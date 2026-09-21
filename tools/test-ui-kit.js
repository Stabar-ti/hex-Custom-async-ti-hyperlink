/**
 * Tests for the UI kit — src/ui/kit/.
 *
 *   node tools/test-ui-kit.js      (or: npm test)
 *
 * The kit exists to get appearance out of inline styles and into classes defined against
 * the design tokens, so the property worth asserting is exactly that: the controls emit
 * the classes they promise and do NOT write colours, sizes or spacing inline. A helper
 * that quietly sets `style.background` would look fine on screen and defeat the point.
 *
 * The DOM here is a hand-rolled stub, matching what tools/test-import-warning.js already
 * does. No jsdom: this project installs nothing to run, and the kit touches a small
 * enough slice of the DOM that faking it is cheaper than a dependency.
 */

// ── Minimal DOM ───────────────────────────────────────────────────────────────

class FakeClassList {
    constructor(node) { this.node = node; this.set = new Set(); }
    add(...names) { for (const n of names) if (n) this.set.add(n); }
    remove(...names) { for (const n of names) this.set.delete(n); }
    contains(name) { return this.set.has(name); }
    toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : !!force;
        if (on) this.set.add(name); else this.set.delete(name);
        return on;
    }
    get value() { return [...this.set].join(' '); }
}

class FakeElement {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.attributes = {};
        this.listeners = {};
        this.textContent = '';
        this.title = '';
        this.id = '';
        this.value = '';
        this.checked = false;
        this.type = '';
        this._classList = new FakeClassList(this);
        // Every style write is recorded, so a test can assert that nothing wrote one.
        this.styleWrites = {};
        this.style = new Proxy({
            setProperty: (k, v) => { this.styleWrites[k] = v; },
        }, {
            get: (t, k) => (k in t ? t[k] : this.styleWrites[k]),
            set: (t, k, v) => { this.styleWrites[k] = v; return true; },
        });
    }
    get classList() { return this._classList; }
    get className() { return this._classList.value; }
    set className(v) {
        this._classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
    }
    appendChild(child) { this.children.push(child); return child; }
    append(...kids) { for (const k of kids) this.children.push(k); }
    /** Supports only the '.class' form, which is all the kit uses. */
    querySelector(sel) {
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        if (!cls) return null;
        return this.find(n => n !== this && n.classList?.contains?.(cls)) || null;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, ev = {}) { for (const fn of this.listeners[type] || []) fn(ev); }
    /** Depth-first text, for asserting rendered labels. */
    get text() {
        return [this.textContent, ...this.children.map(c => (c.text ?? c.textContent ?? ''))]
            .filter(Boolean).join(' ');
    }
    find(pred) {
        if (pred(this)) return this;
        for (const c of this.children) {
            const hit = c.find?.(pred);
            if (hit) return hit;
        }
        return null;
    }
}

globalThis.document = {
    createElement: tag => new FakeElement(tag),
    createTextNode: t => ({ textContent: t, text: t }),
};

const { el, apply, append, setActive } = await import('../src/ui/kit/el.js');
const {
    button, panelButton, railButton, railGroupLabel, setRailLabel, buttonRow, checkbox, field, select,
    stack, row, section, separator, note,
} = await import('../src/ui/kit/controls.js');

// ── Harness ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`  FAIL ${label}\n    expected ${e}\n    actual   ${a}`);
}

function ok(label, cond) { check(label, !!cond, true); }

/** The kit's core promise: appearance lives in CSS, not in style attributes. */
function noInlineStyles(label, node) {
    const offenders = [];
    (function walk(n) {
        const written = Object.keys(n.styleWrites || {});
        if (written.length) offenders.push(`${n.tagName}: ${written.join(', ')}`);
        for (const c of n.children || []) if (c.tagName) walk(c);
    })(node);
    check(label, offenders, []);
}

// ── el() ──────────────────────────────────────────────────────────────────────
{
    const node = el('div', {
        id: 'x', className: 'a b', text: 'hello', title: 'tip',
        attrs: { 'data-n': 3, 'aria-hidden': true, gone: null, off: false },
    });

    check('el sets the tag', node.tagName, 'DIV');
    check('el sets id', node.id, 'x');
    check('el sets classes', node.className, 'a b');
    check('el sets text', node.textContent, 'hello');
    check('el sets title', node.title, 'tip');
    check('el stringifies attrs', node.attributes['data-n'], '3');
    check('el renders true as an empty attribute', node.attributes['aria-hidden'], '');
    ok('el drops null attrs', !('gone' in node.attributes));
    ok('el drops false attrs', !('off' in node.attributes));
}

{
    // textContent, never innerHTML — a tile name out of SystemInfo must never be parsed
    // as markup.
    const node = el('div', { text: '<img src=x onerror=alert(1)>' });
    check('el does not parse text as HTML', node.textContent, '<img src=x onerror=alert(1)>');
    check('and creates no children from it', node.children.length, 0);
}

{
    const seen = [];
    const node = el('button', {
        onClick: () => seen.push('onClick'),
        on: { click: () => seen.push('on.click'), focus: () => seen.push('on.focus') },
    });
    node.dispatch('click');
    node.dispatch('focus');
    check('el wires onClick and on', seen, ['onClick', 'on.click', 'on.focus']);
}

{
    const node = el('div', { children: ['text', null, undefined, false, '', el('span')] });
    check('children skips falsy entries', node.children.length, 2);
    check('and keeps order', node.children[0].textContent, 'text');
}

{
    // The escape hatch still works, and custom properties go through setProperty.
    const node = el('div', { style: { left: '10px', '--sp-text-scale': '1.2' } });
    check('style is forwarded', node.styleWrites.left, '10px');
    check('custom properties use setProperty', node.styleWrites['--sp-text-scale'], '1.2');
}

{
    const existing = el('div');
    apply(existing, { className: 'later', text: 'applied' });
    check('apply works on an existing element', [existing.className, existing.textContent], ['later', 'applied']);

    const parent = el('div');
    append(parent, ['a', el('b')]);
    check('append adds children', parent.children.length, 2);

    const t = el('div');
    setActive(t, true);
    check('setActive adds the class', t.classList.contains('is-active'), true);
    setActive(t, false);
    check('setActive removes it', t.classList.contains('is-active'), false);
}

// ── Buttons ───────────────────────────────────────────────────────────────────
{
    const b = button({ text: 'Go' });
    ok('button keeps the existing mode-button class', b.classList.contains('mode-button'));
    ok('button is a ui-btn', b.classList.contains('ui-btn'));
    check('button is type=button, never a form submit', b.type, 'button');
    noInlineStyles('button writes no inline styles', b);

    ok('primary variant', button({ variant: 'primary' }).classList.contains('ui-btn--primary'));
    ok('danger variant', button({ variant: 'danger' }).classList.contains('ui-btn--danger'));
    ok('active starts on', button({ active: true }).classList.contains('active'));
    ok('default variant adds no variant class',
        ![...button().classList.set].some(c => c.startsWith('ui-btn--')));
}

{
    // The whole reason the kit exists: this replaces eleven inline style assignments.
    const b = panelButton({ id: 'launchCustomLinksPopup', text: 'Custom Links…', title: 'Manage Custom Links' });
    ok('panelButton is a panel button', b.classList.contains('ui-btn--panel'));
    ok('panelButton is still a mode-button', b.classList.contains('mode-button'));
    check('panelButton keeps id', b.id, 'launchCustomLinksPopup');
    check('panelButton keeps title', b.title, 'Manage Custom Links');
    noInlineStyles('panelButton writes no inline styles', b);

    ok('buttonRow lays out', buttonRow([b]).classList.contains('ui-btn-row'));
}

// ── Rail button ───────────────────────────────────────────────────────────────
{
    const b = railButton({ icon: '▦', text: 'System Tiles' });

    ok('railButton is a rail button', b.classList.contains('ui-rail-btn'));
    ok('railButton is still a mode-button', b.classList.contains('mode-button'));
    check('railButton has two children', b.children.length, 2);
    check('icon first', b.children[0].className, 'ui-rail-btn__icon');
    check('label second', b.children[1].className, 'ui-rail-btn__label');
    check('label text', b.children[1].textContent, 'System Tiles');

    // The icon and label are separate elements specifically so CSS can hide the label;
    // if they ever merge into one node the collapsed rail silently shows nothing.
    check('icon is its own element', b.children[0].textContent, '▦');
    check('icon is hidden from screen readers', b.children[0].attributes['aria-hidden'], 'true');

    // Collapsed, the tooltip is the only thing naming the tool.
    check('title falls back to the label', b.title, 'System Tiles');
    check('an explicit title wins',
        railButton({ icon: 'x', text: 'Lore', title: 'Attach lore to a hex' }).title,
        'Attach lore to a hex');

    ok('railButton can start active', railButton({ icon: 'x', text: 'y', active: true }).classList.contains('active'));
    noInlineStyles('railButton writes no inline styles', b);

    // Relabelling must not eat the icon. The tools that rename themselves while armed
    // ("Click a Hex…") used to assign textContent, which replaced the icon and the label
    // with one text node — the icon was gone for good and the collapsed rail showed a
    // blank button.
    const relabelled = railButton({ icon: '⬢', text: 'Token Placement' });
    setRailLabel(relabelled, 'Click a Hex');
    check('setRailLabel changes the label', relabelled.children[1].textContent, 'Click a Hex');
    check('and leaves the icon alone', relabelled.children[0].textContent, '⬢');
    check('and keeps both elements', relabelled.children.length, 2);

    const plain = el('button', { text: 'ordinary' });
    setRailLabel(plain, 'changed');
    check('setRailLabel falls back to textContent off the rail', plain.textContent, 'changed');

    const g = railGroupLabel('Connect');
    ok('railGroupLabel has its class', g.classList.contains('ui-rail-group'));
    check('railGroupLabel renders its text', g.textContent, 'Connect');
    noInlineStyles('railGroupLabel writes no inline styles', g);
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
{
    const seen = [];
    const cb = checkbox({ label: 'Warn on bugs', checked: true, id: 'warn', onChange: v => seen.push(v) });

    ok('checkbox wraps in a label', cb.tagName === 'LABEL');
    ok('checkbox has its class', cb.classList.contains('ui-checkbox'));
    check('checkbox exposes the input', cb.input.type, 'checkbox');
    check('checkbox honours checked', cb.input.checked, true);
    check('checkbox sets the input id', cb.input.id, 'warn');
    check('checkbox renders the label', cb.text.trim(), 'Warn on bugs');

    cb.input.checked = false;
    cb.input.dispatch('change');
    check('onChange gets the new value', seen, [false]);

    noInlineStyles('checkbox writes no inline styles', cb);
}

// ── Field and select ──────────────────────────────────────────────────────────
{
    const seen = [];
    const f = field({ label: 'Rings', value: '6', type: 'number', onInput: v => seen.push(v) });

    ok('field has its class', f.classList.contains('ui-field'));
    check('field exposes the input', f.input.type, 'number');
    check('field honours value', f.input.value, '6');
    ok('field keeps the existing input-dark theming', f.input.classList.contains('input-dark'));
    check('field renders the label', f.text.trim(), 'Rings');

    f.input.value = '9';
    f.input.dispatch('input');
    check('onInput gets the new value', seen, ['9']);

    noInlineStyles('field writes no inline styles', f);
}

{
    const seen = [];
    const s = select({
        label: 'Style',
        options: [{ value: 'a', label: 'Arc' }, { value: 'b', label: 'Bend' }],
        value: 'b',
        onChange: v => seen.push(v),
    });

    ok('select has its class', s.classList.contains('ui-select'));
    check('select builds its options', s.select.children.map(o => o.value), ['a', 'b']);
    check('select labels its options', s.select.children.map(o => o.textContent), ['Arc', 'Bend']);
    check('select honours value', s.select.value, 'b');

    s.select.value = 'a';
    s.select.dispatch('change');
    check('onChange gets the new value', seen, ['a']);

    noInlineStyles('select writes no inline styles', s);
}

// ── Layout ────────────────────────────────────────────────────────────────────
{
    const a = el('div'), b = el('div');

    const st = stack([a, b]);
    ok('stack has its class', st.classList.contains('ui-stack'));
    ok('stack defaults to normal gap', st.classList.contains('ui-stack--normal'));
    check('stack holds its children', st.children.length, 2);
    ok('stack gap is selectable', stack([], { gap: 'tight' }).classList.contains('ui-stack--tight'));

    ok('row has its class', row([]).classList.contains('ui-row'));
    ok('row defaults to centre', row([]).classList.contains('ui-row--center'));
    ok('row align is selectable', row([], { align: 'between' }).classList.contains('ui-row--between'));

    const sec = section({ title: 'Advanced map tools', children: [el('div')] });
    ok('section has its class', sec.classList.contains('ui-section'));
    ok('section renders its title', sec.text.includes('Advanced map tools'));
    ok('section with no title still renders', !section({ children: [] }).text.trim());

    ok('separator has its class', separator().classList.contains('ui-separator'));

    const n = note('Heads up', { tone: 'warning' });
    ok('note has its class', n.classList.contains('ui-note'));
    ok('note tone is selectable', n.classList.contains('ui-note--warning'));
    check('note renders text', n.textContent, 'Heads up');

    noInlineStyles('layout helpers write no inline styles', stack([row([sec, separator(), n])]));
}

console.log(`\nui kit: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
