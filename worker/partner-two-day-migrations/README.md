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

## Paid sign-up (registrations + transfer proof) — 2026-11-26, not yet released

- Page now shows course facts, the 2026-11-27 17:00 +08 deadline with a live countdown, and a 5-step flow: details → confirm amount → bank transfer → upload proof → submit.
- Submit: `POST /api/2days-botsclass/registrations` (multipart). Server rejects after the deadline (410), and refuses unless `PARTNER_TWO_DAY_FEE_1`, `PARTNER_TWO_DAY_FEE_2` (whole RM, > 0), the `PARTNER_TWO_DAY_PROOFS` R2 binding and `PARTNER_TWO_DAY_PAYMENT_OPEN=1` are all present (503). The amount is computed server-side; a stale page amount gets 409.
- Stored status is `pending_verification` (待核实). Proof files go to the private R2 bucket only (no public URL, no read route); D1 keeps the key.
- The old `/api/2days-botsclass/reservations` endpoint now returns 410; rows in `reservations` are untouched.

### Production needs (each needs Adrian's approval)
1. Apply `0002_registrations.sql` to the existing `aligor-2days-botsclass` D1 (adds a table only; does not alter `reservations`).
2. Create a new private R2 bucket (e.g. `aligor-2days-proofs`, public access off, no custom domain) and bind it as `PARTNER_TWO_DAY_PROOFS` in `wrangler.jsonc`.
3. Once fees are confirmed: set `PARTNER_TWO_DAY_FEE_1` / `PARTNER_TWO_DAY_FEE_2` and `PARTNER_TWO_DAY_PAYMENT_OPEN=1`.

### Local preview
```sh
npx wrangler d1 migrations apply aligor-partner-two-day-local --local --config wrangler.partner-two-day.local.jsonc --persist-to .taste-skill/d1-b
npx wrangler dev --local --ip 127.0.0.1 --port 18764 --config wrangler.partner-two-day.local.jsonc --persist-to .taste-skill/d1-b \
  --var PARTNER_TWO_DAY_FEE_1:1111 --var PARTNER_TWO_DAY_FEE_2:2222 --var PARTNER_TWO_DAY_PAYMENT_OPEN:1 --var PARTNER_TWO_DAY_TEST_MODE:1
```
Add `--var PARTNER_TWO_DAY_DEADLINE:<ISO time>` to test the countdown expiry.
