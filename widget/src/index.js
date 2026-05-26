// widget/src/index.js — Self-registering entry point
// This file is the alternative esbuild entry point.
// The primary entry point is chat-widget.js (referenced by build-widget.js).
// This module simply re-exports the ChatWidget class for external use.
export { ChatWidget } from './chat-widget.js';