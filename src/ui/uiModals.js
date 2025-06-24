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

/**
 * Adds draggable behavior to a modal dialog so users can
 * drag the modal around the screen by its header area.
 *
 * @param {string} modalId        - The element ID of the modal
 * @param {string} handleSelector - CSS selector for the draggable area/header (default: '.draggable-handle')
 */
function makeModalDraggableByHeader(modalId, handleSelector = '.draggable-handle') {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const handle = modal.querySelector(handleSelector);
  if (!handle) return;

  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

  // Start dragging when the header (handle) is pressed (not a close button!)
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.close-button')) return;

    // Get the modal's position relative to the viewport
    const rect = modal.getBoundingClientRect();
    console.log('mousedown', { rect, pageX: e.pageX, pageY: e.pageY });

    // Set style to fixed and absolute left/top, so it can be moved freely
    modal.style.position = 'fixed';
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    modal.style.transform = '';
    modal.style.margin = '0';
    modal.style.right = '';
    modal.style.bottom = '';
    modal.style.zIndex = 9999;

    // Calculate the offset between mouse and modal corner
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    console.log(`rect.left: ${rect.left}, e.clientX: ${e.clientX}, offset: ${dragOffsetX}`);

    isDragging = true;
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  });

  // Move modal as the mouse moves
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    // Move the modal so that its header follows the mouse cursor
    modal.style.left = (e.clientX) + 'px';
    modal.style.top = (e.clientY - dragOffsetY) + 'px';
  });

  // Stop dragging on mouse up
  window.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
  });
}

// ───────────────────────────────────────────────────────────────
// Enable draggable headers for select modals on page load
// (Add more calls here to enable dragging for additional modals.)
// ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  makeModalDraggableByHeader('systemLookupModal');
  makeModalDraggableByHeader('optionsModal');
  // makeModalDraggableByHeader('anotherModal'); // etc...
});
