import { wormholeTypes, planetTypeColors, techSpecialtyColors } from '../constants/constants.js';
import { showPopup, hidePopup } from '../ui/popupUI.js';
import { showOptionsPopup } from '../ui/simplepPopup.js';
import { assignSliceTiles } from './sliceOwnership.js';
import { getWeights, hexAsTile, sliceScore, subscribeWeights } from '../modules/Milty/miltyScore.js';
import { getCurrentSettings } from '../modules/Milty/miltyBuilderRandomTool.js';

/** Drops the weights listener of the popup that was open before this one. */
let unsubscribeWeights = null;

export function openCalcSlicePopup(editor) {
    // Build content wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'calcSliceResults';
    renderSliceAnalysis(editor, wrapper);

    // Editing the Milty weights re-scores the slices while the popup is open.
    unsubscribeWeights?.();
    unsubscribeWeights = subscribeWeights(() => {
        if (wrapper.isConnected) renderSliceAnalysis(editor, wrapper);
        else { unsubscribeWeights?.(); unsubscribeWeights = null; }
    });

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
            top: '100px'
        },
        actions: [
            {
                label: 'Options',
                action: () => showOptionsPopup(editor)
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
                <b>Slice Analysis</b> scores the slice around each <b>homesystem</b> on the map the way the Milty generator scores a slice, and lists its planets, techs, resources/influence and wormholes.<br><br>
                <ul>
                  <li>The distance used is set in <b>Distance Calculator Options</b> (gear icon or Options button).</li>
                  <li>Each tile within <b>max distance</b> (default: 2) of a homesystem belongs to the <b>nearest</b> homesystem, so slices do not overlap. A tile equally near to two or more homes is counted in each of them and marked <b>⇄</b>. Homesystems and Mecatol Rex are never part of a slice.</li>
                  <li><b>Score</b> is the Milty slice score, using the weights from <b>Milty Slice Designer ▸ Weighting Settings</b>. Hover it to see what it is made of. Resources and influence count at their optimal use; <b>R/I/F</b> shows optimal resources, influence and flex (planets with equal R and I), with the raw totals underneath.</li>
                  <li>The <b>R ✓ I ✓ Σ ✓</b> marks compare the slice with the Milty generator's slice limits. Those are sized for a five-tile Milty slice, so at a larger distance treat them as a comparison.</li>
                  <li>To see a slice's reach on the map, press <b>D</b> for the Distance tool and click the homesystem (or hold <b>Shift+D</b> and right-click it). It uses the same distance setting.</li>
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
            border: '2px solid var(--popup-border-default)',
            borderRadius: '14px',
            boxShadow: '0 8px 40px #000a'
        }
    });
}

// Two handlers used to be bound here at import time, for a static #calcSlicePopup in
// index.html with its own ✕ and a click-outside dismiss. showPopup replaces that element
// the first time this popup opens, so both listeners died with it; the popup's own titlebar
// close is what actually works. The static markup is gone now.

// ---------- MAIN RENDER FUNCTION ----------

/** 1, 1.5, -0.5 — never 1.0000000002. */
function num(n) {
    return String(Math.round(n * 100) / 100);
}

/**
 * The slices on the map and the Milty score of each.
 *
 * A slice is the tiles within the distance setting of a home system, each given to the
 * home nearest to it (sliceOwnership). The score is the Milty generator's own
 * (miltyScore.sliceScore) under the saved Weighting Settings, so a slice here and a slice
 * the generator builds are measured the same way. Resources and influence are shown at
 * their optimal use — R / I / F, F being flex — with the raw totals underneath.
 *
 * The limits are the generator's slice limits. They are sized for a five-tile Milty slice,
 * so on a map scored at a larger distance they read as a comparison, not a verdict.
 */
export function renderSliceAnalysis(editor, container) {
    container.innerHTML = '';
    const maxDist = editor.maxDistance || 2;

    const homesystems = Object.entries(editor.hexes)
        .filter(([, hex]) =>
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

    const distancesByHome = new Map(homesystems.map(hs =>
        [hs.label, editor.calculateDistancesFrom(hs.label, maxDist)]));
    // Homes are never part of a slice, and neither is Mecatol Rex: a Milty slice never
    // holds it, and within reach of every home it would otherwise land in all of them.
    const isMecatol = hex => String(hex?.realId) === '18'
        || (hex?.planets || []).some(p => /mecatol/i.test(String(p.name || '')));
    const slices = assignSliceTiles(distancesByHome, {
        exclude: new Set([
            ...homesystems.map(h => h.label),
            ...Object.entries(editor.hexes).filter(([, hex]) => isMecatol(hex)).map(([label]) => label),
        ]),
    });

    const weights = getWeights();
    const limits = getCurrentSettings()?.sliceGeneration || {};
    const lookup = editor.sectorIDLookup || {};

    // Table structure
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.98em';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
    <thead>
      <tr>
        <th>HS (label)</th>
        <th title="The Milty slice score, under the Weighting Settings. Hover a score for how it is made up.">Score</th>
        <th>Planets</th>
        <th>Techs</th>
        <th title="Optimal resources / influence / flex — each planet counted where it is better, a planet with equal R and I as flex. Raw totals underneath.">R/I/F<br><span style="font-weight:400;">Raw R/I</span></th>
        <th>Wormholes</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
    const tbody = table.querySelector('tbody');
    let anyShared = false;

    homesystems.forEach(hs => {
        const owned = slices.get(hs.label) || [];
        const sliceHexes = owned
            .map(({ label }) => {
                const hex = editor.hexes[label];
                return hex && typeof hex.q === 'number' && typeof hex.r === 'number'
                    ? { ...hex, label }
                    : null;
            })
            .filter(Boolean);

        const tiles = sliceHexes.map(hex =>
            hexAsTile(hex, hex.realId ? lookup[String(hex.realId).toUpperCase()] : null));
        const score = sliceScore(tiles, weights);

        let res = 0, inf = 0;
        let typeCounts = { INDUSTRIAL: 0, CULTURAL: 0, HAZARDOUS: 0 };
        let techs = new Set();
        let wormholes = new Set();

        sliceHexes.forEach(hex => {
            if (hex.wormholes) hex.wormholes.forEach(w => wormholes.add(w));
            if (!hex.planets) return;
            hex.planets.forEach(p => {
                res += p.resources || 0;
                inf += p.influence || 0;
                let pt = (p.planetType || (Array.isArray(p.planetTypes) && p.planetTypes[0]) || '').toUpperCase();
                if (pt && typeCounts[pt] !== undefined) typeCounts[pt]++;
                if (p.techSpecialty) techs.add(p.techSpecialty);
                if (Array.isArray(p.techSpecialties)) p.techSpecialties.forEach(t => techs.add(t));
            });
        });

        // Build color-coded breakdowns
        const typeHtml = Object.entries(typeCounts)
            .filter(([, count]) => count > 0)
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

        // What the score is made of, for the tooltip: the tiles' own values, then the two
        // terms that only exist for a whole slice.
        const sum = key => score.tiles.reduce((s, t) => s + t.terms[key], 0);
        const breakdown = [
            `R ${num(score.r)} · I ${num(score.i)} · F ${num(score.flex)}: ${num(sum('r') + sum('i') + sum('flex'))}`,
            `tech skips: ${num(sum('tech'))}`,
            `legendary: ${num(sum('legendary'))}`,
            `wormholes: ${num(sum('wormhole'))}`,
            `trade stations: ${num(sum('station'))}`,
            `planet traits: ${num(sum('traits'))}`,
            `anomalies: ${num(sum('anomaly'))}`,
            `R/I imbalance ${num(score.imbalance)} after flex: ${num(score.imbalanceTerm)}`,
            `planet count ${score.planets}: ${num(score.planetCountTerm)}`,
            `= ${num(score.score)}`,
        ].join('\n');

        // Milty's slice limits, on optimal resources and influence.
        const optR = score.optimalResources, optI = score.optimalInfluence;
        const checks = [
            ['R', optR >= (limits.minOptimalResources ?? 0), `optimal R ${num(optR)} (min ${limits.minOptimalResources ?? 0})`],
            ['I', optI >= (limits.minOptimalInfluence ?? 0), `optimal I ${num(optI)} (min ${limits.minOptimalInfluence ?? 0})`],
            ['Σ', optR + optI >= (limits.minOptimalTotal ?? 0) && optR + optI <= (limits.maxOptimalTotal ?? Infinity),
                `optimal total ${num(optR + optI)} (${limits.minOptimalTotal ?? 0}–${limits.maxOptimalTotal ?? '∞'})`],
        ];
        const limitsHtml = checks.map(([k, ok, title]) =>
            `<span title="${title}" style="color:${ok ? '#2ecc40' : '#ff9900'};margin-right:3px;">${k}${ok ? '✓' : '✗'}</span>`
        ).join('');

        const hsHeader = `<b>${hs.realId || '–'}</b> <span style="color:#888;font-size:0.9em;">(${hs.label})</span>`;

        // Add main row, then tiles row
        const row = document.createElement('tr');
        row.innerHTML = `
      <td>${hsHeader}</td>
      <td title="${breakdown}"><b style="font-size:1.1em;cursor:help;">${num(score.score)}</b><br><span style="font-size:0.8em;" title="Milty's slice limits">${limitsHtml}</span></td>
      <td>${score.planets} ${typeHtml}</td>
      <td>${techHtml || '-'}</td>
      <td>${num(score.r)}/${num(score.i)}/${num(score.flex)}<br><span style="font-size:0.88em;color:#aaa;">${res}/${inf}</span></td>
      <td style="min-width:80px;">${wormholeHtml || '-'}</td>
    `;
        tbody.appendChild(row);

        // The tiles, with the shared ones marked and named.
        const labelById = new Map(homesystems.map(h => [h.label, h.realId ? `${h.realId} (${h.label})` : h.label]));
        const tileSpans = owned.map(({ label, sharedWith }) => {
            if (!sharedWith.length) return label;
            anyShared = true;
            const others = sharedWith.map(h => labelById.get(h) || h).join(', ');
            const where = sharedWith.length > 1 ? `all ${sharedWith.length + 1} slices` : 'both slices';
            return `<span style="color:#ff9900;cursor:help;" title="Equally near to ${others} — counted in ${where}">${label}⇄</span>`;
        });
        const tilesPerRow = Math.ceil(tileSpans.length / 2);
        const tileRow = document.createElement('tr');
        tileRow.innerHTML = `
      <td colspan="6" style="padding-bottom:7px;padding-top:1px;">
        <div style="font-size:0.85em;color:#888;line-height:1.1;margin-top:3px;">
          ${tileSpans.slice(0, tilesPerRow).join(', ') || ''}<br>${tileSpans.slice(tilesPerRow).join(', ') || ''}
        </div>
      </td>
    `;
        tbody.appendChild(tileRow);
    });

    container.appendChild(table);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:0.85em;color:#888;margin-top:6px;line-height:1.4;';
    note.textContent = `Each tile within ${maxDist} of a home system belongs to the nearest home. `
        + 'Homes and Mecatol Rex are never part of a slice. '
        + (anyShared ? 'Tiles marked ⇄ are equally near to more than one home and are counted in each of those slices. ' : '')
        + 'Scores use the Milty weights (Milty Slice Designer ▸ Weighting Settings).';
    container.appendChild(note);
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