// @ts-check
/**
 * Dropdowns hanging off top-bar buttons: File, Toggle Overlays, Analyse, Tools and Help,
 * and Distance Options, which hangs off Analyse.
 *
 * They come in two kinds. File, Analyse and Help are panels that stay in the document and
 * are shown by a class; Analyse and Help **move existing buttons** into theirs rather than
 * rebuilding them, because those buttons have handlers bound to them by id in main.js and
 * elsewhere. Toggle Overlays, Tools and Distance Options are built each time they open and
 * removed when they close, because their content reflects the editor at the moment of
 * opening, and code finds them by id while they are up.
 *
 * Those were two implementations here and a third in fileMenu.js, and none of them knew the
 * others existed. A menu closed another only when the click that opened it happened to
 * bubble up to the other's document listener — and the File, Analyse and Help buttons
 * stopped propagation. So whether opening a menu closed the one already open depended on
 * which two they were; Analyse and Help could both be open at once, and the one built
 * later was drawn over the other.
 *
 * Now both kinds go through one record of which menu is open. Opening any menu closes the
 * one that was; a press anywhere outside the open menu and its button closes it; Escape
 * closes it. This governs menus only. Draggable popups — the system tiles, the AutoMapper,
 * the Milty designer — are windows, not menus, and opening or dismissing a menu leaves
 * them where they are.
 */

import { hidePopup, onPopupClose, togglePopup } from './popupUI.js';

const OPEN_CLASS = 'dropdown-open';

/**
 * @typedef {object} OpenMenu
 * @property {HTMLElement} panel
 * @property {HTMLElement} anchor  the button it hangs from; a press on it is not "outside"
 * @property {() => void} close
 */

/** @type {OpenMenu|null} */
let current = null;
let listening = false;

/**
 * The listeners every menu shares, added the first time one opens.
 *
 * Outside presses are caught on pointerdown in the capture phase rather than as a click
 * bubbling up to the document. Bubbling was the bug: any handler on the way that stopped
 * propagation — and three menu buttons did — made a menu deaf to clicks elsewhere.
 * Capture runs before any of them can, and a press on a menu's own button is left to that
 * button's click, so a second press closes rather than closing and reopening.
 */
function listen() {
    if (listening) return;
    listening = true;

    document.addEventListener('pointerdown', (ev) => {
        if (!current) return;
        const target = /** @type {Node} */ (ev.target);
        if (current.panel.contains(target) || current.anchor.contains(target)) return;
        current.close();
    }, true);

    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape' || !current) return;
        const { anchor } = current;
        current.close();
        anchor.focus();
    });

    window.addEventListener('resize', () => {
        if (current) positionUnder(current.panel, current.anchor);
    });
}

/**
 * @param {HTMLElement} anchor
 * @param {boolean} open
 */
function setAnchorState(anchor, open) {
    anchor.classList.toggle('active', open);
    anchor.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Record a menu as the open one, closing whichever was open before. Its panel must
 * already be displayed, so that it can be measured.
 *
 * @param {OpenMenu} menu
 */
function opened(menu) {
    listen();
    if (current && current.panel !== menu.panel) current.close();
    current = menu;
    setAnchorState(menu.anchor, true);
    place(menu.panel, menu.anchor);
}

/**
 * Forget a panel as the open menu.
 *
 * Does nothing if another menu has taken over since. Distance Options opens from an item
 * in the Analyse menu and hangs off the same button; Analyse closes behind the item, and
 * without this check that late close switched the button off under the panel that had
 * just lit it.
 *
 * @param {HTMLElement} panel
 */
function closed(panel) {
    if (current?.panel !== panel) return;
    setAnchorState(current.anchor, false);
    current = null;
}

/**
 * Position a panel under its button and show it.
 *
 * Positioned before it is ever painted. Measuring it takes a layout pass, and the first
 * one can happen before the panel's content has settled — so positioning once put it in
 * the right place for a frame and then moved it. The second pass waits for layout;
 * requestAnimationFrame does not run in a hidden document, so a timer backs it up, or a
 * panel opened in a background tab would stay invisible.
 *
 * @param {HTMLElement} panel
 * @param {HTMLElement} anchor
 */
function place(panel, anchor) {
    panel.style.visibility = 'hidden';
    positionUnder(panel, anchor);
    const reveal = () => { positionUnder(panel, anchor); panel.style.visibility = ''; };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 50);
}

/**
 * Position a panel under its trigger, clamped to the viewport.
 *
 * @param {HTMLElement} panel
 * @param {HTMLElement} trigger
 */
export function positionUnder(panel, trigger) {
    const r = trigger.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 4) + 'px';
    const width = panel.getBoundingClientRect().width;
    panel.style.left = Math.min(Math.round(r.left), Math.max(8, window.innerWidth - width - 8)) + 'px';
}

/**
 * @param {HTMLElement} button
 * @param {() => void} toggle
 */
function bindTrigger(button, toggle) {
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', toggle);
}

/**
 * Show content as a dropdown anchored under a top-bar button.
 *
 * The menus that carry a ▾ were opening draggable popups that appeared at a saved
 * position, often nowhere near the button that opened them. A ▾ promises a menu, so this
 * gives them one: anchored to the trigger, dismissed like every other menu, and gone from
 * the DOM when closed.
 *
 * It keeps the element id the caller asks for, so code that looks the panel up by id —
 * togglePopup, hidePopup, the hover-info binding — keeps working unchanged. However it is
 * taken down, it goes through hidePopup, and the teardown registered here runs once.
 *
 * @param {object} opts
 * @param {string} opts.id            - id for the panel
 * @param {string} opts.anchorId      - id of the button to hang it under
 * @param {HTMLElement} opts.content
 * @param {string} [opts.className]   - extra classes on the panel
 * @param {string} [opts.title]       - optional heading inside the panel
 * @returns {HTMLElement|null}
 */
export function showAnchoredPanel({ id, anchorId, content, className = '', title }) {
    // Through hidePopup rather than remove(): a panel of this id that is already up has
    // its teardown to run, and remove() skipped it.
    hidePopup(id);
    const anchor = document.getElementById(anchorId);
    if (!anchor) return null;

    const panel = document.createElement('div');
    panel.id = id;
    panel.className = ('tb-menu tb-menu--panel ' + OPEN_CLASS + ' ' + className).trim();
    panel.setAttribute('role', 'menu');

    if (title) {
        const heading = document.createElement('div');
        heading.className = 'tb-menu__title';
        heading.textContent = title;
        panel.appendChild(heading);
    }
    panel.appendChild(content);
    document.body.appendChild(panel);

    onPopupClose(panel, () => closed(panel));
    opened({ panel, anchor, close: () => hidePopup(panel) });
    return panel;
}

/**
 * Wire a button to a panel that showAnchoredPanel builds: a press opens it, a second
 * press puts it away.
 *
 * @param {string} buttonId
 * @param {string} panelId
 * @param {() => void} open  builds and shows the panel
 */
export function bindAnchoredPanel(buttonId, panelId, open) {
    const button = document.getElementById(buttonId);
    if (button) bindTrigger(button, () => { togglePopup(panelId, open); });
}

/**
 * @typedef {object} Dropdown
 * @property {HTMLElement} trigger
 * @property {HTMLElement} panel
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {() => boolean} isOpen
 */

/**
 * Make an element that stays in the document a dropdown under a button.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.panel
 * @param {HTMLElement} opts.trigger
 * @param {string} [opts.openClass]      - the class that displays the panel
 * @param {boolean} [opts.closeOnChoose] - close when a button inside is pressed
 * @param {() => void} [opts.onClose]
 * @returns {Dropdown}
 */
export function makeDropdown({ panel, trigger, openClass = OPEN_CLASS, closeOnChoose = false, onClose }) {
    const isOpen = () => current?.panel === panel;

    const close = () => {
        if (!isOpen()) return;
        panel.classList.remove(openClass);
        closed(panel);
        onClose?.();
    };
    const open = () => {
        if (isOpen()) return;
        panel.classList.add(openClass);
        opened({ panel, anchor: trigger, close });
    };
    const toggle = () => (isOpen() ? close() : open());

    bindTrigger(trigger, toggle);

    // Choosing an item is the end of the interaction, so the menu closes behind it.
    if (closeOnChoose) {
        panel.addEventListener('click', (ev) => {
            const target = /** @type {HTMLElement|null} */ (ev.target);
            if (target?.closest('button')) close();
        });
    }

    return { trigger, panel, open, close, toggle, isOpen };
}

/**
 * Build a dropdown from buttons that already exist in the bar.
 *
 * @param {object} opts
 * @param {string} opts.id          - id for the panel; the trigger gets `<id>Btn`
 * @param {string} opts.label       - trigger text, without the ▾
 * @param {string} opts.title       - trigger tooltip
 * @param {string[]} opts.itemIds   - ids of existing elements to move in, in order
 * @param {HTMLElement} opts.host   - where the trigger goes
 * @param {HTMLElement} [opts.before] - insert the trigger before this element
 * @returns {Dropdown|null} null when none of the items exist
 */
export function createDropdownFromExisting({ id, label, title, itemIds, host, before }) {
    const items = /** @type {HTMLElement[]} */ (
        itemIds.map(i => document.getElementById(i)).filter(Boolean)
    );
    if (!items.length || !host) return null;
    if (document.getElementById(id)) return null;   // already built

    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'tb-menu';
    panel.setAttribute('role', 'menu');
    for (const item of items) {
        item.classList.add('tb-menu__item');
        panel.appendChild(item);          // moves it, handlers and all
    }
    document.body.appendChild(panel);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = id + 'Btn';
    trigger.className = 'mode-button ui-btn';
    trigger.textContent = label + ' ▾';
    trigger.title = title;
    host.insertBefore(trigger, before || null);

    return makeDropdown({ panel, trigger, closeOnChoose: true });
}
