# Mr Weed Buakhao — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'; frame-src https://www.google.com https://weed.th
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://chat-widget.kadenaweb.solutions 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' https://chat-widget.kadenaweb.solutions; frame-src https://www.google.com https://weed.th
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="mrweedbuakhao"
  data-sitekey="0x4..."
  async
></script>
```
