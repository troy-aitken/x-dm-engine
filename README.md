# x-dm-engine

Auto-DM users who like or reply to your tweets. Self-hosted, open source, BYO X API keys.

Drop in a tweet URL and a DM body. The engine polls likers and repliers on an interval, sends a DM to each one (deduped, UTM-tagged), and logs every attempt. Pause, resume, or let it auto-expire after N days.

Built and battle-tested by [BuzzLead](https://buzzlead.io). Extracted from our internal stack so other agencies and operators can run it.

---

## What it does

- **Watches a tweet.** Polls the X API for new likers + repliers every N minutes.
- **DMs them.** One message per user, sent through your authorized X account.
- **Tags every link.** Adds `utm_source=x`, `utm_medium=dm`, `utm_campaign=<slug>`, `utm_content=like|reply` to any URL in the body — so you actually know what's converting.
- **Dedupes.** Tracks who's already been DM'd so the same user never gets two.
- **Respects rate limits.** Configurable batch size per cycle (default 5/cycle to stay under X Basic's 5-per-15-min DM cap).
- **Auto-expires.** Set a duration (3/7/14/30 days). Campaign flips to Done automatically.
- **Auth + storage agnostic.** Pluggable store: Notion (recommended for teams) or local JSON file (for solo).

## Requirements

- **Node.js 20+**
- **X Developer account on Basic tier** ($200/mo) or higher.
  Free tier does **not** include the DM endpoint. Confirm the price before signing up.
- **Notion workspace** (optional but recommended) — free tier works fine.

## How it works (architecture)

```
                 ┌────────────┐
   tweet URL ──▶ │   engine   │ ──▶ X API: liking_users + search/recent
                 │  (poller)  │
                 │            │ ──▶ X API: send DM (with UTM-tagged body)
                 └─────┬──────┘
                       │
                       ▼
                 ┌────────────┐
                 │   store    │  Notion DBs  OR  ./data/x-dm-engine.json
                 │            │  • X Tokens
                 │            │  • Campaigns
                 │            │  • DM Log
                 └────────────┘
```

A single Express process runs both the HTTP API and the background poller. No database server, no queue, no worker fleet.

---

## Quick start

```bash
git clone https://github.com/<your-fork>/x-dm-engine
cd x-dm-engine
npm install
cp .env.example .env
```

### 1. Get X API credentials

1. Go to [developer.x.com](https://developer.x.com) → Projects & Apps → create a new app.
2. Subscribe to the **Basic tier** ($200/mo). Free tier won't work — DM endpoint is gated.
3. In the app's **User authentication settings**:
   - **App permissions:** Read and write and Direct Messages
   - **Type of App:** Web App, Automated App or Bot (Confidential client)
   - **Callback URI:** `http://localhost:8787/callback` (for local OAuth)
   - **Required scopes** (set automatically when you toggle DM permissions): `tweet.read users.read like.read dm.read dm.write offline.access`
4. Copy the **Client ID** and **Client Secret** into `.env`:

```
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_REDIRECT_URI=http://localhost:8787/callback
```

### 2. Pick a storage backend

**Option A — Notion (recommended, especially for teams):**

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations). Copy the Internal Integration Token → `NOTION_API_KEY`.
2. Create a parent page in Notion (e.g. "X DM Engine"). Click `•••` → **Connections** → add your integration. Copy the page ID from the URL → `NOTION_PARENT_PAGE_ID` (the 32-char hex string).
3. Run the setup script:

   ```bash
   npm run setup-notion
   ```

   Paste the three printed IDs back into `.env`:

   ```
   NOTION_TOKENS_DB_ID=...
   NOTION_CAMPAIGNS_DB_ID=...
   NOTION_DM_LOG_DB_ID=...
   ```

**Option B — Local JSON (single machine, solo use):**

Set `STORE_BACKEND=json` in `.env`. Skip the Notion section. Data lives in `./data/x-dm-engine.json` (gitignored).

### 3. Connect your X account

```bash
npm run oauth -- <account_label>
# Example:
npm run oauth -- buzzlead_io
```

This spins up a temporary local server, prints an authorization URL, and saves tokens to your store after you approve. The `account_label` is what you'll pass as `owner` when starting campaigns.

### 4. Start the server

```bash
npm run dev
# or
npm run build && npm start
```

You should see:

```
{"t":"...","level":"info","msg":"x-dm-engine listening","meta":{"port":8787}}
```

### 5. Start a campaign

```bash
curl -X POST http://localhost:8787/campaigns/start \
  -H 'Content-Type: application/json' \
  -d '{
    "tweetUrl": "https://x.com/yourhandle/status/1820000000000000000",
    "dmMessage": "Hey! Saw you liked the post. Here'\''s what I promised: https://example.com/playbook",
    "owner": "buzzlead_io",
    "campaignName": "Playbook Launch Wk1",
    "durationDays": 7
  }'
```

The poller will start DMing within ~5 seconds. Check progress:

```bash
curl http://localhost:8787/campaigns
curl http://localhost:8787/campaigns/<id>/log
```

---

## API

All routes are JSON. There's no built-in auth — put this behind a reverse proxy with basic auth, Cloudflare Access, or your auth solution of choice before exposing it publicly.

| Method | Path                       | Body                                                                   | Notes                              |
| ------ | -------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| POST   | `/campaigns/start`         | `{ tweetUrl, dmMessage, owner, campaignName?, durationDays? }`         | Creates and activates a campaign   |
| POST   | `/campaigns/stop/:id`      | —                                                                      | Pauses                             |
| POST   | `/campaigns/resume/:id`    | —                                                                      | Reactivates a paused campaign      |
| POST   | `/campaigns/:id/poll`      | —                                                                      | Manual trigger (useful for testing)|
| GET    | `/campaigns`               | —                                                                      | Lists all campaigns                |
| GET    | `/campaigns/:id/log`       | —                                                                      | DM-by-DM log for a campaign        |
| GET    | `/health`                  | —                                                                      | `{ ok: true }`                     |
| GET    | `/oauth/start?account=foo` | —                                                                      | Browser-based OAuth (alternative to CLI) |
| GET    | `/oauth/callback`          | —                                                                      | OAuth callback target              |

---

## Configuration

| Env var                 | Default                          | Notes                                                            |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `X_CLIENT_ID`           | —                                | From X dev portal                                                |
| `X_CLIENT_SECRET`       | —                                | From X dev portal                                                |
| `X_REDIRECT_URI`        | `http://localhost:8787/callback` | Must match the X app exactly                                     |
| `STORE_BACKEND`         | `notion`                         | `notion` or `json`                                               |
| `NOTION_API_KEY`        | —                                | Required if `STORE_BACKEND=notion`                               |
| `NOTION_PARENT_PAGE_ID` | —                                | Only used during `setup-notion`                                  |
| `NOTION_TOKENS_DB_ID`   | —                                | From `setup-notion` output                                       |
| `NOTION_CAMPAIGNS_DB_ID`| —                                | From `setup-notion` output                                       |
| `NOTION_DM_LOG_DB_ID`   | —                                | From `setup-notion` output                                       |
| `JSON_DATA_DIR`         | `./data`                         | Only used if `STORE_BACKEND=json`                                |
| `PORT`                  | `8787`                           |                                                                  |
| `POLL_INTERVAL_MS`      | `900000` (15 min)                | How often the engine checks active campaigns                     |
| `DM_BATCH_LIMIT`        | `5`                              | Max DMs per campaign per poll. X Basic tier: 5/15min, ~100/day   |

---

## Deploy

### Railway (one-click-ish)

1. Push the repo to GitHub.
2. Create a new Railway project from the repo.
3. Add the env vars from `.env`. Make sure `X_REDIRECT_URI` points at your Railway URL (e.g. `https://your-app.up.railway.app/oauth/callback`) and that **exact** URL is also registered in your X app settings.
4. Deploy.
5. From your local machine, run `npm run oauth -- <account>` once with `X_REDIRECT_URI` pointed at Railway — but actually it's easier to use the browser flow:
   - Visit `https://your-app.up.railway.app/oauth/start?account=<your_label>`
   - Authorize
   - Tokens are stored remotely, ready for campaigns

### Self-hosted (any node-friendly host)

Standard `npm run build && npm start`. Process manager of your choice. Persistent storage only matters if you use `STORE_BACKEND=json` (`./data/` must survive restarts).

---

## Limits & gotchas

- **DM endpoint requires X Basic ($200/mo).** This is the single biggest gotcha. Free tier returns 403.
- **5 DMs / 15 min, ~100/day on Basic.** Pro tier raises this. The default `DM_BATCH_LIMIT=5` keeps you under the burst cap; the 15-min default `POLL_INTERVAL_MS` keeps you under the rolling cap.
- **Closed-DM users return 403.** The engine logs them as `skipped` (not `failed`) so they don't get retried forever. They also don't count against deduplication, so if they later open DMs you can re-run.
- **Replier search uses recent-search.** It only sees replies from the past 7 days. If you're DMing a tweet older than that, replies won't surface. Likers are unaffected.
- **No auth on the HTTP API by default.** Put a reverse proxy in front. Or fork and add auth — `src/server.ts` is ~50 lines.

---

## Use it responsibly

DMs are powerful and easy to abuse. Don't:

- Send the same DM to people who didn't actually engage with your tweet.
- DM people across many tweets with the same body — X will flag your account.
- Hide who you are. The whole point is "you liked X, here's the thing."

Do:

- Make the DM specifically reference what they engaged with.
- Give them something useful in the first message (resource, calendar link, link to a real artifact).
- Watch your reply rate. If it's bad, your message is bad. Iterate.

---

## License

MIT. Use it, fork it, ship it. Attribution appreciated but not required.

If you build something cool with this, [tell us](https://buzzlead.io). We collect war stories.
