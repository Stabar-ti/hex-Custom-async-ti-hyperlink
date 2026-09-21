// Ambient declarations for the handful of things this app genuinely hangs off `window`.
//
// These are NOT a licence to add more. Cross-module calls belong in the module registry
// (src/core/registry.js); what stays here is limited to:
//   - `editor`   — the single editor instance, exposed on purpose so the browser console
//                  is a usable debugging tool. ~250 reads across the codebase.
//   - version/vendor globals set by <script> tags in index.html.
//
// This file is types only. It emits nothing and changes no runtime behaviour.

export {};

declare global {
  interface Window {
    /** The one HexEditor instance. Set in main.js; also a deliberate console affordance. */
    editor: any;

    /** Written by an inline <script> in index.html from public/version.json. */
    APP_VERSION: string;

    /** Cloudflare Turnstile, loaded by a script tag for the optional share-link upload. */
    turnstile: any;
  }

  /** Bare `editor` (no `window.` prefix) is used in a few places; same instance. */
  var editor: any;
}
