// ─────────────── ui/uiModals.js ───────────────

export function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function makeModalDraggableByHeader(modalId, handleSelector = '.draggable-handle') {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const handle = modal.querySelector(handleSelector);
  if (!handle) return;

  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.close-button')) return;

    // Get modal's *real* pixel position BEFORE changing any style
    const rect = modal.getBoundingClientRect();
    console.log('mousedown', { rect, pageX: e.pageX, pageY: e.pageY });

    // Remove transform, set absolute pixel location for drag
    modal.style.position = 'fixed';
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    modal.style.transform = '';
    modal.style.margin = '0';
    modal.style.right = '';
    modal.style.bottom = '';
    modal.style.zIndex = 9999;

    dragOffsetX = e.clientX - rect.left; // Use clientX for best browser consistency
    dragOffsetY = e.clientY - rect.top;

    console.log(`rect.left: ${rect.left}, e.clientX: ${e.clientX}, offset: ${dragOffsetX}`);

    isDragging = true;
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    //modal.style.left = (e.clientX - dragOffsetX) + 'px';
    modal.style.left = (e.clientX) + 'px';
   // modal.style.left = (e.clientX);
   // modal.style.left = 'px';
    modal.style.top = (e.clientY - dragOffsetY) + 'px';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
  });
}

// Only make selected modals draggable by header:
window.addEventListener('DOMContentLoaded', () => {
  makeModalDraggableByHeader('systemLookupModal');
  makeModalDraggableByHeader('optionsModal');
  // makeModalDraggableByHeader('anotherModal'); // etc...
});
