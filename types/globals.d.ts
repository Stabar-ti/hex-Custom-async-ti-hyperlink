// Ambient declarations for the handful of things this app genuinely hangs off `window`.
//
// These are NOT a licence to add more. Cross-module calls belong in the module registry
// (src/core/registry.js). The editor itself used to be `window.editor`, read at 132 sites;
// it is a parameter now, passed down from main.js to whatever needs it.
//
// What is left here is set from outside the module graph, so there is nowhere else for it
// to live: globals written by <script> tags in index.html, and one dev guard.
//
// This file is types only. It emits nothing and changes no runtime behaviour.

export {};

declare global {
  interface Window {
    /** Written by an inline <script> in index.html from public/version.json. */
    APP_VERSION: string;

    /** Cloudflare Turnstile, loaded by a script tag for the optional share-link upload. */
    turnstile: any;

    /**
     * Dev guard: checks every footer on the map survives a structured round-trip.
     * Nothing imports it — the in-app help tells you to run it from the console.
     */
    __loreCheckAllFooters?: () => unknown;
  }
}
