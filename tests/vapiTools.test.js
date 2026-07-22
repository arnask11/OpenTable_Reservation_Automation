import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/opentableService.js', () => ({
  warmSession: vi.fn(async ({ callId }) => ({ success: true, sessionId: 'bb-1', callId })),
  checkAvailability: vi.fn(async (args) => ({
    success: true,
    requestedTimeAvailable: true,
    availableTimes: ['19:00'],
    callId: args.callId,
  })),
  makeReservation: vi.fn(async (args) => ({
    success: true,
    dryRun: args.dryRun,
    callId: args.callId,
  })),
}));

vi.mock('../src/config/env.js', () => ({
  env: { vapiDryRun: true },
}));

import { extractToolCalls, sanitizeBookingArgs, vapiToolsRoutes } from '../src/routes/vapiTools.js';
import { warmSession, checkAvailability, makeReservation } from '../src/services/opentableService.js';
import express from 'express';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(vapiToolsRoutes);
  return app;
}

async function postTools(body) {
  const app = makeApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/vapi/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    return { status: response.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('extractToolCalls', () => {
  it('reads toolCallList and normalizes 12h time + partySize', () => {
    const calls = extractToolCalls({
      message: {
        toolCallList: [
          {
            id: 't1',
            name: 'check_availability',
            arguments: { rid: '24886', date: '2026-07-20', time: '7:00 PM', partySize: '2' },
          },
        ],
      },
    });

    expect(calls).toEqual([
      {
        toolCallId: 't1',
        name: 'check_availability',
        arguments: { rid: 24886, date: '2026-07-20', time: '19:00', partySize: 2 },
      },
    ]);
  });

  it('maps uppercase DATE from Vapi tool schema to date', () => {
    const calls = extractToolCalls({
      message: {
        toolCallList: [
          {
            id: 't2',
            name: 'check_availability',
            arguments: { rid: 24886, DATE: '2026-07-20', time: '19:00', partySize: 2 },
          },
        ],
      },
    });

    expect(calls[0].arguments.date).toBe('2026-07-20');
    expect(calls[0].arguments.DATE).toBeUndefined();
  });
});

describe('sanitizeBookingArgs', () => {
  it('resolves Amber India by restaurantName and fixes stale dates', () => {
    const { args, notes, error } = sanitizeBookingArgs({
      restaurantName: 'Amber India',
      rid: 1,
      date: '2024-06-13',
      time: '19:00',
      partySize: 2,
    });
    expect(error).toBeUndefined();
    expect(args.rid).toBe(24886);
    expect(args.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(notes.some((note) => note.includes('24886') || note.includes('Amber'))).toBe(true);
  });

  it('errors when restaurant is unknown and rid is bogus', () => {
    const { error } = sanitizeBookingArgs({
      restaurantName: 'Great American Steakhouse',
      rid: 1,
      date: '2026-07-20',
      time: '20:00',
      partySize: 4,
    });
    expect(error).toMatch(/Unknown restaurant/i);
  });

  it('pulls far-future year jumps back to the next upcoming day-of-month', () => {
    const { args, notes } = sanitizeBookingArgs({
      rid: 24886,
      date: '2027-07-14',
      time: '20:00',
      partySize: 2,
    });
    expect(args.date.startsWith('2027')).toBe(false);
    expect(args.date.slice(8, 10)).toBe('14');
    expect(notes.some((note) => note.includes('2027-07-14'))).toBe(true);
  });
});

describe('POST /vapi/tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms a session keyed by Vapi call id', async () => {
    const { status, json } = await postTools({
      message: {
        type: 'tool-calls',
        call: { id: 'call-123' },
        toolCallList: [{ id: 'tc1', name: 'warm_session', arguments: {} }],
      },
    });

    expect(status).toBe(200);
    expect(warmSession).toHaveBeenCalledWith({ callId: 'call-123' });
    expect(json.results[0].toolCallId).toBe('tc1');
    expect(JSON.parse(json.results[0].result).sessionId).toBe('bb-1');
  });

  it('passes callId into availability and forces dryRun on reservation', async () => {
    await postTools({
      message: {
        call: { id: 'call-456' },
        toolCallList: [
          {
            id: 'tc2',
            name: 'check_availability',
            arguments: { rid: 24886, date: '2026-07-20', time: '19:00', partySize: 2 },
          },
          {
            id: 'tc3',
            name: 'make_reservation',
            arguments: {
              rid: 24886,
              date: '2026-07-20',
              time: '19:00',
              partySize: 2,
              firstName: 'Test',
              lastName: 'User',
              phone: '4155551234',
              email: 'test@example.com',
              dryRun: false,
            },
          },
        ],
      },
    });

    expect(checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-456', rid: 24886 }),
    );
    expect(makeReservation).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-456', dryRun: true }),
    );
  });
});
