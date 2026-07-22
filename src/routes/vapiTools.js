import { Router } from 'express';
import { warmSession, checkAvailability, makeReservation } from '../services/opentableService.js';
import { to24Hour } from '../utils/timeUtils.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { resolveRestaurant, listRestaurants } from '../config/restaurants.js';

export const vapiToolsRoutes = Router();

function parseArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function normalizeTime(time) {
  if (typeof time !== 'string') return time;
  const trimmed = time.trim();
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) return trimmed;
  try {
    return to24Hour(trimmed);
  } catch {
    return trimmed;
  }
}

function todayInPacific() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // YYYY-MM-DD
}

function daysBetween(a, b) {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Next calendar date with this day-of-month on or after `today` (within ~3 months). */
function nextUpcomingDayOfMonth(day, today) {
  const dayNum = Number(day);
  const [y, m] = today.split('-').map(Number);
  for (let offset = 0; offset < 4; offset++) {
    const monthIndex = m - 1 + offset;
    const year = y + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    // Skip invalid dates like Feb 31
    const parsed = new Date(`${candidate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    const iso = parsed.toISOString().slice(0, 10);
    if (iso.slice(8, 10) !== String(dayNum).padStart(2, '0')) continue;
    if (candidate >= today) return candidate;
  }
  return today;
}

function fixBookingDate(dateStr) {
  const today = todayInPacific();
  const match = typeof dateStr === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim()) : null;
  if (!match) return { date: today, note: `date missing/invalid — using today ${today}` };

  const [, year, month, day] = match;
  const thisYear = Number(today.slice(0, 4));
  let candidate = dateStr.trim();

  // Stale years → current/upcoming occurrence of that month-day.
  if (Number(year) < thisYear || candidate < today) {
    const thisYearSameDay = `${thisYear}-${month}-${day}`;
    candidate = thisYearSameDay >= today ? thisYearSameDay : today;
  }

  // Voice models often jump a full year (e.g. 2027-07-14) when the user said "the 14th".
  // Pull far-future dates back to the next upcoming day-of-month.
  if (daysBetween(today, candidate) > 60) {
    const nearer = nextUpcomingDayOfMonth(day, today);
    return {
      date: nearer,
      note: `date "${dateStr}" was ${daysBetween(today, candidate)} days out — using ${nearer}`,
    };
  }

  if (candidate !== dateStr.trim()) {
    return { date: candidate, note: `date "${dateStr}" rewritten to ${candidate}` };
  }
  return { date: candidate, note: null };
}

/**
 * Voice models invent bad rid/date. Resolve restaurant by name map (or a real rid),
 * and coerce dates / contact fields.
 */
export function sanitizeBookingArgs(args) {
  const next = { ...args };
  const notes = [];

  const resolved = resolveRestaurant({
    restaurantName: next.restaurantName,
    rid: next.rid,
  });
  if (resolved.error) {
    return { args: next, notes, error: resolved.error };
  }
  if (next.rid != null && Number(next.rid) !== resolved.rid) {
    notes.push(`rid ${next.rid} resolved via "${resolved.name}" → ${resolved.rid}`);
  } else if (next.restaurantName) {
    notes.push(`restaurant "${next.restaurantName}" → rid ${resolved.rid}`);
  }
  next.rid = resolved.rid;
  next.restaurantName = resolved.name;

  const fixed = fixBookingDate(next.date);
  next.date = fixed.date;
  if (fixed.note) notes.push(fixed.note);

  if (next.partySize == null || Number.isNaN(Number(next.partySize))) {
    next.partySize = 2;
    notes.push('partySize defaulted to 2');
  }

  if (!next.time) {
    next.time = '19:00';
    notes.push('time defaulted to 19:00');
  }

  if (next.phone != null) next.phone = String(next.phone).replace(/[^\d+]/g, '');

  // Voice often gives only a first name first — keep booking unblocked.
  if (next.firstName && !next.lastName) {
    const parts = String(next.firstName).trim().split(/\s+/);
    if (parts.length >= 2) {
      next.firstName = parts[0];
      next.lastName = parts.slice(1).join(' ');
      notes.push('split firstName into first/last');
    } else {
      next.lastName = 'Guest';
      notes.push('lastName defaulted to Guest');
    }
  }

  return { args: next, notes };
}

function normalizeArgs(args) {
  // Vapi dashboard params are sometimes entered as DATE / PartySize / etc.
  const aliases = {
    date: ['date', 'DATE', 'Date'],
    time: ['time', 'TIME', 'Time'],
    rid: ['rid', 'RID', 'Rid', 'restaurantId', 'restaurant_id'],
    restaurantName: [
      'restaurantName',
      'restaurant',
      'Restaurant',
      'restaurant_name',
    ],
    partySize: ['partySize', 'partysize', 'PartySize', 'party_size', 'PARTYSIZE'],
    firstName: ['firstName', 'firstname', 'FirstName', 'first_name'],
    lastName: ['lastName', 'lastname', 'LastName', 'last_name'],
    phone: ['phone', 'Phone', 'PHONE'],
    email: ['email', 'Email', 'EMAIL'],
  };

  const normalized = {};
  for (const [canonical, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      if (args?.[key] != null && args[key] !== '') {
        normalized[canonical] = args[key];
        break;
      }
    }
  }

  if (normalized.time != null) normalized.time = normalizeTime(normalized.time);
  if (normalized.partySize != null) normalized.partySize = Number(normalized.partySize);
  if (normalized.rid != null && /^\d+$/.test(String(normalized.rid))) {
    normalized.rid = Number(normalized.rid);
  }
  if (normalized.phone != null) normalized.phone = String(normalized.phone);
  if (normalized.firstName != null) normalized.firstName = String(normalized.firstName).trim();
  if (normalized.lastName != null) normalized.lastName = String(normalized.lastName).trim();
  if (normalized.email != null) normalized.email = String(normalized.email).trim();
  return normalized;
}

/** Extract tool calls from Vapi's several payload shapes. */
export function extractToolCalls(body) {
  const message = body?.message ?? body;
  const list =
    message?.toolCallList ||
    message?.toolCalls ||
    message?.toolWithToolCallList?.map((item) => item.toolCall || item) ||
    [];

  return list.map((call) => {
    const name = call.name || call.function?.name;
    const rawArgs = call.arguments ?? call.parameters ?? call.function?.arguments ?? call.function?.parameters;
    return {
      toolCallId: call.id || call.toolCallId,
      name,
      arguments: normalizeArgs(parseArguments(rawArgs)),
    };
  });
}

async function runTool(name, args, callId) {
  switch (name) {
    case 'warm_session':
      return warmSession({ callId });
    case 'list_restaurants':
      return { success: true, restaurants: listRestaurants() };
    case 'check_availability': {
      const { args: safeArgs, notes, error } = sanitizeBookingArgs(args);
      if (error) {
        return { success: false, error: 'unknown_restaurant', message: error, restaurants: listRestaurants() };
      }
      if (notes.length) logger.log('vapi_args_sanitized', { callId, notes, safeArgs });
      const result = await checkAvailability({ ...safeArgs, callId });
      return {
        ...result,
        restaurantName: safeArgs.restaurantName,
        ...(notes.length ? { argNotes: notes } : {}),
      };
    }
    case 'make_reservation': {
      const { args: safeArgs, notes, error } = sanitizeBookingArgs(args);
      if (error) {
        return { success: false, error: 'unknown_restaurant', message: error, restaurants: listRestaurants() };
      }
      if (notes.length) logger.log('vapi_args_sanitized', { callId, notes, safeArgs });
      const result = await makeReservation({
        ...safeArgs,
        callId,
        // Safe default for voice tests — set VAPI_DRY_RUN=false to book for real.
        dryRun: env.vapiDryRun ? true : Boolean(args.dryRun),
      });
      if (result.dryRun) {
        return {
          ...result,
          booked: false,
          restaurantName: safeArgs.restaurantName,
          argNotes: notes.length ? notes : undefined,
          message:
            'DRY RUN SUCCESS: guest details were filled on OpenTable, but the reservation was NOT submitted. Tell the caller this was a successful test booking only. Real booking requires VAPI_DRY_RUN=false on the server.',
        };
      }
      return {
        ...result,
        restaurantName: safeArgs.restaurantName,
        ...(notes.length ? { argNotes: notes } : {}),
      };
    }
    default:
      return { success: false, error: 'unknown_tool', message: `Unknown tool: ${name}` };
  }
}

vapiToolsRoutes.post('/vapi/tools', async (req, res) => {
  const callId = req.body?.message?.call?.id || req.body?.call?.id;
  const toolCalls = extractToolCalls(req.body);

  logger.log('vapi_tool_calls', {
    callId,
    tools: toolCalls.map((call) => call.name),
    args: toolCalls.map((call) => call.arguments),
  });

  if (toolCalls.length === 0) {
    return res.status(200).json({
      results: [
        {
          toolCallId: 'missing',
          result: JSON.stringify({
            success: false,
            error: 'no_tool_calls',
            message: 'No tool calls found in Vapi payload.',
          }),
        },
      ],
    });
  }

  const results = [];

  for (const toolCall of toolCalls) {
    const { toolCallId, name, arguments: args } = toolCall;
    try {
      if (!toolCallId || !name) {
        results.push({
          toolCallId: toolCallId || 'unknown',
          result: JSON.stringify({
            success: false,
            error: 'invalid_tool_call',
            message: 'Tool call missing id or name.',
          }),
        });
        continue;
      }

      const result = await runTool(name, args, callId);
      results.push({ toolCallId, result: JSON.stringify(result) });
    } catch (error) {
      logger.logError('vapi_tool_error', error, { callId, tool: name });
      results.push({
        toolCallId: toolCallId || 'unknown',
        result: JSON.stringify({ success: false, error: 'tool_failed', message: error.message }),
      });
    }
  }

  // Vapi ignores non-200 responses for tools — always 200 with results.
  res.status(200).json({ results });
});
