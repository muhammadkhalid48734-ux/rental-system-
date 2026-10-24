# Outreach Desk

A daily work queue for a one-person web design agency that sends **manual** cold DMs to US party and bounce-house rental businesses.

**The app never sends anything.** For each lead it writes the message, copies it, opens the lead's profile, and records that *you* sent it after you press **Mark sent**. No DM scraping, no browser automation of Instagram or Facebook.

- Backend: Node + Express. Runs as one Vercel serverless function in production, and as a normal local server for development.
- Database: Google Sheets (`@googleapis/sheets`, service account)
- Frontend: React (Vite), static files
- Messages: built-in templates, optionally personalized per lead with Groq (OpenAI-compatible API, plain `fetch`, key kept on the server)
- Login: one shared password, signed session cookie

## Try it locally without any accounts

```bash
npm install
npm run demo        # API on :3001 (in-memory data, 3 EXAMPLE leads) + app on http://localhost:5173
```

Demo mode resets when you stop it and **only runs locally** (production refuses it). Add `GROQ_API_KEY=...` to a `.env` file to try the AI features there too.

## Setup

### 1. Google Sheets (service account)

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account** (any name, e.g. `outreach-desk`). No roles are needed.
4. Open it → **Keys → Add key → Create new key → JSON**. A key file downloads.
5. Locally, save it as `credentials/service-account.json`. The `credentials/` folder and every `*service-account*.json` / `*-key.json` file are in `.gitignore`. **Never commit this file.**
6. Create a blank Google Sheet. Its ID is the long part of the URL: `https://docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`.
7. Click **Share** and add the service account's email (the `client_email` in the JSON, ending in `iam.gserviceaccount.com`) as an **Editor**.

You do not create any tabs. On first use the app creates `Leads`, `Log`, `Messages` and `Config`, writes the header rows, and fills in default settings.

### 2. Groq API key (optional)

1. Sign in at [console.groq.com](https://console.groq.com/) and open **API Keys → Create API Key**.
2. Copy the key (it starts with `gsk_`) and set it as `GROQ_API_KEY`. It is shown once.

Without a key everything still works with the built-in templates; Settings shows that personalization is off.

> **Privacy:** free-tier AI providers may use prompts to improve their service. Only lead data goes into prompts: business name, the owner's first name, city, problem, note, hook, and the messages you already sent to that lead. Social links, email addresses, ids and your account names are never sent. Do not put anything private in a lead's note.

### 3. Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `GOOGLE_SHEET_ID` | yes | The sheet ID from its URL. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | **Production:** the full key file contents as one line of JSON. **Local:** a file path such as `./credentials/service-account.json`. Both forms work. |
| `APP_PASSWORD` | production | The login password. At least 10 characters; use a long passphrase. |
| `SESSION_SECRET` | production | At least 32 random characters, e.g. `openssl rand -hex 32`. Signs the session cookie. |
| `GROQ_API_KEY` | no | Turns on Regenerate and "Generate all". Server-side only. |
| `GROQ_MODEL` | no | Default `openai/gpt-oss-120b`. |
| `GROQ_MAX_RPM` | no | Max AI requests per minute, default `10`. Keeps free-tier limits safe. |
| `GROQ_BASE_URL` | no | Defaults to `https://api.groq.com/openai/v1`. Only meant for tests with a fake server. |
| `PORT` | no | Local server port, default `3001`. |

In production (any Vercel deployment, or `NODE_ENV=production`) the app **refuses to respond** unless both `APP_PASSWORD` and `SESSION_SECRET` are set and long enough. Locally, login is off unless you set them.

Locally, copy `.env.example` to `.env` and fill it in. `.env` is git-ignored.

## Run locally

```bash
npm install
npm run seed        # optional: adds 3 fake leads named "EXAMPLE – …" to your sheet
npm run dev         # API on 127.0.0.1:3001 + app on http://localhost:5173
```

The local server listens on `127.0.0.1` only and rejects other host names. (This restriction is local-only; on Vercel the app is public and protected by the login instead.)

Single-process local mode: `npm run build && npm start` serves everything on http://localhost:3001.

## Deploy on Vercel

The repo is already set up for Vercel: `vercel.json` builds the client to static files, and `api/[...path].js` is the single serverless function that serves every `/api/*` route through the same Express app used locally.

1. Install the CLI and sign in: `npm i -g vercel`, then `vercel login`.
2. From the project folder, create the project: `vercel link` (choose "Other" if asked for a framework; the settings come from `vercel.json`).
3. Add the environment variables for **Production**. Paste secrets when prompted and mark them sensitive:
   ```bash
   vercel env add GOOGLE_SHEET_ID production
   jq -c . credentials/service-account.json | vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
   vercel env add APP_PASSWORD production
   openssl rand -hex 32 | vercel env add SESSION_SECRET production
   vercel env add GROQ_API_KEY production        # optional
   vercel env add GROQ_MAX_RPM production        # optional
   ```
4. Deploy: `vercel --prod`.
5. Open the URL, sign in with `APP_PASSWORD`, then fill in your name, studio and postal address in **Settings**.

Before any `git push` or deploy, check `git status` and make sure no `.env`, key file or `node_modules` is listed. They are in `.gitignore` and `.vercelignore`.

### Production notes

- **Login limits on serverless.** Failed logins are limited to 5 per 15 minutes per IP, plus a fixed delay on every failure. That counter lives in each function instance's memory, so treat it as best effort. The real protection is a long `APP_PASSWORD`. For a hard limit, add a rate-limit rule for `POST /api/login` in the Vercel dashboard under **Firewall**.
- **AI request limit.** `GROQ_MAX_RPM` is enforced per function instance too. In practice the browser sends one `/api/generate` request at a time, and each request is short (it falls back to the template instead of running past the function time limit).
- **No server memory is used for data.** Leads, log, sent messages and settings are all in the Sheet. Browser-side only: generated versions and unsent edits are cached in that browser's localStorage.
- **Session cookie.** `__Host-od_session`: signed, `HttpOnly`, `Secure`, `SameSite=Lax`, 7 days. Every `/api` route requires it except `POST /api/login`. Writes with a foreign `Origin` header are rejected.

## Sheet layout

**Leads** (one row per lead)
`id, name, city, owner, fb, ig, email, site, problem, hook, note, status, track, step, account, lastSentAt, repliedAt, demoLink, verified, order`

| column | values |
| --- | --- |
| `problem` | `outdated` · `down` · `parked` · `nosite` · `social` |
| `status` | `queued` · `active` · `replied` · `won` · `lost` · `done` |
| `track` | `cold` · `demo` |
| `step` | messages already sent in the current track (0–4) |
| `account` | `A` or `B` |
| `verified` | `TRUE`/`FALSE`: "I opened it and confirmed the problem" |
| `order` | import order; decides the default queue order within a priority |

**Log**: `timestamp, leadId, account, track, step, channel`. `track` is `cold`, `demo` or `reply`; `step` is the index of the message sent (0 = first of that track); `channel` is `ig`, `fb`, `email` or `undo`; backfilled rows from an import use `imported` (see Import).

**Messages**: `timestamp, leadId, kind, text`. Written when you press **Mark sent**, with the text exactly as you sent it (after your edits). `kind` is `cold`, `followup1-3`, `replyAck`, `demo`, `demoNudge1-3`. **Undo** appends a compensating row (`<kind>:undo`, empty text) instead of deleting anything. These are the "earlier messages" the AI is told not to repeat.

**Config**: `key, value` for `accA, accB, cap, gaps, yourName, studio, address, demoTurnaround` and the three demo packages (`pkgNName`, `pkgNSetup`, `pkgNMonthly`, `pkgNNote`). All editable in Settings.

### Demo delivery time

`demoTurnaround` (Settings → *Demo delivery time*) finishes the sentence "I'd love to build you a free demo … and send it over ___". Default: *usually within the hour during our support hours, otherwise by the next morning (US time)*. It is the only delivery promise the app ever writes: the first-message template, the AI system prompt and task, the "What do you need from me?" and "How fast is the demo?" quick replies all read it from Config. The AI must include it word for word in a first message, and any draft that promises a different delivery time (for example "within the hour of you saying yes" or "in 30 minutes") is rejected and retried, then replaced by the template. One line, up to 160 characters, no links or prices. Only promise what you can keep.

### Demo packages

Defaults: **Website** ($247 setup, no monthly fee), **Website that books for you** ($297 setup + $33/month, labelled "Recommended"), **Book, pay & sign online** ($597 setup + $79/month). Monthly may be empty; the demo message then says "no monthly fee". The demo message always shows setup and monthly together for every package and ends with: cancel anytime, no contract, and your website, domain and photos stay yours. The app writes no other prices anywhere.

## How the day works

1. **Today** shows, in order: *Replies to handle*, *Follow-ups due* (most overdue first), *New DMs*, *Sent today*.
2. On a card, click **Copy + open Instagram** (or Facebook). It copies the textarea and opens the profile. Paste, send it yourself, return, and press **Mark sent**. That button is always an explicit click. **Copy as email** adds a subject and a footer with your name, studio, postal address and an unsubscribe line.
3. Daily limit: 10 **new** first messages per account (configurable), counted from the Log. Follow-ups and replies you send also add to each account's real volume.
4. Sequence: pitch → follow-up 1 → 2 → 3 (gaps from Config, default 2/3/4 days), then `done`. A follow-up always comes from the account that sent the first message.
5. **More → They replied** moves a lead to the top. After they agree to photos, build the demo, paste the link into the card, and the message becomes the demo delivery. Marking it sent starts the demo track (demo, then 3 nudges).
6. For `down`/`parked` leads, open the site and tick **I opened it and confirmed the problem**; the first message cannot be marked sent until you do, because it says you tried the site.

### Layout and keyboard

On a screen 1024px or wider, Today is a two-pane workbench: the queue on the left, the selected lead on the right. After **Mark sent** the next lead opens automatically, and **Undo** (8 seconds) brings the previous one back. On a phone the queue is a list and a lead opens full screen; **Back to queue** returns to the same scroll position. The header shows "N of M tasks today" (new DMs plus follow-ups) and each account's meter.

| Key | Action |
| --- | --- |
| Up / Down | Move through the queue |
| C | Copy the current message |
| ? | Show the shortcuts |

There is deliberately no shortcut for **Mark sent**; it is only ever a click. The **About this lead** strip above the message shows the problem, the note and the hook (edit them in place, saved when you leave the field) and an **Open site** link.

Fonts (Plus Jakarta Sans, Inter) and icons (Phosphor) are bundled with the app, so the Content-Security-Policy allows only `'self'` for styles and fonts and nothing is loaded from a third party.

### Accounts

Every new lead is sent from Account A or B. Choose it in **Add lead** (**Send from account**; leave it on Automatic to use whichever account has room) or on the lead's card (**Send from account**, with each account's name and `sent/limit` count). A lead's follow-ups always stay on the account that sent the first message.

### Personalized messages

With a Groq key set, the personalized message is written automatically the first time a lead is opened, and **Copy**, **Copy + open** and **Mark sent** stay locked until it is ready (or until you type your own text). If the AI is unavailable, the card says so and offers **Write personalized message** to retry. Without a key, only the built-in **Template** exists. Each card can be rewritten with **Regenerate**:

- Optional **Hint** ("shorter", "don't mention phones"). It can change tone or length but never the rules.
- **Versions ◀ ▶** keep every draft, including your own edits, so nothing is lost. Replacing text you edited needs an in-page confirmation, and your edit is saved as a version first.
- Badge: **Personalized** or **Template**. If both hook and note are empty you get a reminder: the more specific your note, the more personal the message.
- **Generate all for today** goes through the Today cards one at a time with "7 of 20" progress and a Cancel button. It skips cards you edited and cards that already have a personalized draft, pauses to stay under `GROQ_MAX_RPM`, stops cleanly if the provider rate-limits, and leaves the rest as templates.
- Generated text is cached per lead and step in your browser, so reopening the app does not regenerate.

The server builds every prompt itself from the stored lead, so the browser can only send a lead id, a message kind, an optional hint and earlier drafts. Every draft is checked before it is returned: no link, price or website address outside demo messages; first messages 110 words or fewer; follow-ups 70 or fewer; no markdown; at most one emoji; nothing that implies the site is already built ("I built", "already built", …). One failed draft is retried with the problem stated; if it fails again you get the template. In demo messages the AI writes the intro and the server inserts the exact demo link and the package list from Config.

### Import

Leads tab → **Import**. Paste tab-separated rows (from a sheet). Columns in order:

| # | column | notes |
| --- | --- | --- |
| 1-6 | `business, website, Instagram, Facebook, note, email` | as before. Duplicate names are skipped, tracking parameters stripped, an email pulled out, the problem guessed. |
| 7 | `status` (optional) | `queued`, `active`, `replied`, `won`, `lost`, `done` |
| 8 | `step` (optional) | `0`-`4`: how many messages were already sent |
| 9 | `lastSentAt` (optional) | `YYYY-MM-DD`, a real date, not in the future |
| 10 | `account` (optional) | `A` or `B` |

A header row is ignored. A 6-column paste behaves exactly as before: every lead is queued at step 0.

If a row has any of columns 7-10, it is imported as a **cold-track** lead with status, step, lastSentAt and account exactly as given, so **Today** shows its follow-up on the real due date (using the gaps from Settings) and the card shows the right step label. Blank cells get sensible defaults, which the preview spells out: a step without a status becomes `active`, `done` without a step means 4, and **Account for rows with none** in the dialog fills a missing account. A `replied` lead lands in *Replies to handle* straight away.

The preview checks every row and shows clear errors you can fix in place (status, step, last sent, account) or skip with the checkbox. Rows with errors are never imported. It also shows each lead's step, last sent date and **next due date**. Rows are rejected when: `step` is not a whole number 0-4; the date is not `YYYY-MM-DD`, not a real calendar date, or in the future; `status` or `account` is not one of the listed values; a `queued` lead has a step or date; an `active` lead has step 0 or 4 or no date; the step is above 0 but there is no account (follow-ups must come from the same account as the first message).

**Log backfill.** For each imported lead the app adds one Log row per message already sent (steps 0 to step-1) with channel `imported`. The latest row carries `lastSentAt`; earlier rows have a blank timestamp. These rows are history only: they never count toward today's daily limits, the *Sent today* list, the progress ring or the streak, even if `lastSentAt` is today. "Contacted" in the Leads tab is computed from the leads themselves, so imported leads count there as soon as they have a step.

## API

All routes need the session cookie except `POST /api/login`.

`POST /api/login` · `POST /api/logout` · `GET /api/session` · `GET/POST /api/leads` · `PATCH/DELETE /api/leads/:id` · `GET/PUT /api/config` · `GET/POST /api/log` · `POST /api/generate`

`POST /api/generate { leadId, kind, hint?, previousVariants? }` with `kind` one of `cold, followup1, followup2, followup3, demo, demoNudge1, demoNudge2, demoNudge3, replyAck` returns `{ text, source: "personalized" | "template" }`. Errors carry a `code`: `rate_limited`, `bad_key`, `provider_down`, `not_configured` (and `bad_output`, which is retried and then becomes a template).

The frontend reads once on load and after every write. It does not poll.

## Tests

```bash
npm test
```

Covers message building, sequences and limits, the prompt builder (whitelisted lead fields, earlier messages), the draft validator, the Groq adapter with mocked `fetch` (success, 429 then success, 401, malformed output, timeouts), the request queue, authentication (every `/api` route returns 401 without a session, cookie flags, login rate limit, fail-closed production), the Vercel handler, the Messages tab and undo, and `.gitignore`.

## Troubleshooting

- **"Server is not configured"**: `APP_PASSWORD` / `SESSION_SECRET` are missing or too short in production.
- **"Google Sheets refused access"**: wrong sheet ID, or the sheet is not shared with the service account email as Editor.
- **"GOOGLE_SERVICE_ACCOUNT_JSON … is not valid JSON"**: paste the entire key file as one line (`jq -c . key.json`).
- **Rate limit messages**: wait a minute, or lower `GROQ_MAX_RPM`.
