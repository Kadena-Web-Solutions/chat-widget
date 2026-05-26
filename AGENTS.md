# Chat Widget Worker — Agent Context

> Inherits canonical rules from Kadena Web Solutions.
> If opened standalone: https://github.com/Kadena-Web-Solutions/KadenaWebSolutions/blob/main/AGENTS.md

## Project facts
- **Type**: worker + pages-asset
- **Live URL**: https://chat-widget.kadenaweb.solutions
- **Deploy method**: wrangler deploy + wrangler pages deploy
- **Has forms?**: no (chat widget, not a form service)

## Local conventions
Real-time chat widget Cloudflare Worker with AI integration. Handles chat sessions, AI-powered responses via Workers AI, lead capture, rate limiting, and serves a JavaScript widget via Cloudflare Pages.

## Standard commands
- `npm run dev`         — local development (wrangler dev)
- `npm run deploy`      — deploy worker + widget (wrangler deploy + wrangler pages deploy)
- `npm run deploy:worker` — deploy worker only (wrangler deploy)
- `npm run deploy:widget` — build and deploy widget assets (wrangler pages deploy)
- `npm run verify`      — verify worker is up
- `npm run audit`       — quality + security audit
- `npm run test`        — run test suite (vitest run)
- `npm run test:watch`  — run tests in watch mode

## Widget Architecture
The widget is a standalone JavaScript bundle served from Cloudflare Pages (`chat-widget-assets` project). It connects to the Worker via WebSocket-like polling or fetch API.

## Critical: redesign workflow
For visual/structural changes to live sites, use `redesign` branch.
Cloudflare auto-creates https://redesign.chat-widget.pages.dev.
Never push redesign work to `main` until client approves.
