# Generation Plastering — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://code.tidio.co https://widget.tidio.co https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://*.tidio.co; img-src 'self' data: https: blob:; connect-src 'self' https://forms.kadenaweb.solutions https://*.tidio.co wss://*.tidio.co https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com https://*.tidio.co; media-src 'self' https://*.tidio.co; worker-src 'self' blob:;
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://chat-widget.kadenaweb.solutions 'unsafe-inline' https://challenges.cloudflare.com https://code.tidio.co https://widget.tidio.co https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://*.tidio.co; img-src 'self' data: https: blob:; connect-src 'self' https://forms.kadenaweb.solutions https://*.tidio.co wss://*.tidio.co https://challenges.cloudflare.com https://cloudflareinsights.com https://chat-widget.kadenaweb.solutions; frame-src https://challenges.cloudflare.com https://*.tidio.co; media-src 'self' https://*.tidio.co; worker-src 'self' blob:;
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="generationplastering"
  data-sitekey="0x4..."
  async
></script>
```
