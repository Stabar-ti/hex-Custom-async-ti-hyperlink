// @ts-check
/**
 * The element factory the rest of the kit is built on.
 *
 * Why this exists
 * ───────────────
 * The UI in this codebase is assembled by hand, element by element, and then styled by
 * assignment:
 *
 *     const btn = document.createElement('button');
 *     btn.className = 'mode-button';
 *     btn.textContent = 'Custom Links…';
 *     btn.style.width = '100%';
 *     btn.style.maxWidth = '200px';
 *     btn.style.minWidth = '70px';       // Same as wormhole popup buttons
 *     btn.style.height = '38px';         // Same as wormhole popup buttons
 *     btn.style.marginBottom = '6px';
 *     btn.style.fontSize = '0.9em';
 *     btn.style.padding = '8px 12px';
 *     btn.style.boxSizing = 'border-box';
 *     btn.style.textOverflow = 'ellipsis';
 *     btn.style.whiteSpace = 'nowrap';
 *     btn.style.overflow = 'hidden';
 *     btn.style.flex = 'none';
 *
 * That block appears eleven times in uisectorControls.js alone, twice carrying a comment
 * saying it was copied from somewhere else. There are ~1,150 inline style assignments
 * across src/, against a styles.css that already defines a 42-token design system in
 * `:root` — so the tokens exist and almost nothing reaches them. Change an inline value
 * and you have changed one button.
 *
 * What the kit does about it
 * ──────────────────────────
 * Elements are described, not assembled, and appearance comes from a class that is
 * defined once in kit.css against those tokens. The block above becomes:
 *
 *     panelButton({ id: 'launchCustomLinksPopup', text: 'Custom Links…',
 *                   title: 'Manage Custom Links', onClick: ... })
 *
 * `style` is still available as an escape hatch, because a genuinely computed value —
 * a popup's position, a bar's width — belongs inline and always did. What does not
 * belong inline is a colour, a font size or a spacing that is the same everywhere.
 *
 * No DOM at module scope — this imports cleanly under node so the kit can be tested.
 */

/**
 * @typedef {object} ElOptions
 * @property {string}   [className]  - space-separated classes
 * @property {string}   [id]
 * @property {string}   [text]       - textContent (safe: never parsed as HTML)
 * @property {string}   [title]      - tooltip
 * @property {Record<string, string|number|boolean|null|undefined>} [attrs]
 *           - setAttribute for each entry; null/undefined/false removes the attribute
 * @property {Record<string, string>} [style]
 *           - inline styles, for genuinely computed values only
 * @property {Record<string, (ev: any) => void>} [on]
 *           - event listeners by type, e.g. `{ click: fn }`
 * @property {Array<Node|string|null|undefined|false>} [children]
 *           - appended in order; strings become text nodes, falsy entries are skipped
 *             so `[cond && el('div')]` works
 * @property {(ev: MouseEvent) => void} [onClick] - shorthand for `on: { click }`
 */

/**
 * Create an element from a description.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElOptions} [opts]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, opts = {}) {
    const node = document.createElement(tag);
    apply(node, opts);
    return node;
}

/**
 * Apply a description to an element that already exists. This is what makes the kit
 * adoptable a line at a time: an existing hand-built element can be handed to `apply`
 * without being rewritten first.
 *
 * @param {HTMLElement} node
 * @param {ElOptions} [opts]
 * @returns {HTMLElement} the same node
 */
export function apply(node, opts = {}) {
    const { className, id, text, title, attrs, style, on, children, onClick } = opts;

    if (className) node.className = className;
    if (id) node.id = id;
    if (text != null) node.textContent = text;
    if (title != null) node.title = title;

    if (attrs) {
        for (const [name, value] of Object.entries(attrs)) {
            if (value == null || value === false) node.removeAttribute(name);
            else node.setAttribute(name, value === true ? '' : String(value));
        }
    }

    if (style) {
        for (const [prop, value] of Object.entries(style)) {
            // setProperty rather than node.style[prop] so custom properties (--foo) work.
            if (prop.startsWith('--')) node.style.setProperty(prop, value);
            else node.style[/** @type {any} */(prop)] = value;
        }
    }

    if (onClick) node.addEventListener('click', onClick);
    if (on) {
        for (const [type, handler] of Object.entries(on)) {
            node.addEventListener(type, handler);
        }
    }

    if (children) append(node, children);

    return node;
}

/**
 * Append children, skipping falsy entries so a conditional child can be written inline
 * as `[showHint && el('p', ...)]`.
 *
 * @param {HTMLElement} parent
 * @param {Array<Node|string|null|undefined|false>} children
 * @returns {HTMLElement} the parent
 */
export function append(parent, children) {
    for (const child of children) {
        if (child == null || child === false || child === '') continue;
        parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return parent;
}

/**
 * Toggle a state class. Modules currently express "this button is on" by writing four
 * inline styles and then writing four empty strings to undo them, which loses whatever
 * the stylesheet had to say. A class hands that back to CSS.
 *
 * @param {HTMLElement} node
 * @param {boolean} on
 * @param {string} [className]
 */
export function setActive(node, on, className = 'is-active') {
    node.classList.toggle(className, !!on);
}
