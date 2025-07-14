import { wormholeTypes, planetTypeColors, techSpecialtyColors } from '../constants/constants.js';
import { showPopup, hidePopup } from '../ui/popupUI.js';
import { showOptionsPopup } from '../ui/simplepPopup.js';

let calcSlicePopup = null;

export function openCalcSlicePopup() {
    // Build content wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'calcSliceResults';
    renderSliceAnalysis(window.editor, wrapper);

    // Show popup using popupUI.js
    showPopup({
        id: 'calcSlicePopup',
        className: 'popup-ui',
        title: 'Slice Analysis',
        content: wrapper,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar, .draggable-handle',
        scalable: true,
        rememberPosition: true,
        style: {
            minWidth: '420px',
            minHeight: '220px',
            left: '25vw',
            top: '100px',
            zIndex: 2000
        },
        actions: [
            {
                label: 'Options',
                action: () => showOptionsPopup(window.editor)
            },
            {
                label: 'Close',
                action: () => hidePopup('calcSlicePopup')
            }
        ],
        showHelp: true,
        onHelp: showCalcSliceHelpPopup
    });
}

// --- Help popup for Calculate Slice ---
function showCalcSliceHelpPopup() {
    showPopup({
        id: 'calcSliceHelpPopup',
        className: 'popup-ui popup-ui-info',
        title: 'Slice Analysis Help',
        content: `
            <div style="max-width:520px;line-height:1.6;">
                <b>Slice Analysis</b> calculates the planets, techs, resources/influence, and wormholes within a certain distance from each <b>homesystem</b> on the map.<br><br>
                <ul>
                  <li>The distance used is set in <b>Distance Calculator Options</b> (gear icon or Options button).</li>
                  <li>Each slice includes all tiles within <b>max distance</b> (default: 2) from the homesystem, excluding the homesystem itself.</li>
                  <li>Clicking a homesystem while holding <b>Shift</b> and <b>D</b> (Shift+D+Click) will also highlight the slice on the map using the same distance setting.</li>
                  <li>Use this tool to quickly compare starting positions and plan your draft or game setup.</li>
                </ul>
                <b>Tip:</b> Adjust the max distance in <b>Distance Calculator Options</b> to match your preferred slice size.
            </div>
        `,
        actions: [
            { label: 'Close', action: () => hidePopup('calcSliceHelpPopup') }
        ],
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: false,
        rememberPosition: true,
        style: {
            minWidth: '340px',
            maxWidth: '600px',
            border: '2px solid #2196f3',
            borderRadius: '14px',
            boxShadow: '0 8px 40px #000a',
            zIndex: 2100
        }
    });
}

// Modal close (for compatibility with old close button)
document.getElementById('closeCalcSlice')?.addEventListener('click', () => {
    hidePopup('calcSlicePopup');
});

// Optional: Dismiss on background click (if popupUI is used, this is not needed, but kept for legacy)
document.getElementById('calcSlicePopup')?.addEventListener('mousedown', (e) => {
    if (e.target === e.currentTarget) hidePopup('calcSlicePopup');
});

// ---------- MAIN RENDER FUNCTION ----------
export function renderSliceAnalysis(editor, container) {
    container.innerHTML = '';
    const maxDist = editor.maxDistance || 2;

    const homesystems = Object.entries(editor.hexes)
        .filter(([label, hex]) =>
            hex &&
            hex.baseType === "homesystem" &&
            typeof hex.q === "number" &&
            typeof hex.r === "number"
        )
        .map(([label, hex]) => ({ ...hex, label }));

    if (homesystems.length === 0) {
        const p = document.createElement('p');
        p.textContent = "No homesystems found on map.";
        container.appendChild(p);
        return;
    }

    // Table structure
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.98em';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
    <thead>
      <tr>
        <th>HS (label)</th>
        <th>Planets</th>
        <th>Techs</th>
        <th>R/I<br><span style="font-weight:400;">Ideal</span></th>
        <th>Wormholes</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
    const tbody = table.querySelector('tbody');

    homesystems.forEach(hs => {
        const distances = editor.calculateDistancesFrom(hs.label, maxDist);
        const sliceHexes = Object.entries(distances)
            .filter(([label, dist]) => dist > 0 && dist <= maxDist)
            .map(([label]) => {
                const hex = editor.hexes[label];
                return hex && typeof hex.q === 'number' && typeof hex.r === 'number'
                    ? { ...hex, label }
                    : null;
            })
            .filter(Boolean);

        let planetCount = 0, res = 0, inf = 0;
        let typeCounts = { INDUSTRIAL: 0, CULTURAL: 0, HAZARDOUS: 0 };
        let techs = new Set();
        let wormholes = new Set();
        let a = 0, b = 0, c = 0;

        sliceHexes.forEach(hex => {
            if (!hex.planets) return;
            planetCount += hex.planets.length;
            hex.planets.forEach(p => {
                res += p.resources || 0;
                inf += p.influence || 0;
                let pt = (p.planetType || (Array.isArray(p.planetTypes) && p.planetTypes[0]) || '').toUpperCase();
                if (pt && typeCounts[pt] !== undefined) typeCounts[pt]++;
                if (p.techSpecialty) techs.add(p.techSpecialty);
                if (Array.isArray(p.techSpecialties)) p.techSpecialties.forEach(t => techs.add(t));
                if (p.resources === p.influence) c += p.resources;
                else if (p.resources > p.influence) a += p.resources;
                else if (p.influence > p.resources) b += p.influence;
            });
            if (hex.wormholes) hex.wormholes.forEach(w => wormholes.add(w));
            if (hex.inherentWormholes) hex.inherentWormholes.forEach(w => wormholes.add(w));
        });

        // Build color-coded breakdowns
        const typeHtml = Object.entries(typeCounts)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) =>
                `<span style="color:${planetTypeColors[type] || 'inherit'};margin-right:2px;">${count}${type[0]}</span>`
            ).join('');

        const techHtml = Array.from(techs)
            .filter(Boolean)
            .map(t =>
                `<span style="color:${techSpecialtyColors[t.toUpperCase()] || 'inherit'};font-weight:600;margin-right:2px;">${capitalizeTech(t)[0]}</span>`
            ).join('');

        const wormholeHtml = Array.from(wormholes)
            .map(w => {
                const key = w.toLowerCase();
                const whType = wormholeTypes[key];
                const color = whType?.color || 'gray';
                const label = whType?.label ? whType.label[0] : key[0].toUpperCase();
                return `<span style="background:${color};color:white;font-weight:600;padding:1px 6px;border-radius:7px;margin-right:2px;display:inline-block;">${label}</span>`;
            }).join(' ');

        const sliceHexLabels = sliceHexes.map(h => h.label);

        // Compact double-row for tile labels
        const tilesPerRow = Math.ceil(sliceHexLabels.length / 2);
        const tileRow1 = sliceHexLabels.slice(0, tilesPerRow).join(', ');
        const tileRow2 = sliceHexLabels.slice(tilesPerRow).join(', ');
        const tilesBlock = `
      <div style="font-size:0.85em;color:#888;line-height:1.1;margin-top:3px;">
        ${tileRow1 || ''}<br>${tileRow2 || ''}
      </div>
    `;

        const hsHeader = `<b>${hs.realId || '–'}</b> <span style="color:#888;font-size:0.9em;">(${hs.label})</span>`;
        const idealRI = c > 0 ? `${a}/${b}+${c}` : `${a}/${b}`;

        // Add main row, then tiles row
        const row = document.createElement('tr');
        row.innerHTML = `
      <td>${hsHeader}</td>
      <td>${planetCount} ${typeHtml}</td>
      <td>${techHtml || '-'}</td>
      <td>${res}/${inf}<br><span style="font-size:0.88em;color:#aaa;">${idealRI}</span></td>
      <td style="min-width:80px;">${wormholeHtml || '-'}</td>
    `;
        tbody.appendChild(row);

        // Add a compact row for tile labels, spanning all columns
        const tileRow = document.createElement('tr');
        tileRow.innerHTML = `
      <td colspan="5" style="padding-bottom:7px;padding-top:1px;">
        ${tilesBlock}
      </td>
    `;
        tbody.appendChild(tileRow);
    });

    container.appendChild(table);
}

// Helper functions (same as previous)
function capitalizeTech(tech) {
    if (!tech) return '';
    const map = {
        CYBERNETIC: "Cybernetic",
        BIOTIC: "Biotic",
        WARFARE: "Warfare",
        PROPULSION: "Propulsion"
    };
    return map[tech.toUpperCase()] || (tech[0].toUpperCase() + tech.slice(1).toLowerCase());
}