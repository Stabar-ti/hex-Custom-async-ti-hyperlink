// ───────────────────────────────────────────────────────────────
// ui/uiModals.js
//
// This module manages the showing, hiding, and (optionally) dragging
// of modal dialogs within the app. It provides helpers for basic
// modal visibility, and adds draggable behavior so modals can be
// repositioned by dragging their header area.
// ───────────────────────────────────────────────────────────────

/**
 * Shows (opens) a modal dialog by its DOM element ID.
 * Simply sets style.display = 'block' to reveal the modal.
 * @param {string} id - The element ID of the modal
 */
export function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

/**
 * Hides (closes) a modal dialog by its DOM element ID.
 * Sets style.display = 'none' to hide it.
 * @param {string} id - The element ID of the modal
 */
export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
