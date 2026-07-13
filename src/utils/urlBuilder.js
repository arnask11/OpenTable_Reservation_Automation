import { randomUUID } from 'crypto';

export function buildOpenTableBookingUrl({ rid, date, time, partySize }) {
  const dateTime = `${date}T${time}`;

  const params = new URLSearchParams({
    rid: String(rid),
    lang: 'en-US',
    restRef: String(rid),
    partySize: String(partySize),
    dateTime,
    correlationId: randomUUID(),
  });

  return `https://www.opentable.com/booking/restref/availability?${params.toString()}`;
}
