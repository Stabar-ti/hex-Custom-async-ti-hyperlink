// src/ui/popupUI.js
// General-purpose popup UI module for consistent popups across the site

/**
 * Show a popup with flexible content and options.
 * @param {Object} config - Popup configuration object.
 * @param {string|HTMLElement} config.content - HTML string or DOM node for the popup body.
 * @param {Array<{label: string, action: function}>} [config.actions] - Optional array of button definitions.
 * @param {string} [config.id] - Optional unique id for the popup.
 * @param {string} [config.className] - Optional extra class for styling.
 * @param {boolean} [config.modal] - If true, disables close button and auto-close.
 * @param {boolean} [config.draggable] - If true, popup is draggable.
 * @param {string} [config.dragHandleSelector] - CSS selector for drag handle (e.g. '.modal-header').
 * @param {boolean} [config.scalable] - If true, popup is resizable.
 * @param {function} [config.onClose] - Called when popup is closed.
 * @param {HTMLElement} [config.parent] - Parent element to attach popup to.
 * @param {Object} [config.style] - Inline style overrides.
 * @returns {HTMLElement} The popup element.
 */
export function showPopup({
    content,
    actions = [],
    id,
    className = '',
    modal = false,
    draggable = false,
    dragHandleSelector = null,
    scalable = false,
    onClose = null,
    parent = document.body,
    style = {},
    rememberPosition = false,
    showHelp = false,
    onHelp = null,
    title = '',
    confineTo = null
}) {
    // Remove any existing popup with the same id
    if (id) {
        const old = document.getElementById(id);
        if (old) old.remove();
    }
    // Create popup container
    const popup = document.createElement('div');
    popup.className = 'popup-ui' + (className ? ' ' + className : '');
    if (id) popup.id = id;

    // Prevent style.width from accumulating (fixes horizontal growth)
    if (style && style.width) {
        popup.style.width = style.width;
    }

    // Only apply style properties that are not background or color
    if (style) {
        for (const [key, value] of Object.entries(style)) {
            if (key !== 'background' && key !== 'backgroundColor' && key !== 'color') {
                popup.style[key] = value;
            }
        }
    }

    // Always apply rounded corners to all popups
    popup.style.borderRadius = style.borderRadius || '16px';

    // --- Restore position/size from localStorage if enabled ---
    let hasStoredPos = false;
    if (rememberPosition && id) {
        const pos = localStorage.getItem('popup-pos-' + id);
        if (pos) {
            try {
                const { left, top, width, height } = JSON.parse(pos);
                if (left !== undefined) popup.style.left = left + 'px';
                if (top !== undefined) popup.style.top = top + 'px';
                if (width !== undefined) popup.style.width = width + 'px';
                if (height !== undefined) popup.style.height = height + 'px';
                popup.style.position = 'fixed';
                hasStoredPos = true;
            } catch { }
        }
    }

    // Content
    if (typeof content === 'string') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'popup-ui-content';
        contentDiv.innerHTML = content;
        contentDiv.style.paddingLeft = '24px'; // Indent content further to the right
        contentDiv.style.width = 'auto'; // Prevent width accumulation
        popup.appendChild(contentDiv);
    } else if (content instanceof HTMLElement) {
        content.style.paddingLeft = '24px'; // Indent content further to the right
        content.style.width = 'auto'; // Prevent width accumulation
        popup.appendChild(content);
    }

    // Actions/buttons
    if (actions && actions.length) {
        const btnRow = document.createElement('div');
        btnRow.className = 'popup-ui-actions';
        btnRow.style.marginTop = '18px'; // Add more space above the buttons
        btnRow.style.paddingLeft = '24px'; // Align left edge with text content
        btnRow.style.width = 'auto'; // Prevent width accumulation
        actions.forEach(({ label, action, toggled }) => {
            const btn = document.createElement('button');
            btn.className = 'wizard-btn';
            btn.textContent = label;
            if (toggled) {
                btn.classList.add('toggled');
                btn.style.background = '#666';
                btn.style.color = '#fff';
                btn.style.fontWeight = 'bold';
            }
            btn.onclick = (e) => {
                e.stopPropagation();
                if (typeof action === 'function') action(btn);
                // Do NOT close popup on click
            };
            btnRow.appendChild(btn);
        });
        popup.appendChild(btnRow);
    }

    // Close button for non-modal popups
    if (!modal) {
        // Create a title bar if it doesn't exist, and make it larger for the close button
        let titleBar = popup.querySelector('.popup-ui-titlebar');
        if (!titleBar) {
            titleBar = document.createElement('div');
            titleBar.className = 'popup-ui-titlebar';
            titleBar.style.height = '40px';
            titleBar.style.display = 'flex';
            titleBar.style.alignItems = 'center';
            titleBar.style.justifyContent = 'flex-end';
            // --- Sticky title bar ---
            titleBar.style.position = 'sticky';
            titleBar.style.top = '0';
            titleBar.style.zIndex = '2';
            titleBar.style.background = '#444'; // Lighter gray background for title bar
            titleBar.style.userSelect = 'none';
            titleBar.style.padding = '0 8px 0 8px';
            titleBar.style.marginBottom = '8px';
            titleBar.style.boxShadow = '0 2px 6px #0002'; // subtle shadow for separation
            // --- Insert title text if provided ---
            if (typeof title !== 'undefined' && title !== null && title !== '') {
                const titleText = document.createElement('span');
                titleText.className = 'popup-ui-title';
                titleText.textContent = title;
                titleText.style.flex = '1';
                titleText.style.fontWeight = 'bold';
                titleText.style.fontSize = '1.1em';
                titleText.style.color = '#ffe066';
                titleBar.appendChild(titleText);
            }
            popup.insertBefore(titleBar, popup.firstChild);
        }
        // Remove any existing close button in the title bar
        const oldClose = titleBar.querySelector('.popup-ui-close');
        if (oldClose) oldClose.remove();
        // Create the close button and add to title bar (right side)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'popup-ui-close wizard-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close';
        closeBtn.style.fontSize = '1.2rem';
        closeBtn.style.width = '28px';
        closeBtn.style.height = '28px';
        closeBtn.style.lineHeight = '28px';
        closeBtn.style.position = 'relative';
        closeBtn.style.marginLeft = '8px';
        closeBtn.style.display = 'flex';
        closeBtn.style.alignItems = 'center';
        closeBtn.style.justifyContent = 'center';
        closeBtn.onclick = () => {
            hidePopup(popup);
            if (typeof onClose === 'function') onClose();
        };
        // --- NEW: Help button ---
        if (showHelp) {
            const helpBtn = document.createElement('button');
            helpBtn.className = 'popup-ui-help wizard-btn';
            helpBtn.innerHTML = '?';
            helpBtn.title = 'Help';
            helpBtn.style.background = '#2ecc40'; // Green
            helpBtn.style.color = '#fff';
            helpBtn.style.fontWeight = 'bold';
            helpBtn.style.fontSize = '1.1rem';
            helpBtn.style.width = '28px';
            helpBtn.style.height = '28px';
            helpBtn.style.lineHeight = '28px';
            helpBtn.style.position = 'relative';
            helpBtn.style.marginLeft = '8px';
            helpBtn.style.display = 'flex';
            helpBtn.style.alignItems = 'center';
            helpBtn.style.justifyContent = 'center';
            helpBtn.onclick = () => {
                if (typeof onHelp === 'function') onHelp();
            };
            titleBar.appendChild(helpBtn);
        }
        titleBar.appendChild(closeBtn);
    }

    // --- Confinement logic ---
    function getConfinementRect() {
        if (confineTo && confineTo.getBoundingClientRect) {
            return confineTo.getBoundingClientRect();
        }
        // Default to visible viewport (not full window, so scroll works)
        return {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    // --- Constrain popup position on drag/resize ---
    function confinePopupToRect() {
        const confineRect = getConfinementRect();
        const rect = popup.getBoundingClientRect();
        let left = rect.left, top = rect.top;
        let width = rect.width, height = rect.height;

        // Clamp left/top so popup stays inside confineRect
        if (left < confineRect.left) left = confineRect.left;
        if (top < confineRect.top) top = confineRect.top;
        if (left + width > confineRect.right) left = confineRect.right - width;
        if (top + height > confineRect.bottom) top = confineRect.bottom - height;

        // Prevent negative width/height if popup is larger than viewport
        if (width > confineRect.width) left = confineRect.left;
        if (height > confineRect.height) top = confineRect.top;

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    // Center popup if no stored position and not already positioned
    if (!hasStoredPos) {
        setTimeout(() => {
            if (!popup.style.left && !popup.style.top) {
                const rect = popup.getBoundingClientRect();
                const confineRect = getConfinementRect();
                let left = Math.max(confineRect.left, Math.round(confineRect.left + (confineRect.width - rect.width) / 2));
                let top = Math.max(confineRect.top, Math.round(confineRect.top + (confineRect.height - rect.height) / 2));
                // Prevent negative left/top if popup is larger than viewport
                if (rect.width > confineRect.width) left = confineRect.left;
                if (rect.height > confineRect.height) top = confineRect.top;
                popup.style.position = 'fixed';
                popup.style.left = left + 'px';
                popup.style.top = top + 'px';
            }
        }, 0);
    }

    // Draggability
    if (draggable) {
        popup.style.position = 'fixed';
        let dragHandle = dragHandleSelector ? popup.querySelector(dragHandleSelector) : popup;
        let offsetX, offsetY, dragging = false;
        if (dragHandle) {
            dragHandle.style.cursor = 'move';
            dragHandle.addEventListener('mousedown', function (e) {
                dragging = true;
                offsetX = e.clientX - popup.getBoundingClientRect().left;
                offsetY = e.clientY - popup.getBoundingClientRect().top;
                document.body.style.userSelect = 'none';
            });
        }
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onStopDrag);
        function onDrag(e) {
            if (!dragging) return;
            popup.style.left = (e.clientX - offsetX) + 'px';
            popup.style.top = (e.clientY - offsetY) + 'px';
            confinePopupToRect();
        }
        function onStopDrag() {
            if (dragging) {
                dragging = false;
                document.body.style.userSelect = '';
                if (rememberPosition && id) {
                    savePopupPos();
                }
            }
        }
    }

    // Scalability
    if (scalable) {
        popup.style.resize = 'both';
        popup.style.overflow = 'auto';
        // Save size on mouseup and confine after resize
        popup.addEventListener('mouseup', function () {
            if (rememberPosition && id) savePopupPos();
            confinePopupToRect();
        });
    }

    // --- Save position/size helper ---
    function savePopupPos() {
        if (!id) return;
        const rect = popup.getBoundingClientRect();
        localStorage.setItem('popup-pos-' + id, JSON.stringify({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        }));
    }

    // Add to DOM
    (parent || document.body).appendChild(popup);

    // Remove any minWidth/maxWidth set by previous popups to prevent growth
    popup.style.minWidth = style.minWidth || '';
    popup.style.maxWidth = style.maxWidth || '';
    popup.style.width = style.width || '';

    // Center popup if no stored position and not already positioned
    if (!hasStoredPos) {
        // Wait for DOM to render and size to be set
        setTimeout(() => {
            // Only center if not already positioned
            if (!popup.style.left && !popup.style.top) {
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                const rect = popup.getBoundingClientRect();
                popup.style.position = 'fixed';
                popup.style.left = Math.max(0, Math.round((winW - rect.width) / 2)) + 'px';
                popup.style.top = Math.max(0, Math.round((winH - rect.height) / 2)) + 'px';
            }
        }, 0);
    }

    // Focus for accessibility
    setTimeout(() => popup.focus?.(), 0);
    return popup;
}

/**
 * Hide and remove a popup element.
 * @param {HTMLElement|string} popup - The popup element or its id.
 */
export function hidePopup(popup) {
    if (typeof popup === 'string') popup = document.getElementById(popup);
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
}

/**
 * Reset all stored popup positions and sizes from localStorage.
 * Call this to clear all memorized popup locations.
 */
export function resetAllPopupPositions() {
    Object.keys(localStorage)
        .filter(key => key.startsWith('popup-pos-'))
        .forEach(key => localStorage.removeItem(key));
}
