// @ts-check
/**
 * Every keyboard and mouse shortcut, in one place, and the panel that lists them.
 *
 * The list used to be hand-written HTML inside the Help popup, and the status bar carried
 * its own short copy. They drifted apart from the code and from each other: the popup
 * still described a pan "hand" that had been removed, the status bar suggested Shift+D
 * did something on its own, and the Slice Analysis help described a Shift+D+click that
 * never existed. Now the panel and the status-bar hint are both rendered from SHORTCUTS,
 * so there is one thing to keep true.
 *
 * A combo is a string of tokens joined by '+', e.g. 'Mod+Shift+Z' or 'Shift+Drag'.
 * Keys are drawn as keycaps; the mouse tokens below are drawn as a small mouse with the
 * relevant button lit. 'Mod' is Ctrl, or ⌘ on a Mac.
 *
 * No DOM at module scope — tools/test-shortcuts.js loads this under node.
 */

import { showPopup, hidePopup, togglePopup } from './popupUI.js';

/**
 * `hint` puts the shortcut in the status bar under that word; `hintCombo` is a shorter combo
 * to show there, when the full one would not fit the line.
 * @typedef {{ combos: string[], does: string, hint?: string, hintCombo?: string }} Shortcut
 */
/** @typedef {{ id: string, title: string, icon: string, items: Shortcut[], notes?: string[] }} ShortcutGroup */

/** Mouse tokens: which button to light, and the word under it. */
export const MOUSE_TOKENS = /** @type {const} */ ({
    Click:       { button: 'left',   label: 'Click' },
    RightClick:  { button: 'right',  label: 'Right-click' },
    Drag:        { button: 'left',   label: 'Drag' },
    MiddleDrag:  { button: 'middle', label: 'Middle-drag' },
    Wheel:       { button: 'middle', label: 'Scroll' },
    Hover:       { button: null,     label: 'Hover' },
});

/** Keys that are written differently from how they are named in a combo. */
const KEY_NAMES = { Esc: 'Esc', Shift: 'Shift', Alt: 'Alt', Space: 'Space', Enter: 'Enter' };

/** @type {ShortcutGroup[]} */
export const SHORTCUTS = [
    {
        id: 'general', title: 'General', icon: '⚙',
        items: [
            { combos: ['Mod+Z'], does: 'Undo' },
            { combos: ['Mod+Shift+Z'], does: 'Redo' },
            { combos: ['Esc', 'RightClick'], does: 'Clear cursor/Disarm tool' },
            { combos: ['Hover+Shift+R'], does: 'Clear everything from the hex under the cursor', hint: 'clear', hintCombo: 'Shift+R' },
            { combos: ['?'], does: 'Show this list' },
        ],
    },
    {
        id: 'map', title: 'Moving around', icon: '🗺',
        items: [
            { combos: ['Drag'], does: 'Pan the map, Has a small deadzone' },
            { combos: ['MiddleDrag'], does: 'Pan the map' },
            { combos: ['Wheel'], does: 'Zoom, towards the cursor' },
        ],
    },
    {
        id: 'select', title: 'Selecting', icon: '⬡',
        items: [
            { combos: ['Click'], does: 'Select/Deselect hex, inspector (panel to the right) shows hex info' },
            { combos: ['Shift+Click'], does: 'Add/Remove hex from selection' },
            { combos: ['Shift+Drag'], does: 'Paint hexes to add to selection', hint: 'select' },
        ],
        notes: ['Selecting only happens with no tool armed. With a tool armed, the click belongs to the tool.'],
    },
    {
        id: 'clipboard', title: 'Copy, paste, swap', icon: '✂',
        items: [
            { combos: ['Mod+C'], does: 'Copy the selected hexes' },
            { combos: ['Mod+X'], does: 'Cut the selected hexes' },
            { combos: ['Mod+V'], does: 'Summon last used ghost to cursor' },
            { combos: ['R'], does: 'Rotate ghost 60° clockwise' },
            { combos: ['Click'], does: 'Place the ghost, does not clear cursor' },
            { combos: ['Shift+S+Click'], does: 'Pick the first tile of a swap; the next click swaps' },
        ],
        notes: ['The last 12 copies are listed in the Inspector. Select exactly two hexes to get a ⇄ swap button on them.'],
    },
    {
        id: 'distance', title: 'Distance', icon: '↔',
        items: [
            { combos: ['D'], does: 'Arm or disarm the Distance tool', hint: 'distance' },
            { combos: ['Click'], does: 'Show distances from a tile. Click it again to hide them' },
            { combos: ['Shift+D+RightClick'], does: 'The same, without arming the tool' },
            { combos: ['Esc'], does: 'Clear the distances' },
        ],
        notes: [
            'Unpainted hexes are not tiles, so movement cannot pass through them.',
            'Hyperlanes are conduits: they get no number of their own and cost no movement.',
            'The range and the rules are in Analyse ▸ Distance Options.',
        ],
    },
    {
        id: 'hyperlanes', title: 'Hyperlanes', icon: '∿',
        items: [
            { combos: ['Click'], does: 'A → B → C draws a lane through B, and the next click carries it on' },
            { combos: ['Click', 'Enter'], does: 'Click the tile the lane has reached, or its ✓, to finish the lane. The tool stays armed' },
            { combos: ['Click'], does: 'A → B → A, or the ○ on the tile the lane has reached, puts a roundabout there' },
            { combos: ['Alt+Click'], does: 'A → B → C removes that one lane; A → B → A takes that side off a roundabout' },
            { combos: ['Shift+Click'], does: 'Remove every lane on the tile' },
        ],
        notes: [
            'A roundabout joins every lane that reaches its tile: a ship coming in by one can leave by any of them.',
            'A lane drawn across a roundabout joins it at both ends instead of crossing it.',
            'Right-click and Esc drop the lane too, but they also disarm the tool.',
        ],
    },
];

/** @returns {boolean} */
function isMac() {
    const nav = /** @type {any} */ (globalThis.navigator);
    const platform = nav?.userAgentData?.platform || nav?.platform || '';
    return /mac|iphone|ipad/i.test(platform);
}

/**
 * Split a combo into keycaps and mouse tokens.
 *
 * @param {string} combo
 * @param {{ mac?: boolean }} [opts]
 * @returns {Array<{ kind: 'key', text: string } | { kind: 'mouse', token: keyof typeof MOUSE_TOKENS }>}
 */
export function parseCombo(combo, { mac = isMac() } = {}) {
    // '+' on its own would split to nothing, and no shortcut uses it, so a plain split is safe.
    return combo.split('+').map(part => {
        if (part in MOUSE_TOKENS) {
            return { kind: 'mouse', token: /** @type {keyof typeof MOUSE_TOKENS} */ (part) };
        }
        if (part === 'Mod') return { kind: 'key', text: mac ? '⌘' : 'Ctrl' };
        if (part === 'Alt' && mac) return { kind: 'key', text: '⌥' };
        return { kind: 'key', text: KEY_NAMES[part] || part.toUpperCase() };
    });
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A small mouse with one button lit.
 * @param {'left'|'right'|'middle'|null} button
 */
function mouseIcon(button) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 22');
    svg.setAttribute('class', 'sc-mouse__icon');
    svg.setAttribute('aria-hidden', 'true');

    const lit = (/** @type {string} */ which) => which === button ? ' sc-mouse__lit' : '';
    svg.innerHTML = `
        <path class="sc-mouse__btn${lit('left')}" d="M8 1.5 H6.5 A5 5 0 0 0 1.5 6.5 V9 H8 Z"/>
        <path class="sc-mouse__btn${lit('right')}" d="M8 1.5 H9.5 A5 5 0 0 1 14.5 6.5 V9 H8 Z"/>
        <path class="sc-mouse__body" d="M1.5 9 V15 A6.5 6.5 0 0 0 14.5 15 V9 Z"/>
        <rect class="sc-mouse__wheel${lit('middle')}" x="6.9" y="3.4" width="2.2" height="4.2" rx="1.1"/>`;
    return svg;
}

/**
 * One combo, as keycaps and mice.
 * @param {string} combo
 */
export function renderCombo(combo) {
    const wrap = document.createElement('span');
    wrap.className = 'sc-combo';
    parseCombo(combo).forEach((part, i) => {
        if (i) {
            const plus = document.createElement('span');
            plus.className = 'sc-plus';
            plus.textContent = '+';
            wrap.appendChild(plus);
        }
        if (part.kind === 'key') {
            const kbd = document.createElement('kbd');
            kbd.className = 'sc-key';
            kbd.textContent = part.text;
            wrap.appendChild(kbd);
        } else {
            const { button, label } = MOUSE_TOKENS[part.token];
            const m = document.createElement('span');
            m.className = 'sc-mouse';
            m.appendChild(mouseIcon(button));
            const word = document.createElement('span');
            word.textContent = label;
            m.appendChild(word);
            wrap.appendChild(m);
        }
    });
    return wrap;
}

/** @param {Shortcut} item */
function renderRow(item) {
    const row = document.createElement('div');
    row.className = 'sc-row';
    row.dataset.search = (item.does + ' ' + item.combos.join(' ')).toLowerCase();

    const keys = document.createElement('div');
    keys.className = 'sc-row__keys';
    item.combos.forEach((combo, i) => {
        if (i) {
            const or = document.createElement('span');
            or.className = 'sc-or';
            or.textContent = 'or';
            keys.appendChild(or);
        }
        keys.appendChild(renderCombo(combo));
    });

    const does = document.createElement('div');
    does.className = 'sc-row__does';
    does.textContent = item.does;

    row.append(keys, does);
    return row;
}

/** @param {ShortcutGroup} group */
function renderGroup(group) {
    const card = document.createElement('section');
    card.className = 'sc-group';

    const head = document.createElement('h3');
    head.className = 'sc-group__title';
    const icon = document.createElement('span');
    icon.className = 'sc-group__icon';
    icon.textContent = group.icon;
    head.append(icon, document.createTextNode(group.title));
    card.appendChild(head);

    for (const item of group.items) card.appendChild(renderRow(item));

    for (const note of group.notes || []) {
        const p = document.createElement('p');
        p.className = 'sc-note';
        p.textContent = note;
        card.appendChild(p);
    }
    return card;
}

export const SHORTCUTS_POPUP_ID = 'shortcuts-popup';

/** Open the shortcuts panel. */
export function showShortcutsPopup() {
    const root = document.createElement('div');
    root.className = 'sc-panel';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'sc-search';
    search.placeholder = 'Filter: "paste", "shift", "distance"…';
    search.setAttribute('aria-label', 'Filter shortcuts');

    const grid = document.createElement('div');
    grid.className = 'sc-grid';
    const cards = SHORTCUTS.map(renderGroup);
    grid.append(...cards);

    const empty = document.createElement('p');
    empty.className = 'sc-empty';
    empty.textContent = 'No shortcut matches that.';
    empty.hidden = true;

    search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        let any = false;
        for (const card of cards) {
            let shown = 0;
            card.querySelectorAll('.sc-row').forEach(row => {
                const hit = !q || /** @type {HTMLElement} */ (row).dataset.search?.includes(q);
                /** @type {HTMLElement} */ (row).hidden = !hit;
                if (hit) shown++;
            });
            // A matching group title keeps the whole group, rows and all.
            const titleHit = !!q && card.querySelector('.sc-group__title')?.textContent?.toLowerCase().includes(q);
            if (titleHit) card.querySelectorAll('.sc-row').forEach(r => { /** @type {HTMLElement} */ (r).hidden = false; });
            card.querySelectorAll('.sc-note').forEach(n => { /** @type {HTMLElement} */ (n).hidden = !!q && !titleHit; });
            card.hidden = !shown && !titleHit;
            any = any || !card.hidden;
        }
        empty.hidden = any;
    });

    root.append(search, grid, empty);

    showPopup({
        id: SHORTCUTS_POPUP_ID,
        className: 'sc-popup',
        title: '⌨ Keyboard & mouse',
        content: root,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        modal: false,
        actions: [{ label: 'Close', action: () => hidePopup(SHORTCUTS_POPUP_ID) }],
        // showPopup ignores maxWidth, so the cap is inside the width. Three columns of
        // cards on a large screen, two on a laptop.
        style: { width: 'min(1600px, 94vw)', zIndex: 10010 },
    });
    setTimeout(() => search.focus(), 0);
}

/** The status bar's order: most used first, since the line is cut from the right. */
const HINT_ORDER = ['distance', 'select', 'clear'];

/**
 * The status bar's short list: the shortcuts marked with a `hint`.
 * @param {HTMLElement} host
 */
function renderStatusHint(host) {
    host.textContent = '';
    const rank = (/** @type {Shortcut} */ item) => {
        const i = HINT_ORDER.indexOf(item.hint || '');
        return i === -1 ? HINT_ORDER.length : i;
    };
    const hinted = SHORTCUTS.flatMap(g => g.items).filter(item => item.hint)
        .sort((a, b) => rank(a) - rank(b));
    hinted.forEach((item, i) => {
        if (i) {
            const dot = document.createElement('span');
            dot.className = 'sc-hint-sep';
            dot.textContent = '·';
            host.appendChild(dot);
        }
        const combo = renderCombo(item.hintCombo || item.combos[0]);
        combo.classList.add('sc-combo--mini');
        host.append(combo, document.createTextNode(' ' + item.hint));
    });
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'sc-hint-more';
    more.title = 'All keyboard and mouse shortcuts';
    more.append(renderCombo('?'), document.createTextNode(' all shortcuts'));
    more.querySelector('.sc-combo')?.classList.add('sc-combo--mini');
    more.addEventListener('click', () => togglePopup(SHORTCUTS_POPUP_ID, showShortcutsPopup));
    host.appendChild(more);
}

/** @param {EventTarget|null} target */
function isTypingTarget(target) {
    const el = /** @type {HTMLElement|null} */ (target);
    if (!el) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Wire the ways in: the ⌨ button in the top bar, the ? key, and the status-bar hint.
 */
export function installShortcuts() {
    document.getElementById('shortcutsBtn')
        ?.addEventListener('click', () => togglePopup(SHORTCUTS_POPUP_ID, showShortcutsPopup));

    const hint = document.getElementById('statusHint');
    if (hint) renderStatusHint(hint);

    document.addEventListener('keydown', (ev) => {
        // Escape first: it has to work from inside the panel's own filter box.
        if (ev.key === 'Escape' && document.getElementById(SHORTCUTS_POPUP_ID)) {
            hidePopup(SHORTCUTS_POPUP_ID);
            return;
        }
        if (ev.ctrlKey || ev.metaKey || ev.altKey || isTypingTarget(ev.target)) return;
        if (ev.key === '?') {
            ev.preventDefault();
            togglePopup(SHORTCUTS_POPUP_ID, showShortcutsPopup);
        }
    });
}
