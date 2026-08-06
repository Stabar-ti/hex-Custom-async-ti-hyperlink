/**
 * The filter strip: sources, active-filter chips, and the result count.
 *
 * The old picker showed twenty-one filter buttons at once, fifteen of them off by default
 * and permanently in the way. Worse, it never said what they were doing — filter down to
 * nothing and you got a blank list with no explanation, which is the single most common
 * way people got stuck in it.
 *
 * So: sources stay visible, because people toggle them constantly. Everything else is an
 * "+ Add filter" menu, and only the filters actually switched on take up space, each as a
 * chip you can click to remove. The count line always says how many tiles you are looking
 * at and how many are hidden. Modelled on loreOverlay's filter strip.
 */

import { SOURCE_GROUPS, ATTRIBUTES, PLANET_COUNTS, TRI_STATES } from './pickerModel.js';
import { describeActiveFilters, activeFilterCount } from './pickerSelect.js';
import { openListPicker } from '../../ui/listPicker.js';
import * as state from './pickerState.js';

let root = null;
let ctx = null;

/** @param {{ getResult: () => object }} context */
export function create(context) {
    ctx = context;
    root = document.createElement('div');
    root.className = 'sp-filters';
    return root;
}

export function destroy() { root = null; ctx = null; }

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function chip(label, { title, on = false, onClick, onRemove, className = '' } = {}) {
    const wrap = el('span', `sp-chip ${className}${on ? ' is-on' : ''}`);
    const btn = el('button', 'sp-chip-label', label);
    btn.type = 'button';
    if (title) btn.title = title;
    if (onClick) btn.addEventListener('click', onClick);
    wrap.appendChild(btn);

    if (onRemove) {
        const x = el('button', 'sp-chip-x', '×');
        x.type = 'button';
        x.title = 'Remove this filter';
        x.addEventListener('click', e => { e.stopPropagation(); onRemove(); });
        wrap.appendChild(x);
    }
    return wrap;
}

export function refresh() {
    if (!root || !ctx) return;
    const filter = state.getFilter();
    const { counts } = ctx.getResult();

    root.innerHTML = '';
    root.appendChild(buildSourceRow(filter));
    root.appendChild(buildChipRow(filter));
    root.appendChild(buildCountRow(filter, counts));
}

// ── Sources ───────────────────────────────────────────────────────────────────

function buildSourceRow(filter) {
    const row = el('div', 'sp-filter-row');
    row.appendChild(el('span', 'sp-filter-label', 'Sources'));

    for (const group of SOURCE_GROUPS) {
        const on = !!filter.sources[group.key];
        row.appendChild(chip(group.label, {
            on,
            className: 'sp-chip--source',
            title: on ? `Hide ${group.label} tiles` : `Show ${group.label} tiles`,
            onClick: () => state.toggleSource(group.key)
        }));
    }

    const all = Object.values(filter.sources).every(Boolean);
    const none = !Object.values(filter.sources).some(Boolean);
    const toggle = el('button', 'sp-linkbtn', all ? 'None' : 'All');
    toggle.type = 'button';
    toggle.title = all ? 'Turn every source off' : 'Turn every source on';
    toggle.addEventListener('click', () => state.setSourcesAll(!all));
    row.appendChild(toggle);

    if (none) {
        // Every source off shows nothing at all, which reads as a broken picker.
        row.appendChild(el('span', 'sp-warn', 'no sources selected'));
    }
    return row;
}

// ── Active filters ────────────────────────────────────────────────────────────

function buildChipRow(filter) {
    const row = el('div', 'sp-filter-row');
    row.appendChild(el('span', 'sp-filter-label', 'Filters'));

    for (const c of describeActiveFilters(filter)) {
        row.appendChild(chip(c.label, {
            on: true,
            title: c.title,
            onRemove: () => removeFilter(c)
        }));
    }

    const add = el('button', 'sp-addbtn', '+ Add filter');
    add.type = 'button';
    add.title = 'Narrow the list by tile contents, anomalies, planets or type';
    add.addEventListener('click', () => openAddFilter(add));
    row.appendChild(add);

    // NAND is genuinely confusing and only means anything once something is required,
    // so it only appears then.
    if (Object.keys(filter.attrs).length > 1) {
        const mode = el('button', `sp-modebtn${filter.mode === 'nand' ? ' is-on' : ''}`, filter.mode.toUpperCase());
        mode.type = 'button';
        mode.title = filter.mode === 'and'
            ? 'AND: tiles matching every filter above. Click for NAND.'
            : 'NAND: tiles that fail at least one filter above. Click for AND.';
        mode.addEventListener('click', () => state.setMode(filter.mode === 'and' ? 'nand' : 'and'));
        row.appendChild(mode);
    }

    return row;
}

function removeFilter(c) {
    switch (c.kind) {
        case 'attr': state.setAttr(c.key, false); break;
        case 'planetCounts': state.setPlanetCounts([]); break;
        case 'tri': state.setTri(c.key, 'hide'); break;
        case 'unplacedOnly': state.setUnplacedOnly(false); break;
    }
}

async function openAddFilter(anchor) {
    const filter = state.getFilter();
    const items = [];

    for (const a of ATTRIBUTES) {
        items.push({
            value: `attr:${a.key}`, label: a.label, group: a.group,
            selected: !!filter.attrs[a.key],
            hint: filter.attrs[a.key] ? 'on' : ''
        });
    }
    for (const p of PLANET_COUNTS) {
        items.push({
            value: `count:${p.count}`, label: p.label, group: 'Planets',
            selected: filter.planetCounts.includes(p.count),
            hint: filter.planetCounts.includes(p.count) ? 'on' : ''
        });
    }
    // Tri-states offer their two non-default positions; the default is "no chip".
    for (const t of TRI_STATES) {
        const current = filter.tri[t.key];
        if (current !== 'hide') items.push({ value: `tri:${t.key}:hide`, label: t.hideLabel, group: 'Tile type' });
        if (current !== 'only') items.push({ value: `tri:${t.key}:only`, label: t.onlyLabel, group: 'Tile type' });
        if (current !== 'any') items.push({ value: `tri:${t.key}:any`, label: `Allow ${t.label.toLowerCase()}`, group: 'Tile type' });
    }
    items.push({
        value: 'unplaced', label: 'Unplaced only', group: 'Map',
        selected: filter.unplacedOnly,
        hint: filter.unplacedOnly ? 'on' : ''
    });

    const picked = await openListPicker(anchor, items, { title: 'Add filter', width: 260 });
    if (!picked) return;

    if (picked.startsWith('attr:')) state.toggleAttr(picked.slice(5));
    else if (picked.startsWith('count:')) state.togglePlanetCount(Number(picked.slice(6)));
    else if (picked.startsWith('tri:')) {
        const [, key, value] = picked.split(':');
        state.setTri(key, value);
    } else if (picked === 'unplaced') state.setUnplacedOnly(!filter.unplacedOnly);
}

// ── Counts ────────────────────────────────────────────────────────────────────

function buildCountRow(filter, counts) {
    const row = el('div', 'sp-count-row');

    row.appendChild(el('span', 'sp-count',
        `${counts.afterSearch} of ${counts.total} tiles`));

    const hidden = counts.hiddenByFilter + counts.hiddenBySearch;
    if (hidden > 0) {
        const parts = [];
        if (counts.hiddenByFilter) parts.push(`${counts.hiddenByFilter} by filters`);
        if (counts.hiddenBySearch) parts.push(`${counts.hiddenBySearch} by search`);
        row.appendChild(el('span', 'sp-count-hidden', `${hidden} hidden (${parts.join(', ')})`));
    }

    if (counts.used > 0) {
        row.appendChild(el('span', 'sp-count-used', `${counts.used} already on the map`));
    }

    if (activeFilterCount(filter) > 0) {
        const clear = el('button', 'sp-linkbtn', 'Clear filters');
        clear.type = 'button';
        clear.title = 'Back to the default filters. Leaves the search box alone.';
        clear.addEventListener('click', () => state.clearFilters());
        row.appendChild(clear);
    }

    return row;
}
