# RG Drywall LLC — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://forms.kadenaweb.solutions; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions https://static.cloudflareinsights.com; form-action 'self' https://forms.kadenaweb.solutions; frame-src 'self' https://challenges.cloudflare.com
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://chat-widget.kadenaweb.solutions 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://forms.kadenaweb.solutions; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://forms.kadenaweb.solutions https://static.cloudflareinsights.com https://chat-widget.kadenaweb.solutions; form-action 'self' https://forms.kadenaweb.solutions; frame-src 'self' https://challenges.cloudflare.com
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="rgdrywall"
  data-sitekey="0x4..."
  async
></script>
```
