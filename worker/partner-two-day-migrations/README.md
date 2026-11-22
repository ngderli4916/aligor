# Two-day partner course reservations

- Public path: `/2days-botsclass/` (also works without trailing slash); submit: `POST /api/2days-botsclass/reservations`.
- Status `requested` is neither payment nor confirmed attendance. A request reserves one or two requested seats, but only organizers confirm seats. No automatic communications or invoice generation.
- The worker uses only the separate `PARTNER_TWO_DAY_DB` binding for these reservations. Missing binding or `PARTNER_TWO_DAY_OPEN` other than `1` hides the form and rejects writes. This does not reuse half-day registration records, Preview, class orders, invoices, or CRM. Production is configured for the dedicated `aligor-2days-botsclass` database and opened via `PARTNER_TWO_DAY_OPEN=1`.
- Repeated submits with the same normalized phone do not create extra seats or replace the first request. Amendments (including supplying the second name later) are to be collected by organizer follow-up; do not expose a public list, receipt lookup, or edit endpoint. Only organizers with approved access to the dedicated database may read the roster; no access is granted to the existing partner dashboard by this change.

## Local test

```sh
npx wrangler d1 migrations apply aligor-partner-two-day-local --local --config wrangler.partner-two-day.local.jsonc --persist-to .taste-skill/local-d1
npx wrangler dev --local --ip 127.0.0.1 --port 18763 --config wrangler.partner-two-day.local.jsonc --persist-to .taste-skill/local-d1
```

## Separate release approval required

Create a real, empty Cloudflare D1 dedicated to this intake, confirm its ID differs from `aligor-leads`, review and apply *only* `worker/partner-two-day-migrations/0001_reservations.sql` to it. Add the real ID as `PARTNER_TWO_DAY_DB` in `wrangler.jsonc` with that migrations directory. Set `PARTNER_TWO_DAY_OPEN` to `1` only for the approved launch. Do not reuse the synthetic local DB ID or import the test rows. Deploy solely according to the repository/Obsidian SOP; after deployment, check both public domains using GET only and confirm the new binding before distributing the link.
