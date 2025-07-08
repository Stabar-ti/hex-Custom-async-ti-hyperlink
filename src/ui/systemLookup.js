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

    // 3) Main list rendering function: show systems in the <ul>
    function getTechLetterColor(tech) {
        // Map tech specialty to {letter, color}
        switch ((tech || '').toUpperCase()) {
            case 'CYBERNETIC': return { l: 'Y', c: techSpecialtyColors.CYBERNETIC || '#FFD700' };
            case 'BIOTIC': return { l: 'G', c: techSpecialtyColors.BIOTIC || 'green' };
            case 'WARFARE': return { l: 'R', c: techSpecialtyColors.WARFARE || 'red' };
            case 'PROPULSION': return { l: 'B', c: techSpecialtyColors.PROPULSION || '#00BFFF' };
            default: return null;
        }
    }

    function getWormholeCharColor(worm) {
        // Map wormhole type to {char, color}
        const w = (worm || '').toLowerCase();
        const info = wormholeTypes[w];
        if (!info) return null;
        // Use first character of label as symbol
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
            // Thumbnail src (ensure safe fallback)
            const smallImgSrc = s.imagePath
                ? `public/data/tiles/${s.imagePath}`
                : '';

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
                ${smallImgSrc ? `<img src="${smallImgSrc}" class="tile-thumb" loading="lazy" style="width:32px; height:28px;" />` : ''}
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
            if (smallImgSrc) {
                const img = tr.querySelector('img.tile-thumb');
                let latestHoverToken = {};
                tr.addEventListener('mouseenter', e => {
                    // Begin the timer for 2s delayed popup
                    hoverTimeout = setTimeout(() => {
                        tilePreview.innerHTML = `<img src="${smallImgSrc}" alt="tile preview" />`;
                        tilePreview.style.display = 'block';
                        // Position right of row, or fallback near cursor
                        const rect = tr.getBoundingClientRect();
                        tilePreview.style.left = (rect.right + 12) + 'px';
                        tilePreview.style.top = (rect.top - 8) + 'px';
                    }, 500);
                });
                tr.addEventListener('mouseleave', e => {
                    clearTimeout(hoverTimeout);
                    tilePreview.style.display = 'none';
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
                    // Remove all non-digits from ID for numeric search
                    const idDigits = id.replace(/\D/g, '');
                    return id.includes(term) || idDigits.includes(term) || name.includes(term);
                }

                // Otherwise, behave as normal: substring match on ID or name
                return id.includes(term) || name.includes(term);
            });
        }

        renderList(toShow);
    });

    // 7) When generating a new map, clear all "used" system IDs
    genMapBtn?.addEventListener('click', () => {
        Array.from(usedRealIDs).forEach(id => unmarkRealIDUsed(id));
        // If the lookup modal is open, refresh its results
        if (document.getElementById('systemLookupModal')?.classList.contains('open')) {
            refreshSystemList();
        }
    });
}

// 8) Exported: Forces the system list to be re-filtered and re-rendered.
// Used by other modules to ensure current assignment/search/filter state is visible.
export function refreshSystemList() {
    const items = getActiveFilterPass(window.editor);
    window.renderSystemList(items);
}

// 9) When the page is ready, initialize the system lookup modal.
window.addEventListener('DOMContentLoaded', () => {
    initSystemLookup(window.editor);
});
