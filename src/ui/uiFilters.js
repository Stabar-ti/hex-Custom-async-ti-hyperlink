// ───────────────────────────────────────────────────────────────
// ui/uiFilters.js
//
// This module manages the system filter UI and realID tracking for the
// map editor's system lookup/assign modal. It provides a flexible filter
// system for live search, planet/wormhole/effect attributes, and ensures
// that each "real" tile ID can only be used once per map. Includes helpers
// for batch updates and auto-refresh on changes.
// ───────────────────────────────────────────────────────────────

// ▶︎ A Set of all realIDs that have already been assigned to hexes on the map.
//    This helps prevent duplicate assignments.
export const usedRealIDs = new Set();

// ▶︎ Batch mode flag: when true, disables auto-refresh (useful for import).
let _batchMode = false;

/**
 * Call before a bulk import/reset to suspend UI updates and avoid excessive refreshes.
 */
export function beginBatch() {
  _batchMode = true;
}

/**
 * Call after a bulk import/reset. Triggers one refresh.
 * @param {Function=} renderFn Optional custom renderer (defaults to refreshSystemList)
 */
export function endBatch(renderFn) {
  _batchMode = false;
  (renderFn || refreshSystemList)();
}

// ──────────────────────────────
// FILTERS: Attribute filter definitions
// Each object has a key, label, default state, and a test() function
// that checks if a system should pass the filter when "active".
// ──────────────────────────────
const FILTERS = [
  // Source filters (OR logic, case-insensitive, multi-select)
  {
    key: 'sourceMulti', label: 'Source', defaultOn: true, test(sys, a) {
      // Collect all active source filters
      const sources = [];
      if (document.getElementById('filter-sourceBase')?.dataset.active === 'true') sources.push('base');
      if (document.getElementById('filter-sourcePok')?.dataset.active === 'true') sources.push('pok');
      if (document.getElementById('filter-sourceDs')?.dataset.active === 'true') {
        sources.push('ds');
        sources.push('uncharted_space');
      }
      if (document.getElementById('filter-sourceEronous')?.dataset.active === 'true') sources.push('eronous');
      if (document.getElementById('filter-sourceOther')?.dataset.active === 'true') sources.push('other');
      if (sources.length === 0) return true;
      if (typeof sys.source !== 'string') return false;
      const src = sys.source.toLowerCase().trim();
      // If 'other' is selected, match any not in the listed set
      if (sources.includes('other') && !['base','pok','ds','eronous'].includes(src)) return true;
      // Otherwise, match any selected source (allow partial match)
      return sources.some(s => s !== 'other' && src.includes(s));
    }
  },
  // Wormhole filter: supports both Set and Array for wormholes (union of inherent+custom)
  {
    key: 'hasWormhole', label: 'Has Wormhole', defaultOn: false, test(sys, a) {
      if (!a) return true;
      // New pattern: wormholes is always a Set (union), but support Array for legacy/test data
      if (sys.wormholes instanceof Set) return sys.wormholes.size > 0;
      if (Array.isArray(sys.wormholes)) return sys.wormholes.length > 0;
      return false;
    }
  },
  { key: 'hasTech', label: 'Has Tech', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.some(p => (Array.isArray(p.techSpecialties) && p.techSpecialties.length > 0) || (!!p.techSpecialty)); } },
  { key: 'hasRift', label: 'Has Rift', defaultOn: false, test(sys, a) { if (!a) return true; return sys.isGravityRift === true; } },
  { key: 'hasNebula', label: 'Has Nebula', defaultOn: false, test(sys, a) { if (!a) return true; return sys.isNebula === true; } },
  { key: 'hasAsteroids', label: 'Has Asteroids', defaultOn: false, test(sys, a) { if (!a) return true; return sys.isAsteroidField === true; } },
  { key: 'hasSupernova', label: 'Has Supernova', defaultOn: false, test(sys, a) { if (!a) return true; return sys.isSupernova === true; } },
  { key: 'noPlanets', label: 'No Planets', defaultOn: false, test(sys, a) { if (!a) return true; return !Array.isArray(sys.planets) || sys.planets.length === 0; } },
  { key: 'onePlanet', label: '1 Planet', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 1; } },
  { key: 'twoPlanets', label: '2 Planets', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 2; } },
  { key: 'threePlanets', label: '3 Planets', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 3; } },
  { key: 'isLegendary', label: 'Legendary', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.some(p => !!p.legendaryAbilityName); } },
  { key: 'noFaction', label: 'No Faction', defaultOn: true, test(sys, a) { if (!a) return true; return Array.isArray(sys.planets) && !sys.planets.some(p => !!p.factionHomeworld); } },
  {
    key: 'showHyperlanes',
    label: 'Show Hyperlanes Only',
    defaultOn: false,
    test(sys, active) {
      // If ON, show only hyperlanes
      if (active) return !!sys.isHyperlane;
      // If OFF, hide all hyperlanes
      return !sys.isHyperlane;
    }
  },
  {
    key: 'weirdTiles',
    label: 'Weird Tiles',
    defaultOn: true,
    test(sys, a) {
      // Exclude tiles with certain names/IDs, but do NOT match "hyperlane" or "hl_" anymore
      const txt = `${sys.id} ${sys.name}`.toLowerCase();
      // Remove |hl_|hyperlane from this regex:
      const isWeird = /fow|blank|-1|Prison|0b|0g|0r|0gray|0border/.test(txt);
      return a ? !isWeird : isWeird;
    }
  }
];

// ──────────────────────────────
// initFilters: Setup the filter bar UI
// ─────────────────────────────-
/**
 * Renders filter‐buttons and wires up their event handlers.
 * Each filter button toggles an attribute filter.
 *
 * @param {HTMLElement} container where your buttons go
 * @param {HexEditor}   editor    the editor (should have .allSystems)
 * @param {Function}    onResults Callback: receives the filtered system list
 */
export function initFilters(container, editor, onResults) {

  container.innerHTML = '';

  // Add section header for Source (OR logic)
  const sourceHeader = document.createElement('div');
  sourceHeader.textContent = 'Source (OR: any selected)';
  sourceHeader.className = 'filter-section-header';
  container.appendChild(sourceHeader);

  // Render Source filter buttons
  const sources = [
    { subKey: 'sourceBase', label: 'Base', defaultOn: true },
    { subKey: 'sourcePok', label: 'PoK', defaultOn: true },
    { subKey: 'sourceDs', label: 'DS', defaultOn: true },
    { subKey: 'sourceEronous', label: 'Eronous', defaultOn: true },
    { subKey: 'sourceOther', label: 'Other', defaultOn: true }
  ];
  sources.forEach(({ subKey, label, defaultOn }) => {
    const btn = document.createElement('button');
    btn.id = `filter-${subKey}`;
    btn.textContent = label;
    btn.classList.add('filter-button');
    btn.dataset.active = defaultOn.toString();
    if (defaultOn) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const now = btn.dataset.active === 'true';
      btn.dataset.active = (!now).toString();
      btn.classList.toggle('active', !now);
      applyFilters(editor, onResults);
      updateFilterSummary(editor);
    });
    container.appendChild(btn);
  });


  // Attribute logic toggle (AND/NAND)
  let attrLogic = window.localStorage.getItem('attributeLogic') || 'AND';
  const attrHeader = document.createElement('div');
  attrHeader.className = 'filter-section-header';
  const attrLabel = document.createElement('span');
  attrLabel.textContent = `Attributes (`;
  const logicToggle = document.createElement('button');
  logicToggle.textContent = attrLogic;
  logicToggle.className = 'attr-logic-toggle';
  logicToggle.addEventListener('click', () => {
    attrLogic = attrLogic === 'AND' ? 'NAND' : 'AND';
    window.localStorage.setItem('attributeLogic', attrLogic);
    logicToggle.textContent = attrLogic;
    applyFilters(editor, onResults, attrLogic);
    updateFilterSummary(editor, attrLogic);
  });
  attrHeader.appendChild(attrLabel);
  attrHeader.appendChild(logicToggle);
  attrHeader.appendChild(document.createTextNode(': all selected)'));
  container.appendChild(attrHeader);

  // Render Attribute filter buttons
  FILTERS.forEach(({ key, label, defaultOn }) => {
    if (key === 'sourceMulti') return;
    const btn = document.createElement('button');
    btn.id = `filter-${key}`;
    btn.textContent = label;
    btn.classList.add('filter-button');
    btn.dataset.active = defaultOn.toString();
    if (defaultOn) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const now = btn.dataset.active === 'true';
      btn.dataset.active = (!now).toString();
      btn.classList.toggle('active', !now);
      applyFilters(editor, onResults, attrLogic);
      updateFilterSummary(editor, attrLogic);
    });
    container.appendChild(btn);
  });

  // Add filter summary bar
  let summaryBar = document.getElementById('filter-summary-bar');
  if (!summaryBar) {
    summaryBar = document.createElement('div');
    summaryBar.id = 'filter-summary-bar';
    summaryBar.className = 'filter-summary-bar';
    container.prepend(summaryBar);
  }
  updateFilterSummary(editor, attrLogic);

  // Run filters initially so UI is correct on load
  applyFilters(editor, onResults, attrLogic);
}

// Helper to update the filter summary bar
function updateFilterSummary(editor, attrLogic = 'AND') {
  const summaryBar = document.getElementById('filter-summary-bar');
  if (!summaryBar) return;
  // Collect active sources
  const sourceLabels = [];
  if (document.getElementById('filter-sourceBase')?.dataset.active === 'true') sourceLabels.push('Base');
  if (document.getElementById('filter-sourcePok')?.dataset.active === 'true') sourceLabels.push('PoK');
  if (document.getElementById('filter-sourceDs')?.dataset.active === 'true') sourceLabels.push('DS');
  if (document.getElementById('filter-sourceEronous')?.dataset.active === 'true') sourceLabels.push('Eronous');
  if (document.getElementById('filter-sourceOther')?.dataset.active === 'true') sourceLabels.push('Other');
  // Collect active attributes
  const attrLabels = [];
  FILTERS.forEach(({ key, label }) => {
    if (key === 'sourceMulti') return;
    const btn = document.getElementById(`filter-${key}`);
    if (btn?.dataset.active === 'true') attrLabels.push(label);
  });
  // Build summary text
  let summary = '';
  if (sourceLabels.length > 0) summary += `Source: [${sourceLabels.join(', ')}]`;
  if (attrLabels.length > 0) summary += `  ${attrLogic}  Attributes: [${attrLabels.join(', ')}]`;
  if (!summary) summary = 'No filters active';
  summaryBar.textContent = summary;
}

// ──────────────────────────────
// applyFilters: Run all filters on the system list
// ─────────────────────────────-
/**
 * Applies every filter's .test to editor.allSystems, then calls onResults.
 * This function is called whenever a filter button is toggled.
 */
export function applyFilters(editor, onResults, attrLogic = 'AND') {
  const all = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  const matches = all.filter(sys => {
    // Never show a system already placed on the map
    if (editor.hexes[sys.id]?.baseType) return false;
    // Source filter always ANDed in, but attribute filters can be AND or NAND
    // 1. Source filter
    const sourcePass = FILTERS.find(f => f.key === 'sourceMulti').test(sys, true);
    if (!sourcePass) return false;
    // 2. Attribute filters
    const attrFilters = FILTERS.filter(f => f.key !== 'sourceMulti');
    const activeAttrs = attrFilters.filter(f => {
      const btn = document.getElementById(`filter-${f.key}`);
      return btn?.dataset.active === 'true';
    });
    if (activeAttrs.length === 0) return true;
    if (attrLogic === 'AND') {
      return activeAttrs.every(f => f.test(sys, true));
    } else {
      // NAND: show systems that do NOT match all selected attributes
      return !activeAttrs.every(f => f.test(sys, true));
    }
  });
  onResults(matches);
}

// ──────────────────────────────
// Mark/unmark/check realID usage (unique system tiles)
// ─────────────────────────────-
/**
 * Mark a realID as used. If not batching, also trigger a refresh.
 */
export function markRealIDUsed(id) {
  usedRealIDs.add(id);
  //  console.log('realIDmarked')
  if (!_batchMode) refreshSystemList();
}

/**
 * Remove a realID from the used set.
 */
export function unmarkRealIDUsed(id) {
  usedRealIDs.delete(id);
  if (!_batchMode) refreshSystemList();
}

/**
 * Returns true if a realID is in use on the map.
 */
export function isRealIDUsed(id) {
  return usedRealIDs.has(id);
}

/**
 * Clear all tracked realIDs (usually on map reset/import).
 */
export function clearRealIDUsage() {
  usedRealIDs.clear();
  if (!_batchMode) refreshSystemList();
}

// ──────────────────────────────
// refreshSystemList: Main "reflow" after filter/search changes
// ─────────────────────────────-
/**
 * The standard “reflow”: re-apply filters+search and re-render
 * via window.renderSystemList, the lookup module's live results.
 */
export function refreshSystemList() {
  const editor = window.editor;
  const systems = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  const input = document.getElementById('systemSearch');
  const term = input?.value.toLowerCase() || '';

  // 1) Filter out already-placed systems and non-passing filters
  const filtered = systems.filter(sys => {
    if (editor.hexes[sys.id]?.baseType) return false;
    return FILTERS.every(({ key, test }) => {
      const btn = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });

  // 2) Apply the live search term (ID or name substring)
  const searched = filtered.filter(sys => {
    const name = (sys.name || '').toLowerCase();
    return sys.id.toString().includes(term) || name.includes(term);
  });

  // 3) Render the final results via the lookup UI
  if (typeof window.renderSystemList === 'function') {
    window.renderSystemList();
  }
}

// ──────────────────────────────
// getActiveFilterPass: Returns all systems that pass current filters
// (ignores the search box, unlike refreshSystemList)
// ─────────────────────────────-
/**
 * Returns the array of systems passing only the filter buttons,
 * ignoring any live search term.
 */
export function getActiveFilterPass(editor) {
  const all = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  return all.filter(sys => {
    if (editor.hexes[sys.id]?.baseType) return false;
    return FILTERS.every(({ key, test }) => {
      const btn = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });
}

export { FILTERS };