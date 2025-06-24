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
    function renderList(items = systems) {
        list.innerHTML = '';
        items.forEach(s => {
            // Compose planet/resource summary, wormhole codes, tech specialties, effects, legendary
            const planetSummaries = (s.planets || [])
                .map((p, i) => `p${i + 1} ${p.resources}/${p.influence}`)
                .join(' ');
            //   const rawW = s.wormholes || [];
            const rawW = Array.isArray(s.wormholes) ? s.wormholes : [];
            const wormSummary = rawW.filter(w => typeof w === "string" && w.length > 0).length
                ? `w(${rawW.filter(w => typeof w === "string" && w.length > 0).map(w => w.toLowerCase()).join(',')})`
                : '';
            const techs = Array.from(new Set(
                (s.planets || []).flatMap(p => p.techSpecialties || [])
            ));
            const techSummary = techs.join(', ');
            const effs = [];
            if (s.isNebula) effs.push('Nebula');
            if (s.isGravityRift) effs.push('Rift');
            if (s.isSupernova) effs.push('Supernova');
            if (s.isAsteroidField) effs.push('Asteroids');
            const effectsSummary = effs.join(', ');
            const legend = (s.planets || []).some(p => p.legendaryAbilityName)
                ? 'Legendary' : '';
            // Collect all non-empty summaries with a divider
            const extras = [
                planetSummaries,
                wormSummary,
                techSummary,
                effectsSummary,
                legend
            ].filter(x => x).join(' | ');

            // Build the <li> for this system
            const li = document.createElement('li');
            // Visually mark as "used" if already assigned on map
            if (isRealIDUsed(s.id)) li.classList.add('used');
            li.textContent = `${s.id} — ${s.name || ''}${extras ? ' — ' + extras : ''}`;

            // When clicked: prepare to assign this system, mark as used, and show modal
            li.addEventListener('click', () => {
                editor.pendingSystemId = s.id.toString().toUpperCase();
                //markRealIDUsed(s.id);
                showModal('systemLookupModal', false);
                // (User then clicks a hex to assign)
            });
            list.appendChild(li);
        });
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
            toShow = toShow.filter(s =>
                s.id.toString().includes(term) ||
                (s.name || '').toLowerCase().includes(term)
            );
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
