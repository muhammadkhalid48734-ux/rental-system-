# Outreach Desk

A daily work queue for a one-person web design agency that sends **manual** cold DMs to US party and bounce-house rental businesses.

**The app never sends anything.** For each lead it writes the message, copies it, opens the lead's profile, and records that *you* sent it. No DM scraping, no browser automation of Instagram or Facebook.

- Backend: Node + Express, Google Sheets as the database (`googleapis`, service account)
- Frontend: React (Vite), served on localhost

## Try it without Google Sheets

```bash
npm install
npm run demo        # API on :3001 (in-memory data, 3 EXAMPLE leads) + app on http://localhost:5173
```

Demo mode resets when you stop it. Use it to look around, then set up the Sheet below.

## Setup with Google Sheets

### 1. Create a service account

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account** (any name, e.g. `outreach-desk`). No roles are needed.
4. Open the new service account → **Keys → Add key → Create new key → JSON**. A key file downloads.
5. Save it as `credentials/service-account.json` in this project. The `credentials/` folder and every `*service-account*.json` file are in `.gitignore`. **Never commit this file.**

### 2. Create the Sheet and share it

1. Create a blank Google Sheet. The ID is the long part of its URL: `https://docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`.
2. Click **Share** and add the service account's email (the `client_email` value in the JSON, ending in `iam.gserviceaccount.com`) as an **Editor**.

You do not need to create any tabs. On first start the app creates `Leads`, `Log` and `Config`, writes the header rows, and fills in default settings.

### 3. Fill in `.env`

```bash
cp .env.example .env
```

```
GOOGLE_SHEET_ID=<the sheet id>
GOOGLE_SERVICE_ACCOUNT_JSON=./credentials/service-account.json
```

### 4. Run

```bash
npm install
npm run seed        # optional: adds 3 fake leads named "EXAMPLE – …"
npm run dev         # API on :3001 + app on http://localhost:5173
```

Single-process mode (what you would leave running day to day):

```bash
npm run build
npm start           # everything on http://localhost:3001
```

The server listens on `127.0.0.1` only and rejects requests for any other host name. There is no login, so do not expose it to a network.

Delete the EXAMPLE leads from the Leads tab (open a lead → More → Edit lead → Delete) when you are done trying things out.

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

**Log**: `timestamp, leadId, account, track, step, channel`. `track` is `cold`, `demo` or `reply` (the photo-permission message); `step` is the index of the message sent (0 = first message of that track); `channel` is `ig`, `fb` or `email`. Pressing **Undo** appends a row with channel `undo` that cancels the matching send, so the daily count frees the slot without deleting history.

**Config**: `key, value` for `accA, accB, cap, gaps, setupPrice, monthlyPrice, yourName, studio, address, autoMark`. Everything is editable in the Settings tab.

You can edit the Sheet by hand. Reload the app (Refresh button) to pick changes up.

## How the day works

1. **Today** shows, in order: *Replies to handle*, *Follow-ups due* (most overdue first), *New DMs*, *Sent today*.
2. On a card, click **Copy + open Instagram** (or Facebook). It copies the textarea and opens the profile in a new tab. Paste, send it yourself, come back and press **Mark sent**. **Copy as email** adds a subject line and a footer with your name, studio, postal address and an unsubscribe line.
3. Daily limit: 10 **new** first messages per account (configurable), counted from the Log for today's date. Follow-ups and replies you send also add to each account's real daily volume, even though only new DMs fill the meters.
4. Sequence: pitch → follow-up 1 → 2 → 3 (gaps from Config, default 2/3/4 days), then the lead is `done`. A follow-up always comes from the account that sent the first message.
5. When someone replies, use **More → They replied**. The card moves to the top and offers the photo-permission message. After they agree, build the private demo, paste the link into the card, and the message switches to demo delivery. Marking that sent starts the demo track (demo message, then 3 nudges).
6. For `down`/`parked` leads, open the site and tick **I opened it and confirmed the problem**. **Mark sent** stays disabled for the first message until you do, because the pitch says you tried the site.

### Import

Leads tab → **Import**. Paste rows copied from a sheet (tab-separated): `business, website, Instagram, Facebook, note, email`. Duplicate names are skipped, `fbclid`/`utm_*` and similar tracking parameters are stripped, an email is pulled from the email column or the note, and the problem is guessed from the note and whether a site exists. Check the preview before importing. Cells that contain line breaks will split into extra rows.

### Auto-mark

Settings → **Auto-mark as sent**. Off by default. When on, clicking **Copy + open Instagram/Facebook** also marks the lead as sent immediately (the 8-second Undo still applies). It records the click, not the actual send, so leave it off if you sometimes copy and then change your mind.

## Message rules built in

- The pitch never says a site is already built. It offers to build a free private demo "within the hour of you saying yes".
- No link in the first DM.
- The pitch says you run a small web design studio. The "Where are you based?" quick reply says plainly that the studio is in Pakistan.
- At most 3 follow-ups.

You can edit any message in its textarea before copying. Edits are kept until you mark the message sent.

## API

`GET/POST /api/leads`, `PATCH/DELETE /api/leads/:id`, `GET/PUT /api/config`, `POST /api/log`, plus `GET /api/log` (last 14 days; the browser needs it for today's counts, the streak and weekly stats). `POST /api/leads` accepts a single lead, an array, or `{ "leads": [...] }`.

The frontend reads once on load and after every write. It does not poll. The only other reads are the Refresh button and a reload when you return to the tab after at least a minute (skipped while you are typing).

## Tests

```bash
npm test
```

Covers message generation, the follow-up sequence, daily limits, undo accounting, ordering, and the importer.

## Troubleshooting

- **"Google Sheets refused access"**: the sheet ID is wrong, or the sheet is not shared with the service account email as Editor.
- **"Missing GOOGLE_SHEET_ID …"**: `.env` is missing or empty.
- **Quota / 429**: Sheets limits reads per minute. Wait a minute; the app makes 3 reads per refresh.
