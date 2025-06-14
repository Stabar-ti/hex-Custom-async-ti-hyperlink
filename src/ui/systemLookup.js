// ui/systemLookup.js
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
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { assignSystem } from '../features/assignSystem.js';

export default async function initSystemLookup(editor) {
    // 1) load & stash system data
    await loadSystemInfo(editor);
    const systems = editor.allSystems || [];

    // 2) grab DOM refs
    const input = document.getElementById('systemSearch');
    const list = document.getElementById('systemList');
    const filtersContainer = document.getElementById('uiFiltersContainer');
    const genMapBtn = document.getElementById('genMapBtn');
    const jumpBtn = document.getElementById('jumpToSystemBtn');

    // 3) the master render function
    function renderList(items = systems) {
        list.innerHTML = '';
        items.forEach(s => {
            const planetSummaries = (s.planets || [])
                .map((p, i) => `p${i + 1} ${p.resources}/${p.influence}`)
                .join(' ');
            const rawW = s.wormholes || [];
            const wormSummary = rawW.length
                ? `w(${rawW.filter(Boolean).map(w => ("" + w).toLowerCase()).join(',')})`
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
            const extras = [
                planetSummaries,
                wormSummary,
                techSummary,
                effectsSummary,
                legend
            ].filter(x => x).join(' | ');

            const li = document.createElement('li');
            if (isRealIDUsed(s.id)) li.classList.add('used');
            li.textContent = `${s.id} — ${s.name || ''}${extras ? ' — ' + extras : ''}`;
li.addEventListener('click', () => {
    editor.pendingSystemId = s.id.toString().toUpperCase(); // Use uppercase for all IDs
    markRealIDUsed(s.id);
    showModal('systemLookupModal', false);
    // Tell the user to click a hex!
    //alert('Now click a hex to assign system ' + s.id + ' – ' + s.name);
});
            list.appendChild(li);
        });
    }

    // 4) expose it globally so refreshSystemList() can see it
    window.renderSystemList = renderList;

    // 5) “Open lookup” button
    jumpBtn?.addEventListener('click', () => {
        showModal('systemLookupModal', true);
        input.value = '';
        renderList(systems);
        filtersContainer.innerHTML = '';
        initFilters(filtersContainer, editor, renderList);
        input.focus();
    });

    // 6) live text search + fold‐out filters
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

    // 7) when you “Generate Map”, clear all used‐ID flags
    genMapBtn?.addEventListener('click', () => {
        Array.from(usedRealIDs).forEach(id => unmarkRealIDUsed(id));
        // also re‐render if your lookup is open
        if (document.getElementById('systemLookupModal')?.classList.contains('open')) {
            refreshSystemList();
        }
    });
}

// 8) your public refresh function
//    this will re‐draw whatever passed your filters + current text search
export function refreshSystemList() {
    const items = getActiveFilterPass(window.editor);
    window.renderSystemList(items);
}

// 9) kick it off once the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    initSystemLookup(window.editor);
});
