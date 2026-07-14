# OpenTable Reservation Automation

Books an OpenTable table for you by driving a cloud browser ([Browserbase](https://browserbase.com) + Playwright). There is no official OpenTable booking API — this clicks through the website.

## How it works

1. Opens a Browserbase cloud browser
2. Goes to the restaurant’s OpenTable booking page
3. Checks availability → picks seating → fills your details → clicks **Complete reservation**
4. Returns the confirmation number

**Cold one-shot:** ~40–50s (sometimes longer if OpenTable blocks — just retry).  
**Live call (warmed):** start a session early, then confirm in ~15–25s.

## What you need

- Browserbase credentials in `.env` (`BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`)
- The restaurant’s **numeric** OpenTable ID (`rid`) — the URL slug alone is not enough  
  Example: Amber India SF slug is `amber-india-san-francisco`, but `rid` is `24886`
- Date (`YYYY-MM-DD`), time (`19:00` 24h), party size, name, phone, email

## Setup (once)

```sh
npm install
cp .env.example .env   # fill in Browserbase credentials
```

## Live-call flow (fast confirm)

Warm the browser while you’re talking, then book when the customer confirms:

```sh
npm run dev

# 1) Start of call — warm OpenTable (~10–20s, do this early)
curl -X POST http://localhost:3000/sessions/warm
# → { "success": true, "sessionId": "..." }

# 2) During call — check times (reuse sessionId)
curl -X POST http://localhost:3000/availability \
  -H "Content-Type: application/json" \
  -d '{"rid":24886,"date":"2026-07-20","time":"19:00","partySize":2,"sessionId":"YOUR_SESSION_ID"}'

# 3) Customer says yes — book (same sessionId; ~15–25s)
curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "rid": 24886,
    "date": "2026-07-20",
    "time": "19:00",
    "partySize": 2,
    "firstName": "Your",
    "lastName": "Name",
    "phone": "4155551234",
    "email": "you@example.com",
    "sessionId": "YOUR_SESSION_ID",
    "dryRun": false
  }'
```

Warm sessions expire after ~6 minutes. After a book attempt the session is closed — warm again for the next booking. Omit `sessionId` for a cold one-shot (slower).

## Book a table (cold one-shot)

```sh
npm run dev

curl -X POST http://localhost:3000/availability \
  -H "Content-Type: application/json" \
  -d '{"rid":24886,"date":"2026-07-20","time":"19:00","partySize":2}'

curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "rid": 24886,
    "date": "2026-07-20",
    "time": "19:00",
    "partySize": 2,
    "firstName": "Your",
    "lastName": "Name",
    "phone": "4155551234",
    "email": "you@example.com",
    "dryRun": false
  }'
```

Success looks like:

```json
{ "success": true, "confirmationNumber": "2110395461", ... }
```

Use `"dryRun": true` first if you want to test without actually booking.

> **`dryRun: false` creates a real reservation.** Use real contact info, and save the confirmation number.

## What made this work

**Bot block:** OpenTable blocks generic cloud IPs. This project uses a San Francisco proxy and visits the OpenTable homepage first before the booking page. You do **not** change geolocation every booking — it’s already set in `src/services/browserbaseService.js`. Only change it if you’re booking outside the Bay Area and keep getting Access Denied.

**Seating:** The code clicks seating buttons like **Standard** / **High Top** (OpenTable no longer uses a separate “Select” button).

**Restaurant ID:** Always use the numeric `rid`, not the name/slug.

## Notes

- OpenTable sometimes still blocks a session — retry if you get a page-load error.
- Unit tests: `npm test` (no Browserbase / OpenTable needed).
- When OpenTable changes its UI, fix selectors in `src/utils/selectors.js`.
