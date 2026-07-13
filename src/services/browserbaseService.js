import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright-core';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function createBrowserSession() {
  const client = new Browserbase({ apiKey: env.browserbaseApiKey });

  let session;
  try {
    // OpenTable/Akamai often blocks generic datacenter proxies; SF geo works more reliably.
    session = await client.sessions.create({
      projectId: env.browserbaseProjectId,
      proxies: [
        {
          type: 'browserbase',
          geolocation: { city: 'SAN_FRANCISCO', state: 'CA', country: 'US' },
        },
      ],
    });
  } catch (error) {
    logger.logError('browserbase_session_create_failed', error);
    throw new Error(`Failed to create Browserbase session: ${error.message}`);
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
  } catch (error) {
    logger.logError('browserbase_connect_failed', error, { sessionId: session.id });
    throw new Error(`Failed to connect Playwright to Browserbase session: ${error.message}`);
  }

  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.newPage());

  return { browser, page, sessionId: session.id };
}
