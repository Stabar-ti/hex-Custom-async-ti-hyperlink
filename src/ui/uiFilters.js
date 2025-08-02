// ───────────────────────────────────────────────────────────────
// ui/uiFilters.js
//
// This module manages the system filter UI and realID tracking for the
// map editor's system lookup/assign modal. It provides a flexible filter
// system for live search, planet/wormhole/effect attributes, and ensures
// that each "real" tile ID can only be used once per map. Includes helpers
// for batch updates and auto-refresh on changes.
// ───────────────────────────────────────────────────────────────

import { wormholeTypes, techSpecialtyColors, effectEmojiMap } from '../constants/constants.js';

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
  // ──────────────────────────────
  // SOURCE FILTERS (OR-based logic)
  // These work differently - when any are active, show systems matching ANY active source
  // ──────────────────────────────
  { key: 'sourceBase', label: 'Base', defaultOn: true, test(sys, a) { return true; } }, // Handled in special OR logic
  { key: 'sourcePok', label: 'PoK', defaultOn: true, test(sys, a) { return true; } }, // Handled in special OR logic
  { key: 'sourceDS', label: 'DS/Uncharted', defaultOn: true, test(sys, a) { return true; } }, // Handled in special OR logic
  { key: 'sourceEronous', label: 'Eronous', defaultOn: true, test(sys, a) { return true; } }, // Handled in special OR logic
  { key: 'sourceOthers', label: 'Others', defaultOn: true, test(sys, a) { return true; } }, // Handled in special OR logic

  // Wormhole filter: supports both Set and Array for wormholes (union of inherent+custom)
  {
    key: 'hasWormhole', label: 'Has Wormhole', defaultOn: false, test(sys, a) {
      if (!a) return true;
      // New pattern: wormholes is always a Set (union), but support Array for legacy/test data
      if (sys.wormholes instanceof Set) {
        // Check if Set has any wormholes that are not "null"
        for (const wormhole of sys.wormholes) {
          if (wormhole !== "null" && wormhole !== null) {
            return true;
          }
        }
        return false;
      }
      if (Array.isArray(sys.wormholes)) {
        // Check if Array has any wormholes that are not "null"
        return sys.wormholes.length > 0 && sys.wormholes.some(w => w !== "null" && w !== null);
      }
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
// COLUMNS: Column definitions for the system table
// Each object has a key, label, default visibility, and width
// ──────────────────────────────
const COLUMNS = [
  { key: 'tile', label: 'Tile', defaultVisible: true, width: '50px' },
  { key: 'id', label: 'ID', defaultVisible: true, width: '60px' },
  { key: 'name', label: 'Name', defaultVisible: true, width: '140px' },
  { key: 'planets', label: 'Planets', defaultVisible: true, width: '60px' },
  { key: 'planetTypes', label: 'Types', defaultVisible: true, width: '50px' },
  { key: 'resources', label: 'Res', defaultVisible: true, width: '40px' },
  { key: 'influence', label: 'Inf', defaultVisible: true, width: '40px' },
  { key: 'effective', label: 'Eff R/I', defaultVisible: true, width: '60px' },
  { key: 'wormholes', label: 'Worm', defaultVisible: true, width: '50px' },
  { key: 'tech', label: 'Tech', defaultVisible: true, width: '50px' },
  { key: 'legendary', label: 'Legend', defaultVisible: true, width: '50px' },
  { key: 'anomalies', label: 'Effect', defaultVisible: true, width: '50px' },
  { key: 'used', label: 'Used', defaultVisible: false, width: '50px' }
];

// ──────────────────────────────
// COLUMN VISIBILITY MANAGEMENT
// ──────────────────────────────

/**
 * Get column visibility settings from localStorage
 */
function getColumnVisibility() {
  const stored = localStorage.getItem('ti4-column-visibility');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse column visibility from localStorage:', e);
    }
  }

  // Return defaults if no stored settings
  const defaults = {};
  COLUMNS.forEach(col => {
    defaults[col.key] = col.defaultVisible;
  });
  return defaults;
}

/**
 * Save column visibility settings to localStorage
 */
function saveColumnVisibility(visibility) {
  try {
    localStorage.setItem('ti4-column-visibility', JSON.stringify(visibility));
  } catch (e) {
    console.warn('Failed to save column visibility to localStorage:', e);
  }
}

/**
 * Apply column visibility to the table
 */
export function applyColumnVisibility() {
  const visibility = getColumnVisibility();

  COLUMNS.forEach(col => {
    const isVisible = visibility[col.key];

    // Hide/show column header
    const headerCell = document.querySelector(`th[data-column="${col.key}"]`);
    if (headerCell) {
      headerCell.style.display = isVisible ? '' : 'none';
    }

    // Hide/show all cells in this column
    const cells = document.querySelectorAll(`td[data-column="${col.key}"]`);
    cells.forEach(cell => {
      cell.style.display = isVisible ? '' : 'none';
    });
  });
}

/**
 * Initialize column visibility controls
 */
export function initColumnControls(container) {
  const visibility = getColumnVisibility();

  // Create column control wrapper
  const columnWrapper = document.createElement('div');
  columnWrapper.classList.add('column-controls');
  columnWrapper.style.marginBottom = '8px';
  columnWrapper.style.padding = '8px';
  columnWrapper.style.border = '1px solid #555';
  columnWrapper.style.borderRadius = '4px';
  columnWrapper.style.backgroundColor = '#2a2a2a';

  // Create toggle button to show/hide column controls
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Show/Hide Columns';
  toggleBtn.classList.add('column-toggle-btn');
  toggleBtn.style.marginBottom = '8px';
  toggleBtn.style.padding = '4px 8px';
  toggleBtn.style.backgroundColor = '#444';
  toggleBtn.style.color = '#fff';
  toggleBtn.style.border = '1px solid #666';
  toggleBtn.style.borderRadius = '3px';
  toggleBtn.style.cursor = 'pointer';

  // Create the actual column checkboxes (initially hidden)
  const checkboxWrapper = document.createElement('div');
  checkboxWrapper.classList.add('column-checkboxes');
  checkboxWrapper.style.display = 'none';
  checkboxWrapper.style.maxHeight = '120px';
  checkboxWrapper.style.overflowY = 'auto';
  checkboxWrapper.style.padding = '4px';
  checkboxWrapper.style.display = 'grid';
  checkboxWrapper.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))';
  checkboxWrapper.style.gap = '4px';

  // Add checkboxes for each column
  COLUMNS.forEach(col => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.cursor = 'pointer';
    label.style.color = '#fff';
    label.style.fontSize = '12px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = visibility[col.key];
    checkbox.style.marginRight = '4px';

    checkbox.addEventListener('change', () => {
      visibility[col.key] = checkbox.checked;
      saveColumnVisibility(visibility);
      applyColumnVisibility();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(col.label));
    checkboxWrapper.appendChild(label);
  });

  // Toggle visibility of checkbox controls
  let isExpanded = false;
  toggleBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    checkboxWrapper.style.display = isExpanded ? 'grid' : 'none';
    toggleBtn.textContent = isExpanded ? 'Hide Column Controls' : 'Show/Hide Columns';
  });

  columnWrapper.appendChild(toggleBtn);
  columnWrapper.appendChild(checkboxWrapper);
  container.appendChild(columnWrapper);
}

// ──────────────────────────────
// TABLE RENDERING HELPERS
// ──────────────────────────────

/**
 * Calculate optimal value for a system (resources + influence, with optimal calculation)
 */
function calculateOptimalValue(system) {
  if (!Array.isArray(system.planets)) return 0;

  let optimalResources = 0;
  let optimalInfluence = 0;

  system.planets.forEach(planet => {
    const res = planet.resources || 0;
    const inf = planet.influence || 0;

    if (res === inf && res > 0) {
      // Split planets contribute half to each
      optimalResources += res / 2;
      optimalInfluence += inf / 2;
    } else if (res > inf) {
      optimalResources += res;
    } else if (inf > res) {
      optimalInfluence += inf;
    }
  });

  return optimalResources + optimalInfluence;
}

/**
 * Generate table header HTML with proper data attributes and sorting functionality
 */
export function generateTableHeader(sortColumn = null, sortDirection = 'asc', onSort = null) {
  const headerRow = document.createElement('tr');

  COLUMNS.forEach(col => {
    const th = document.createElement('th');
    th.setAttribute('data-column', col.key);
    th.style.width = col.width;
    th.style.padding = '4px 6px';
    th.style.borderBottom = '1px solid #555';
    th.style.backgroundColor = '#333';
    th.style.color = '#fff';
    th.style.fontSize = '14px';
    th.style.fontWeight = 'bold';
    th.style.textAlign = 'center';
    th.style.lineHeight = '1.3';
    th.style.whiteSpace = 'nowrap';

    // Make most columns sortable (except tile)
    const isSortable = col.key !== 'tile';

    if (isSortable && onSort) {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.title = `Click to sort by ${col.label}`;

      // Add sort indicator
      const sortIndicator = sortColumn === col.key ?
        (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ▽';
      th.textContent = col.label + sortIndicator;

      // Add click handler for sorting
      th.addEventListener('click', () => {
        const newDirection = sortColumn === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
        onSort(col.key, newDirection);
      });
    } else {
      th.textContent = col.label;
    }

    headerRow.appendChild(th);
  });

  return headerRow;
}

/**
 * Sort systems array by column and direction
 */
export function sortSystemsByColumn(systems, column, direction) {
  return [...systems].sort((a, b) => {
    let valueA, valueB;

    switch (column) {
      case 'id':
        valueA = a.id.toString().toLowerCase();
        valueB = b.id.toString().toLowerCase();
        break;

      case 'name':
        valueA = (a.name || '').toLowerCase();
        valueB = (b.name || '').toLowerCase();
        break;

      case 'planets':
        // Sort by planet count, then by total resources + influence
        const planetsA = a.planets || [];
        const planetsB = b.planets || [];
        const countA = planetsA.length;
        const countB = planetsB.length;
        if (countA !== countB) {
          valueA = countA;
          valueB = countB;
        } else {
          // Same planet count, sort by total resources + influence
          const totalA = planetsA.reduce((sum, p) => sum + (p.resources || 0) + (p.influence || 0), 0);
          const totalB = planetsB.reduce((sum, p) => sum + (p.resources || 0) + (p.influence || 0), 0);
          valueA = totalA;
          valueB = totalB;
        }
        break;

      case 'planetTypes':
        // Sort by number of different planet types, then by type priority
        const getUniqueTypes = (system) => {
          const types = new Set();
          let hasUnTypedPlanets = false;

          if (system.planets && system.planets.length > 0) {
            system.planets.forEach(p => {
              let type;
              if (typeof p.planetType === "string" && p.planetType) {
                type = p.planetType;
              } else if (Array.isArray(p.planetTypes) && p.planetTypes.length > 0) {
                type = p.planetTypes[0];
              }

              if (type) {
                types.add(type.toUpperCase());
              } else {
                hasUnTypedPlanets = true;
              }
            });

            if (hasUnTypedPlanets) {
              types.add('NEUTRAL');
            }
          }

          return types;
        };

        const typesA = getUniqueTypes(a);
        const typesB = getUniqueTypes(b);

        if (typesA.size !== typesB.size) {
          valueA = typesA.size;
          valueB = typesB.size;
        } else {
          // Same type count, sort by type priority
          const typePriority = { 'CULTURAL': 1, 'INDUSTRIAL': 2, 'HAZARDOUS': 3, 'NEUTRAL': 4 };
          const priorityA = Array.from(typesA).reduce((sum, type) => sum + (typePriority[type] || 5), 0);
          const priorityB = Array.from(typesB).reduce((sum, type) => sum + (typePriority[type] || 5), 0);
          valueA = priorityA;
          valueB = priorityB;
        }
        break;

      case 'resources':
        valueA = a.planets ? a.planets.reduce((sum, p) => sum + (p.resources || 0), 0) : 0;
        valueB = b.planets ? b.planets.reduce((sum, p) => sum + (p.resources || 0), 0) : 0;
        break;

      case 'influence':
        valueA = a.planets ? a.planets.reduce((sum, p) => sum + (p.influence || 0), 0) : 0;
        valueB = b.planets ? b.planets.reduce((sum, p) => sum + (p.influence || 0), 0) : 0;
        break;

      case 'effective':
        // Calculate effective R/I values for sorting
        const calcEffective = (system) => {
          let a = 0, b = 0, c = 0;
          if (system.planets) {
            for (const p of system.planets) {
              if (p.resources === p.influence) {
                c += p.resources;
              } else if (p.resources > p.influence) {
                a += p.resources;
              } else if (p.influence > p.resources) {
                b += p.influence;
              }
            }
          }
          return a + b + c; // Total effective value for sorting
        };
        valueA = calcEffective(a);
        valueB = calcEffective(b);
        break;

      case 'wormholes':
        // Sort by number of wormholes, then by type priority
        const wormsA = Array.isArray(a.wormholes) ? a.wormholes.filter(w => w && w !== 'null') : [];
        const wormsB = Array.isArray(b.wormholes) ? b.wormholes.filter(w => w && w !== 'null') : [];
        if (wormsA.length !== wormsB.length) {
          valueA = wormsA.length;
          valueB = wormsB.length;
        } else {
          // Same count, sort by wormhole type priority
          const wormPriority = { 'alpha': 1, 'beta': 2, 'gamma': 3, 'delta': 4 };
          const priorityA = wormsA.reduce((sum, worm) => sum + (wormPriority[worm?.toLowerCase()] || 5), 0);
          const priorityB = wormsB.reduce((sum, worm) => sum + (wormPriority[worm?.toLowerCase()] || 5), 0);
          valueA = priorityA;
          valueB = priorityB;
        }
        break;

      case 'tech':
        // Sort by number of tech specialties, then by type priority
        const techsA = Array.from(new Set((a.planets || []).flatMap(p => p.techSpecialties || [])));
        const techsB = Array.from(new Set((b.planets || []).flatMap(p => p.techSpecialties || [])));
        if (techsA.length !== techsB.length) {
          valueA = techsA.length;
          valueB = techsB.length;
        } else {
          // Same count, sort by tech type priority
          const techPriority = { 'WARFARE': 1, 'PROPULSION': 2, 'CYBERNETIC': 3, 'BIOTIC': 4 };
          const priorityA = techsA.reduce((sum, tech) => sum + (techPriority[tech?.toUpperCase()] || 5), 0);
          const priorityB = techsB.reduce((sum, tech) => sum + (techPriority[tech?.toUpperCase()] || 5), 0);
          valueA = priorityA;
          valueB = priorityB;
        }
        break;

      case 'legendary':
        valueA = (a.planets || []).some(p => p.legendaryAbilityName) ? 1 : 0;
        valueB = (b.planets || []).some(p => p.legendaryAbilityName) ? 1 : 0;
        break;

      case 'anomalies':
        // Sort by number of anomalies, then by type priority
        let anomaliesA = [];
        let anomaliesB = [];
        if (a.isSupernova) anomaliesA.push('supernova');
        if (a.isGravityRift) anomaliesA.push('gravity');
        if (a.isNebula) anomaliesA.push('nebula');
        if (a.isAsteroidField) anomaliesA.push('asteroid');
        if (b.isSupernova) anomaliesB.push('supernova');
        if (b.isGravityRift) anomaliesB.push('gravity');
        if (b.isNebula) anomaliesB.push('nebula');
        if (b.isAsteroidField) anomaliesB.push('asteroid');

        if (anomaliesA.length !== anomaliesB.length) {
          valueA = anomaliesA.length;
          valueB = anomaliesB.length;
        } else {
          // Same count, sort by anomaly type priority
          const anomalyPriority = { 'supernova': 1, 'gravity': 2, 'nebula': 3, 'asteroid': 4 };
          const priorityA = anomaliesA.reduce((sum, anomaly) => sum + (anomalyPriority[anomaly] || 5), 0);
          const priorityB = anomaliesB.reduce((sum, anomaly) => sum + (anomalyPriority[anomaly] || 5), 0);
          valueA = priorityA;
          valueB = priorityB;
        }
        break;

      case 'used':
        valueA = isRealIDUsed(a.id) ? 1 : 0;
        valueB = isRealIDUsed(b.id) ? 1 : 0;
        break;

      default:
        return 0;
    }

    // Handle comparison
    let result = 0;
    if (valueA < valueB) result = -1;
    else if (valueA > valueB) result = 1;

    return direction === 'desc' ? -result : result;
  });
}

/**
 * Generate table row HTML for a system with proper data attributes
 */
export function generateSystemRow(system) {
  const row = document.createElement('tr');
  row.style.borderBottom = '1px solid #444';
  row.style.height = '36px'; // Increased height for larger content

  COLUMNS.forEach(col => {
    const td = document.createElement('td');
    td.setAttribute('data-column', col.key);
    td.style.padding = '4px 6px';
    td.style.fontSize = '13px';
    td.style.color = '#ccc';
    td.style.lineHeight = '1.3';
    td.style.verticalAlign = 'middle';
    td.style.textAlign = 'center';
    td.style.whiteSpace = 'nowrap';
    td.style.overflow = 'hidden';
    td.style.textOverflow = 'ellipsis';

    // Populate cell based on column type
    switch (col.key) {
      case 'tile':
        // Create a small tile image preview
        if (system.imagePath && system.imagePath.trim()) {
          const img = document.createElement('img');
          img.src = `public/data/tiles/${system.imagePath}`;
          img.style.width = '36px';
          img.style.height = '36px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '3px';
          img.style.display = 'block';
          img.style.margin = '0 auto';
          img.title = `${system.id} - ${system.name || 'Unnamed'}`;

          img.onerror = function () {
            // Replace with text fallback if image fails to load
            td.textContent = system.id;
            td.style.fontSize = '12px';
            td.style.textAlign = 'center';
          };

          td.appendChild(img);
        } else {
          // Fallback to ID text if no image path
          td.textContent = system.id;
          td.style.fontSize = '12px';
        }
        break;

      case 'id':
        td.textContent = system.id;
        td.style.fontFamily = 'monospace';
        break;

      case 'name':
        td.textContent = system.name || '';
        td.style.maxWidth = '150px';
        td.style.overflow = 'hidden';
        td.style.textOverflow = 'ellipsis';
        td.style.textAlign = 'left';
        td.title = system.name || '';
        break;

      case 'planets':
        const planetCount = system.planets ? system.planets.length : 0;
        td.textContent = planetCount;
        break;

      case 'planetTypes':
        td.innerHTML = ''; // Clear content to add spans
        const planetTypes = new Set();
        let hasUnTypedPlanets = false;

        if (system.planets && system.planets.length > 0) {
          system.planets.forEach(p => {
            let type;
            if (typeof p.planetType === "string" && p.planetType) {
              type = p.planetType;
            } else if (Array.isArray(p.planetTypes) && p.planetTypes.length > 0) {
              type = p.planetTypes[0];
            }

            if (type) {
              planetTypes.add(type.toUpperCase());
            } else {
              hasUnTypedPlanets = true;
            }
          });

          // Build the display spans
          const typeSpans = [];

          // Add specific planet types
          Array.from(planetTypes).forEach(type => {
            let color = '#ccc';
            let label = '';

            switch (type) {
              case 'CULTURAL':
                color = 'blue';
                label = 'C';
                break;
              case 'HAZARDOUS':
                color = 'red';
                label = 'H';
                break;
              case 'INDUSTRIAL':
                color = 'green';
                label = 'I';
                break;
              default:
                color = 'gray';
                label = 'N'; // Neutral for unknown types
                break;
            }

            typeSpans.push(`<span style="color: ${color}; font-weight: bold; margin-right: 2px;" title="${type}">${label}</span>`);
          });

          // Add neutral for untyped planets (only if there are planets without types)
          if (hasUnTypedPlanets) {
            typeSpans.push(`<span style="color: gray; font-weight: bold; margin-right: 2px;" title="Neutral">N</span>`);
          }

          td.innerHTML = typeSpans.join('');
        } else {
          // No planets at all - leave empty
          td.textContent = '';
        }
        break;

      case 'resources':
        const totalRes = system.planets ?
          system.planets.reduce((sum, p) => sum + (p.resources || 0), 0) : 0;
        td.textContent = totalRes;
        td.style.color = totalRes > 0 ? '#4CAF50' : '#ccc';
        break;

      case 'influence':
        const totalInf = system.planets ?
          system.planets.reduce((sum, p) => sum + (p.influence || 0), 0) : 0;
        td.textContent = totalInf;
        td.style.color = totalInf > 0 ? '#2196F3' : '#ccc';
        break;

      case 'effective':
        // Calculate effective R/I like in realIDsOverlays.js
        let a = 0, b = 0, c = 0;
        if (system.planets) {
          for (const p of system.planets) {
            if (p.resources === p.influence) {
              c += p.resources;
            } else if (p.resources > p.influence) {
              a += p.resources;
            } else if (p.influence > p.resources) {
              b += p.influence;
            }
          }
        }
        let effective = `${a}/${b}`;
        if (c > 0) effective += `+${c}`;
        td.textContent = effective === '0/0' ? '' : effective;
        td.style.color = (a + b + c) > 0 ? '#00BCD4' : '#ccc';
        td.style.fontSize = '11px';
        break;

      case 'wormholes':
        td.innerHTML = ''; // Clear content to add spans
        let wormholes = [];
        if (system.wormholes instanceof Set) {
          wormholes = Array.from(system.wormholes).filter(w => w && w !== 'null');
        } else if (Array.isArray(system.wormholes)) {
          wormholes = system.wormholes.filter(w => w && w !== 'null');
        }

        if (wormholes.length > 0) {
          const wormholeSpans = wormholes.map(w => {
            const wormType = wormholeTypes[w.toLowerCase()];
            const color = wormType ? wormType.color : '#888';
            const label = wormType ? wormType.label.charAt(0) : w.charAt(0).toUpperCase();
            return `<span style="color: ${color}; font-weight: bold; margin-right: 2px;">${label}</span>`;
          }).join('');
          td.innerHTML = wormholeSpans;
        } else {
          td.textContent = '';
          td.style.color = '#ccc';
        }
        break;

      case 'tech':
        td.innerHTML = ''; // Clear content to add spans
        const techSpecialties = new Set();

        if (system.planets) {
          system.planets.forEach(p => {
            if (Array.isArray(p.techSpecialties)) {
              p.techSpecialties.forEach(tech => techSpecialties.add(tech));
            } else if (p.techSpecialty) {
              techSpecialties.add(p.techSpecialty);
            }
          });
        }

        if (techSpecialties.size > 0) {
          const techSpans = Array.from(techSpecialties).map(tech => {
            const techUpper = tech.toUpperCase();
            let color = techSpecialtyColors[techUpper] || '#9C27B0';
            let label = '';

            switch (techUpper) {
              case 'CYBERNETIC': label = 'Y'; break;
              case 'BIOTIC': label = 'G'; break;
              case 'WARFARE': label = 'R'; break;
              case 'PROPULSION': label = 'B'; break;
              default: label = tech.charAt(0).toUpperCase(); break;
            }

            return `<span style="color: ${color}; font-weight: bold; margin-right: 2px;" title="${tech}">${label}</span>`;
          }).join('');
          td.innerHTML = techSpans;
        } else {
          td.textContent = '';
          td.style.color = '#ccc';
        }
        break;

      case 'legendary':
        const hasLegendary = system.planets && system.planets.some(p => p.legendaryAbilityName);
        td.textContent = hasLegendary ? '★' : '';
        td.style.color = hasLegendary ? '#FFD700' : '#ccc';
        break;

      case 'anomalies':
        const effects = [];
        if (system.isSupernova) effects.push(effectEmojiMap.supernova || '☀️');
        if (system.isAsteroidField) effects.push(effectEmojiMap.asteroid || '🪨');
        if (system.isNebula) effects.push(effectEmojiMap.nebula || '☁️');
        if (system.isGravityRift) effects.push(effectEmojiMap.rift || '🕳️');
        td.textContent = effects.join(' ');
        td.style.fontSize = '14px'; // Larger for emojis
        td.style.color = effects.length > 0 ? '#fff' : '#ccc';
        break;

      case 'used':
        const isUsed = isRealIDUsed(system.id);
        td.textContent = isUsed ? '✓' : '';
        td.style.color = isUsed ? '#f44336' : '#ccc';
        break;

      default:
        td.textContent = '';
    }

    row.appendChild(td);
  });

  return row;
}

/**
 * Apply column visibility after table is rendered
 */
export function applyColumnVisibilityToTable(table) {
  // Apply column visibility after a short delay to ensure table is in DOM
  setTimeout(() => applyColumnVisibility(), 0);
}

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

  // Add column controls first
  initColumnControls(container);

  // Create a wrapper for source filters (OR)
  const sourceWrapper = document.createElement('div');
  sourceWrapper.classList.add('filter-group', 'source-filters');
  sourceWrapper.style.marginBottom = '8px';
  sourceWrapper.appendChild(document.createTextNode('Source Filters (OR): '));

  // Create a wrapper for attribute filters (AND/NAND)
  const attrWrapper = document.createElement('div');
  attrWrapper.classList.add('filter-group', 'attribute-filters');
  attrWrapper.style.marginBottom = '8px';

  // AND/NAND toggle button
  const andNandBtn = document.createElement('button');
  andNandBtn.id = 'filter-and-nand-toggle';
  andNandBtn.textContent = 'AND';
  andNandBtn.classList.add('filter-toggle');
  andNandBtn.dataset.mode = 'and';
  andNandBtn.style.marginRight = '8px';
  andNandBtn.addEventListener('click', () => {
    const mode = andNandBtn.dataset.mode === 'and' ? 'nand' : 'and';
    andNandBtn.dataset.mode = mode;
    andNandBtn.textContent = mode.toUpperCase();
    applyFilters(editor, onResults);
  });
  attrWrapper.appendChild(andNandBtn);
  attrWrapper.appendChild(document.createTextNode(' Attribute Filters: '));

  // Separate source and attribute filters
  const sourceFilterKeys = ['sourceBase', 'sourcePok', 'sourceDS', 'sourceEronous', 'sourceOthers'];
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
    if (sourceFilterKeys.includes(key)) {
      sourceWrapper.appendChild(btn);
    } else {
      attrWrapper.appendChild(btn);
    }
  });

  container.appendChild(sourceWrapper);
  container.appendChild(attrWrapper);

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
  const andNandBtn = document.getElementById('filter-and-nand-toggle');
  const mode = andNandBtn?.dataset.mode === 'nand' ? 'nand' : 'and';
  const matches = all.filter(sys => {
    // Never show a system already placed on the map
    if (editor.hexes[sys.id]?.baseType) return false;

    // Handle source filters with OR logic
    const sourceFilters = ['sourceBase', 'sourcePok', 'sourceDS', 'sourceEronous', 'sourceOthers'];
    const activeSourceFilters = sourceFilters.filter(key => {
      const btn = document.getElementById(`filter-${key}`);
      return btn?.dataset.active === 'true';
    });

    // Apply OR logic for sources - if no source filters are active, show nothing
    if (activeSourceFilters.length === 0) {
      return false; // No source filters active = show nothing
    }

    const sourceMatches = activeSourceFilters.some(key => {
      const source = (sys.source || '').toLowerCase();
      switch (key) {
        case 'sourceBase': return source === 'base';
        case 'sourcePok': return source === 'pok';
        case 'sourceDS': return source === 'ds' || source === 'uncharted_space';
        case 'sourceEronous': return source === 'eronous';
        case 'sourceOthers':
          // Handle "others" - includes known other sources and any unknown sources
          return ['other', 'draft', 'dane_leaks'].includes(source) ||
            (source !== '' && !['base', 'pok', 'ds', 'uncharted_space', 'eronous'].includes(source));
        default: return false;
      }
    });
    if (!sourceMatches) return false;

    // All other filters must pass (AND/NAND logic) - exclude source filters
    const otherFilters = FILTERS.filter(({ key }) => !sourceFilters.includes(key));
    const results = otherFilters.map(({ key, test }) => {
      const btn = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
    if (mode === 'nand') {
      // NAND: show systems that fail at least one filter
      return results.some(r => !r);
    } else {
      // AND: show systems that pass all filters
      return results.every(r => r);
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

  // 1) Filter out already-placed systems and apply filters
  const filtered = systems.filter(sys => {
    if (editor.hexes[sys.id]?.baseType) return false;

    // Handle source filters with OR logic
    const sourceFilters = ['sourceBase', 'sourcePok', 'sourceDS', 'sourceEronous', 'sourceOthers'];
    const activeSourceFilters = sourceFilters.filter(key => {
      const btn = document.getElementById(`filter-${key}`);
      return btn?.dataset.active === 'true';
    });

    // Apply OR logic for sources - if no source filters are active, show nothing
    if (activeSourceFilters.length === 0) {
      return false; // No source filters active = show nothing
    }

    const sourceMatches = activeSourceFilters.some(key => {
      const source = (sys.source || '').toLowerCase();
      switch (key) {
        case 'sourceBase': return source === 'base';
        case 'sourcePok': return source === 'pok';
        case 'sourceDS': return source === 'ds' || source === 'uncharted_space';
        case 'sourceEronous': return source === 'eronous';
        case 'sourceOthers':
          // Handle "others" - includes known other sources and any unknown sources
          return ['other', 'draft', 'dane_leaks'].includes(source) ||
            (source !== '' && !['base', 'pok', 'ds', 'uncharted_space', 'eronous'].includes(source));
        default: return false;
      }
    });
    if (!sourceMatches) return false;

    // All other filters must pass (AND logic) - exclude source filters
    const otherFilters = FILTERS.filter(({ key }) => !sourceFilters.includes(key));
    return otherFilters.every(({ key, test }) => {
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

    // Handle source filters with OR logic
    const sourceFilters = ['sourceBase', 'sourcePok', 'sourceDS', 'sourceEronous', 'sourceOthers'];
    const activeSourceFilters = sourceFilters.filter(key => {
      const btn = document.getElementById(`filter-${key}`);
      return btn?.dataset.active === 'true';
    });

    // Apply OR logic for sources - if no source filters are active, show nothing
    if (activeSourceFilters.length === 0) {
      return false; // No source filters active = show nothing
    }

    const sourceMatches = activeSourceFilters.some(key => {
      const source = (sys.source || '').toLowerCase();
      switch (key) {
        case 'sourceBase': return source === 'base';
        case 'sourcePok': return source === 'pok';
        case 'sourceDS': return source === 'ds' || source === 'uncharted_space';
        case 'sourceEronous': return source === 'eronous';
        case 'sourceOthers':
          // Handle "others" - includes known other sources and any unknown sources
          return ['other', 'draft', 'dane_leaks'].includes(source) ||
            (source !== '' && !['base', 'pok', 'ds', 'uncharted_space', 'eronous'].includes(source));
        default: return false;
      }
    });
    if (!sourceMatches) return false;

    // All other filters must pass (AND logic) - exclude source filters
    const otherFilters = FILTERS.filter(({ key }) => !sourceFilters.includes(key));
    return otherFilters.every(({ key, test }) => {
      const btn = document.getElementById(`filter-${key}`);
      const active = btn?.dataset.active === 'true';
      return test(sys, active);
    });
  });
}

export { FILTERS, COLUMNS };