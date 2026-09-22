// @ts-check
/**
 * A dropdown hanging off a top-bar button.
 *
 * Used to group controls that were each their own button in the bar. The bar had eleven
 * top-level buttons competing for attention regardless of how often anything was used —
 * three of them help, one of them the settings for a feature that had no button of its own.
 *
 * The important property: this **moves existing elements** into the panel rather than
 * rebuilding them. Every one of those buttons already has handlers bound to it by id, in
 * main.js and uiBindings.js and elsewhere. Moving the node keeps all of that working;
 * recreating it would mean rewiring, and quietly dropping whatever was missed.
 */

import { hidePopup, onPopupClose } from './popupUI.js';

/**
 * Show content as a dropdown anchored under a top-bar button.
 *
 * The three menus that carry a ▾ — Layout Options, Toggle Overlays and Generate — were
 * opening draggable popups that appeared at a saved position, often nowhere near the
 * button that opened them. A ▾ promises a menu, so this gives them one: anchored to the
 * trigger, dismissed by clicking away or pressing Escape, and gone from the DOM when
 * closed.
 *
 * It keeps the element id the caller asks for, so code that toggles a menu by looking up
 * that id — and hidePopup, which simply removes the element — keeps working unchanged.
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
    const anchor = document.getElementById(anchorId);
    document.getElementById(id)?.remove();
    if (!anchor) return null;

    const panel = document.createElement('div');
    panel.id = id;
    panel.className = ('tb-menu tb-menu--panel ' + className).trim();
    panel.setAttribute('role', 'menu');
    // Positioned before it is ever painted. Measuring it takes a layout pass, and the
    // first one happens before the panel's own content has settled — so positioning once
    // on append put it in the right place for a frame and then moved it.
    panel.style.visibility = 'hidden';

    if (title) {
        const heading = document.createElement('div');
        heading.className = 'tb-menu__title';
        heading.textContent = title;
        panel.appendChild(heading);
    }
    panel.appendChild(content);
    document.body.appendChild(panel);

    panel.classList.add(OPEN_CLASS);
    positionUnder(panel, anchor);
    anchor.classList.add('active');
    anchor.setAttribute('aria-expanded', 'true');

    // Second pass once the content has laid out, then show it. requestAnimationFrame does
    // not run in a hidden document, so a timer backs it up — otherwise a panel opened in a
    // background tab would stay invisible.
    const reveal = () => { positionUnder(panel, anchor); panel.style.visibility = ''; };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 50);

    const close = () => {
        // Through hidePopup, so the teardown registered below runs exactly once however the
        // panel is dismissed.
        hidePopup(panel);
        anchor.classList.remove('active');
        anchor.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
    };

    // A click inside must not dismiss it — these panels hold toggles you set several of.
    panel.addEventListener('click', ev => ev.stopPropagation());
    const onDocClick = (ev) => {
        if (ev.target === anchor || anchor.contains(/** @type {Node} */(ev.target))) return;
        close();
    };
    const onKey = (ev) => { if (ev.key === 'Escape') { close(); anchor.focus(); } };
    const onResize = () => positionUnder(panel, anchor);

    // The panel can also be taken down by togglePopup — the top bar's second-press-closes
    // behaviour — which removes it through hidePopup and never reaches close(). Without
    // this the panel went and the button stayed lit.
    onPopupClose(panel, () => {
        anchor.classList.remove('active');
        anchor.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
    });

    // Deferred, so the click that opened the panel does not immediately close it.
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    return panel;
}

/**
 * @typedef {object} Dropdown
 * @property {HTMLButtonElement} trigger
 * @property {HTMLElement} panel
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {() => boolean} isOpen
 */

const OPEN_CLASS = 'dropdown-open';

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
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    host.insertBefore(trigger, before || null);

    const isOpen = () => panel.classList.contains(OPEN_CLASS);

    const setOpen = (on) => {
        panel.classList.toggle(OPEN_CLASS, on);
        if (on) positionUnder(panel, trigger);
        trigger.classList.toggle('active', on);
        trigger.setAttribute('aria-expanded', on ? 'true' : 'false');
    };

    const close = () => setOpen(false);
    const open = () => setOpen(true);
    const toggle = () => setOpen(!isOpen());

    trigger.addEventListener('click', (ev) => { ev.stopPropagation(); toggle(); });

    // Choosing an item is the end of the interaction, so the menu closes behind it —
    // except for a checkbox, where you may well want to set more than one.
    panel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const target = /** @type {HTMLElement|null} */ (ev.target);
        if (target?.closest('button')) close();
    });

    document.addEventListener('click', () => { if (isOpen()) close(); });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && isOpen()) { close(); trigger.focus(); }
    });
    window.addEventListener('resize', () => { if (isOpen()) positionUnder(panel, trigger); });

    return { trigger, panel, open, close, toggle, isOpen };
}
