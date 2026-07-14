import { createBrowserSession } from './browserbaseService.js';
import { putSession, acquireSession, unlockSession, releaseSession } from './sessionStore.js';
import { buildOpenTableBookingUrl } from '../utils/urlBuilder.js';
import { to12Hour, to24Hour } from '../utils/timeUtils.js';
import { selectors, TIME_SLOT_TEXT_PATTERN } from '../utils/selectors.js';
import { validateAvailabilityInput, validateReservationInput } from '../validators/reservationValidator.js';
import { logger } from '../utils/logger.js';

const MAKE_RESERVATION_ENDPOINT = '/dapi/booking/make-reservation';
const DAPI_PREFIX = '/dapi/';

// ─── Page parsing ────────────────────────────────────────────────────────────

export async function parseTimeSlots(page) {
  const patternSource = TIME_SLOT_TEXT_PATTERN.source;
  const patternFlags = TIME_SLOT_TEXT_PATTERN.flags;

  return page.evaluate(
    ({ source, flags }) => {
      const pattern = new RegExp(source, flags);
      const seen = new Set();
      const times = [];

      for (const button of document.querySelectorAll('button')) {
        const text = (button.textContent || '').trim();
        const match = pattern.exec(text);
        if (!match) continue;

        const time12 = match[1].toUpperCase().replace(/\s+/, ' ');
        if (!seen.has(time12)) {
          seen.add(time12);
          times.push(time12);
        }
      }

      return times;
    },
    { source: patternSource, flags: patternFlags }
  );
}

export async function waitForTimeSlots(page, maxWaitMs = 12000) {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const slots = await parseTimeSlots(page);
    if (slots.length > 0) {
      // Slots often render in batches; brief pause for stragglers.
      await page.waitForTimeout(300);
      return parseTimeSlots(page);
    }
    await page.waitForTimeout(250);
  }

  return [];
}

// ─── Flow steps ──────────────────────────────────────────────────────────────

async function dismissOverlays(page) {
  const accept = page.locator(selectors.cookieAcceptButton).first();
  if ((await accept.count()) > 0) {
    await accept.click().catch(() => {});
  }
  const close = page.locator(selectors.cookieCloseButton).first();
  if ((await close.count()) > 0) {
    await close.click().catch(() => {});
  }
}

async function warmHomepage(page) {
  await page.goto('https://www.opentable.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await dismissOverlays(page);
}

async function navigateAndFindTable(page, { rid, date, time, partySize }, { skipHomepageWarmup = false } = {}) {
  // A cold direct hit to the booking endpoint gets blocked by OpenTable's bot detection.
  // Homepage first (unless this page was already warmed via /sessions/warm).
  if (!skipHomepageWarmup) {
    await warmHomepage(page);
  }

  const url = buildOpenTableBookingUrl({ rid, date, time, partySize });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);

  const findTableButton = page.locator(selectors.findTableButton).first();
  try {
    await findTableButton.waitFor({ state: 'visible', timeout: 20000 });
  } catch {
    throw new Error(`"Find a table" button not found for rid=${rid} — the booking page may not have loaded.`);
  }
  await findTableButton.click();
}

// The search bar's date/time/party summary control can also match on time12 text
// (e.g. "7:00 PM") and sits above the results in the DOM, so a plain .first() sometimes
// clicks it instead of the real slot button. Disambiguate by position: the real slot
// button renders below "Find a table"; the search control renders above it.
async function clickTimeSlotButton(page, time12) {
  const findTableBox = await page.locator(selectors.findTableButton).first().boundingBox().catch(() => null);
  const referenceY = findTableBox?.y ?? 0;

  const candidates = page.locator(selectors.timeSlotButton(time12));
  const count = await candidates.count();

  for (let i = 0; i < count; i++) {
    const candidate = candidates.nth(i);
    const box = await candidate.boundingBox().catch(() => null);
    if (box && box.y > referenceY) {
      await candidate.click();
      return;
    }
  }

  await candidates.last().click();
}

async function selectSeating(page, seatingPreference) {
  const legacySelect = page.locator(selectors.seatingSelectButton).first();
  const seatingOptions = page.locator(selectors.seatingOptionButtons);
  const seatingHeading = page.locator(selectors.seatingHeading).first();
  const formField = page.locator(selectors.firstNameInput).first();

  const winner = await Promise.race([
    seatingHeading.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'seating').catch(() => null),
    seatingOptions.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'seating').catch(() => null),
    legacySelect.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'legacy').catch(() => null),
    formField.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'form').catch(() => null),
  ]);

  if (winner === null) {
    throw new Error('Neither seating selection nor the reservation form appeared after selecting a time.');
  }
  if (winner === 'form') {
    return;
  }

  if (winner === 'legacy') {
    let selectButton = legacySelect;
    if (seatingPreference) {
      const preferred = page
        .locator(`text=${seatingPreference}`)
        .locator(
          'xpath=ancestor::*[.//button[contains(text(), "Select")]][1]//button[contains(text(), "Select")]'
        )
        .first();
      if ((await preferred.count()) > 0) {
        selectButton = preferred;
      }
    }
    await selectButton.click();
  } else {
    // Current OpenTable UI: click the seating option button itself.
    let option = seatingOptions.first();
    if (seatingPreference) {
      const preferred = page.locator(`button:has-text("${seatingPreference}")`).first();
      if ((await preferred.count()) > 0) {
        option = preferred;
      }
    } else {
      const standard = page.locator('button:has-text("Standard")').first();
      if ((await standard.count()) > 0) {
        option = standard;
      }
    }
    await option.click();
  }

  try {
    await formField.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    throw new Error('Reservation form did not appear after selecting seating.');
  }
}

async function fillReservationForm(page, { firstName, lastName, phone, email, specialRequest }) {
  try {
    await page.locator(selectors.firstNameInput).first().fill(firstName);
    await page.locator(selectors.lastNameInput).first().fill(lastName);
    await page.locator(selectors.phoneInput).first().fill(phone);
    await page.locator(selectors.emailInput).first().fill(email);
  } catch (error) {
    throw new Error(`Could not fill reservation form: ${error.message}`);
  }

  if (specialRequest) {
    const specialRequestField = page.locator(selectors.specialRequestTextarea).first();
    if ((await specialRequestField.count()) > 0) {
      await specialRequestField.fill(specialRequest);
    }
  }
}

async function applyCheckboxPreferences(page, { emailMarketingOptIn, smsReminderOptIn }) {
  const emailLabel = page.locator(selectors.emailMarketingLabel);
  if ((await emailLabel.count()) > 0) {
    const emailCheckbox = emailLabel.locator('input[type="checkbox"]').first();
    const isChecked = await emailCheckbox.isChecked();
    if (isChecked !== emailMarketingOptIn) {
      await emailLabel.click();
    }
  }

  const smsLabel = page.locator(selectors.smsReminderLabel);
  if ((await smsLabel.count()) > 0) {
    const smsCheckbox = smsLabel.locator('input[type="checkbox"]').first();
    const isChecked = await smsCheckbox.isChecked();
    if (isChecked !== smsReminderOptIn) {
      await smsLabel.click();
    }
  }
}

function attachDapiLogger(page, sessionId) {
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes(DAPI_PREFIX) || response.status() !== 200) return;
    if (url.includes(MAKE_RESERVATION_ENDPOINT)) return; // handled separately, with full payload

    try {
      const endpoint = new URL(url).pathname;
      logger.log('dapi_response', { endpoint, sessionId });
    } catch {
      // ignore malformed URLs
    }
  });
}

async function submitReservation(page, { partySize, restaurantId, sessionId }) {
  const responsePromise = page
    .waitForResponse((response) => response.url().includes(MAKE_RESERVATION_ENDPOINT), { timeout: 20000 })
    .catch(() => null);

  const submitButton = page.locator(selectors.completeReservationButton).first();
  if ((await submitButton.count()) === 0) {
    throw new Error('"Complete reservation" button not found.');
  }
  await submitButton.click();

  const response = await responsePromise;

  if (response) {
    try {
      const body = await response.json();
      if (body?.success !== false) {
        return {
          success: true,
          confirmationNumber: String(body.confirmationNumber ?? body.reservationId ?? ''),
          reservationId: body.reservationId !== undefined ? String(body.reservationId) : undefined,
          reservationDateTime: body.reservationDateTime,
          partySize,
          reservationType: body.reservationType,
          restaurantId,
          sessionId,
        };
      }
    } catch {
      // Response wasn't JSON or didn't match the expected shape; fall through to the page-text check.
    }
  }

  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? '';
  if (/confirmed|confirmation/i.test(bodyText)) {
    return {
      success: true,
      confirmationNumber: 'unknown',
      partySize,
      restaurantId,
      sessionId,
    };
  }

  const errorElement = page.locator(selectors.errorMessage).first();
  const message =
    (await errorElement.count()) > 0
      ? await errorElement.textContent()
      : 'Reservation may not have completed successfully. Please verify manually.';

  return {
    success: false,
    error: 'reservation_uncertain',
    message,
    sessionId,
  };
}

async function resolveBrowserSession(sessionId) {
  if (!sessionId) {
    const created = await createBrowserSession();
    return { ...created, reused: false };
  }

  const entry = acquireSession(sessionId);
  if (!entry) {
    throw new Error(`Warm session not found or expired: ${sessionId}`);
  }

  return {
    browser: entry.browser,
    page: entry.page,
    sessionId,
    reused: true,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start a Browserbase session and warm OpenTable's homepage.
 * Use the returned sessionId on /availability and /reservations during a live call.
 */
export async function warmSession() {
  const { browser, page, sessionId } = await createBrowserSession();
  try {
    await warmHomepage(page);
    putSession(sessionId, { browser, page });
    logger.log('session_warmed', { sessionId });
    return { success: true, sessionId };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

export async function checkAvailability(params) {
  const { valid, errors, data } = validateAvailabilityInput(params);
  if (!valid) {
    throw new Error(`Invalid availability input: ${errors.join('; ')}`);
  }

  const { rid, date, time, partySize, sessionId: requestedSessionId } = data;
  let session;
  let reused = false;

  try {
    session = await resolveBrowserSession(requestedSessionId);
    reused = session.reused;
    const { page, sessionId } = session;
    logger.log('checking_availability', { rid, date, time, partySize, sessionId, reused });

    await navigateAndFindTable(page, { rid, date, time, partySize }, { skipHomepageWarmup: reused });
    const slots12h = await waitForTimeSlots(page);
    const availableTimes = slots12h.map(to24Hour);

    if (availableTimes.length === 0) {
      return {
        success: false,
        error: 'no_availability_found',
        message: 'No available reservation times were found.',
        availableTimes: [],
        sessionId,
      };
    }

    return {
      success: true,
      requestedTimeAvailable: availableTimes.includes(time),
      requestedTime: time,
      availableTimes,
      sessionId,
    };
  } finally {
    if (session?.reused) {
      unlockSession(session.sessionId);
    } else if (session?.browser) {
      await session.browser.close().catch(() => {});
    }
  }
}

export async function makeReservation(params) {
  const { valid, errors, data } = validateReservationInput(params);
  if (!valid) {
    throw new Error(`Invalid reservation input: ${errors.join('; ')}`);
  }

  const {
    rid,
    date,
    time,
    partySize,
    seatingPreference,
    emailMarketingOptIn,
    smsReminderOptIn,
    dryRun,
    sessionId: requestedSessionId,
  } = data;

  let session;
  let reused = false;

  try {
    session = await resolveBrowserSession(requestedSessionId);
    reused = session.reused;
    const { page, sessionId } = session;
    attachDapiLogger(page, sessionId);
    logger.log('making_reservation', {
      rid,
      date,
      time,
      partySize,
      dryRun,
      sessionId,
      reused,
      email: logger.maskEmail(data.email),
      phone: logger.maskPhone(data.phone),
    });

    await navigateAndFindTable(page, { rid, date, time, partySize }, { skipHomepageWarmup: reused });

    const slots12h = await waitForTimeSlots(page);
    const availableTimes = slots12h.map(to24Hour);

    if (!availableTimes.includes(time)) {
      logger.log('requested_time_unavailable', { sessionId });
      return {
        success: false,
        error: 'requested_time_unavailable',
        message: `The requested time ${time} is not available.`,
        requestedTime: time,
        availableTimes,
        date,
        partySize,
        sessionId,
      };
    }

    const time12 = to12Hour(time);
    await clickTimeSlotButton(page, time12);
    logger.log('select_time', { requestedTime: time, sessionId });

    await selectSeating(page, seatingPreference);
    await fillReservationForm(page, data);
    await applyCheckboxPreferences(page, { emailMarketingOptIn, smsReminderOptIn });

    if (dryRun) {
      logger.log('dry_run_stop_before_submit', { sessionId });
      return {
        success: true,
        dryRun: true,
        message: 'Dry run completed. Reservation was not submitted.',
        requestedTime: time,
        date,
        partySize,
        sessionId,
      };
    }

    const result = await submitReservation(page, { partySize, restaurantId: rid, sessionId });
    logger.log('make_reservation_done', { success: result.success, sessionId });

    return result;
  } catch (error) {
    logger.logError('make_reservation_error', error, { sessionId: session?.sessionId });
    throw error;
  } finally {
    if (reused && session?.sessionId) {
      // Always release warm sessions after a book attempt (success or failure).
      await releaseSession(session.sessionId);
    } else if (session?.browser) {
      await session.browser.close().catch(() => {});
    }
  }
}
