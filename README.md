# Falcon AI

Executive email assistant. Monitors an IONOS inbox, uses AI to classify every incoming email, escalates important ones to you over WhatsApp, drafts replies on your instruction, and **never sends an email without your explicit `SEND` approval**.

Built on Node.js, Express, MongoDB, BullMQ + Redis, imapflow, nodemailer, OpenRouter, and the WhatsApp Cloud API.

## How it works

```
IONOS Inbox ──► IMAP poller ──► parse + dedupe ──► AI classify ──► filter spam/newsletter/promo
                                                                        │
                                            important? ──► WhatsApp notification ──► you reply
                                                                        │
                                                              instruction ──► AI draft
                                                                        │
                                                              draft shown on WhatsApp
                                                                        │
                                                        SEND / EDIT / CANCEL (WhatsApp or API)
                                                                        │
                                                              SMTP send (only on SEND)
```

- Every email is stored in MongoDB (`Email`), grouped into threads (`Conversation`), with AI drafts tracked (`Draft`) and every action logged (`Log`).
- Deduplication is enforced by a unique index on `Message-ID`; the IMAP poller additionally tracks the last UID seen.
- Attachments are downloaded to `uploads/` and re-attached to replies.
- Job retries with exponential backoff via BullMQ; errors are logged to console + MongoDB.

## Requirements

- Node.js >= 20
- MongoDB (local or Atlas)
- Redis >= 6 (for BullMQ)
- An IONOS mailbox with IMAP and SMTP enabled
- An OpenRouter API key: https://openrouter.ai/keys
- A WhatsApp Business Platform app (Meta Developer): https://developers.facebook.com
- A public HTTPS URL for the webhook (domain, tunnel like `ngrok`, etc.)

## Installation

```bash
npm install
cp .env.example .env
```

Fill in `.env` with real values, then start MongoDB and Redis.

### IONOS settings

| Purpose  | Host            | Port | Security | User / Password        |
| -------- | --------------- | ---- | -------- | ---------------------- |
| IMAP     | `imap.ionos.com` | 993  | TLS      | mailbox address + password |
| SMTP     | `smtp.ionos.com` | 465  | SSL      | mailbox address + password |

### Run (development, single process)

Workers run inside the API process when `ENABLE_WORKERS=true`:

```bash
npm run dev
```

### One-command start (recommended)

`start.sh` checks that MongoDB and Redis are running (starting them via Homebrew services, with a direct-binary fallback, if not), verifies `.env` and `node_modules`, waits for the databases to become reachable, then starts Falcon:

```bash
./start.sh          # dev mode (node --watch)
./start.sh start    # production mode (npm start)
./start.sh worker   # workers only
./start.sh check    # only ensure dependencies are up, don't start the app
```

### Run with PM2 (production, two processes)

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs falcon-api falcon-workers
```

- `falcon-api` – Express API + webhook
- `falcon-workers` – IMAP poller, email processor, WhatsApp command processor

## WhatsApp setup

Falcon ships with two interchangeable WhatsApp providers, selected with `WHATSAPP_PROVIDER`:

### Option A: Baileys (recommended for personal use, no Meta app)

```bash
WHATSAPP_PROVIDER=baileys
WHATSAPP_RECIPIENT=918757921866   # your number, country code + number, no +/spaces
```

1. Start the app (or the workers process).
2. A QR code is printed to the console (`pm2 logs falcon-workers` in PM2 mode) — or fetch it at `GET /whatsapp/qr`.
3. On your phone: **WhatsApp → Settings → Linked devices → Link a device** and scan the QR.

No Meta developer app, no access token, no phone number ID. The session is stored in `uploads/baileys-auth/` and persists across restarts. Delete that folder to re-pair.

> Unofficial protocol. Keep your phone online occasionally and avoid automated spamming; WhatsApp can ban numbers that misuse it.

### Option B: WhatsApp Cloud API (official, for production)

1. Create an app in Meta Developer → add the **WhatsApp product**.
2. Add a test number and get a temporary access token + phone number ID.
3. Set `WHATSAPP_PROVIDER=cloud` plus `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_RECIPIENT` in `.env`.
4. Expose the server publicly (e.g. `ngrok http 3000`) and set `WEBHOOK_PUBLIC_URL`.
5. In the Meta app → **WhatsApp → Configuration → Webhook**, set:
   - Callback URL: `https://<your-domain>/webhook`
   - Verify token: exactly what you put in `WHATSAPP_VERIFY_TOKEN`
6. Click **Verify and save**; Falcon answers the challenge automatically, then subscribe to the `messages` field.

In both modes Falcon only accepts commands from `WHATSAPP_RECIPIENT`; all other senders are ignored.

## Usage

1. Falcon polls the inbox (default every 60s, `POLL_INTERVAL_MS`).
2. Important emails produce a WhatsApp notification:

```
📩 New Email

Priority: High
Category: Client
From: Jane Doe <jane@acme.com>
Subject: Q3 proposal follow-up

Summary: ...

Suggested Action: ...

Reply with instructions.
```

3. Reply with instructions (or just `Reply professionally`). Falcon sends the draft back:

```
✍️ Draft ready for approval

Subject: Re: Q3 proposal follow-up

...draft body...

Signature: ...

Reply SEND to send, EDIT <new instructions> to revise, CANCEL to discard.
```

4. Then reply:
   - `SEND` — sends the email via SMTP (adds attachments from the original email, and `In-Reply-To`/`References` headers to keep the thread)
   - `EDIT <new instructions>` — regenerates the draft
   - `CANCEL` — discards the draft

Spam, newsletters, and promotions are classified by AI and ignored, backed by deterministic header/subject heuristics.

## API

| Method | Path                | Description                                     |
| ------ | ------------------- | ----------------------------------------------- |
| GET    | `/`                 | Service info                                    |
| GET    | `/health`           | Health + connection status + counts             |
| GET    | `/webhook`          | WhatsApp webhook verification (challenge, cloud provider) |
| POST   | `/webhook`          | WhatsApp inbound messages (cloud provider)                |
| GET    | `/whatsapp/qr`      | Current Baileys pairing QR (Baileys provider)            |
| GET    | `/emails`           | List emails (`?status=`, `?category=`, `?limit=`, `?page=`) |
| GET    | `/emails/:id`       | Single email                                    |
| POST   | `/emails/:id/notify`| Re-send the WhatsApp notification              |
| GET    | `/drafts`           | List drafts (`?status=`)                        |
| GET    | `/drafts/:id`       | Single draft                                    |
| POST   | `/drafts/:id/send`  | Send a generated draft (manual override)        |
| POST   | `/drafts/:id/cancel`| Cancel a generated draft                        |

> The primary send/cancel channel is WhatsApp (`SEND`/`CANCEL`). The API endpoints exist for operations and testing.

## Project structure

```
src/
  config/      env validation + constants
  database/    MongoDB connection, Redis/BullMQ connection
  models/      Email, Conversation, Draft, Log, State
  queues/      BullMQ queues (email, whatsapp)
  workers/     poll inbox, process emails, handle WhatsApp commands
  services/
    email/     imapflow poller, mailparser, nodemailer SMTP
    ai/        OpenRouter client, classification, drafting, spam filters
    whatsapp/  notify, webhook, command parsing, providers (cloud / baileys)
  routes/      health, whatsapp, emails, drafts
  server.js    API entry point
  workers/index.js  dedicated worker entry point
```

## Verification

```bash
npm run check      # syntax-check every source file
./start.sh check   # ensure MongoDB + Redis are up (starts them if needed)
curl http://localhost:3000/health
```

## Troubleshooting

- **Webhook verification fails** — verify token must match `WHATSAPP_VERIFY_TOKEN` exactly and the server must be reachable over HTTPS.
- **Emails not arriving** — check IONOS IMAP credentials and that the mailbox allows third-party app access; check `pm2 logs`.
- **Drafts never generated** — confirm `OPENROUTER_API_KEY` and that `OPENROUTER_MODEL` is a chat model on OpenRouter.
- **`Missing required environment variable`** — the process refuses to start until `.env` is complete.
