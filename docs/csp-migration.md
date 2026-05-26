# CSP Header Migration Guide for Chat Widget Integration

> Wave 1, Task T17 — Kadena Web Solutions

## Overview

This guide documents the Content-Security-Policy (CSP) header changes required to embed the Kadena Web Solutions chat widget on all client sites. The chat widget is served from `https://chat-widget.kadenaweb.solutions` and makes API calls to the same domain. Without updating CSP headers, browsers will block the widget script and its network requests.

Each client site uses a `_headers` file (Cloudflare Pages format) to define security headers. This guide provides the exact before/after diffs for every client.

## What Additions Are Required

For every client site, two CSP directives must be updated:

1. **`script-src`** — add `https://chat-widget.kadenaweb.solutions`
   This allows the browser to load the chat widget JavaScript file.

2. **`connect-src`** — add `https://chat-widget.kadenaweb.solutions`
   This allows the widget to send and receive data from the chat API.

All other directives remain unchanged. No other headers need modification.

## Risk Analysis

The additions pose minimal security risk:

- `chat-widget.kadenaweb.solutions` is a domain owned and operated by Kadena Web Solutions, the same entity managing all client sites.
- The widget script is first-party code, not a third-party service.
- No external or untrusted domains are being added to the CSP.
- The scope is limited to `script-src` and `connect-src` only.

## Embedding Snippet Template

Add the following snippet to the HTML `<body>` of each client site (typically just before the closing `</body>` tag):

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="CLIENT_KEY"
  data-sitekey="0x4..."
  async
></script>
```

Replace `CLIENT_KEY` with the client identifier from `projects.json` and `data-sitekey` with the client's Cloudflare Turnstile site key.

## Testing Checklist

Before marking any client migration as complete, verify all of the following:

- [ ] Widget loads without CSP errors in the browser console.
- [ ] Existing contact forms still submit correctly.
- [ ] No broken functionality (navigation, images, scripts, styles).
- [ ] No new console warnings or errors unrelated to the widget.
- [ ] Widget appears and is interactive on the live site.

## Rollback Procedure

If any issues arise after deployment, revert the changes in this order:

1. **Remove the script tag** from the client's HTML files.
2. **Revert the CSP line** in the client's `_headers` file to the previous state (see the per-client diff files for the exact original line).
3. **Redeploy** the client site via `npm run deploy` or `git push`.
4. **Verify** the site returns to its pre-migration state.

## Per-Client Diff Files

See the following files in this directory for the exact before/after CSP lines for each client:

| Client | Diff File |
|--------|-----------|
| Kadena Web Solutions (agency site) | `diff-kadena-web-solutions.md` |
| Floor Water Gang | `diff-floor-water-gang.md` |
| Generation Plastering | `diff-generation-plastering.md` |
| MK Stucco LLC | `diff-mk-stucco-llc.md` |
| Mr Weed Buakhao | `diff-mr-weed-buakhao.md` |
| Nixon Consulting | `diff-nixon-consulting.md` |
| RG Drywall LLC | `diff-rg-drywall-llc.md` |
| JG Plastering | `diff-jg-plastering.md` |
