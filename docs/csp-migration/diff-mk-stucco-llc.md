# MK Stucco LLC — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions; frame-src 'self' https://challenges.cloudflare.com
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://chat-widget.kadenaweb.solutions 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions https://chat-widget.kadenaweb.solutions; frame-src 'self' https://challenges.cloudflare.com
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="mkstucco"
  data-sitekey="0x4..."
  async
></script>
```
