/**
 * The random tile popup — big art, one tile at a time, roll again or place it.
 *
 * Kept as its own popup rather than folded into the results pane: it is a deliberately
 * theatrical one-at-a-time flow and it wants the space. What changed is where its
 * candidates come from. It used to re-derive the filter set twice more from the DOM
 * buttons (systemLookup.js:283 and :909), which is how it drifted out of step with the
 * list it was supposedly drawing from. It now takes the picker's current results.
 *
 * "No tiles match" used to be an alert(). It is a line of text in the popup now.
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { isRealIDUsed } from '../../ui/uiFilters.js';
import { tileImage, techBadges, wormholeBadges, anomalyTitle, effectiveText, legendaryPlanet } from './pickerCells.js';
import { totalResources, totalInfluence } from './pickerModel.js';
import * as state from './pickerState.js';

const POPUP_ID = 'system-picker-random';

let lastRolled = null;

/**
 * @param {object} editor
 * @param {object[]} candidates the picker's current results — what you can see is what
 *                              you can roll, which was not true before
 */
export function showRandomTilePopup(editor, candidates) {
    hidePopup(POPUP_ID);

    const content = document.createElement('div');
    content.className = 'sp-random';

    const body = document.createElement('div');
    body.className = 'sp-random-body';
    content.appendChild(body);

    const controls = document.createElement('div');
    controls.className = 'sp-random-controls';

    const uniqueWrap = document.createElement('label');
    uniqueWrap.className = 'sp-random-unique';
    const unique = document.createElement('input');
    unique.type = 'checkbox';
    unique.checked = true;
    unique.title = 'Only roll tiles that are not already on the map';
    uniqueWrap.appendChild(unique);
    uniqueWrap.append(' Unplaced only');
    controls.appendChild(uniqueWrap);

    const rollBtn = document.createElement('button');
    rollBtn.type = 'button';
    rollBtn.className = 'sp-addbtn';
    rollBtn.textContent = '🎲 Roll again';
    controls.appendChild(rollBtn);

    const armBtn = document.createElement('button');
    armBtn.type = 'button';
    armBtn.className = 'sp-addbtn sp-random-arm';
    armBtn.textContent = 'Place on map';
    controls.appendChild(armBtn);

    content.appendChild(controls);

    let current = null;

    const pool = () => {
        const all = Array.isArray(candidates) ? candidates : [];
        return unique.checked ? all.filter(s => !isRealIDUsed(s.id)) : all;
    };

    const roll = () => {
        const options = pool();
        if (!options.length) {
            current = null;
            renderEmpty(body, unique.checked);
            armBtn.disabled = true;
            return;
        }
        // Avoid repeating the previous roll when there is any alternative — rolling the
        // same tile twice in a row reads as a broken button.
        let choices = options;
        if (options.length > 1 && lastRolled != null) {
            const without = options.filter(s => s.id !== lastRolled);
            if (without.length) choices = without;
        }
        current = choices[Math.floor(Math.random() * choices.length)];
        lastRolled = current.id;
        renderTile(body, current);
        armBtn.disabled = false;
    };

    rollBtn.addEventListener('click', roll);
    unique.addEventListener('change', () => { lastRolled = null; roll(); });
    armBtn.addEventListener('click', () => {
        if (!current) return;
        state.arm(current, 'once');
        hidePopup(POPUP_ID);
    });

    roll();

    showPopup({
        id: POPUP_ID,
        title: '🎲 Random tile',
        content,
        modal: false,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            width: '340px',
            zIndex: 10005,
            border: '2px solid var(--popup-border-picker)'
        }
    });
}

function renderEmpty(host, uniqueOnly) {
    host.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'sp-empty-msg';
    msg.textContent = uniqueOnly
        ? 'Every tile matching your filters is already on the map.'
        : 'No tiles match the current filters and search.';
    host.appendChild(msg);
}

function renderTile(host, sys) {
    host.innerHTML = '';

    const img = tileImage(sys, { size: 0, className: 'sp-random-img' });
    if (img) host.appendChild(img);

    const title = document.createElement('div');
    title.className = 'sp-random-title';
    title.textContent = `${sys.id} — ${sys.name || 'Unnamed'}`;
    host.appendChild(title);

    if (isRealIDUsed(sys.id)) {
        const used = document.createElement('div');
        used.className = 'sp-count-used';
        used.textContent = 'Already on the map';
        host.appendChild(used);
    }

    const stats = document.createElement('div');
    stats.className = 'sp-random-stats';
    const r = totalResources(sys), i = totalInfluence(sys);
    if (r || i) {
        const ri = document.createElement('span');
        ri.innerHTML = `<span class="sp-res">${r}</span>/<span class="sp-inf">${i}</span>`;
        const eff = effectiveText(sys);
        if (eff) ri.append(` (eff ${eff})`);
        stats.appendChild(ri);
    }
    stats.appendChild(techBadges(sys));
    stats.appendChild(wormholeBadges(sys));
    if (stats.childNodes.length) host.appendChild(stats);

    const anomalies = anomalyTitle(sys);
    if (anomalies) {
        const row = document.createElement('div');
        row.className = 'sp-random-note';
        row.textContent = anomalies;
        host.appendChild(row);
    }

    const legendary = legendaryPlanet(sys);
    if (legendary) {
        const row = document.createElement('div');
        row.className = 'sp-preview-legendary';
        row.textContent = `★ ${legendary.legendaryAbilityName}`;
        host.appendChild(row);
    }
}
