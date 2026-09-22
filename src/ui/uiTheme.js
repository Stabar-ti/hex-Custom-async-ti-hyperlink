// ───────────────────────────────────────────────────────────────
// ui/uiTheme.js
//
// The app is dark only. There was a toggle, in Layout Options, and both are gone: the
// light palette was never finished — the --surface-* scale that the rail, the menus and
// the popups are built on sits in :root rather than under a theme, so those surfaces
// stayed dark while --text-color went black, and half the interface rendered black on
// near-black.
//
// The class is still applied rather than removed, because a great deal of CSS in
// styles.css is written as `body.dark .thing`. Making dark the default by deleting the
// class would mean rewriting every one of those selectors; setting it once here does the
// same job and can be undone in one place if a light theme is ever finished.
// ───────────────────────────────────────────────────────────────

/**
 * Put the page in dark mode. Called at startup; there is nothing to toggle.
 */
export function applySavedTheme() {
  document.body.classList.add('dark');
  document.body.classList.remove('light');
  try {
    localStorage.setItem('theme', 'dark');
  } catch { /* private mode — the class is applied either way */ }
}
