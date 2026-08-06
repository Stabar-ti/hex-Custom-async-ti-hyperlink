/**
 * The tile gallery: the picker's default view.
 *
 * The old picker only ever offered a fourteen-column table. But this is a *tile* picker,
 * and people recognise tiles by their art long before they can read "Eff R/I" — asking
 * someone to find the red asteroid tile in a spreadsheet is the wrong shape of question.
 * The table is still one click away for the min/maxing case.
 *
 * Rendering 671 images is only affordable because of two things: `loading="lazy"` on every
 * thumbnail, and `content-visibility: auto` on the cells (in styles.css), which lets the
 * browser skip layout and paint for everything off-screen. That is deliberately not a
 * hand-written virtualizer — this repo has no browser tests, and a windowing engine is a
 * couple of hundred lines of scroll-restoration bugs waiting to happen.
 */

import { tileImage, techBadges, wormholeBadges, anomalyText, legendaryPlanet } from './pickerCells.js';
import { attachPreview } from './pickerPreview.js';
import { totalResources, totalInfluence } from './pickerModel.js';
import { highlightMatches } from './pickerQuery.js';

let root = null;
let ctx = null;
let cells = [];
let activeIndex = -1;

/**
 * @param {{ getResult: () => object, isUsed: (id) => boolean,
 *           onSelect: (sys) => void, getArmedId: () => string|null }} context
 */
export function create(context) {
    ctx = context;
    root = document.createElement('div');
    root.className = 'sp-grid';
    root.tabIndex = 0;
    root.addEventListener('keydown', onKeyDown);
    return root;
}

export function destroy() {
    root = null; ctx = null; cells = []; activeIndex = -1;
}

export function refresh() {
    if (!root || !ctx) return;
    const { results, parsed } = ctx.getResult();
    const tokens = parsed ? parsed.terms.filter(t => !t.negated).map(t => t.value) : [];
    const armedId = ctx.getArmedId();

    root.innerHTML = '';
    cells = [];

    if (!results.length) return;   // the empty state is the panel's job, not the grid's

    const frag = document.createDocumentFragment();
    for (const sys of results) {
        frag.appendChild(buildCell(sys, tokens, armedId));
    }
    root.appendChild(frag);

    if (activeIndex >= 0) setActive(Math.min(activeIndex, cells.length - 1));
}

function buildCell(sys, tokens, armedId) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'sp-cell';
    cell.dataset.systemId = String(sys.id);
    if (ctx.isUsed(sys.id)) cell.classList.add('is-used');
    if (armedId && String(sys.id).toUpperCase() === armedId) cell.classList.add('is-armed');

    const art = document.createElement('div');
    art.className = 'sp-cell-art';
    const img = tileImage(sys, { size: 0, className: 'sp-cell-img' });
    if (img) art.appendChild(img);
    else {
        const fallback = document.createElement('span');
        fallback.className = 'sp-thumb-fallback';
        fallback.textContent = sys.id;
        art.appendChild(fallback);
    }

    // Corner marks: the few things worth reading without hovering.
    const marks = document.createElement('div');
    marks.className = 'sp-cell-marks';
    const anomalies = anomalyText(sys);
    if (anomalies) {
        const a = document.createElement('span');
        a.className = 'sp-cell-anomaly';
        a.textContent = anomalies;
        marks.appendChild(a);
    }
    if (legendaryPlanet(sys)) {
        const star = document.createElement('span');
        star.className = 'sp-cell-legendary';
        star.textContent = '★';
        marks.appendChild(star);
    }
    if (marks.childNodes.length) art.appendChild(marks);

    const worms = wormholeBadges(sys);
    if (worms.childNodes.length) {
        const w = document.createElement('div');
        w.className = 'sp-cell-worms';
        w.appendChild(worms);
        art.appendChild(w);
    }

    if (ctx.isUsed(sys.id)) {
        const placed = document.createElement('span');
        placed.className = 'sp-cell-placed';
        placed.textContent = 'on map';
        art.appendChild(placed);
    }

    cell.appendChild(art);

    const label = document.createElement('div');
    label.className = 'sp-cell-label';
    const id = document.createElement('span');
    id.className = 'sp-cell-id';
    id.innerHTML = highlightMatches(String(sys.id), tokens);
    const name = document.createElement('span');
    name.className = 'sp-cell-name';
    name.innerHTML = highlightMatches(sys.name || '', tokens);
    label.appendChild(id);
    label.appendChild(name);
    cell.appendChild(label);

    const stats = document.createElement('div');
    stats.className = 'sp-cell-stats';
    const r = totalResources(sys), i = totalInfluence(sys);
    if (r || i) {
        const ri = document.createElement('span');
        ri.className = 'sp-cell-ri';
        ri.innerHTML = `<span class="sp-res">${r}</span>/<span class="sp-inf">${i}</span>`;
        stats.appendChild(ri);
    }
    const tech = techBadges(sys);
    if (tech.childNodes.length) stats.appendChild(tech);
    if (stats.childNodes.length) cell.appendChild(stats);

    cell.addEventListener('click', () => ctx.onSelect(sys));
    attachPreview(cell, sys);

    cells.push(cell);
    return cell;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

/**
 * Columns per row, read back from the rendered layout rather than computed from widths
 * and gaps — the grid is `auto-fill`, so only the browser knows the real answer.
 */
function columnCount() {
    if (!root) return 1;
    const cols = getComputedStyle(root).gridTemplateColumns;
    const n = cols ? cols.split(' ').filter(Boolean).length : 1;
    return Math.max(1, n);
}

export function setActive(index) {
    if (!cells.length) { activeIndex = -1; return; }
    const i = Math.max(0, Math.min(index, cells.length - 1));
    cells.forEach((c, n) => c.classList.toggle('is-active', n === i));
    cells[i].scrollIntoView({ block: 'nearest' });
    activeIndex = i;
}

export function moveActive(delta) {
    setActive(activeIndex < 0 ? 0 : activeIndex + delta);
}

/** Arrow keys move in two dimensions here, unlike the table's single axis. */
export function handleKey(key) {
    const cols = columnCount();
    switch (key) {
        case 'ArrowRight': moveActive(1); return true;
        case 'ArrowLeft':  moveActive(-1); return true;
        case 'ArrowDown':  moveActive(cols); return true;
        case 'ArrowUp':    moveActive(-cols); return true;
        case 'Home':       setActive(0); return true;
        case 'End':        setActive(cells.length - 1); return true;
        case 'Enter':
            if (activeIndex >= 0) cells[activeIndex].click();
            else if (cells.length) cells[0].click();
            return true;
        default: return false;
    }
}

function onKeyDown(e) {
    if (handleKey(e.key)) e.preventDefault();
}

export function focusResults() { root?.focus(); }
export function resetActive() { activeIndex = -1; }
