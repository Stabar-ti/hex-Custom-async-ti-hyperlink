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
    usedRealIDs
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

    // Sorting state
    let sortColumn = null;
    let sortDirection = 'asc';

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

        // Build table header with sortable columns
        const table = document.createElement('table');
        table.className = 'system-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '12px';
        table.style.tableLayout = 'auto'; // Allow columns to resize based on content
        
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.background = '#444';
        headerRow.style.position = 'sticky';
        headerRow.style.top = '0';

        // Define sortable columns
        const columns = [
            { key: null, label: 'Tile', width: '60px', sortable: false },
            { key: 'id', label: 'ID', width: '70px', sortable: true },
            { key: 'name', label: 'Name', width: 'auto', sortable: true },
            { key: 'planets', label: 'Planets', width: '100px', sortable: true },
            { key: 'techs', label: 'Techs', width: '80px', sortable: true },
            { key: 'worms', label: 'Worms', width: '80px', sortable: true },
            { key: 'effects', label: 'Eff', width: '80px', sortable: true },
            { key: 'legendary', label: 'L', width: '40px', sortable: true }
        ];

        columns.forEach(col => {
            const th = document.createElement('th');
            th.style.padding = '8px';
            th.style.border = '1px solid #555';
            th.style.textAlign = col.key === 'name' ? 'left' : 'center';
            th.style.width = col.width;
            th.style.minWidth = col.width === 'auto' ? '120px' : '40px';
            
            if (col.sortable) {
                th.style.cursor = 'pointer';
                th.style.userSelect = 'none';
                th.title = `Click to sort by ${col.label}`;
                
                const sortIndicator = sortColumn === col.key ? 
                    (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ▽';
                th.innerHTML = col.label + sortIndicator;
                
                th.addEventListener('click', () => {
                    if (sortColumn === col.key) {
                        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortColumn = col.key;
                        sortDirection = 'asc';
                    }
                    
                    // Sort the items
                    const sortedItems = [...items].sort((a, b) => {
                        let valueA, valueB;
                        
                        switch (col.key) {
                            case 'id':
                                valueA = a.id.toString().toLowerCase();
                                valueB = b.id.toString().toLowerCase();
                                break;
                            case 'name':
                                valueA = (a.name || '').toLowerCase();
                                valueB = (b.name || '').toLowerCase();
                                break;
                            case 'planets':
                                // Sort by total planet count, then by total resources + influence
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
                            case 'techs':
                                // Sort by number of tech specialties, then by type priority
                                const techsA = Array.from(new Set((a.planets || []).flatMap(p => p.techSpecialties || [])));
                                const techsB = Array.from(new Set((b.planets || []).flatMap(p => p.techSpecialties || [])));
                                const techPriority = { 'WARFARE': 1, 'PROPULSION': 2, 'CYBERNETIC': 3, 'BIOTIC': 4 };
                                
                                if (techsA.length !== techsB.length) {
                                    valueA = techsA.length;
                                    valueB = techsB.length;
                                } else {
                                    // Same count, sort by tech type priority (combined priority score)
                                    const priorityA = techsA.reduce((sum, tech) => sum + (techPriority[tech?.toUpperCase()] || 5), 0);
                                    const priorityB = techsB.reduce((sum, tech) => sum + (techPriority[tech?.toUpperCase()] || 5), 0);
                                    valueA = priorityA;
                                    valueB = priorityB;
                                }
                                break;
                            case 'worms':
                                // Sort by number of wormholes, then by type priority
                                const wormsA = Array.isArray(a.wormholes) ? a.wormholes : [];
                                const wormsB = Array.isArray(b.wormholes) ? b.wormholes : [];
                                const wormPriority = { 'alpha': 1, 'beta': 2, 'gamma': 3, 'delta': 4 };
                                
                                if (wormsA.length !== wormsB.length) {
                                    valueA = wormsA.length;
                                    valueB = wormsB.length;
                                } else {
                                    // Same count, sort by wormhole type priority
                                    const priorityA = wormsA.reduce((sum, worm) => sum + (wormPriority[worm?.toLowerCase()] || 5), 0);
                                    const priorityB = wormsB.reduce((sum, worm) => sum + (wormPriority[worm?.toLowerCase()] || 5), 0);
                                    valueA = priorityA;
                                    valueB = priorityB;
                                }
                                break;
                            case 'effects':
                                // Sort by number of effects, then by type priority
                                let effectsA = [];
                                let effectsB = [];
                                if (a.isNebula) effectsA.push('nebula');
                                if (a.isGravityRift) effectsA.push('gravity');
                                if (a.isSupernova) effectsA.push('supernova');
                                if (a.isAsteroidField) effectsA.push('asteroid');
                                if (b.isNebula) effectsB.push('nebula');
                                if (b.isGravityRift) effectsB.push('gravity');
                                if (b.isSupernova) effectsB.push('supernova');
                                if (b.isAsteroidField) effectsB.push('asteroid');
                                
                                const effectPriority = { 'supernova': 1, 'gravity': 2, 'nebula': 3, 'asteroid': 4 };
                                
                                if (effectsA.length !== effectsB.length) {
                                    valueA = effectsA.length;
                                    valueB = effectsB.length;
                                } else {
                                    // Same count, sort by effect type priority
                                    const priorityA = effectsA.reduce((sum, effect) => sum + (effectPriority[effect] || 5), 0);
                                    const priorityB = effectsB.reduce((sum, effect) => sum + (effectPriority[effect] || 5), 0);
                                    valueA = priorityA;
                                    valueB = priorityB;
                                }
                                break;
                            case 'legendary':
                                valueA = (a.planets || []).some(p => p.legendaryAbilityName) ? 1 : 0;
                                valueB = (b.planets || []).some(p => p.legendaryAbilityName) ? 1 : 0;
                                break;
                            default:
                                return 0;
                        }
                        
                        let result = 0;
                        if (valueA < valueB) result = -1;
                        else if (valueA > valueB) result = 1;
                        
                        return sortDirection === 'desc' ? -result : result;
                    });
                    
                    // Re-render with sorted items
                    renderList(sortedItems);
                });
            } else {
                th.textContent = col.label;
            }
            
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        items.forEach(s => {
            // Only use image if it is non-empty and exists (and hasn't failed before)
            const hasImage = !!(s.imagePath && s.imagePath.trim());
            const smallImgSrc = hasImage ? `public/data/tiles/${s.imagePath}` : '';
            const imageAlreadyFailed = failedImages.has(smallImgSrc);

            // Planets, techs, worms, etc (as in your existing code)
            const planetSummaries = (s.planets || [])
                .map((p, i) => `${p.resources}/${p.influence}`).join(' ');

            const techsArr = Array.from(new Set(
                (s.planets || []).flatMap(p => p.techSpecialties || [])
            ));
            const techHtml = techsArr.map(t => {
                const tcc = getTechLetterColor(t);
                return tcc
                    ? `<span style="color:${tcc.c}; font-weight:bold;">${tcc.l}</span>`
                    : '';
            }).join(' ');

            const wormArr = Array.isArray(s.wormholes) ? s.wormholes : [];
            const wormHtml = wormArr.map(w => {
                const whc = getWormholeCharColor(w);
                return whc
                    ? `<span style="color:${whc.c}; font-weight:bold;">${whc.ch}</span>`
                    : '';
            }).join(' ');

            const effs = [];
            if (s.isNebula) effs.push('☁️');
            if (s.isGravityRift) effs.push('🕳️');
            if (s.isSupernova) effs.push('☀️');
            if (s.isAsteroidField) effs.push('🪨');
            const effectsSummary = effs.join(' ');

            const legend = (s.planets || []).some(p => p.legendaryAbilityName) ? '⭐' : '';

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.border = '1px solid #555';
            
            // Check if this system is currently selected
            const isCurrentlySelected = currentlySelectedSystemId && s.id.toString().toUpperCase() === currentlySelectedSystemId.toString().toUpperCase();
            
            if (isRealIDUsed(s.id)) {
                tr.classList.add('used');
                tr.style.background = '#522';
            } else if (isCurrentlySelected) {
                // Apply selected styling
                tr.classList.add('selected');
                tr.style.backgroundColor = '#3a5a3a';
                // Don't add hover events for selected rows
            } else {
                // Add hover events only for non-selected, non-used rows
                const mouseEnterHandler = () => {
                    if (!tr.classList.contains('selected')) {
                        tr.style.background = '#444';
                    }
                };
                const mouseLeaveHandler = () => {
                    if (!tr.classList.contains('selected')) {
                        tr.style.background = '';
                    }
                };
                tr.addEventListener('mouseenter', mouseEnterHandler);
                tr.addEventListener('mouseleave', mouseLeaveHandler);
            }

            tr.innerHTML = `
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 60px; min-width: 50px;">
                ${hasImage && !imageAlreadyFailed ? `<img src="${smallImgSrc}" class="tile-thumb" loading="lazy" style="width:32px; height:28px;" />` : ''}
            </td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 70px; min-width: 40px;"><b>${s.id}</b></td>
            <td style="padding: 4px; border: 1px solid #555; text-align: left; min-width: 120px; word-wrap: break-word;">${s.name || ''}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 100px; min-width: 40px; font-size: 11px;">${planetSummaries}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 40px;">${techHtml}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 40px;">${wormHtml}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 40px;">${effectsSummary}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 40px; min-width: 20px;">${legend}</td>
        `;

            // Helper function to add image preview handlers
            function addImagePreviewHandlers(element) {
                if (hasImage && !imageAlreadyFailed) {
                    element.addEventListener('mouseenter', e => {
                        hoverTimeout = setTimeout(() => {
                            // Skip if we've already determined this image fails
                            if (failedImages.has(smallImgSrc)) return;

                            // Try loading the image, only show if successful
                            const previewImg = new window.Image();
                            previewImg.src = smallImgSrc;
                            previewImg.style.maxWidth = '220px';
                            previewImg.style.maxHeight = '220px';
                            previewImg.onload = () => {
                                tilePreview.innerHTML = '';
                                tilePreview.appendChild(previewImg);
                                tilePreview.style.display = 'block';
                                // Position 10px to the right of mouse pointer
                                tilePreview.style.left = (e.clientX + 10) + 'px';
                                tilePreview.style.top = e.clientY + 'px';
                            };
                            previewImg.onerror = () => {
                                // Mark this image as failed to prevent future attempts
                                failedImages.add(smallImgSrc);
                                tilePreview.style.display = 'none';
                                tilePreview.innerHTML = '';
                                console.warn(`⚠️ Image not found: ${smallImgSrc}`);
                            };
                        }, 500);
                    });

                    // Update position on mouse move within the row
                    element.addEventListener('mousemove', e => {
                        if (tilePreview.style.display === 'block') {
                            tilePreview.style.left = (e.clientX + 10) + 'px';
                            tilePreview.style.top = e.clientY + 'px';
                        }
                    });

                    element.addEventListener('mouseleave', e => {
                        clearTimeout(hoverTimeout);
                        tilePreview.style.display = 'none';
                        tilePreview.innerHTML = '';
                    });
                }
            }

            // Handle image loading errors for the thumbnail in the table
            if (hasImage && !imageAlreadyFailed) {
                const thumbImg = tr.querySelector('.tile-thumb');
                if (thumbImg) {
                    thumbImg.onerror = () => {
                        failedImages.add(smallImgSrc);
                        thumbImg.style.display = 'none';
                        console.warn(`⚠️ Thumbnail image not found: ${smallImgSrc}`);
                    };
                }
            }

            // Add image preview handlers
            addImagePreviewHandlers(tr);

            tr.addEventListener('click', () => {
                editor.pendingSystemId = s.id.toString().toUpperCase();

                // Clear previous selections and restore hover events
                document.querySelectorAll('.system-table tr.selected').forEach(row => {
                    row.classList.remove('selected');
                    row.style.backgroundColor = '';
                    
                    // Re-add hover events for previously selected rows that aren't used
                    const systemId = row.querySelector('td:nth-child(2) b')?.textContent;
                    if (systemId && !isRealIDUsed(systemId)) {
                        const mouseEnterHandler = () => {
                            if (!row.classList.contains('selected')) {
                                row.style.background = '#444';
                            }
                        };
                        const mouseLeaveHandler = () => {
                            if (!row.classList.contains('selected')) {
                                row.style.background = '';
                            }
                        };
                        row.addEventListener('mouseenter', mouseEnterHandler);
                        row.addEventListener('mouseleave', mouseLeaveHandler);
                    }
                });

                // Apply selection to current row
                tr.classList.add('selected');
                tr.style.backgroundColor = '#3a5a3a';
                
                // Remove all event listeners from the selected row to prevent hover effects
                const newTr = tr.cloneNode(true);
                tr.parentNode.replaceChild(newTr, tr);
                
                // Re-add image preview handlers to the new row
                addImagePreviewHandlers(newTr);
                
                // Re-add image error handling to the new row
                if (hasImage && !imageAlreadyFailed) {
                    const thumbImg = newTr.querySelector('.tile-thumb');
                    if (thumbImg) {
                        thumbImg.onerror = () => {
                            failedImages.add(smallImgSrc);
                            thumbImg.style.display = 'none';
                            console.warn(`⚠️ Thumbnail image not found: ${smallImgSrc}`);
                        };
                    }
                }
                
                // Re-add only the click event to the new row
                newTr.addEventListener('click', () => {
                    // Same click logic - allow re-selection
                    editor.pendingSystemId = s.id.toString().toUpperCase();
                    if (typeof window.updateSystemSelectionStatus === 'function') {
                        window.updateSystemSelectionStatus(s.id, s.name);
                    }
                    console.log(`📋 System ${s.id} (${s.name}) ready to place. Click on a hex to assign it.`);
                    if (typeof editor.setMode === 'function') editor.setMode('select');
                    document.querySelectorAll('.btn-wormhole.active').forEach(btn => btn.classList.remove('active'));
                });

                // Update status indicator
                if (typeof window.updateSystemSelectionStatus === 'function') {
                    window.updateSystemSelectionStatus(s.id, s.name);
                }

                console.log(`📋 System ${s.id} (${s.name}) ready to place. Click on a hex to assign it.`);

                // Don't close the popup - let users select multiple systems quickly!
                // hidePopup('system-lookup-popup'); // <- Removed this line
                // --- Fix: Reset mode to prevent spurious wormhole overlays ---
                if (typeof editor.setMode === 'function') editor.setMode('select');
                // Remove 'active' from wormhole tool buttons (if any)
                document.querySelectorAll('.btn-wormhole.active').forEach(btn => btn.classList.remove('active'));
            });
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        systemList.appendChild(table);

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
                const items = getActiveFilterPass(editor);
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
    const items = getActiveFilterPass(window.editor);
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
