// ───────────────────────────────────────────────────────────────
// ui/systemLookup.js
//
// This module provides the system lookup popup: a searchable and
// filterable list for choosing TI4 systems by ID or attributes.
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

        // Add debug info at the top (removable later)
        const debugInfo = document.createElement('div');
        debugInfo.style.background = '#2a4a2a';
        debugInfo.style.border = '1px solid #4a6a4a';
        debugInfo.style.borderRadius = '4px';
        debugInfo.style.padding = '8px';
        debugInfo.style.marginBottom = '8px';
        debugInfo.style.fontSize = '12px';
        debugInfo.style.color = '#afa';
        debugInfo.innerHTML = `
            <strong>🧪 Debug Info:</strong> 
            Systems loaded: ${systems.length} | 
            Editor: ${editor ? '✅' : '❌'} | 
            Filters: ${FILTERS.length} | 
            PopupUI: ${typeof showPopup === 'function' ? '✅' : '❌'}
            <button id="removeDebugInfo" style="float: right; font-size: 10px; padding: 2px 6px;">Remove</button>
        `;
        content.appendChild(debugInfo);

        // Remove debug info button handler
        debugInfo.querySelector('#removeDebugInfo').addEventListener('click', () => {
            debugInfo.remove();
        });

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
        resultsContainer.style.flex = '1 1 0'; // Take remaining space but allow shrinking to 0
        resultsContainer.style.overflow = 'auto';
        resultsContainer.style.border = '1px solid #555';
        resultsContainer.style.borderRadius = '4px';
        resultsContainer.style.minHeight = '150px'; // Reduced minimum height
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
            style: {
                width: '800px',
                height: '600px',
                minWidth: '600px',
                minHeight: '400px',
                maxWidth: '95vw',
                maxHeight: '90vh',
                zIndex: 10003,
                resize: 'both', // Allow manual resizing
                overflow: 'hidden' // Prevent content from spilling out
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

        // Build table header
        const table = document.createElement('table');
        table.className = 'system-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '12px';
        table.style.tableLayout = 'auto'; // Allow columns to resize based on content
        table.innerHTML = `<thead>
        <tr style="background: #444; position: sticky; top: 0;">
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 60px; min-width: 50px;">Tile</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 70px; min-width: 60px;">ID</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: left; min-width: 120px;">Name</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 100px; min-width: 80px;">Planets</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">Techs</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">Worms</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">Eff</th>
            <th style="padding: 8px; border: 1px solid #555; text-align: center; width: 40px; min-width: 30px;">L</th>
        </tr>
    </thead>`;

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
            if (isRealIDUsed(s.id)) {
                tr.classList.add('used');
                tr.style.background = '#522';
            } else {
                tr.addEventListener('mouseenter', () => tr.style.background = '#444');
                tr.addEventListener('mouseleave', () => tr.style.background = '');
            }
            
            tr.innerHTML = `
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 60px; min-width: 50px;">
                ${hasImage && !imageAlreadyFailed ? `<img src="${smallImgSrc}" class="tile-thumb" loading="lazy" style="width:32px; height:28px;" />` : ''}
            </td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 70px; min-width: 60px;"><b>${s.id}</b></td>
            <td style="padding: 4px; border: 1px solid #555; text-align: left; min-width: 120px; word-wrap: break-word;">${s.name || ''}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 100px; min-width: 80px; font-size: 11px;">${planetSummaries}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">${techHtml}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">${wormHtml}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 80px; min-width: 60px;">${effectsSummary}</td>
            <td style="padding: 4px; border: 1px solid #555; text-align: center; width: 40px; min-width: 30px;">${legend}</td>
        `;

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

            // --- Hover preview logic for image (if exists and hasn't failed) ---
            if (hasImage && !imageAlreadyFailed) {
                tr.addEventListener('mouseenter', e => {
                    hoverTimeout = setTimeout(() => {
                        // Skip if we've already determined this image fails
                        if (failedImages.has(smallImgSrc)) return;
                        
                        // Try loading the image, only show if successful
                        const previewImg = new window.Image();
                        previewImg.src = smallImgSrc;
                        previewImg.style.maxWidth = '120px';
                        previewImg.style.maxHeight = '120px';
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
                tr.addEventListener('mousemove', e => {
                    if (tilePreview.style.display === 'block') {
                        tilePreview.style.left = (e.clientX + 10) + 'px';
                        tilePreview.style.top = e.clientY + 'px';
                    }
                });
                
                tr.addEventListener('mouseleave', e => {
                    clearTimeout(hoverTimeout);
                    tilePreview.style.display = 'none';
                    tilePreview.innerHTML = '';
                });
            }

            tr.addEventListener('click', () => {
                editor.pendingSystemId = s.id.toString().toUpperCase();
                
                // Add visual feedback for the selected system
                document.querySelectorAll('.system-table tr.selected').forEach(row => {
                    row.classList.remove('selected');
                    row.style.backgroundColor = '';
                });
                tr.classList.add('selected');
                tr.style.backgroundColor = '#3a5a3a';
                
                // Update status indicator
                if (typeof window.updateSystemSelectionStatus === 'function') {
                    window.updateSystemSelectionStatus(s.id, s.name);
                }
                
                console.log(`📋 System ${s.id} (${s.name}) ready to place. Click on a hex to assign it.`);
                
                // Don't close the popup - let users select multiple systems quickly!
                // hidePopup('system-lookup-popup'); // <- Removed this line
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
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div style="font-size:18px;"><b>Tile:</b> <span style="color:#e4f">${sys.id}</span> – ${sys.name}</div>
      <div id="randomTileImgContainer"></div>
      <div style="margin:7px 0;">${(sys.planets || []).map(p => `${p.name || ''} (${p.resources}/${p.influence})`).join('<br>')}</div>
    `;
    // Only show the image if it actually loads and handle errors gracefully!
    const imgContainer = wrapper.querySelector('#randomTileImgContainer');
    if (sys.imagePath && sys.imagePath.trim()) {
        const img = new window.Image();
        img.src = `public/data/tiles/${sys.imagePath}`;
        img.style.width = '92px';
        img.style.margin = '12px 0';
        img.style.borderRadius = '8px';
        img.onload = function () {
            imgContainer.appendChild(img);
        };
        img.onerror = function () {
            // Don't show anything if image fails to load
            console.warn(`⚠️ Random tile image not found: ${img.src}`);
        };
    }
    const actions = [
        {
            label: 'Assign to map',
            action: () => {
                editor.pendingSystemId = sys.id.toString().toUpperCase();
                
                // Update status in main popup if it's open
                if (typeof window.updateSystemSelectionStatus === 'function') {
                    window.updateSystemSelectionStatus(sys.id, sys.name);
                }
                
                hidePopup('random-tile-popup');
                // Don't close the main lookup popup - let it stay open for more selections
                // hidePopup('system-lookup-popup');
                if (onAssign) onAssign();
            }
        },
        {
            label: 'Close',
            action: () => hidePopup('random-tile-popup')
        }
    ];
    showPopup({
        id: 'random-tile-popup',
        className: 'random-tile-popup',
        content: wrapper,
        actions,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: '🎲 Random Tile',
        style: {
            minWidth: '280px',
            borderRadius: '12px',
            zIndex: 10004
        },
        showHelp: false
    });
}
