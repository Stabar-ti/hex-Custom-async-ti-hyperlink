/**
 * The system picker panel: search, filters, results, and the entry points.
 *
 * Replaces src/ui/systemLookup.js, which was a single 1,000-line closure where every
 * helper was unreachable from outside and the only exported function was a refresh hook.
 * Here the panel is assembled from section factories, the views are components, and the
 * state lives in pickerState — so a change to a filter re-renders through one path
 * instead of three functions poking each other's element ids.
 *
 * Entry points are real functions, not DOM ids (the rule the lore rework settled on).
 * window.showSystemPicker is the name; window.showSystemLookupPopup stays as an alias
 * because console users and older call sites know it.
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { loadSystemInfo } from '../../data/import.js';
import { isRealIDUsed } from '../../ui/uiFilters.js';
import { selectSystems } from './pickerSelect.js';
import { onUsedIdsChanged } from './pickerEvents.js';
import { installPlacement } from './pickerPlacement.js';
import { destroyPreview } from './pickerPreview.js';
import { tileImage } from './pickerCells.js';
import { showRandomTilePopup } from './pickerRandom.js';
import { showPickerHelp } from './pickerHelp.js';
import * as state from './pickerState.js';
import * as chips from './pickerChips.js';
import * as grid from './pickerGrid.js';
import * as table from './pickerTable.js';

const POPUP_ID = 'system-picker-popup';

let editorRef = null;
let open = false;
let searchInput = null;
let resultsHost = null;
let recentHost = null;
let emptyState = null;
let columnsBtn = null;
let scaleLabel = null;
let unsubscribeStore = null;
let unsubscribeUsed = null;

// One pipeline run per render, shared by every component that needs it — the chip strip
// needs the counts, the views need the rows, and running it twice would double the work
// on every keystroke.
let cached = null;

// ── Install ───────────────────────────────────────────────────────────────────

export function installSystemPickerUI(editor) {
    editorRef = editor;
    state.hydrate();
    // Before the popup exists: the armed banner and the hover card are body-level and
    // must already be at the stored size the first time they appear.
    applyTextScale();
    installPlacement(editor);

    window.showSystemPicker = showSystemPicker;
    window.showSystemLookupPopup = showSystemPicker;   // legacy alias
    window.systemPickerState = state;                  // console escape hatch

    // Load the corpus up front so the first open is instant. Errors are non-fatal: the
    // picker shows its empty state rather than throwing during startup.
    loadSystemInfo(editor).catch(err =>
        console.warn('[SystemPicker] system data failed to load', err));
}

// ── Data ──────────────────────────────────────────────────────────────────────

function systems() {
    return Array.isArray(editorRef?.allSystems) ? editorRef.allSystems : [];
}

function isUsed(id) {
    return isRealIDUsed(id);
}

function getResult() {
    if (!cached) {
        cached = selectSystems(systems(), state.getViewSpec(), { isUsed });
    }
    return cached;
}

const viewCtx = {
    getResult,
    isUsed,
    onSelect: sys => state.arm(sys, state.getArmed()?.mode || 'once', state.getArmed()?.remaining || 1),
    getArmedId: () => state.getArmed()?.id || null
};

function activeView() {
    return state.getView() === 'table' ? table : grid;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
    if (!open) return;
    cached = null;

    chips.refresh();
    mountActiveView();
    activeView().refresh();
    renderRecent();
    renderEmptyState();
    applyTextScale();
    if (columnsBtn) columnsBtn.hidden = state.getView() !== 'table';
}

/** Swaps grid/table in place when the view toggle changes. */
let mountedView = null;
function mountActiveView() {
    const wanted = state.getView();
    if (mountedView === wanted) return;
    resultsHost.innerHTML = '';
    grid.destroy();
    table.destroy();
    resultsHost.appendChild(activeView().create(viewCtx));
    mountedView = wanted;
}

function renderEmptyState() {
    const { counts } = getResult();
    if (counts.afterSearch > 0) { emptyState.hidden = true; return; }

    emptyState.hidden = false;
    emptyState.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'sp-empty-msg';

    // Say which of the two things is responsible, and offer to undo that one. An
    // unexplained blank list was the old picker's worst failure mode.
    if (counts.afterFilter === 0) {
        msg.textContent = 'No tiles match the current filters.';
        emptyState.appendChild(msg);
        emptyState.appendChild(actionLink('Clear filters', () => state.clearFilters()));
    } else {
        msg.textContent = `No tiles match "${state.getQuery()}". ${counts.afterFilter} match your filters.`;
        emptyState.appendChild(msg);
        emptyState.appendChild(actionLink('Clear search', () => setQuery('')));
    }
}

function actionLink(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-linkbtn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderRecent() {
    const ids = state.getRecent();
    if (!ids.length) { recentHost.hidden = true; return; }

    const lookup = editorRef?.sectorIDLookup || {};
    const found = ids.map(id => lookup[id]).filter(Boolean).slice(0, 10);
    if (!found.length) { recentHost.hidden = true; return; }

    recentHost.hidden = false;
    recentHost.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'sp-filter-label';
    label.textContent = 'Recent';
    recentHost.appendChild(label);

    for (const sys of found) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-recent';
        btn.title = `${sys.id} — ${sys.name || 'Unnamed'}`;
        const img = tileImage(sys, { size: 28, className: 'sp-recent-img' });
        if (img) btn.appendChild(img);
        else btn.textContent = sys.id;
        btn.addEventListener('click', () => viewCtx.onSelect(sys));
        recentHost.appendChild(btn);
    }
}

// ── Sections ──────────────────────────────────────────────────────────────────

function setQuery(value) {
    if (searchInput) searchInput.value = value;
    state.setQuery(value);
}

function buildSearchRow() {
    const row = document.createElement('div');
    row.className = 'sp-search-row';

    const wrap = document.createElement('div');
    wrap.className = 'sp-search-wrap';

    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'sp-search';
    searchInput.value = state.getQuery();
    searchInput.placeholder = 'Search id, name, planet, tech… or tech:cybernetic, src:pok, -fow';
    searchInput.title =
        'Space-separated terms all have to match.\n' +
        'Prefixes: id: name: planet: tech: worm: src: alias:\n' +
        'Quote to group ("new terra"), prefix with - to exclude (-fow).';
    searchInput.addEventListener('input', () => {
        activeView().resetActive();
        state.setQuery(searchInput.value);
    });
    searchInput.addEventListener('keydown', onSearchKey);
    wrap.appendChild(searchInput);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'sp-search-clear';
    clear.textContent = '×';
    clear.title = 'Clear search';
    clear.addEventListener('click', () => { setQuery(''); searchInput.focus(); });
    wrap.appendChild(clear);
    row.appendChild(wrap);

    row.appendChild(buildViewToggle());
    row.appendChild(buildTextScale());

    // Table-only: hidden in the gallery, where there are no columns to choose.
    columnsBtn = document.createElement('button');
    columnsBtn.type = 'button';
    columnsBtn.className = 'sp-addbtn';
    columnsBtn.textContent = 'Columns';
    columnsBtn.title = 'Choose which columns the table shows';
    columnsBtn.addEventListener('click', () => table.openColumnsMenu(columnsBtn));
    row.appendChild(columnsBtn);

    const random = document.createElement('button');
    random.type = 'button';
    random.className = 'sp-addbtn';
    random.textContent = '🎲 Random';
    random.title = 'Pick a random tile from the current results';
    random.addEventListener('click', () => showRandomTilePopup(editorRef, getResult().results));
    row.appendChild(random);

    return row;
}

/**
 * Text size control: A− / percentage / A+.
 *
 * The picker's panels all live outside the page's normal flow — the popup, the hover
 * card, the armed banner, the menus — so the browser's own zoom is a blunt instrument
 * here: it rescales the map too. One variable on :root drives every picker surface.
 *
 * The middle reads as a label but is a button: clicking it resets to 100%, which is the
 * only affordance people reliably look for after over-shooting.
 */
function buildTextScale() {
    const wrap = document.createElement('div');
    wrap.className = 'sp-view-toggle sp-scale';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'sp-view-btn';
    minus.textContent = 'A−';
    minus.title = 'Smaller text';
    minus.addEventListener('click', () => state.stepTextScale(-1));

    scaleLabel = document.createElement('button');
    scaleLabel.type = 'button';
    scaleLabel.className = 'sp-view-btn sp-scale-label';
    scaleLabel.title = 'Reset text size to 100%';
    scaleLabel.addEventListener('click', () => state.resetTextScale());

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'sp-view-btn';
    plus.textContent = 'A+';
    plus.title = 'Larger text';
    plus.addEventListener('click', () => state.stepTextScale(1));

    wrap.append(minus, scaleLabel, plus);
    return wrap;
}

/** Pushes the stored scale onto :root and refreshes the readout. */
function applyTextScale() {
    const scale = state.getTextScale();
    document.documentElement.style.setProperty('--sp-text-scale', String(scale));
    if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;
}

function buildViewToggle() {
    const wrap = document.createElement('div');
    wrap.className = 'sp-view-toggle';
    const make = (view, label, title) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `sp-view-btn${state.getView() === view ? ' is-on' : ''}`;
        btn.textContent = label;
        btn.title = title;
        btn.addEventListener('click', () => state.setView(view));
        return btn;
    };
    wrap.appendChild(make('grid', '▦', 'Tile gallery'));
    wrap.appendChild(make('table', '☰', 'Detailed table'));
    return wrap;
}

/**
 * Arrow keys and Enter work from the search box, so you can type and pick without
 * moving your hands. They also work with the results focused, which the old picker
 * couldn't do — its handler was bound to the input alone, so clicking into the list
 * killed keyboard navigation until you clicked back.
 */
function onSearchKey(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (searchInput.value) setQuery('');
        else hidePopup(POPUP_ID);
        return;
    }
    if (activeView().handleKey(e.key)) e.preventDefault();
}

// ── The popup ─────────────────────────────────────────────────────────────────

export function showSystemPicker() {
    if (document.getElementById(POPUP_ID)) return;

    const content = document.createElement('div');
    content.className = 'sp-panel';

    content.appendChild(buildSearchRow());
    content.appendChild(chips.create({ getResult }));

    recentHost = document.createElement('div');
    recentHost.className = 'sp-filter-row sp-recent-row';
    recentHost.hidden = true;
    content.appendChild(recentHost);

    resultsHost = document.createElement('div');
    resultsHost.className = 'sp-results';
    content.appendChild(resultsHost);

    emptyState = document.createElement('div');
    emptyState.className = 'sp-empty';
    emptyState.hidden = true;
    content.appendChild(emptyState);

    open = true;
    mountedView = null;

    showPopup({
        id: POPUP_ID,
        title: '🔍 System tiles',
        content,
        modal: false,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: showPickerHelp,
        style: {
            width: '860px',
            height: '640px',
            minWidth: '520px',
            minHeight: '380px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            zIndex: 10003,
            border: '2px solid var(--popup-border-picker)',
            resize: 'both',
            overflow: 'hidden'
        },
        onClose: () => {
            open = false;
            unsubscribeStore?.(); unsubscribeStore = null;
            unsubscribeUsed?.(); unsubscribeUsed = null;
            grid.destroy(); table.destroy(); chips.destroy();
            destroyPreview();
            searchInput = resultsHost = recentHost = emptyState = columnsBtn = scaleLabel = null;
            mountedView = null;
            // The armed tile deliberately survives closing the popup: closing it to see
            // the map better should not disarm you.
        }
    });

    unsubscribeStore = state.subscribe(render);
    // Placement, undo, redo and imports all reach the picker through this rather than
    // through the 250 ms poll the old one ran.
    unsubscribeUsed = onUsedIdsChanged(render);

    render();
    setTimeout(() => searchInput?.focus(), 60);
}

export function hideSystemPicker() {
    hidePopup(POPUP_ID);
}
