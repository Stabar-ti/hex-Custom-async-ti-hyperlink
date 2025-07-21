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
  { key: 'hasWormhole', label: 'Has Wormhole', defaultOn: false, test(sys, a) { if (!a) return true; return Array.isArray(sys.wormholes) && sys.wormholes.length > 0; } },
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
  container.innerHTML = ''; // Clear any old filter buttons

  FILTERS.forEach(({ key, label, defaultOn }) => {
    const btn = document.createElement('button');
    btn.id = `filter-${key}`;
    btn.textContent = label;
    btn.classList.add('filter-button');
    btn.dataset.active = defaultOn.toString();
    if (defaultOn) btn.classList.add('active');

    // Toggle button state and re-apply filters on click
    btn.addEventListener('click', () => {
      const now = btn.dataset.active === 'true';
      btn.dataset.active = (!now).toString();
      btn.classList.toggle('active', !now);
      applyFilters(editor, onResults);
    });

    container.appendChild(btn);
  });

  // Run filters initially so UI is correct on load
  applyFilters(editor, onResults);
}

// ──────────────────────────────
// applyFilters: Run all filters on the system list
// ─────────────────────────────-
/**
 * Applies every filter's .test to editor.allSystems, then calls onResults.
 * This function is called whenever a filter button is toggled.
 */
export function applyFilters(editor, onResults) {
  const all = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  const matches = all.filter(sys => {
    // Never show a system already placed on the map
    if (editor.hexes[sys.id]?.baseType) return false;
    // All filters must pass (AND logic)
    return FILTERS.every(({ key, test }) => {
      const btn = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
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