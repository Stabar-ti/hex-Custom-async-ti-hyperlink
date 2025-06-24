// Add this to your uiUtils.js

/**
 * Set active state for a set of button IDs (for overlay toggles, etc).
 * @param {string[]} ids
 * @param {boolean} isActive
 */

export function syncToggleButtons(ids, value) {
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', value);
    });
}

/**
 * Make a popup draggable by its draggable-handle.
 * @param {string} popupId
 */
export function makePopupDraggable(popupId) {
    const popup = document.getElementById(popupId);
    if (!popup) return;
    const header = popup.querySelector('.draggable-handle');
    if (!header) return;
    let isDragging = false, offsetX, offsetY;

    header.onmousedown = function (e) {
        isDragging = true;
        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
        document.onmousemove = function (e) {
            if (isDragging) {
                popup.style.left = (e.clientX - offsetX) + 'px';
                popup.style.top = (e.clientY - offsetY) + 'px';
            }
        };
        document.onmouseup = function () {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}
