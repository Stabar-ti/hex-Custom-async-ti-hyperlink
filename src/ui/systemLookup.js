// ───────────────────────────────────────────────────────────────
// ui/systemLookup.js
//
// This module provides the system lookup popup: a searchable and
// filterable list for choosing TI4 systems and attributes.
// Uses the flexible popupUI.js system for better UX with draggable,
// scalable popups while maintaining all existing functionality.
// ───────────────────────────────────────────────────────────────

import { loadSystemInfo } from '../data/import.js';
import {
    initFilters,
    markRealIDUsed,
    isRealIDUsed,
    getActiveFilterPass,
    unmarkRealIDUsed,
    usedRealIDs,
    generateTableHeader,
    generateSystemRow,
    applyColumnVisibilityToTable,
    sortSystemsByColumn
} from './uiFilters.js';
import { wormholeTypes, techSpecialtyColors } from '../constants/constants.js';
import { FILTERS } from './uiFilters.js';
import { showPopup, hidePopup } from './popupUI.js';
//import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
//import { assignSystem } from '../features/assignSystem.js';

/**
 * Initializes the system lookup popup, creating a popup-based interface
 * for searching, filtering, and selecting TI4 systems.
 * Should be called with the active HexEditor instance.
 */
export default async function initSystemLookup(editor) {
    // 1) Load system data (names, planets, IDs, etc.)
    await loadSystemInfo(editor);
    const systems = editor.allSystems || [];

    // Store references for the popup components
    let currentPopup = null;
    let searchInput = null;
    let systemList = null;
    let filtersContainer = null;

    // Sorting state
    let sortColumn = null;
    let sortDirection = null;

    // Global cache for failed image loads to prevent repeated 404s
    const failedImages = new Set();

    /**
     * Creates and shows the system lookup popup
     */
    function showSystemLookupPopup() {
        // Hide any existing popup
        hidePopup('system-lookup-popup');

        // Create the popup content structure
        const content = document.createElement('div');
        content.className = 'system-lookup-content';
        content.style.width = '100%';
        content.style.height = '100%';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.minHeight = '0'; // Allow flex children to shrink
        content.style.padding = '8px';
        content.style.boxSizing = 'border-box';

        // ...existing code...

        // Create filters section (collapsible)
        const filtersSection = document.createElement('details');
        filtersSection.style.marginBottom = '12px';
        filtersSection.innerHTML = '<summary style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">Filters</summary>';

        filtersContainer = document.createElement('div');
        filtersContainer.id = 'uiFiltersContainer';
        filtersContainer.style.marginBottom = '8px';
        filtersSection.appendChild(filtersContainer);

        // Create random tile section
        const randomDiv = document.createElement('div');
        randomDiv.style.margin = '8px 0';
        randomDiv.style.display = 'flex';
        randomDiv.style.alignItems = 'center';
        randomDiv.style.gap = '8px';

        const uniqueCheck = document.createElement('input');
        uniqueCheck.type = 'checkbox';
        uniqueCheck.id = 'randomUnique';
        uniqueCheck.checked = true;

        const uniqueLabel = document.createElement('label');
        uniqueLabel.htmlFor = 'randomUnique';
        uniqueLabel.textContent = 'Unique';

        const randomBtn = document.createElement('button');
        randomBtn.className = 'wizard-btn';
        randomBtn.textContent = '🎲 DJWizzy Random Tile Bonanza';

        randomDiv.appendChild(uniqueCheck);
        randomDiv.appendChild(uniqueLabel);
        randomDiv.appendChild(randomBtn);

        // Create search section
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'systemSearch';
        searchInput.placeholder = 'Type ID or name…';
        searchInput.className = 'modal-input';
        searchInput.style.width = '100%';
        searchInput.style.marginBottom = '8px';
        searchInput.style.boxSizing = 'border-box';

        // Add status indicator
        const statusDiv = document.createElement('div');
        statusDiv.id = 'systemSelectionStatus';
        statusDiv.style.background = '#333';
        statusDiv.style.border = '1px solid #555';
        statusDiv.style.borderRadius = '4px';
        statusDiv.style.padding = '6px 8px';
        statusDiv.style.marginBottom = '8px';
        statusDiv.style.fontSize = '12px';
        statusDiv.style.color = '#aaa';
        statusDiv.innerHTML = '📋 Select a system below, then click on a hex to place it';

        // Update status function
        window.updateSystemSelectionStatus = (systemId, systemName) => {
            if (systemId) {
                statusDiv.innerHTML = `📍 Ready to place: <strong style="color: #4a8a4a;">${systemId}</strong> - ${systemName || 'Unknown'}`;
            } else {
                statusDiv.innerHTML = '📋 Select a system below, then click on a hex to place it';
            }
        };

        // Create results container
        const resultsContainer = document.createElement('div');
        resultsContainer.style.flex = '0.9 1 0'; // Take remaining space but allow shrinking to 0
        resultsContainer.style.overflow = 'auto';
        resultsContainer.style.border = '1px solid #555';
        resultsContainer.style.borderRadius = '4px';
        resultsContainer.style.minHeight = '120px'; // Reduced minimum height
        resultsContainer.style.display = 'flex';
        resultsContainer.style.flexDirection = 'column';

        systemList = document.createElement('div');
        systemList.id = 'systemList';
        systemList.style.width = '100%';
        systemList.style.height = '100%';
        resultsContainer.appendChild(systemList);

        // Assemble the content
        content.appendChild(filtersSection);
        content.appendChild(randomDiv);
        content.appendChild(searchInput);
        content.appendChild(statusDiv);
        content.appendChild(resultsContainer);

        // Show the popup
        currentPopup = showPopup({
            id: 'system-lookup-popup',
            title: '🔍 Search system and add to map',
            content: content,
            modal: false,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            showHelp: true,
            onHelp: () => {
                showPopup({
                    id: 'system-lookup-help',
                    className: 'popup-ui popup-ui-info',
                    title: 'System Lookup Help',
                    content:
                        "<div style='max-width:600px;line-height:1.6;font-size:15px;padding:8px;'>" +
                        "<h3>System Lookup & Async Tiles</h3>" +
                        "<ul>" +
                        "<li><b>Search:</b> Type a system ID or name to filter the list. Numeric search matches any digits in IDs.</li>" +
                        "<li><b>Source Filters (OR):</b> Select one or more source categories to show systems from those sources. At least one must be active.</li>" +
                        "<li><b>Attribute Filters (AND/NAND):</b> Use attribute buttons to further filter systems. Toggle AND/NAND to switch between showing systems that match all attributes (AND) or systems that fail at least one (NAND).</li>" +
                        "<li><b>Random Tile:</b> Use the random button to pick a tile from the current filtered list. 'Unique' ensures only unused tiles are chosen.</li>" +
                        "<li><b>Selection:</b> Click a row to select a system. Selected systems are highlighted in green until placed on the map.</li>" +
                        "<li><b>Legend:</b> Techs, wormholes, and effects are shown with icons and color codes.</li>" +
                        "</ul>" +
                        "<hr>" +
                        "<b>Tips:</b> <br>" +
                        "- You can resize and drag this popup.<br>" +
                        "- Filters are grouped for clarity.<br>" +
                        "- If no systems show, check your source filters.<br>" +
                        "</div>",
                    actions: [],
                    draggable: true,
                    dragHandleSelector: '.popup-ui-titlebar',
                    scalable: true,
                    rememberPosition: true,
                    style: {
                        minWidth: '340px',
                        maxWidth: '800px',
                        minHeight: '200px',
                        maxHeight: '800px',
                        border: '2px solid #2ecc40',
                        borderRadius: '10px',
                        boxShadow: '0 8px 40px #000a',
                        padding: '24px'
                    }
                });
            },
            style: {
                width: '800px',
                height: '600px',
                minWidth: '600px',
                minHeight: '400px',
                maxWidth: '95vw',
                maxHeight: '90vh',
                zIndex: 10003,
                resize: 'both', // Allow manual resizing
                overflow: 'auto' // Allow scrolling and pointer events
            },
            onClose: () => {
                currentPopup = null;
                searchInput = null;
                systemList = null;
                filtersContainer = null;
                stopPlacementMonitoring();
            }
        });

        // Initialize the components after popup is created
        initializePopupComponents(randomBtn, uniqueCheck);

        // Initial render
        renderList(systems);

        // Initialize filters
        initFilters(filtersContainer, editor, renderList);

        // Focus search input
        setTimeout(() => searchInput?.focus(), 100);

        // Start monitoring for system placement
        startPlacementMonitoring();
    }

    /**
     * Initialize event handlers for popup components
     */
    function initializePopupComponents(randomBtn, uniqueCheck) {
        let lastRandom = null;

        // Random tile button handler
        randomBtn.addEventListener('click', () => {
            const unique = uniqueCheck.checked;
            let candidates;

            if (unique) {
                candidates = getActiveFilterPass(editor)
                    .filter(s => !isRealIDUsed(s.id));
            } else {
                candidates = (Array.isArray(editor.allSystems) ? editor.allSystems : []).filter(sys =>
                    FILTERS.every(({ key, test }) => {
                        const btn = document.getElementById(`filter-${key}`);
                        const active = btn?.dataset.active === 'true';
                        return test(sys, active);
                    })
                );
            }

            if (!candidates.length) {
                alert('No tiles match the current filters!');
                return;
            }

            let filtered = candidates;
            if (candidates.length > 1 && lastRandom != null) {
                filtered = candidates.filter(s => s.id !== lastRandom);
                if (!filtered.length) filtered = candidates;
            }
            const sys = filtered[Math.floor(Math.random() * filtered.length)];
            lastRandom = sys.id;

            showRandomTilePopup(sys, editor, () => lastRandom = null);
        });

        // Unique checkbox handler
        uniqueCheck.addEventListener('change', () => { lastRandom = null; });

        // Search input handler
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.trim().toLowerCase();
            let toShow = getActiveFilterPass(editor);

            if (term) {
                // Advanced: allow searching for numbers within IDs even if ID is not purely numeric
                toShow = toShow.filter(s => {
                    const id = s.id.toString().toLowerCase();
                    const name = (s.name || '').toLowerCase();

                    // If term is only digits, match IDs that contain those digits anywhere (even inside strings)
                    if (/^\d+$/.test(term)) {
                        const idDigits = id.replace(/\D/g, '');
                        return id.includes(term) || idDigits.includes(term) || name.includes(term);
                    }

                    // Otherwise, behave as normal: substring match on ID or name
                    return id.includes(term) || name.includes(term);
                });
            }

            // Preserve sorting if we have sort state
            if (sortColumn && sortDirection) {
                toShow = sortSystemsByColumn(toShow, sortColumn, sortDirection);
            }

            renderList(toShow);
        });
    }
    /**
     * Helper functions for rendering system attributes
     */
    function getTechLetterColor(tech) {
        switch ((tech || '').toUpperCase()) {
            case 'CYBERNETIC': return { l: 'Y', c: techSpecialtyColors.CYBERNETIC || '#FFD700' };
            case 'BIOTIC': return { l: 'G', c: techSpecialtyColors.BIOTIC || 'green' };
            case 'WARFARE': return { l: 'R', c: techSpecialtyColors.WARFARE || 'red' };
            case 'PROPULSION': return { l: 'B', c: techSpecialtyColors.PROPULSION || '#00BFFF' };
            default: return null;
        }
    }

    function getWormholeCharColor(worm) {
        const w = (worm || '').toLowerCase();
        const info = wormholeTypes[w];
        if (!info) return null;
        return { ch: info.label?.charAt(0) || '?', c: info.color || '#888' };
    }

    /**
     * Update selected system info display
     */
    function updateSelectedSystemInfo(system) {
        // Update any system info displays if they exist
        if (typeof window.updateSystemSelectionStatus === 'function') {
            window.updateSystemSelectionStatus(system.id, system.name);
        }
    }

    /**
     * Show hover preview popup for a system
     */
    function showHoverPreview(system, x, y, previewDiv) {
        if (!previewDiv) return;

        // Build preview content with image and text side by side
        let content = `<div style="display: flex; gap: 12px; font-size: 18px; line-height: 1.4; max-width: 400px;">`;
        
        // Image column (left side)
        content += `<div style="flex-shrink: 0;">`;
        if (system.imagePath && system.imagePath.trim()) {
            const imgSrc = `public/data/tiles/${system.imagePath}`;
            content += `<img src="${imgSrc}" style="width: 160px; height: 160px; border-radius: 4px; object-fit: cover;" 
                        onerror="this.style.display='none';" />`;
        }
        content += `</div>`;

        // Info column (right side)
        content += `<div style="flex: 1; min-width: 0;">`;
        content += `<div style="font-weight: bold; color: #e4f; margin-bottom: 4px;">${system.id} - ${system.name || 'Unnamed'}</div>`;

        // Planets
        if (system.planets && system.planets.length > 0) {
            content += `<div style="margin-bottom: 4px;"><strong>Planets:</strong></div>`;
            system.planets.forEach(p => {
                const res = p.resources || 0;
                const inf = p.influence || 0;
                const name = p.name || 'Unnamed';
                content += `<div style="margin-left: 8px; font-size: 16px;">${name} (${res}/${inf})</div>`;
            });
        }

        // Tech specialties
        const techs = Array.from(new Set((system.planets || []).flatMap(p => p.techSpecialties || [])));
        if (techs.length > 0) {
            content += `<div style="margin: 4px 0;"><strong>Tech:</strong> `;
            techs.forEach(tech => {
                const techInfo = getTechLetterColor(tech);
                if (techInfo) {
                    content += `<span style="color: ${techInfo.c}; font-weight: bold;">${techInfo.l}</span> `;
                }
            });
            content += `</div>`;
        }

        // Wormholes
        const wormholes = Array.isArray(system.wormholes) ? system.wormholes : [];
        if (wormholes.length > 0) {
            content += `<div style="margin: 4px 0;"><strong>Wormholes:</strong> `;
            wormholes.forEach(worm => {
                const wormInfo = getWormholeCharColor(worm);
                if (wormInfo) {
                    content += `<span style="color: ${wormInfo.c}; font-weight: bold;">${wormInfo.ch}</span> `;
                }
            });
            content += `</div>`;
        }

        // Anomalies/Effects
        const effects = [];
        if (system.isNebula) effects.push('☁️ Nebula');
        if (system.isGravityRift) effects.push('🕳️ Gravity Rift');
        if (system.isSupernova) effects.push('☀️ Supernova');
        if (system.isAsteroidField) effects.push('🪨 Asteroid Field');
        if (effects.length > 0) {
            content += `<div style="margin: 4px 0;"><strong>Effects:</strong> ${effects.join(', ')}</div>`;
        }

        // Legendary with ability details
        const legendaryPlanet = (system.planets || []).find(p => p.legendaryAbilityName);
        if (legendaryPlanet) {
            content += `<div style="margin: 4px 0; color: #ffd700;"><strong>⭐ Legendary:</strong> ${legendaryPlanet.legendaryAbilityName}</div>`;
            if (legendaryPlanet.legendaryAbilityText) {
                content += `<div style="margin: 2px 0 4px 16px; font-size: 15px; color: #ccc; font-style: italic; line-height: 1.3;">${legendaryPlanet.legendaryAbilityText}</div>`;
            }
        }

        content += `</div>`; // Close info column
        content += `</div>`; // Close main container

        previewDiv.innerHTML = content;
        updatePreviewPosition(previewDiv, x, y);
        previewDiv.style.display = 'block';
    }

    /**
     * Update preview popup position
     */
    function updatePreviewPosition(previewDiv, x, y) {
        const rect = previewDiv.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Position to the right of cursor by default
        let left = x + 15;
        let top = y - 10;

        // Adjust if would go off screen
        if (left + rect.width > viewportWidth) {
            left = x - rect.width - 15; // Position to the left instead
        }
        if (top + rect.height > viewportHeight) {
            top = viewportHeight - rect.height - 10;
        }
        if (top < 10) {
            top = 10;
        }

        previewDiv.style.left = left + 'px';
        previewDiv.style.top = top + 'px';
    }

    /**
     * Main list rendering function: displays systems in a table
     */
    function renderList(items = systems) {
        if (!systemList) return;

        // Prevent excessive re-renders
        if (systemList.dataset.rendering === 'true') {
            return;
        }
        systemList.dataset.rendering = 'true';

        // Remember the currently selected system to restore after render
        const currentlySelectedSystemId = editor.pendingSystemId;

        systemList.innerHTML = '';

        // Set up the floating preview popup once
        let tilePreview = document.getElementById('tilePreviewPopup');
        if (!tilePreview) {
            tilePreview = document.createElement('div');
            tilePreview.id = 'tilePreviewPopup';
            tilePreview.style.position = 'fixed';
            tilePreview.style.zIndex = '10005';
            tilePreview.style.background = '#333';
            tilePreview.style.border = '1px solid #666';
            tilePreview.style.borderRadius = '8px';
            tilePreview.style.padding = '8px';
            tilePreview.style.display = 'none';
            tilePreview.style.pointerEvents = 'none';
            document.body.appendChild(tilePreview);
        }
        tilePreview.style.display = 'none';
        let hoverTimeout = null;

        // Sort handler function
        const handleSort = (column, direction) => {
            sortColumn = column;
            sortDirection = direction;
            const sortedItems = sortSystemsByColumn(items, column, direction);
            renderList(sortedItems);
        };

        // Build table with column management system
        const table = document.createElement('table');
        table.className = 'system-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '13px';
        table.style.tableLayout = 'fixed';
        table.style.backgroundColor = '#1a1a1a';
        table.style.border = '1px solid #444';
        
        const thead = document.createElement('thead');
        const headerRow = generateTableHeader(sortColumn, sortDirection, handleSort);
        headerRow.style.position = 'sticky';
        headerRow.style.top = '0';
        headerRow.style.zIndex = '1';
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        items.forEach(s => {
            const row = generateSystemRow(s);
            
            // Check if this system is currently selected
            const isCurrentlySelected = currentlySelectedSystemId && s.id.toString().toUpperCase() === currentlySelectedSystemId.toString().toUpperCase();
            
            if (isRealIDUsed(s.id)) {
                row.classList.add('used');
                row.style.backgroundColor = '#522';
            } else if (isCurrentlySelected) {
                row.classList.add('selected');
                row.style.backgroundColor = '#3a5a3a';
            }

            // Add hover popup functionality
            row.addEventListener('mouseenter', (e) => {
                if (!row.classList.contains('selected') && !hoverTimeout) {
                    hoverTimeout = setTimeout(() => {
                        showHoverPreview(s, e.clientX, e.clientY, tilePreview);
                        hoverTimeout = null;
                    }, 500); // Show after 500ms hover
                }
                // Add background hover effect
                if (!row.classList.contains('selected')) {
                    row.style.backgroundColor = '#444';
                }
            });

            row.addEventListener('mouseleave', () => {
                // Clear hover timeout
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }
                // Hide preview
                if (tilePreview) {
                    tilePreview.style.display = 'none';
                }
                // Remove background hover effect
                if (!row.classList.contains('selected')) {
                    row.style.backgroundColor = '';
                }
            });

            row.addEventListener('mousemove', (e) => {
                // Update preview position if visible
                if (tilePreview && tilePreview.style.display !== 'none') {
                    updatePreviewPosition(tilePreview, e.clientX, e.clientY);
                }
            });

            // Add click handler for system selection
            row.addEventListener('click', () => {
                editor.pendingSystemId = s.id.toString().toUpperCase();

                // Clear previous selections
                document.querySelectorAll('.system-table tr.selected').forEach(prevRow => {
                    prevRow.classList.remove('selected');
                    prevRow.style.backgroundColor = '';
                });

                // Mark this row as selected
                row.classList.add('selected');
                row.style.backgroundColor = '#3a5a3a';

                console.log(`Selected system: ${s.id} - ${s.name || 'Unnamed'}`);
                updateSelectedSystemInfo(s);
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        systemList.appendChild(table);

        // Apply column visibility
        applyColumnVisibilityToTable(table);

        // Clear the rendering flag
        systemList.dataset.rendering = 'false';
    }

    // Connect to external triggers
    const genMapBtn = document.getElementById('genMapBtn');
    const jumpBtn = document.getElementById('jumpToSystemBtn');
    const testBtn = document.getElementById('testSystemLookupBtn');

    // When the "Async Tiles" (jump) button is pressed, show popup
    jumpBtn?.addEventListener('click', () => {
        showSystemLookupPopup();
    });

    // Test button for easy testing of the new popup system
    testBtn?.addEventListener('click', () => {
        console.log('🧪 Testing new system lookup popup...');
        showSystemLookupPopup();
    });

    // When generating a new map, clear all "used" system IDs
    genMapBtn?.addEventListener('click', () => {
        Array.from(usedRealIDs).forEach(id => unmarkRealIDUsed(id));
        if (currentPopup) {
            refreshSystemList();
            // Clear selection status
            if (typeof window.updateSystemSelectionStatus === 'function') {
                window.updateSystemSelectionStatus(null);
            }
        }
    });

    // Listen for system placement to update the UI
    let lastPendingSystemId = null;
    function checkForSystemPlacement() {
        if (!currentPopup) return;

        const currentPendingId = editor.pendingSystemId;

        // Only act when pendingSystemId changes from something to null (system was placed)
        if (lastPendingSystemId && !currentPendingId) {
            // System was placed, clear visual selection and update status
            document.querySelectorAll('.system-table tr.selected').forEach(row => {
                row.classList.remove('selected');
                row.style.backgroundColor = '';
            });
            if (typeof window.updateSystemSelectionStatus === 'function') {
                window.updateSystemSelectionStatus(null);
            }
            // Only refresh if we actually need to update "used" status
            if (systemList) {
                refreshSystemList();
            }
        }

        lastPendingSystemId = currentPendingId;
    }

    // Check for placement periodically when popup is open (less frequently)
    let placementCheckInterval;
    function startPlacementMonitoring() {
        lastPendingSystemId = editor.pendingSystemId;
        placementCheckInterval = setInterval(checkForSystemPlacement, 250); // Reduced frequency
    }
    function stopPlacementMonitoring() {
        if (placementCheckInterval) {
            clearInterval(placementCheckInterval);
            placementCheckInterval = null;
            lastPendingSystemId = null;
        }
    }

    // Expose the render function globally for filter/search refresh
    let renderTimeout = null;
    window.renderSystemList = () => {
        if (systemList) {
            // Debounce rapid re-renders to prevent performance issues
            if (renderTimeout) {
                clearTimeout(renderTimeout);
            }
            renderTimeout = setTimeout(() => {
                let items = getActiveFilterPass(editor);
                // Preserve sorting if we have sort state
                if (sortColumn && sortDirection) {
                    items = sortSystemsByColumn(items, sortColumn, sortDirection);
                }
                renderList(items);
                renderTimeout = null;
            }, 50);
        }
    };

    // Expose global function to show popup
    window.showSystemLookupPopup = showSystemLookupPopup;
}
// 8) Exported: Forces the system list to be re-filtered and re-rendered.
export function refreshSystemList() {
    if (window.renderSystemList) {
        window.renderSystemList();
    }
}

// 9) When the page is ready, initialize the system lookup.
window.addEventListener('DOMContentLoaded', () => {
    initSystemLookup(window.editor);
});

function showRandomTilePopup(sys, editor, onAssign) {
    hidePopup('random-tile-popup');
    // Gather info for effects, wormholes, techs, legendary
    const planetSummaries = (sys.planets || []).map(p => `${p.name || ''} (${p.resources}/${p.influence})`).join('<br>');
    const techsArr = Array.from(new Set((sys.planets || []).flatMap(p => p.techSpecialties || [])));
    const techHtml = techsArr.map(t => {
        switch ((t || '').toUpperCase()) {
            case 'CYBERNETIC': return `<span style="color:#FFD700;font-weight:bold;">Y</span>`;
            case 'BIOTIC': return `<span style="color:green;font-weight:bold;">G</span>`;
            case 'WARFARE': return `<span style="color:red;font-weight:bold;">R</span>`;
            case 'PROPULSION': return `<span style="color:#00BFFF;font-weight:bold;">B</span>`;
            default: return '';
        }
    }).join(' ');
    const wormArr = Array.isArray(sys.wormholes) ? sys.wormholes : [];
    const wormHtml = wormArr.map(w => {
        const wh = (w || '').toLowerCase();
        let color = '#888', label = wh.charAt(0).toUpperCase();
        if (wh === 'alpha') { color = '#2196f3'; label = 'A'; }
        else if (wh === 'beta') { color = '#e91e63'; label = 'B'; }
        else if (wh === 'gamma') { color = '#ff9800'; label = 'G'; }
        else if (wh === 'delta') { color = '#4caf50'; label = 'D'; }
        return `<span style="color:${color};font-weight:bold;">${label}</span>`;
    }).join(' ');
    const effs = [];
    if (sys.isNebula) effs.push('☁️ Nebula');
    if (sys.isGravityRift) effs.push('🕳️ Gravity Rift');
    if (sys.isSupernova) effs.push('☀️ Supernova');
    if (sys.isAsteroidField) effs.push('🪨 Asteroid Field');
    const effectsSummary = effs.join(', ');
    const legend = (sys.planets || []).some(p => p.legendaryAbilityName) ? '⭐ Legendary' : '';

    // Layout: buttons top, image left, info right
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '12px';

    // Top button row
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '10px';
    btnRow.style.justifyContent = 'flex-start';
    btnRow.style.marginBottom = '2px';

    // Assign button
    const assignBtn = document.createElement('button');
    assignBtn.className = 'wizard-btn';
    assignBtn.textContent = 'Assign to map';
    assignBtn.onclick = () => {
        editor.pendingSystemId = sys.id.toString().toUpperCase();
        if (typeof window.updateSystemSelectionStatus === 'function') {
            window.updateSystemSelectionStatus(sys.id, sys.name);
        }
        // Do NOT close the popup after assigning
        if (typeof editor.setMode === 'function') editor.setMode('select');
        document.querySelectorAll('.btn-wormhole.active').forEach(btn => btn.classList.remove('active'));
        if (onAssign) onAssign();
    };
    btnRow.appendChild(assignBtn);

    // Random button
    const randomBtn = document.createElement('button');
    randomBtn.className = 'wizard-btn';
    randomBtn.textContent = 'Random';
    randomBtn.onclick = () => {
        // Use the same filter logic as the main random button
        const uniqueCheck = document.getElementById('randomUnique');
        const unique = uniqueCheck ? uniqueCheck.checked : true;
        let candidates;

        if (unique) {
            candidates = getActiveFilterPass(editor)
                .filter(s => !isRealIDUsed(s.id));
        } else {
            candidates = (Array.isArray(editor.allSystems) ? editor.allSystems : []).filter(sys =>
                FILTERS.every(({ key, test }) => {
                    const btn = document.getElementById(`filter-${key}`);
                    const active = btn?.dataset.active === 'true';
                    return test(sys, active);
                })
            );
        }

        if (!candidates.length) {
            alert('No tiles match the current filters!');
            return;
        }

        // Prevent immediate repeat
        let filtered = candidates;
        if (candidates.length > 1 && sys && sys.id) {
            filtered = candidates.filter(s => s.id !== sys.id);
            if (!filtered.length) filtered = candidates;
        }
        const newSys = filtered[Math.floor(Math.random() * filtered.length)];
        showRandomTilePopup(newSys, editor, onAssign);
    };
    btnRow.appendChild(randomBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'wizard-btn';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => hidePopup('random-tile-popup');
    btnRow.appendChild(closeBtn);

    wrapper.appendChild(btnRow);

    // Main content row: image left, info right, flush alignment
    const mainRow = document.createElement('div');
    mainRow.style.display = 'grid';
    mainRow.style.gridTemplateColumns = 'auto 1fr';
    mainRow.style.alignItems = 'start';
    mainRow.style.gap = '0px';
    mainRow.style.marginTop = '8px';

    // Image column
    const imgCol = document.createElement('div');
    imgCol.style.display = 'flex';
    imgCol.style.flexDirection = 'column';
    imgCol.style.alignItems = 'flex-start';
    imgCol.style.justifyContent = 'flex-start';
    imgCol.style.paddingRight = '18px';
    imgCol.id = 'randomTileImgContainer';
    if (sys.imagePath && sys.imagePath.trim()) {
        const img = new window.Image();
        img.src = `public/data/tiles/${sys.imagePath}`;
        img.style.width = '220px';
        img.style.maxWidth = '220px';
        img.style.maxHeight = '220px';
        img.style.margin = '0';
        img.style.borderRadius = '8px';
        img.onload = function () {
            imgCol.appendChild(img);
        };
        img.onerror = function () {
            // Don't show anything if image fails to load
            console.warn(`⚠️ Random tile image not found: ${img.src}`);
        };
    }

    // Info column
    const infoCol = document.createElement('div');
    infoCol.style.display = 'flex';
    infoCol.style.flexDirection = 'column';
    infoCol.style.justifyContent = 'flex-start';
    infoCol.style.gap = '8px';
    infoCol.style.alignItems = 'flex-start';
    infoCol.innerHTML = `
      <div style="font-size:18px;"><b>Tile:</b> <span style="color:#e4f">${sys.id}</span> – ${sys.name}</div>
      <div style="margin:7px 0;">${planetSummaries}</div>
      <div><b>Techs:</b> ${techHtml || '<span style="color:#888">None</span>'}</div>
      <div><b>Wormholes:</b> ${wormHtml || '<span style="color:#888">None</span>'}</div>
      <div><b>Effects:</b> ${effectsSummary || '<span style="color:#888">None</span>'}</div>
      <div>${legend}</div>
    `;

    mainRow.appendChild(imgCol);
    mainRow.appendChild(infoCol);
    wrapper.appendChild(mainRow);

    showPopup({
        id: 'random-tile-popup',
        className: 'random-tile-popup',
        content: wrapper,
        actions: [], // No footer actions, all buttons are at the top
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: '🎲 Random Tile',
        style: {
            minWidth: '380px',
            borderRadius: '12px',
            zIndex: 10004
        },
        showHelp: false
    });
}
