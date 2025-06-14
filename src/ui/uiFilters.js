// ui/uiFilters.js

// ▶︎ A Set of all realIDs that have already been assigned
export const usedRealIDs = new Set();

// ▶︎ Internal “batch” flag: when true, we suppress immediate list‐refreshes
let _batchMode = false;

/**
 * Call before a bulk import or reset to suspend UI updates
 */
export function beginBatch() {
  _batchMode = true;
}

/**
 * Call after batch is done; runs exactly one refresh
 * @param {Function=} renderFn Optional custom renderer (defaults to refreshSystemList)
 */
export function endBatch(renderFn) {
  _batchMode = false;
  (renderFn || refreshSystemList)();
}

// ──────────────────────────────────────────────────────────────────────────────
// Your existing FILTERS definition, unchanged
// ──────────────────────────────────────────────────────────────────────────────
const FILTERS = [
  { key:'hasWormhole',   label:'Has Wormhole',   defaultOn:false, test(sys,a){ if(!a)return true; return Array.isArray(sys.wormholes)&&sys.wormholes.length>0; }},
  { key:'hasRift',       label:'Has Rift',        defaultOn:false, test(sys,a){ if(!a)return true; return sys.isGravityRift===true; }},
  { key:'hasNebula',     label:'Has Nebula',      defaultOn:false, test(sys,a){ if(!a)return true; return sys.isNebula===true; }},
  { key:'hasAsteroids',  label:'Has Asteroids',   defaultOn:false, test(sys,a){ if(!a)return true; return sys.isAsteroidField===true; }},
  { key:'hasSupernova',  label:'Has Supernova',   defaultOn:false, test(sys,a){ if(!a)return true; return sys.isSupernova===true; }},
  { key:'noPlanets',     label:'No Planets',      defaultOn:false, test(sys,a){ if(!a)return true; return !Array.isArray(sys.planets)||sys.planets.length===0; }},
  { key:'onePlanet',     label:'1 Planet',        defaultOn:false, test(sys,a){ if(!a)return true; return Array.isArray(sys.planets)&&sys.planets.length===1; }},
  { key:'twoPlanets',    label:'2 Planets',       defaultOn:false, test(sys,a){ if(!a)return true; return Array.isArray(sys.planets)&&sys.planets.length===2; }},
  { key:'threePlanets',  label:'3 Planets',       defaultOn:false, test(sys,a){ if(!a)return true; return Array.isArray(sys.planets)&&sys.planets.length===3; }},
  { key:'isLegendary',   label:'Legendary',       defaultOn:false, test(sys,a){ if(!a)return true; return Array.isArray(sys.planets)&&sys.planets.some(p=>!!p.legendaryAbilityName); }},
  { key:'noFaction',     label:'No Faction',      defaultOn:true,  test(sys,a){ if(!a)return true; return Array.isArray(sys.planets)&&!sys.planets.some(p=>!!p.factionHomeworld); }},
  { key:'weirdTiles',    label:'Weird Tiles',     defaultOn:true,  test(sys,a){
      const txt = `${sys.id} ${sys.name}`.toLowerCase();
      const isWeird = /fow|hl_|blank|hyperlane/.test(txt);
      return a ? !isWeird : isWeird;
    }}
];

// ──────────────────────────────────────────────────────────────────────────────
/**
 * Renders filter‐buttons and wires up their clicks.
 *
 * @param {HTMLElement} container where your buttons go
 * @param {HexEditor}   editor    the editor which now has .allSystems
 * @param {Function}    onResults (filteredSystems:Array) => void
 */
export function initFilters(container, editor, onResults) {
  container.innerHTML = '';

  FILTERS.forEach(({ key, label, defaultOn }) => {
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
      applyFilters(editor, onResults);
    });

    container.appendChild(btn);
  });

  // initial run
  applyFilters(editor, onResults);
}

/**
 * Applies every filter.test to editor.allSystems, then calls onResults.
 */
export function applyFilters(editor, onResults) {
  const all = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  const matches = all.filter(sys => {
    // never show a hex you’ve already placed
    if (editor.hexes[sys.id]?.baseType) return false;
    // every filter must pass
    return FILTERS.every(({ key, test }) => {
      const btn    = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });
  onResults(matches);
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * Mark/unmark a real–ID as used.  While in batchMode, suppress immediate re‐renders.
 */
export function markRealIDUsed(id) {
  usedRealIDs.add(id);
  if (!_batchMode) refreshSystemList();
}

export function unmarkRealIDUsed(id) {
  usedRealIDs.delete(id);
  if (!_batchMode) refreshSystemList();
}

export function isRealIDUsed(id) {
  return usedRealIDs.has(id);
}

export function clearRealIDUsage() {
  usedRealIDs.clear();
  if (!_batchMode) refreshSystemList();
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * The standard “reflow”: re-apply filters+search and re-render via window.renderSystemList
 */
export function refreshSystemList() {
  const editor  = window.editor;
  const systems = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  const input   = document.getElementById('systemSearch');
  const term    = input?.value.toLowerCase() || '';

  // 1) filter out placed hexes and by active FILTERS
  const filtered = systems.filter(sys => {
    if (editor.hexes[sys.id]?.baseType) return false;
    return FILTERS.every(({ key, test }) => {
      const btn    = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });

  // 2) apply the live search term
  const searched = filtered.filter(sys => {
    const name = (sys.name || '').toLowerCase();
    return sys.id.toString().includes(term) || name.includes(term);
  });

  // 3) finally, hand off to the lookup module
  if (typeof window.renderSystemList === 'function') {
    window.renderSystemList(searched);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns the array of systems passing *only* your fold‐out filters,
 * ignoring any live‐search term.
 */
export function getActiveFilterPass(editor) {
  const all = Array.isArray(editor.allSystems) ? editor.allSystems : [];
  return all.filter(sys => {
    if (editor.hexes[sys.id]?.baseType) return false;
    return FILTERS.every(({ key, test }) => {
      const btn    = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });
}
