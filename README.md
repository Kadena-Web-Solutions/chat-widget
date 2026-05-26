# Chat Widget Worker v1.0.0

[![Cloudflare Workers](https://img.shields.io/badge/deployed%20on-Cloudflare%20Workers-f38020?logo=cloudflare)](https://chat-widget.kadenaweb.solutions)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Cloudflare AI](https://img.shields.io/badge/Cloudflare%20AI-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers-ai/)

> Real-time chat widget with **AI-powered responses**, **lead capture**, and **smart rate limiting**. Built by [Kadena Web Solutions](https://kadenaweb.solutions).

**Live**: [chat-widget.kadenaweb.solutions](https://chat-widget.kadenaweb.solutions)

---

## What's New in v1.0

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat** | Workers AI-powered responses with conversation memory |
| 💬 **Widget** | Standalone JS widget embeddable on any site |
| 📊 **Session Management** | KV-backed chat sessions with message history |
| 🚦 **Rate Limiting** | Per-session and global rate limiting |
| 💰 **Budget Tracking** | AI budget caps per session/project |
| 📝 **Lead Capture** | Collect email/name during chat sessions |
| 🔒 **Security** | Turnstile verification, secure headers, middleware |

## Architecture

```
src/
├── index.js              # Main router + handler (lean)
├── config.js             # Site configs with widget settings
├── chat/
│   ├── session.js       # Chat session management (KV)
│   ├── message.js       # Message handling + storage (D1)
│   └── history.js        # Chat history retrieval
├── ai/
│   └── responses.js      # AI response generation with Workers AI
├── lead/
│   └── capture.js        # Lead capture during chat
├── security/
│   ├── turnstile.js      # Turnstile verification middleware
│   └── headers.js        # Security headers
├── middleware/
│   ├── rate-limit.js     # Rate logging and enforcement
│   └── session.js        # Session initialization
├── utils.js             # Validation, helpers
└── templates/
    └── chat.js          # Chat message templates

widget/
├── src/
│   └── chat-widget.js    # Widget source (ES module)
├── public/
│   └── chat-widget.js   # Built bundle (generated)
└── build-widget.js       # Widget build script (esbuild)

d1/
├── schema.sql            # D1 schema (sessions, messages)
└── migrations/           # D1 migrations
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a chat message |
| `GET`  | `/api/chat/history` | Get chat history |
| `POST` | `/api/lead` | Capture lead info |
| `GET`  | `/api/config` | Get widget config |
| `GET`  | `/health` | Health check |

## Environment Variables

### Required Secrets

| Variable | Description |
|----------|-------------|
| `TURNSTILE_SECRET_KEY` | Turnstile CAPTCHA server-side key |
| `ADMIN_TOKEN` | Token for admin endpoints |

### KV Namespaces

| Binding | Purpose |
|---------|---------|
| `CHAT_SESSIONS` | Active chat sessions |
| `CHAT_RATE_LIMIT` | Per-session rate limiting |
| `CHAT_CONFIG` | Site widget configurations |
| `CHAT_BUDGET` | AI budget tracking per session |

### D1 Database

| Binding | Purpose |
|---------|---------|
| `DB` | Chat messages and session metadata |

## Local Development

```bash
npm install
npm run dev    # starts wrangler dev at http://localhost:8787
# Health check: http://localhost:8787/health
```

## Deployment

```bash
# Deploy via npm script
npm run deploy:worker  # deploys worker via wrangler
npm run deploy:widget  # deploys widget assets

# Full deploy
npm run deploy

# Verify
npm run verify
curl -s https://chat-widget.kadenaweb.solutions/health | jq .
```

## Client-Side Integration

```html
<script src="https://chat-widget.kadenaweb.solutions/chat-widget.js" defer></script>
<div data-chat-widget site-id="YOUR_SITE_ID"></div>
```

---

**Built by [Kadena Web Solutions](https://kadenaweb.solutions)**
