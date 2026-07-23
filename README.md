# OUPS Ticket Sampler

Search OHIO811 (OUPS) tickets that **involve a specific member code** over a
**selectable date range**, using the official CENTER LOGiX API at
`oh811.centerlogix.org` (Swagger docs: https://oh811.centerlogix.org/api-docs).

## How it works

The UI has two tabs.

### Date-range sample

- The server logs in with your member credentials via `POST /api/login`
  (center `oups`) and keeps the session cookie, re-authenticating on expiry.
- A search calls `POST /api/ticket/search` with the date range and the member
  code as the keyword, then filters the results to tickets whose
  `member_codes` list actually contains your code.
- In parallel it pulls **your response codes** for the window via
  `GET /api/response?member_code=…` and joins them onto each ticket by
  ticket+revision, so the table shows which code(s) your organization posted
  (e.g. `004` Locator Coordination). Codes and their meanings come from
  `GET /api/response_code`.
- **Response-code filter**: choose a code (e.g. `004`) to restrict the pool to
  tickets where your org posted that code before the random sample is drawn.
- If more tickets match than the chosen sample size, a random sample is shown
  (pick "All" to see everything).
- Clicking a row loads the full formatted ticket text
  (`GET /api/ticket/formatted/{ticket}/{revision}`) plus a table of **all**
  members' responses on that ticket (from the ticket detail record).

### Past due

- Calls `GET /api/response/due/list?memberCode=…&mode=…`. Modes map to the
  API's own values: **late** = past due, **pending** = due but not yet
  answered, **responded**, and **all**. Rows are sorted by `response_due_at`.

## Setup

```powershell
npm install
copy .env.example .env   # then edit: OUPS_EMAIL, OUPS_PASSWORD, OUPS_MEMBER_CODE
npm start                # http://localhost:8811
```

## .env

| Variable           | Meaning                                   | Default                          |
| ------------------ | ----------------------------------------- | -------------------------------- |
| `OUPS_EMAIL`       | Member portal login email                 | (required)                       |
| `OUPS_PASSWORD`    | Member portal password                    | (required)                       |
| `OUPS_MEMBER_CODE` | Default member code pre-filled in the UI  | —                                |
| `OUPS_BASE_URL`    | API base URL                              | `https://oh811.centerlogix.org`  |
| `OUPS_CENTER`      | Center identifier for login               | `oups`                           |
| `DASHBOARD_PORT`   | Local web UI port                         | `8811`                           |

## Notes

- Login is rate-limited (5 failed attempts/minute) — if you see repeated 401s,
  check the password before retrying.
- The API's `end_date` is exclusive; the app adds one day so the "To" date you
  pick is included.
- Full API surface (tickets, dispatches, responses, mapping, geocoding…) is
  browsable at `/api-docs` once signed in; the change log is at
  `/api/change_log`.
