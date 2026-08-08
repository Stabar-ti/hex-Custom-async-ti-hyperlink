// ───────────────────────────────────────────────────────────────
// ui/uiToast.js
//
// Transient corner notifications for things the user should know about but must
// not be interrupted by. The app otherwise only has alert(), which blocks, and
// console warnings, which nobody reads — neither suits "your map loaded, but two
// of its tiles no longer exist".
//
// Toasts stack downwards, auto-dismiss, and can be dismissed early. No DOM is
// created until the first toast, so importing this module costs nothing.
// ───────────────────────────────────────────────────────────────

import { COLORS } from '../constants/designTokens.js';

const TYPES = {
    info:    { color: COLORS.info,    icon: 'ℹ️' },
    success: { color: COLORS.success, icon: '✅' },
    warning: { color: COLORS.warning, icon: '⚠️' },
    error:   { color: COLORS.danger,  icon: '❌' }
};

const ANIM_MS = 300;

let stack = null;

function toastStack() {
    if (stack && stack.isConnected) return stack;
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
    `;
    document.body.appendChild(stack);
    return stack;
}

function dismiss(toast) {
    if (!toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(110%)';
    setTimeout(() => toast.remove(), ANIM_MS);
}

/**
 * Show a toast notification.
 * @param {string} message  plain text — inserted as text, not HTML
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {number} [duration] ms before it disappears on its own
 * @returns {HTMLElement} the toast, so a caller can dismiss it early
 */
export function showToast(message, type = 'info', duration = 3000) {
    const { color, icon } = TYPES[type] || TYPES.info;

    const toast = document.createElement('div');
    toast.className = 'ui-toast';
    toast.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 10px;
        max-width: 380px;
        padding: 12px 14px;
        background: ${COLORS.surface2};
        border: 1px solid ${color};
        border-left: 4px solid ${color};
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        color: #fff;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0;
        transform: translateX(110%);
        transition: transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease;
        pointer-events: auto;
    `;

    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    iconEl.style.cssText = 'font-size: 16px; flex: none;';

    // textContent, not innerHTML: messages carry tile ids and other data.
    const text = document.createElement('span');
    text.textContent = message;
    text.style.flex = '1';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Dismiss';
    close.style.cssText = `
        flex: none;
        background: none;
        border: none;
        color: ${COLORS.textMuted};
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0 2px;
    `;
    close.addEventListener('click', () => dismiss(toast));

    toast.append(iconEl, text, close);
    toastStack().appendChild(toast);

    // Next frame, so the transition has a start state to animate from.
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    if (duration > 0) setTimeout(() => dismiss(toast), duration);
    return toast;
}
