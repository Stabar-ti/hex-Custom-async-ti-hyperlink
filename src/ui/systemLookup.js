// ───────────────────────────────────────────────────────────────
// ui/systemLookup.js
//
// This module provides the system lookup modal: a searchable and
// filterable list for choosing TI4 systems by ID or attributes.
// It wires up the modal for searching, filtering, and selection
// (with only one system assigned per map), and ensures the UI
// reflects current assignments. All search/filter logic is in one place.
// ───────────────────────────────────────────────────────────────

import { showModal } from './uiModals.js';
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
// Add this to re-use filter logic for non-unique mode:
import { FILTERS } from './uiFilters.js';
import { makePopupDraggable } from './uiUtils.js';
import { showPopup, hidePopup } from './popupUI.js';
//import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
//import { assignSystem } from '../features/assignSystem.js';

/**
 * Initializes the system lookup modal, attaches all handlers, and
 * wires up filters, search, and result rendering.
 * Should be called with the active HexEditor instance.
 */
export default async function initSystemLookup(editor) {
    // 1) Load system data (names, planets, IDs, etc.)
    await loadSystemInfo(editor);
    const systems = editor.allSystems || [];

    // 2) Grab UI elements: search input, results list, filters, map button, modal button
    const input = document.getElementById('systemSearch');
    const list = document.getElementById('systemList');
    const filtersContainer = document.getElementById('uiFiltersContainer');
    const genMapBtn = document.getElementById('genMapBtn');
    const jumpBtn = document.getElementById('jumpToSystemBtn');

    // --- Add Random Tile UI ---
    const randomDiv = document.createElement('div');
    randomDiv.style.margin = '12px 0 10px 0';
    randomDiv.style.display = 'flex';
    randomDiv.style.alignItems = 'center';

    const uniqueCheck = document.createElement('input');
    uniqueCheck.type = 'checkbox';
    uniqueCheck.id = 'randomUnique';
    uniqueCheck.checked = true;
    uniqueCheck.style.marginRight = '6px';
    const uniqueLabel = document.createElement('label');
    uniqueLabel.htmlFor = 'randomUnique';
    uniqueLabel.textContent = 'Unique';

    const randomBtn = document.createElement('button');
    randomBtn.id = 'randomTileBtn';
    randomBtn.textContent = '🎲 DJWizzy Random Tile Bonanza';
    randomBtn.style.marginLeft = '12px';

    randomDiv.appendChild(uniqueCheck);
    randomDiv.appendChild(uniqueLabel);
    randomDiv.appendChild(randomBtn);

    // Place BELOW the filters
    filtersContainer.parentNode.insertBefore(randomDiv, filtersContainer.nextSibling);

    // 3) Main list rendering function: show systems in the <ul>
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

    // New renderList function
    function renderList(items = systems) {
        list.innerHTML = '';

        // Set up the floating preview popup once
        let tilePreview = document.getElementById('tilePreviewPopup');
        if (!tilePreview) {
            tilePreview = document.createElement('div');
            tilePreview.id = 'tilePreviewPopup';
            document.body.appendChild(tilePreview);
        }
        tilePreview.style.display = 'none';
        let hoverTimeout = null;

        // Build table header
        const table = document.createElement('table');
        table.className = 'system-table';
        table.innerHTML = `<thead>
        <tr>
            <th>Tile</th>
            <th>ID</th>
            <th>Name</th>
            <th>Planets</th>
            <th>Techs</th>
            <th>Worms</th>
            <th>Eff</th>
            <th>L</th>
        </tr>
    </thead>`;

        const tbody = document.createElement('tbody');

        items.forEach(s => {
            // Only use image if it is non-empty and exists
            const hasImage = !!(s.imagePath && s.imagePath.trim());
            const smallImgSrc = hasImage ? `public/data/tiles/${s.imagePath}` : '';

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
            if (isRealIDUsed(s.id)) tr.classList.add('used');
            tr.innerHTML = `
            <td>
                ${hasImage ? `<img src="${smallImgSrc}" class="tile-thumb" loading="lazy" style="width:32px; height:28px;" onerror="this.style.display='none'" />` : ''}
            </td>
            <td><b>${s.id}</b></td>
            <td>${s.name || ''}</td>
            <td>${planetSummaries}</td>
            <td>${techHtml}</td>
            <td>${wormHtml}</td>
            <td>${effectsSummary}</td>
            <td>${legend}</td>
        `;

            // --- Hover preview logic for image (if exists) ---
            if (hasImage) {
                const img = tr.querySelector('img.tile-thumb');
                tr.addEventListener('mouseenter', e => {
                    hoverTimeout = setTimeout(() => {
                        // Try loading the image, only show if successful
                        const previewImg = new window.Image();
                        previewImg.src = smallImgSrc;
                        previewImg.style.maxWidth = '120px';
                        previewImg.style.maxHeight = '120px';
                        previewImg.onload = () => {
                            tilePreview.innerHTML = '';
                            tilePreview.appendChild(previewImg);
                            tilePreview.style.display = 'block';
                            const rect = tr.getBoundingClientRect();
                            tilePreview.style.left = (rect.right + 12) + 'px';
                            tilePreview.style.top = (rect.top - 8) + 'px';
                        };
                        previewImg.onerror = () => {
                            tilePreview.style.display = 'none';
                            tilePreview.innerHTML = '';
                        };
                    }, 500);
                });
                tr.addEventListener('mouseleave', e => {
                    clearTimeout(hoverTimeout);
                    tilePreview.style.display = 'none';
                    tilePreview.innerHTML = '';
                });
            }


            tr.addEventListener('click', () => {
                editor.pendingSystemId = s.id.toString().toUpperCase();
                showModal('systemLookupModal', false);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        list.appendChild(table);
    }

    // 4) Expose the render function globally for filter/search refresh
    window.renderSystemList = renderList;

    // 5) When the "Async Tiles" (jump) button is pressed, show modal & filter bar
    jumpBtn?.addEventListener('click', () => {
        showModal('systemLookupModal', true);
        input.value = '';
        renderList(systems); // Show all systems initially
        filtersContainer.innerHTML = '';
        initFilters(filtersContainer, editor, renderList); // Build filter buttons
        input.focus();
    });

    // 6) Live text search and filters: filter as user types
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
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

    let lastRandom = null;
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

    uniqueCheck.addEventListener('change', () => { lastRandom = null; });

    // 7) When generating a new map, clear all "used" system IDs
    genMapBtn?.addEventListener('click', () => {
        Array.from(usedRealIDs).forEach(id => unmarkRealIDUsed(id));
        if (document.getElementById('systemLookupModal')?.classList.contains('open')) {
            refreshSystemList();
        }
    });
}

// 8) Exported: Forces the system list to be re-filtered and re-rendered.
export function refreshSystemList() {
    const items = getActiveFilterPass(window.editor);
    window.renderSystemList(items);
}

// 9) When the page is ready, initialize the system lookup modal.
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
    // Only show the image if it actually loads!
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
        // If the image fails to load, do nothing (no broken icon).
    }
    const actions = [
        {
            label: 'Assign to map',
            action: () => {
                editor.pendingSystemId = sys.id.toString().toUpperCase();
                hidePopup('random-tile-popup');
                showModal('systemLookupModal', false);
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
