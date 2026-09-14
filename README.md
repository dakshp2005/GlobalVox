# GlobalVox RSVP Campaign Manager

A prototype internal tool for the GlobalVox event/business team to import an
invitee list, create an RSVP calling campaign, run it through a simulated AI
voice-calling service, and track results — without building a real
conversational AI or making real phone calls (per the assessment brief).

## Live application

- Vercel URL: _fill in after deploying_
- GitHub repo: _fill in after pushing_

## How to run locally

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Set up the database.** This project uses Postgres via Prisma. Copy
   `.env.example` to `.env` and fill in your connection strings (Supabase
   example shown):
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL` — the pooled connection string (port `6543`,
     `?pgbouncer=true`) — used by the app at runtime.
   - `DIRECT_URL` — the direct connection string (port `5432`) — used only by
     Prisma Migrate.
   - `AUTH_SECRET` — random string used to sign session cookies. Generate one
     with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. **Create the schema:**
   ```bash
   npx prisma migrate dev --name init
   ```
   This both generates the migration SQL under `prisma/migrations/` and
   applies it to your database.
4. **Run the app:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — it redirects to `/login`. Use **Sign up** to
   create your first account (any email/password, no email verification
   step), then you're into `/campaigns`.
5. **Try it out** with `sample-invitees.csv` in the repo root when creating a
   campaign — it intentionally includes a few invalid rows (bad phone, bad
   email, missing name) to demonstrate import validation.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add the `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` environment
   variables in the Vercel project settings (same values as your `.env`).
4. Deploy. Prisma's client is generated automatically via the `postinstall`
   script (`prisma generate`), and migrations are applied ahead of time by
   running `npx prisma migrate deploy` locally against the same database (or
   from a one-off Vercel deployment shell) — Vercel's build step does not run
   migrations by default, which is intentional so a bad deploy can't corrupt
   the schema unattended.

## Architecture / design overview

**Stack:** Next.js 16 (App Router, TypeScript) for both the UI and the API
(Route Handlers), Prisma as the ORM, Postgres (Supabase) as the datastore,
Tailwind for styling. One deployable unit, which maps cleanly onto Vercel.

**Data model** (`prisma/schema.prisma`):
- `Campaign` — event name/date/location + campaign name + status
  (`DRAFT` → `RUNNING` → `COMPLETED`).
- `Invitee` — belongs to a campaign; holds contact info, current `status`
  (`PENDING`, `IN_PROGRESS`, `CONFIRMED`, `DECLINED`, `UNDECIDED`, `FAILED`,
  `INVALID`), and an `attemptCount`.
- `CallAttempt` — one row per call attempt against an invitee (outcome,
  duration, error message, timestamps) — a full audit trail, not just the
  latest status.

**CSV import** (`src/lib/csv.ts`): parsed server-side with `papaparse`.
Each row is validated independently — missing name/phone, malformed phone
(loose E.164-style check) or email, and in-file duplicate phone numbers are
all caught. Invalid rows are still imported (so the team can see *why* a
row was skipped) but tagged `INVALID` and excluded from calling. Rows are
inserted with `createMany` in chunks of 1,000 so imports scale to very large
lists without hitting statement/payload limits.

**Simulated calling service** (`src/lib/callSimulator.ts`): the assessment
says a "simulated AI calling service" is provided — none shipped with the
brief I was given, so I built a small internal stand-in with the properties
the brief describes: variable call duration, and a realistic outcome
distribution that includes not just CONFIRMED/DECLINED/UNDECIDED but also
NO_ANSWER and PROVIDER_ERROR, so the campaign engine has real flakiness to
handle rather than a service that always succeeds.

**Campaign execution engine** (`src/lib/campaignEngine.ts` +
`/api/campaigns/[id]/process`): processes invitees in batches of 25. Calls
that resolve to CONFIRMED/DECLINED/UNDECIDED are terminal. NO_ANSWER and
PROVIDER_ERROR are retried automatically up to `MAX_ATTEMPTS` (3); after
that the invitee is marked `FAILED` so the team can see it needs manual
follow-up. The frontend drives this by repeatedly calling the process
endpoint until no `PENDING` invitees remain ("Start Campaign" / "Resume
Calling"), which keeps each serverless invocation short and bounded.

**Business-scale note:** this batch-polling approach is a pragmatic choice
for a 3-hour prototype running on Vercel's serverless functions (which have
execution-time limits). It works correctly at any scale, but for
10k–100k+ invitees a production version would replace client-driven
polling with a durable job queue (e.g. QStash, SQS, or BullMQ on a
long-running worker), so campaigns keep progressing even if no browser tab
is open, with proper rate limiting against the real calling provider and
exponential backoff on retries.

**Campaign management** — beyond the required create/start/track flow, the
dashboard also supports: retrying every `FAILED` invitee in one click
(resets attempts and resumes calling), exporting the full results as a CSV,
appending another CSV of invitees to an already-created campaign (with
duplicate-phone detection against the existing list), and editing or
deleting a campaign (delete cascades to its invitees and call history).

**Authentication** (`src/lib/auth.ts`, `src/lib/password.ts`, `src/proxy.ts`,
`src/app/api/auth/*`, `src/app/login`, `src/app/signup`): not required by the
brief, but requested afterward so only known team members can use the tool.
Deliberately simple — email + password, no email-verification step. Accounts
are created via a self-service `/signup` (any email/password works; there's
no company-domain restriction — see Known limitations). Passwords are hashed
with `bcryptjs`; sessions are a signed JWT (`jose`, HS256) in an HttpOnly
cookie, verified in `src/proxy.ts` (Next.js 16's replacement for
`middleware.ts`) on every request — it's the single gate in front of every
page and API route except `/login`, `/signup`, and `/api/auth/*`. The proxy
only decodes the JWT (no database lookup), which is both fast and matches
Next's own guidance to keep Proxy/Middleware checks lightweight.

## Important technical decisions

- **Postgres over SQLite** — SQLite's file-based storage doesn't persist on
  Vercel's serverless filesystem; every cold start would reset the data.
  Postgres (Supabase) is the only realistic choice for a Vercel deployment
  that needs to retain campaign state.
- **Full call-attempt history, not just a status field** — the brief asks
  "what happened with an individual invitee," which needs more than a
  single current status; storing every attempt lets the UI show a real call
  log and lets retries be explained rather than just overwriting state.
- **Invalid rows are imported, not silently dropped** — the business user
  needs to see *what* was wrong with their CSV, not just a smaller-than-
  expected invitee count.
- **Status model separates `FAILED` (retries exhausted) from `PENDING`
  (not yet contacted)** — the brief explicitly asks the team to distinguish
  "not yet successfully contacted" from problem cases, so these are kept as
  distinct, filterable statuses rather than collapsed together.

## Major assumptions

- No real calling provider was shipped with the assessment materials I
  received, so I built a simulated one with realistic behavior (see above)
  rather than leaving calling unimplemented.
- All campaigns are visible to any signed-in user (no per-user/team
  ownership or roles) — fine for a prototype used by one internal team.
- Self-service signup with no domain restriction or admin approval is
  acceptable for this prototype's audience (a small internal team who were
  given the URL directly), in exchange for not needing to send email.
- CSV is the input format (as shown in the brief); no other import formats
  were required.

## Known limitations

- Campaign execution relies on the browser tab staying open while polling
  the batch-process endpoint; if the tab is closed mid-run, the campaign
  simply pauses at its current progress and can be resumed later via
  "Resume Calling" (nothing is lost — progress is persisted after every
  batch — but it isn't a background job).
- Anyone can sign up with any email (no company-domain restriction, no
  invite/approval step) and, once signed in, can see and manage every
  campaign — there's no per-user ownership, roles, or admin/member
  distinction.
- No password reset flow (no email sending, per the request that prompted
  auth in the first place) — a forgotten password currently means creating
  a new account.
- Phone/email validation is intentionally loose (format checks only, no
  carrier/deliverability verification).

## What I'd improve with more time

- Replace batch polling with a real background job queue so campaigns run
  independently of the browser, plus a rate limiter in front of the (real)
  calling provider.
- Restrict signup to a company email domain (or switch to invite-only
  account creation) and add roles/per-team campaign scoping.
- Real-time updates (SSE/websockets) instead of polling for the dashboard.
- Stream large CSV uploads in chunks from the browser instead of one JSON
  request, so imports comfortably scale past what fits in a single
  serverless request body.

## AI usage

- **Tools used:** Claude (Claude Code) for the full implementation —
  scaffolding, schema design, API routes, UI, and this README.
- **What I used it for:** Turning the PDF assessment brief into a concrete
  plan and stack decision, then generating the Next.js/Prisma application
  end-to-end, including the simulated calling service and batch-processing
  engine.
- **One useful contribution from AI:** Recognizing upfront that SQLite
  wouldn't survive Vercel's serverless filesystem and steering the design
  to Postgres from the start, instead of hitting that as a deploy-time
  failure.
- **One situation where output was verified/modified:** Claude initially
  scaffolded with Prisma 7 (the newest major version, installed by
  default), which uses a different generator/config format
  (`prisma.config.ts`, a relocated client output path) than the
  widely-documented Prisma 5/6 patterns. Since this is brand-new and
  higher-risk for a time-boxed deploy, it was pinned back down to the
  stable Prisma 6 line and the leftover v7 config file was removed, then
  the schema and client setup were re-verified against that version.
