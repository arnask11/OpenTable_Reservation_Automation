import { describe, it, expect } from 'vitest';
import { buildOpenTableBookingUrl } from '../src/utils/urlBuilder.js';

describe('buildOpenTableBookingUrl', () => {
  it('builds a correctly-parameterized OpenTable availability URL', () => {
    const url = new URL(
      buildOpenTableBookingUrl({ rid: 12345, date: '2026-07-20', time: '19:00', partySize: 2 })
    );

    expect(url.origin + url.pathname).toBe('https://www.opentable.com/booking/restref/availability');
    expect(url.searchParams.get('rid')).toBe('12345');
    expect(url.searchParams.get('restRef')).toBe('12345');
    expect(url.searchParams.get('lang')).toBe('en-US');
    expect(url.searchParams.get('dateTime')).toBe('2026-07-20T19:00');
    expect(url.searchParams.get('partySize')).toBe('2');
  });

  it('generates a unique correlationId on each call', () => {
    const params = { rid: 1, date: '2026-07-20', time: '19:00', partySize: 2 };
    const url1 = new URL(buildOpenTableBookingUrl(params));
    const url2 = new URL(buildOpenTableBookingUrl(params));

    expect(url1.searchParams.get('correlationId')).toBeTruthy();
    expect(url1.searchParams.get('correlationId')).not.toBe(url2.searchParams.get('correlationId'));
  });
});
