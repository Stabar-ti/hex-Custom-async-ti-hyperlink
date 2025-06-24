// ───────────────────────────────────────────────────────────────
// ui/uiTheme.js
//
// This module controls the dark/light mode theme for the app.
// It provides functions to toggle between themes and to apply
// the user's preferred or saved theme at app startup.
//
// The theme is applied by adding/removing classes on <body>,
// and the current theme is stored in localStorage.
// ───────────────────────────────────────────────────────────────

/**
 * Switches the theme between dark and light mode.
 * This function toggles the 'dark' or 'light' class on <body>
 * and remembers the user's preference in localStorage.
 */
export function toggleTheme() {
  // Determine which theme should be active next
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  // Update <body> classes to match the selected theme
  document.body.classList.toggle('dark', next === 'dark');
  document.body.classList.toggle('light', next === 'light');
  // Store the preference in localStorage for persistence
  localStorage.setItem('theme', next);
}

/**
 * Applies the saved or default theme to the page on load.
 * This version always sets 'dark' mode (for now) and saves it.
 * To load a remembered theme from localStorage, update this function.
 */
export function applySavedTheme() {
  // Always set dark mode on startup
  document.body.classList.add('dark');
  localStorage.setItem('theme', 'dark');
}
