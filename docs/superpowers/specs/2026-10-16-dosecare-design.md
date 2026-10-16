# DoseCare: design

Date: 2026-10-16. Status: awaiting review.

## 1. Purpose

- **What**: a medication tracking and reminder platform. A user tracks their own treatments and those of relatives, shares access with caregivers, gets email reminders, and caregivers are alerted when a dose is missed.
- **Why**: a GitHub showcase proving a complete senior profile (database, backend, web, later mobile). Not a product launch.
- **Constraints**: everything free, no hosted demo, fictional data only, no medical advice or diagnosis anywhere in the UI. UI language: English only. README in English.
- **Success**:
  1. `docker compose up` starts the full stack; emails are visible in Mailpit.
  2. A seeded dataset demonstrates the main flows.
  3. CI is green: lint, typecheck, unit and integration tests on a real Postgres.
  4. The README explains the architecture and justifies the main decisions (ADRs).

## 2. Scope of v1

In: accounts; several followed people per account (self included); medications with schedules; dose log (taken / skipped / missed); email reminders; sharing with a relative (A); missed-dose alert to caregivers (B); stock tracking and low-stock alert (C).

Out: email verification, password reset, drug interaction checks, mobile app (phase 2, Expo, same API), hosting, i18n.

## 3. Repository layout (monorepo)

```
apps/api         Hono + Zod + OpenAPI
apps/worker      reminder cycle
apps/web         Next.js + Ant Design + Tailwind
packages/db      Drizzle schema, migrations, client
packages/shared  Zod schemas and shared types
docker-compose.yml, .env.example, docs/adr/
```

Stack: TypeScript everywhere, Hono, Drizzle (versions pinned), Zod, PostgreSQL, Next.js App Router, Ant Design with `@ant-design/nextjs-registry`, Tailwind v4 with `@layer theme, base, antd, components, utilities;` and `StyleProvider layer`, Vitest, Playwright (one smoke test), Mailpit, nodemailer (SMTP adapter).

## 4. Data model

- `users`: email unique, password hash (argon2id), name.
- `sessions`: hashed opaque token, user, expiry, revoked flag.
- `recipients`: display name, IANA time zone. Following yourself means a recipient created at sign-up.
- `recipient_members` `(recipient_id, user_id, role)`, role in `owner | editor | viewer`.
- `invitations`: recipient, invited email, role, hashed token (32 random bytes, single use), expiry (7 days), accepted_at.
- `medications`: recipient, name, strength, unit, active, start and end dates.
- `schedules`: medication, days of week, local time of day, quantity per dose, validity period.
- `stock_movements`: medication, signed quantity, reason `refill | dose | adjustment`. Remaining stock is the sum.
- `dose_events`: schedule (nullable, kept for history if the schedule is deleted), medication, recipient, `quantity` (snapshot of the schedule quantity), `scheduled_at` (UTC), status `pending | taken | skipped | missed`, taken_at, recorded_by. Unique `(schedule_id, scheduled_at)`.
- `notification_outbox`: kind `reminder | missed_alert | low_stock | invitation`, `to_email` (resolved at enqueue time, so invitations to people without an account work), optional user, payload, `dedupe_key` unique, status `pending | sending | sent | failed`, attempts, next_attempt_at, locked_until.
- `notification_preferences`: per member and recipient, reminders on/off, missed-alert on/off, alert delay (minutes, at most the grace period).

Decisions: schedules are entered in the recipient's local time and converted to UTC when doses are generated; stock is a ledger, not a counter; doses are materialized so each has a status and history.

## 5. Authentication and authorization

- Email and password, argon2id. Server-side sessions in Postgres, hashed token, revocable. Cookie `httpOnly`, `SameSite=Lax`; the API also accepts `Authorization: Bearer` (for mobile later). Next.js rewrites `/api/*` to Hono so web and API share an origin. Rate limiting on login and invitations (in memory in v1, documented).
- Roles per recipient:

| Action | viewer | editor | owner |
|---|---|---|---|
| Read medications, doses, stock | yes | yes | yes |
| Record a dose or stock movement | no | yes | yes |
| Create or edit medications and schedules | no | yes | yes |
| Manage members and invitations | no | no | yes |
| Change time zone, delete the recipient | no | no | yes |

- One `requireRole(min)` middleware is the single authorization point. A non-member gets 404, never 403. A recipient always keeps at least one owner (checked in a transaction).
- Invitations: owner invites by email and role; the email goes through the outbox (`invitation`). Any logged-in account holding the token can accept it once. No email verification, so the token is the proof; documented.

## 6. Worker and reminder queue

A separate Node process runs a cycle every 30 s (configurable). Every step is idempotent.

1. **Materialize doses** for the next 48 h per schedule in the recipient's zone, `ON CONFLICT DO NOTHING`.
2. **Enqueue reminders** for due pending doses, one outbox row per member with reminders on, `dedupe_key = reminder:{dose}:{user}`.
3. **Missed doses**: a `missed_alert` row is enqueued when a dose is still pending at `scheduled_at + member delay`. After a fixed grace period (2 h, configurable) a dose becomes `missed` through one atomic `UPDATE ... WHERE status = 'pending' RETURNING`. A dose recorded later moves `missed` to `taken`; alerts already sent are not recalled.
4. **Low stock**: days left = stock / daily consumption. Below a threshold (7 days by default) a `low_stock` row goes to owners and editors. The key includes the last refill, so one alert per stock cycle.
5. **Dispatch**: claim a batch with `SELECT ... FOR UPDATE SKIP LOCKED`, mark `sending` with `locked_until`, send through a `Mailer` interface (SMTP to Mailpit locally), then `sent`. On failure: attempts + 1, exponential backoff with jitter, `failed` after the maximum. Rows stuck in `sending` past `locked_until` are reclaimed.

Guarantees: at least once, not exactly once. If the worker crashes between sending and recording, an email can be sent twice; the `dedupe_key` is used as the email `Message-ID` to limit this. Several workers can run concurrently thanks to `SKIP LOCKED`. A `Clock` is injected so tests move time without waiting.

## 7. API (REST, OpenAPI at `/docs`)

- Auth: `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`.
- Recipients: `GET|POST /recipients`, `GET|PATCH|DELETE /recipients/:id`.
- Members and invitations: `GET /recipients/:id/members`, `PATCH|DELETE` a member, `POST /recipients/:id/invitations`, `POST /invitations/:token/accept`.
- Medications and schedules: CRUD under `/recipients/:id/medications`.
- Doses: `GET /recipients/:id/doses?from&to`, `POST /doses/:id/take`, `POST /doses/:id/skip`.
- Stock: `GET /medications/:id/stock`, `POST /medications/:id/stock-movements`.
- Preferences: `GET|PUT /recipients/:id/preferences`.

Zod schemas live in `packages/shared` and are used by the API (validation) and the web (types, typed Hono client).

## 8. Web screens (Ant Design)

Login and sign-up; **Today** (doses per followed person with Taken and Skipped actions); person page with tabs Medications, History, Stock and Members; invitation acceptance; notification settings.

## 9. Infrastructure and quality

- `docker compose up`: Postgres, Mailpit, API, worker, web; migrations run automatically; a seed script loads fictional people, history and a nearly empty stock. Multi-stage Dockerfiles, `.env.example`.
- GitHub Actions: lint, typecheck, tests with a Postgres service, Docker image build.
- Tests (Vitest, real Postgres): authorization matrix (route × role × non-member, table driven so a new route without a check fails); worker (DST gap and overlap, two cycles produce no duplicates, two concurrent workers send each row once, retry with backoff then `failed`, crash recovery, dose recorded after `missed`, one low-stock alert per cycle); session and invitation lifecycle. One Playwright smoke test: log in, add a medication, record a dose.
- Documentation: README with a Mermaid architecture diagram, screenshots and a GIF; short ADRs (own sessions, Postgres queue, at-least-once delivery, ledger stock).

## 10. Known risks

- Free-tier or library behaviors (Drizzle `skipLocked`, Ant Design layer order with the installed Tailwind v4) are confirmed during implementation; fallback is raw `sql` for the claim query.
- Own authentication is sensitive code: kept small, tested, and documented.
- Time zones and DST are the main source of subtle bugs: covered by dedicated tests.
