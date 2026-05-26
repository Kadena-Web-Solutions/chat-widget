/**
 * Lightweight route matching utility for Cloudflare Workers.
 *
 * Usage:
 *   const router = new Router();
 *   router.add('GET', '/api/chat/:id', handler);
 *   const match = router.match('GET', '/api/chat/abc123');
 *   // match → { handler, params: { id: 'abc123' } }
 */

/**
 * Extract named parameter keys from a route pattern.
 *   '/api/chat/:id' → ['id']
 *   '/metrics/:client/:month' → ['client', 'month']
 */
function extractKeys(pattern) {
  const keys = [];
  pattern.replace(/:([^/]+)/g, (_match, key) => keys.push(key));
  return keys;
}

/**
 * Build a regex from a route pattern and extract values on match.
 * Returns null if no match, or an array of captured values.
 */
function matchPattern(pattern, pathname) {
  const regexStr = '^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$';
  const regex = new RegExp(regexStr);
  const match = pathname.match(regex);
  if (!match) return null;
  // match[0] is full match; match[1..n] are captures
  return match.slice(1);
}

export class Router {
  constructor() {
    /** @type {Array<{method: string, pattern: string, handler: Function, keys: string[]}>} */
    this.routes = [];
  }

  /**
   * Register a route.
   * @param {string} method - HTTP method or '*' for all methods
   * @param {string} pattern - Route pattern with optional :params
   * @param {Function} handler - Async handler (request, env, ctx, params) => Response
   */
  add(method, pattern, handler) {
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      handler,
      keys: extractKeys(pattern),
    });
  }

  /**
   * Match a request method and pathname to a registered handler.
   * @param {string} method - HTTP method
   * @param {string} pathname - URL pathname
   * @returns {{ handler: Function, params: Object } | null}
   */
  match(method, pathname) {
    const upperMethod = method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== upperMethod) continue;

      // Wildcard pattern matches any pathname
      if (route.pattern === '*') {
        return { handler: route.handler, params: {} };
      }

      const captures = matchPattern(route.pattern, pathname);
      if (captures !== null) {
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = captures[i];
        });
        return { handler: route.handler, params };
      }
    }

    return null;
  }
}
