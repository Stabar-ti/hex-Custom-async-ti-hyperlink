// @ts-check
/**
 * The controls the panels and popups actually build, as described elements.
 *
 * Every one of these emits classes defined in kit.css against the `:root` tokens in
 * styles.css. None of them writes a colour, a font size or a spacing inline — that is
 * the whole point. Where a caller genuinely needs a computed value it can still pass
 * `style`, which is forwarded to `el`.
 *
 * Existing classes are kept where they already exist. `button()` still emits
 * `mode-button`, because styles.css has a lot to say about `.mode-button` and its
 * `.active` state and the map toolbar depends on it. The kit adds to that rather than
 * competing with it.
 *
 * No DOM at module scope — this imports cleanly under node so the kit can be tested.
 */

import { el, append, setActive } from './el.js';

/**
 * @typedef {import('./el.js').ElOptions} ElOptions
 */

// ── Buttons ──────────────────────────────────────────────────────────────────

/**
 * A toolbar/popup button. Keeps the existing `.mode-button` styling and its `.active`
 * state, so this is a drop-in for the hand-built ones.
 *
 * @param {ElOptions & {variant?: 'default'|'primary'|'danger', active?: boolean}} [opts]
 * @returns {HTMLButtonElement}
 */
export function button({ variant = 'default', active = false, className = '', ...rest } = {}) {
    const variantClass = variant === 'default' ? '' : ` ui-btn--${variant}`;
    const node = el('button', {
        ...rest,
        className: ('mode-button ui-btn' + variantClass + ' ' + className).trim(),
    });
    node.type = 'button';           // never submit a surrounding form by accident
    if (active) node.classList.add('active');
    return node;
}

/**
 * The full-width button used down the side panels — the eleven-line inline recipe that
 * uisectorControls.js repeats for every launcher, now one class.
 *
 * @param {ElOptions & {active?: boolean}} [opts]
 * @returns {HTMLButtonElement}
 */
export function panelButton({ className = '', ...rest } = {}) {
    return button({ ...rest, className: ('ui-btn--panel ' + className).trim() });
}

/**
 * A button for the docked tool rail: an icon and a label, laid out as a row.
 *
 * The icon and the label are separate elements on purpose — that is what lets the rail
 * collapse to an icon strip by hiding one of them in CSS, rather than rebuilding the
 * button with different content. The label doubles as the tooltip when none is given,
 * because once collapsed the icon is all there is to go on.
 *
 * @param {ElOptions & {icon: string, text: string, active?: boolean}} opts
 * @returns {HTMLButtonElement}
 */
export function railButton({ icon, text, active = false, className = '', title, ...rest }) {
    const node = button({
        ...rest,
        active,
        title: title || text,
        className: ('ui-rail-btn ' + className).trim(),
    });
    node.append(
        el('span', { className: 'ui-rail-btn__icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'ui-rail-btn__label', text }),
    );
    return node;
}

/**
 * Change a rail button's label, leaving its icon alone.
 *
 * Use this rather than writing `button.textContent`. A rail button is an icon element plus
 * a label element, and assigning textContent replaces both with a single text node — the
 * icon disappears and never comes back, so the collapsed rail shows an empty button. The
 * tools that relabel themselves while armed ("Click a Hex…") hit exactly that.
 *
 * @param {HTMLElement} node
 * @param {string} text
 */
export function setRailLabel(node, text) {
    const label = node.querySelector('.ui-rail-btn__label');
    if (label) label.textContent = text;
    else node.textContent = text;   // not a rail button — behave like the plain assignment
}

/**
 * A heading above a group of rail buttons.
 *
 * @param {string} text
 */
export function railGroupLabel(text) {
    return el('div', { className: 'ui-rail-group', text });
}

/**
 * A row of buttons that sit together.
 *
 * @param {Array<Node|string|null|undefined|false>} children
 * @param {ElOptions} [opts]
 */
export function buttonRow(children, { className = '', ...rest } = {}) {
    return el('div', { ...rest, className: ('ui-btn-row ' + className).trim(), children });
}

// ── Inputs ───────────────────────────────────────────────────────────────────

/**
 * A checkbox with its label, wired as one thing. The pattern this replaces is four
 * elements and a handful of inline styles, repeated ~40 times across the codebase.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {boolean} [opts.checked]
 * @param {string} [opts.id]
 * @param {string} [opts.title]
 * @param {string} [opts.className]
 * @param {(checked: boolean, ev: Event) => void} [opts.onChange]
 * @returns {HTMLLabelElement & {input: HTMLInputElement}}
 */
export function checkbox({ label, checked = false, id, title, className = '', onChange }) {
    const input = el('input', { id });
    input.type = 'checkbox';
    input.checked = !!checked;
    input.className = 'ui-checkbox__input';
    if (onChange) {
        input.addEventListener('change', (ev) => onChange(input.checked, ev));
    }

    const wrapper = el('label', {
        className: ('ui-checkbox ' + className).trim(),
        title,
        children: [input, el('span', { className: 'ui-checkbox__label', text: label })],
    });

    // The input is what callers need to read or set later, so hand it back attached
    // rather than making everyone re-query for it.
    return Object.assign(/** @type {HTMLLabelElement} */(wrapper), { input });
}

/**
 * A labelled text/number input.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} [opts.value]
 * @param {'text'|'number'|'search'} [opts.type]
 * @param {string} [opts.id]
 * @param {string} [opts.placeholder]
 * @param {string} [opts.title]
 * @param {string} [opts.className]
 * @param {(value: string, ev: Event) => void} [opts.onInput]
 * @returns {HTMLDivElement & {input: HTMLInputElement}}
 */
export function field({ label, value = '', type = 'text', id, placeholder, title, className = '', onInput }) {
    const input = el('input', { id, attrs: { placeholder } });
    input.type = type;
    input.value = value;
    // `input-dark` is the existing class styles.css already themes; keep it.
    input.className = 'input-dark ui-field__input';
    if (onInput) {
        input.addEventListener('input', (ev) => onInput(input.value, ev));
    }

    const wrapper = el('div', {
        className: ('ui-field ' + className).trim(),
        title,
        children: [el('span', { className: 'ui-field__label', text: label }), input],
    });

    return Object.assign(/** @type {HTMLDivElement} */(wrapper), { input });
}

/**
 * A labelled `<select>`.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {Array<{value: string, label: string}>} opts.options
 * @param {string} [opts.value]
 * @param {string} [opts.id]
 * @param {string} [opts.title]
 * @param {string} [opts.className]
 * @param {(value: string, ev: Event) => void} [opts.onChange]
 * @returns {HTMLDivElement & {select: HTMLSelectElement}}
 */
export function select({ label, options, value, id, title, className = '', onChange }) {
    const node = el('select', { id, className: 'input-dark ui-select__input' });
    for (const opt of options) {
        const o = el('option', { text: opt.label });
        o.value = opt.value;
        node.appendChild(o);
    }
    if (value != null) node.value = value;
    if (onChange) {
        node.addEventListener('change', (ev) => onChange(node.value, ev));
    }

    const wrapper = el('div', {
        className: ('ui-select ' + className).trim(),
        title,
        children: [el('span', { className: 'ui-select__label', text: label }), node],
    });

    return Object.assign(/** @type {HTMLDivElement} */(wrapper), { select: node });
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * A vertical stack — the default shape of a popup's contents.
 *
 * @param {Array<Node|string|null|undefined|false>} children
 * @param {ElOptions & {gap?: 'tight'|'normal'|'loose'}} [opts]
 */
export function stack(children, { gap = 'normal', className = '', ...rest } = {}) {
    return el('div', {
        ...rest,
        className: (`ui-stack ui-stack--${gap} ` + className).trim(),
        children,
    });
}

/**
 * A horizontal row.
 *
 * @param {Array<Node|string|null|undefined|false>} children
 * @param {ElOptions & {align?: 'start'|'center'|'between'}} [opts]
 */
export function row(children, { align = 'center', className = '', ...rest } = {}) {
    return el('div', {
        ...rest,
        className: (`ui-row ui-row--${align} ` + className).trim(),
        children,
    });
}

/**
 * A titled group of controls.
 *
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {Array<Node|string|null|undefined|false>} opts.children
 * @param {string} [opts.className]
 */
export function section({ title, children, className = '' }) {
    const body = el('div', { className: 'ui-section__body', children });
    return el('div', {
        className: ('ui-section ' + className).trim(),
        children: [title && el('div', { className: 'ui-section__title', text: title }), body],
    });
}

/** A horizontal rule between sections. */
export function separator({ className = '' } = {}) {
    return el('div', { className: ('ui-separator ' + className).trim() });
}

/**
 * Explanatory text under a control.
 *
 * @param {string} text
 * @param {ElOptions & {tone?: 'muted'|'warning'|'danger'}} [opts]
 */
export function note(text, { tone = 'muted', className = '', ...rest } = {}) {
    return el('div', { ...rest, className: (`ui-note ui-note--${tone} ` + className).trim(), text });
}

export { el, append, setActive };
