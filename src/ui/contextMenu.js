// @ts-check
/**
 * A cascading context menu, opened at a point.
 *
 *   openContextMenu({ x, y, title: 'Tile 305', items: [
 *       { label: 'Wormholes', submenu: [...] },
 *       { separator: true },
 *       { label: 'Start hyperlane here', onSelect: () => ... },
 *   ] });
 *
 * The anchored list picker (listPicker.js) is one flat list that resolves a Promise. A menu
 * of actions is a different shape: items do things rather than return a value, and they
 * nest, so this is its own component rather than a mode of that one. It shares the picker's
 * one-open-at-a-time rule through registerForeignCloser — opening either closes the other.
 *
 * Mouse: hovering an item with a submenu opens it beside the item, flipped to the left
 * when there is no room on the right. Keyboard: ↑/↓ move, → or Enter opens a submenu,
 * ← or Escape closes one level, Escape on the root closes the menu. Any press outside it,
 * scrolling the page, resizing or leaving the window closes it.
 *
 * A right-click elsewhere closes this menu on its mousedown, so the contextmenu event that
 * follows can open a new one where the pointer now is — the way a desktop menu behaves.
 */

import { closeListPicker, registerForeignCloser } from './listPicker.js';

/**
 * @typedef {object} MenuItem
 * @property {string} [label]
 * @property {string} [icon]      a glyph shown before the label
 * @property {string} [swatch]    a CSS colour shown as a dot before the label
 * @property {string} [hint]      right-aligned muted text (a count, "both sides", …)
 * @property {string} [title]     tooltip
 * @property {boolean} [checked]  shows a ✓ — for items that toggle something on the tile
 * @property {boolean} [disabled]
 * @property {(event: MouseEvent) => void} [onSelect]  gets the click, e.g. for where the pointer is
 * @property {MenuItem[] | (() => MenuItem[] | Promise<MenuItem[]>)} [submenu]
 * @property {boolean} [separator]
 * @property {string} [group]     a small heading; the item is not clickable
 */

const SUBMENU_HOVER_DELAY_MS = 120;
const EDGE_PAD = 8;

/** @type {HTMLElement[]} the root menu, then each open submenu, outermost first */
let levels = [];
/** @type {(() => void) | null} */
let onCloseCallback = null;
let hoverTimer = 0;

registerForeignCloser(() => closeContextMenu());

export function isContextMenuOpen() {
    return levels.length > 0;
}

/** Closes the whole menu. Safe to call when nothing is open. */
export function closeContextMenu() {
    if (!levels.length) return;
    clearTimeout(hoverTimer);
    for (const level of levels) level.remove();
    levels = [];
    document.removeEventListener('mousedown', onOutsidePress, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', closeContextMenu);
    window.removeEventListener('blur', closeContextMenu);
    document.removeEventListener('scroll', closeContextMenu, true);
    const cb = onCloseCallback;
    onCloseCallback = null;
    cb?.();
}

/**
 * @param {object} opts
 * @param {number} opts.x  client coordinates
 * @param {number} opts.y
 * @param {string} [opts.title]
 * @param {MenuItem[]} opts.items
 * @param {() => void} [opts.onClose]
 */
export function openContextMenu({ x, y, title, items, onClose }) {
    closeContextMenu();
    closeListPicker();

    const root = buildLevel(items, 0, title);
    document.body.appendChild(root);
    placeAt(root, x, y);
    levels = [root];
    onCloseCallback = onClose || null;

    document.addEventListener('mousedown', onOutsidePress, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);
    document.addEventListener('scroll', closeContextMenu, true);
}

// ── building ─────────────────────────────────────────────────────────────────

/**
 * @param {MenuItem[]} items
 * @param {number} depth
 * @param {string} [title]
 */
function buildLevel(items, depth, title) {
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.dataset.depth = String(depth);
    // A right-click on the menu itself means nothing — not the browser's menu either.
    menu.addEventListener('contextmenu', e => e.preventDefault());

    if (title) {
        const head = document.createElement('div');
        head.className = 'ctx-menu-title';
        head.textContent = title;
        menu.appendChild(head);
    }

    const shown = items.filter(Boolean);
    if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'ctx-menu-empty';
        empty.textContent = 'Nothing here';
        menu.appendChild(empty);
    }
    for (const item of shown) menu.appendChild(buildItem(item, depth));
    return menu;
}

/**
 * @param {MenuItem} item
 * @param {number} depth
 */
function buildItem(item, depth) {
    if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        sep.setAttribute('role', 'separator');
        return sep;
    }
    if (item.group) {
        const group = document.createElement('div');
        group.className = 'ctx-menu-group';
        group.textContent = item.group;
        return group;
    }

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ctx-menu-item';
    row.setAttribute('role', 'menuitem');
    if (item.title) row.title = item.title;
    if (item.disabled) {
        row.disabled = true;
        row.setAttribute('aria-disabled', 'true');
    }

    const check = document.createElement('span');
    check.className = 'ctx-menu-check';
    check.textContent = item.checked ? '✓' : '';
    row.appendChild(check);

    if (item.swatch) {
        const dot = document.createElement('span');
        dot.className = 'ctx-menu-swatch';
        dot.style.background = item.swatch;
        row.appendChild(dot);
    } else if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'ctx-menu-icon';
        icon.textContent = item.icon;
        row.appendChild(icon);
    }

    const label = document.createElement('span');
    label.className = 'ctx-menu-label';
    label.textContent = item.label || '';
    row.appendChild(label);

    if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'ctx-menu-hint';
        hint.textContent = item.hint;
        row.appendChild(hint);
    }

    if (item.submenu) {
        row.setAttribute('aria-haspopup', 'menu');
        row.setAttribute('aria-expanded', 'false');
        const arrow = document.createElement('span');
        arrow.className = 'ctx-menu-arrow';
        arrow.textContent = '▸';
        row.appendChild(arrow);
    }

    row.addEventListener('mouseenter', () => {
        if (row.disabled) return;
        row.focus({ preventScroll: true });
        clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => {
            if (item.submenu) openSubmenu(row, item, depth);
            else closeLevelsBelow(depth);
        }, SUBMENU_HOVER_DELAY_MS);
    });
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (row.disabled) return;
        if (item.submenu) {
            clearTimeout(hoverTimer);
            openSubmenu(row, item, depth);
            return;
        }
        // Close first: an action that opens something of its own (an editor, a pick mode
        // with a cursor hint) must not have this menu still on top of it.
        closeContextMenu();
        item.onSelect?.(e);
    });
    return row;
}

/**
 * @param {HTMLElement} row
 * @param {MenuItem} item
 * @param {number} depth  the depth of the menu `row` is in
 */
async function openSubmenu(row, item, depth) {
    if (row.getAttribute('aria-expanded') === 'true' && levels[depth + 1]) return;
    closeLevelsBelow(depth);

    const source = item.submenu;
    const items = typeof source === 'function' ? await source() : source;
    // The pointer may have moved on, or the menu closed, while the items loaded.
    if (!levels.includes(/** @type {HTMLElement} */(row.closest('.ctx-menu')))) return;
    if (levels.length !== depth + 1) return;

    const sub = buildLevel(items || [], depth + 1);
    document.body.appendChild(sub);
    placeBeside(sub, row);
    levels.push(sub);
    row.setAttribute('aria-expanded', 'true');
    row.classList.add('is-open');
}

/** Closes every menu deeper than `depth`, leaving that one open. */
function closeLevelsBelow(depth) {
    while (levels.length > depth + 1) levels.pop()?.remove();
    const parent = levels[depth];
    parent?.querySelectorAll('.ctx-menu-item.is-open').forEach(r => {
        r.classList.remove('is-open');
        r.setAttribute('aria-expanded', 'false');
    });
}

// ── placement ────────────────────────────────────────────────────────────────

/** At the pointer, pulled back inside the viewport. */
function placeAt(menu, x, y) {
    const { width, height } = menu.getBoundingClientRect();
    const left = x + width > window.innerWidth - EDGE_PAD ? x - width : x;
    const top = y + height > window.innerHeight - EDGE_PAD ? y - height : y;
    menu.style.left = `${clamp(left, EDGE_PAD, window.innerWidth - width - EDGE_PAD)}px`;
    menu.style.top = `${clamp(top, EDGE_PAD, window.innerHeight - height - EDGE_PAD)}px`;
}

/** Beside the row that opened it: right if it fits, otherwise left. */
function placeBeside(menu, row) {
    const r = row.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const fitsRight = r.right + width <= window.innerWidth - EDGE_PAD;
    const left = fitsRight ? r.right - 2 : r.left - width + 2;
    menu.style.left = `${clamp(left, EDGE_PAD, window.innerWidth - width - EDGE_PAD)}px`;
    // Line the first item up with the row; .ctx-menu has 4px of padding.
    menu.style.top = `${clamp(r.top - 4, EDGE_PAD, window.innerHeight - height - EDGE_PAD)}px`;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}

// ── dismissal and keyboard ───────────────────────────────────────────────────

/** @param {MouseEvent} e */
function onOutsidePress(e) {
    const target = /** @type {Node} */ (e.target);
    if (levels.some(level => level.contains(target))) return;
    closeContextMenu();
}

/** @param {KeyboardEvent} e */
function onKey(e) {
    if (!levels.length) return;
    const menu = levels[levels.length - 1];
    const rows = /** @type {HTMLButtonElement[]} */ (
        [...menu.querySelectorAll('.ctx-menu-item')].filter(r => !(/** @type {HTMLButtonElement} */ (r)).disabled)
    );
    const index = rows.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));

    const consume = () => { e.preventDefault(); e.stopPropagation(); };

    switch (e.key) {
        case 'Escape':
        case 'ArrowLeft':
            consume();
            if (levels.length > 1) {
                const depth = levels.length - 2;
                const opener = /** @type {HTMLElement|null} */ (levels[depth].querySelector('.ctx-menu-item.is-open'));
                closeLevelsBelow(depth);
                opener?.focus({ preventScroll: true });
            } else if (e.key === 'Escape') {
                closeContextMenu();
            }
            break;
        case 'ArrowDown':
            consume();
            rows[(index + 1) % rows.length]?.focus({ preventScroll: true });
            break;
        case 'ArrowUp':
            consume();
            rows[(index - 1 + rows.length) % rows.length]?.focus({ preventScroll: true });
            break;
        case 'ArrowRight':
            if (index >= 0 && rows[index].getAttribute('aria-haspopup')) {
                consume();
                rows[index].click();
                // Focus the submenu's first item once it is there.
                setTimeout(() => {
                    const sub = levels[levels.length - 1];
                    if (sub !== menu) /** @type {HTMLElement|null} */ (sub.querySelector('.ctx-menu-item:not(:disabled)'))?.focus({ preventScroll: true });
                }, 0);
            }
            break;
        case 'Enter':
        case ' ':
            if (index >= 0) {
                consume();
                rows[index].click();
            }
            break;
        case 'Tab':
            consume();
            break;
        default:
            break;
    }
}
