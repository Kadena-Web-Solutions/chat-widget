# Kadena Web Solutions — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://js.stripe.com https://challenges.cloudflare.com https://static.cloudflareinsights.com 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions https://api.stripe.com; frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://js.stripe.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://chat-widget.kadenaweb.solutions 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions https://api.stripe.com https://chat-widget.kadenaweb.solutions; frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="kadena-web-solutions"
  data-sitekey="0x4..."
  async
></script>
```
