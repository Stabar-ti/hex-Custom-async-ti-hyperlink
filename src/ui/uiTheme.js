// ─────────────── ui/theme.js ───────────────

export function toggleTheme() {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  document.body.classList.toggle('dark', next === 'dark');
  document.body.classList.toggle('light', next === 'light');
  localStorage.setItem('theme', next);
}

export function applySavedTheme() {
  document.body.classList.add('dark');
  localStorage.setItem('theme', 'dark');
}
