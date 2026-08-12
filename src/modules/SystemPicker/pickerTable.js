/**
 * The dense table view: every stat at once, sortable, with configurable columns.
 *
 * Same data as the grid, same selection contract, same keyboard model — it is the view
 * you switch to when you are comparing tiles on numbers rather than recognising them by
 * art. Kept because that is a real job the grid is bad at.
 *
 * Row appearance is entirely CSS (.sp-row.is-used / .is-armed / .is-active). The old table
 * set `row.style.backgroundColor` inline for used, selected and hover, which overrode the
 * stylesheet's own rules for the same states and made the whole table ignore dark mode.
 */

import {
    tileImage, techBadges, wormholeBadges, planetTypeBadges,
    anomalyText, anomalyTitle, effectiveText, legendaryPlanet
} from './pickerCells.js';
import { attachPreview } from './pickerPreview.js';
import { COLUMNS, totalResources, totalInfluence, isFractureTile } from './pickerModel.js';
import { highlightMatches } from './pickerQuery.js';
import { createPanel, closeListPicker } from '../../ui/listPicker.js';
import * as state from './pickerState.js';

let root = null;
let ctx = null;
let rows = [];
let activeIndex = -1;

/**
 * @param {{ getResult: () => object, isUsed: (id) => boolean,
 *           onSelect: (sys) => void, getArmedId: () => string|null }} context
 */
export function create(context) {
    ctx = context;
    root = document.createElement('div');
    root.className = 'sp-table-wrap';
    root.tabIndex = 0;
    root.addEventListener('keydown', onKeyDown);
    return root;
}

export function destroy() {
    root = null; ctx = null; rows = []; activeIndex = -1;
}

function visibleColumns() {
    const vis = state.getColumns();
    return COLUMNS.filter(c => vis[c.key] !== false);
}

/**
 * The column chooser.
 *
 * Uses createPanel rather than openListPicker because this is a set of toggles, not a
 * choice: openListPicker resolves and closes on the first click, which would mean
 * reopening the menu for every column you wanted to change. Panel dismissal (outside
 * click, Escape) still comes from the shared primitive.
 */
export function openColumnsMenu(anchorEl) {
    const panel = createPanel(anchorEl, { width: 200 });

    const title = document.createElement('div');
    title.className = 'sp-picker-title';
    title.textContent = 'Show columns';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'sp-picker-list';

    for (const col of COLUMNS) {
        const row = document.createElement('label');
        row.className = 'sp-col-toggle';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = state.getColumns()[col.key] !== false;
        box.addEventListener('change', () => state.setColumnVisible(col.key, box.checked));

        row.appendChild(box);
        row.append(col.label);
        list.appendChild(row);
    }
    panel.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'sp-col-actions';

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'sp-linkbtn';
    all.textContent = 'Show all';
    all.addEventListener('click', () => {
        for (const col of COLUMNS) state.setColumnVisible(col.key, true);
        closeListPicker();
        openColumnsMenu(anchorEl);
    });
    actions.appendChild(all);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'sp-linkbtn';
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => {
        for (const col of COLUMNS) state.setColumnVisible(col.key, col.defaultVisible);
        closeListPicker();
        openColumnsMenu(anchorEl);
    });
    actions.appendChild(reset);

    panel.appendChild(actions);
}

export function refresh() {
    if (!root || !ctx) return;
    const { results, parsed } = ctx.getResult();
    const tokens = parsed ? parsed.terms.filter(t => !t.negated).map(t => t.value) : [];
    const armedId = ctx.getArmedId();
    const cols = visibleColumns();

    root.innerHTML = '';
    rows = [];
    if (!results.length) return;

    const table = document.createElement('table');
    table.className = 'sp-table';

    const thead = document.createElement('thead');
    thead.appendChild(buildHeader(cols));
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const sys of results) tbody.appendChild(buildRow(sys, cols, tokens, armedId));
    table.appendChild(tbody);

    root.appendChild(table);
    if (activeIndex >= 0) setActive(Math.min(activeIndex, rows.length - 1));
}

function buildHeader(cols) {
    const tr = document.createElement('tr');
    const sort = state.getSort();

    for (const col of cols) {
        const th = document.createElement('th');
        th.dataset.column = col.key;
        // table-layout is fixed, so the declared widths are the real ones — they have to
        // grow with the type scale or larger text clips inside its column.
        th.style.width = `calc(${col.width} * var(--sp-text-scale))`;

        if (col.key === 'tile') {
            th.textContent = col.label;
            tr.appendChild(th);
            continue;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-sort';
        btn.textContent = col.label;
        if (sort.column === col.key) {
            btn.classList.add('is-on');
            btn.append(sort.direction === 'desc' ? ' ▼' : ' ▲');
            btn.title = `Sorted ${sort.direction === 'desc' ? 'descending' : 'ascending'} — click to ${sort.direction === 'desc' ? 'clear' : 'reverse'}`;
        } else {
            btn.title = `Sort by ${col.label}`;
        }
        // No second argument: the store cycles asc -> desc -> unpinned, so a third click
        // gets you back to relevance ordering without clearing the search box.
        btn.addEventListener('click', () => state.setSort(col.key));
        th.appendChild(btn);
        tr.appendChild(th);
    }
    return tr;
}

function buildRow(sys, cols, tokens, armedId) {
    const tr = document.createElement('tr');
    tr.className = 'sp-row';
    tr.dataset.systemId = String(sys.id);
    const used = ctx.isUsed(sys.id);
    if (used) tr.classList.add('is-used');
    if (armedId && String(sys.id).toUpperCase() === armedId) tr.classList.add('is-armed');

    for (const col of cols) {
        const td = document.createElement('td');
        td.dataset.column = col.key;
        fillCell(td, col.key, sys, tokens, used);
        tr.appendChild(td);
    }

    tr.addEventListener('click', () => ctx.onSelect(sys));
    attachPreview(tr, sys);
    rows.push(tr);
    return tr;
}

function fillCell(td, key, sys, tokens, used) {
    switch (key) {
        case 'tile': {
            const img = tileImage(sys, { size: 36 });
            if (img) td.appendChild(img);
            else td.textContent = sys.id;
            break;
        }
        case 'id':
            td.innerHTML = highlightMatches(String(sys.id), tokens);
            td.classList.add('sp-mono');
            break;
        case 'name':
            td.innerHTML = highlightMatches(sys.name || '', tokens);
            td.classList.add('sp-name');
            td.title = sys.name || '';
            break;
        case 'planets':
            td.textContent = (sys.planets || []).length || '';
            break;
        case 'planetTypes':
            td.appendChild(planetTypeBadges(sys));
            break;
        case 'resources': {
            const r = totalResources(sys);
            td.textContent = r || '';
            if (r) td.classList.add('sp-res');
            break;
        }
        case 'influence': {
            const i = totalInfluence(sys);
            td.textContent = i || '';
            if (i) td.classList.add('sp-inf');
            break;
        }
        case 'effective':
            td.textContent = effectiveText(sys);
            td.classList.add('sp-eff');
            break;
        case 'wormholes':
            td.appendChild(wormholeBadges(sys));
            break;
        case 'tech':
            td.appendChild(techBadges(sys));
            break;
        case 'legendary': {
            const l = legendaryPlanet(sys);
            td.textContent = l ? '★' : '';
            if (l) { td.classList.add('sp-legendary'); td.title = l.legendaryAbilityName; }
            break;
        }
        case 'anomalies':
            td.textContent = anomalyText(sys);
            td.title = anomalyTitle(sys);
            td.classList.add('sp-anomaly');
            break;
        case 'fracture':
            if (isFractureTile(sys)) {
                td.textContent = '◈';
                td.classList.add('sp-fracture');
                td.title = 'Fracture tile';
            }
            break;
        case 'used':
            if (used) { td.textContent = '✓'; td.classList.add('sp-used-mark'); td.title = 'Already on the map'; }
            break;
        default:
            td.textContent = '';
    }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

export function setActive(index) {
    if (!rows.length) { activeIndex = -1; return; }
    const i = Math.max(0, Math.min(index, rows.length - 1));
    rows.forEach((r, n) => r.classList.toggle('is-active', n === i));
    rows[i].scrollIntoView({ block: 'nearest' });
    activeIndex = i;
}

export function moveActive(delta) {
    setActive(activeIndex < 0 ? 0 : activeIndex + delta);
}

export function handleKey(key) {
    switch (key) {
        case 'ArrowDown': moveActive(1); return true;
        case 'ArrowUp':   moveActive(-1); return true;
        case 'PageDown':  moveActive(10); return true;
        case 'PageUp':    moveActive(-10); return true;
        case 'Home':      setActive(0); return true;
        case 'End':       setActive(rows.length - 1); return true;
        case 'Enter':
            if (activeIndex >= 0) rows[activeIndex].click();
            else if (rows.length) rows[0].click();
            return true;
        default: return false;
    }
}

function onKeyDown(e) {
    if (handleKey(e.key)) e.preventDefault();
}

export function focusResults() { root?.focus(); }
export function resetActive() { activeIndex = -1; }
