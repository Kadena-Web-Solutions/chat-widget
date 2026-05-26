# Floor Water Gang — CSP Migration Diff

## BEFORE

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'
```

## AFTER

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://chat-widget.kadenaweb.solutions 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://chat-widget.kadenaweb.solutions
```

## Embedding Snippet

```html
<script
  src="https://chat-widget.kadenaweb.solutions/chat-widget.js"
  data-client="floorwatergang"
  data-sitekey="0x4..."
  async
></script>
```
