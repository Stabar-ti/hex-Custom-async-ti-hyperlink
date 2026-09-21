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
