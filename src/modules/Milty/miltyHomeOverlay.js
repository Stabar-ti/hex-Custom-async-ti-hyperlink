// src/modules/Milty/miltyHomeOverlay.js
// Layout (y from hex centre, S = hexRadius/40):
//   -20S  Icon strip  (tech, wormhole, legendary, space station)  — with thin outline ring
//    -9S  Total row   — shifted +6S right so label fits
//    +2S  Ideal row   — same shift; 3-pill split layout when _idealSplit
//   +13S  Planet balls row 1  (r=3.5S)
//  +20.5S Planet balls row 2
//   +28S  Planet balls row 3

import { slotPositions } from './miltyBuilderCore.js';
import { getCurrentWeights } from './miltyBuilderRandomTool.js';

const SVG_NS   = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'miltyHomeOverlayLayer';

// ── State ─────────────────────────────────────────────────────────────────────
let _enabled    = true;
let _idealSplit = false;

export function setHomeOverlayEnabled(val) { _enabled = val; }
export function setIdealSplitEnabled(val)  { _idealSplit = val; }

// ── Colours ───────────────────────────────────────────────────────────────────
const PLANET_COLOR = { CULTURAL: '#4488ff', INDUSTRIAL: '#44aa44', HAZARDOUS: '#dd4444' };
const NEUTRAL_COLOR = '#888888';

const TECH_COLOR  = { CYBERNETIC: '#FFD700', BIOTIC: '#44bb44', WARFARE: '#ee4444', PROPULSION: '#00BFFF' };
const TECH_LETTER = { CYBERNETIC: 'Y', BIOTIC: 'G', WARFARE: 'R', PROPULSION: 'B' };

const WORMHOLE_COLOR = {
    alpha: '#ff9900', beta: '#44aa44', gamma: '#ff88cc', delta: '#4488ff',
    eta: '#dd4444', epsilon: '#b58900', kappa: '#226622', zeta: '#9932cc',
    theta: '#cc6600', omega: '#888888',
};
const WORMHOLE_GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
    eta: 'η', epsilon: 'ε', kappa: 'κ', zeta: 'ζ',
    theta: 'θ', omega: 'ω',
};

const PILL_RES = { bg: '#ffe066', text: '#1a1a00' };
const PILL_INF = { bg: '#1fa3ff', text: '#ffffff' };
const PILL_EQ  = { bg: '#555555', text: '#eeeeee' };

// ── Data collection ───────────────────────────────────────────────────────────
function collectSliceData(editor, hexIds) {
    const d = {
        planets: [], techs: {}, wormholes: [],
        legendaries: 0, hasSpaceStation: false,
        totalRes: 0, totalInf: 0,
        idealRes: 0, idealInf: 0,
        pureRes: 0, pureInf: 0, equalVal: 0,
        // Real-scoring fields (mirror calculateSliceScore in miltyBuilderRandomTool.js)
        techSpecialtyCount: 0,
        legendaryNames: [],
        tradeStations: 0,
        industrialCount: 0, culturalCount: 0, hazardousCount: 0,
        anomalies: [],            // 'supernova','asteroidField','nebula','gravityRift','entropicScar'
        planetCount: 0,
    };
    const seenWH = new Set();

    // hex.effects keys → scoring anomaly keys
    const EFFECT_TO_ANOMALY = {
        supernova: 'supernova', asteroid: 'asteroidField', nebula: 'nebula',
        rift: 'gravityRift', scar: 'entropicScar',
    };

    for (let i = 1; i < hexIds.length; i++) {
        const hex = editor.hexes[String(hexIds[i])];
        if (!hex) continue;

        if (hex.systemTokens?.some(t => /station/i.test(String(t)))) d.hasSpaceStation = true;
        // Also detect via planetType SPACESTATION (DS / community maps)
        if (hex.planets?.some(p => {
            const types = [p.planetType, ...(Array.isArray(p.planetTypes) ? p.planetTypes : [])].filter(Boolean);
            return types.some(t => String(t).toUpperCase() === 'SPACESTATION');
        })) d.hasSpaceStation = true;

        // Anomalies from hex effects (for scoring parity with the generator)
        if (hex.effects) {
            for (const e of hex.effects) {
                const key = EFFECT_TO_ANOMALY[String(e).toLowerCase()];
                if (key) d.anomalies.push(key);
            }
        }

        if (hex.wormholes) {
            for (const w of hex.wormholes) {
                const wl = String(w).toLowerCase();
                if (wl && wl !== 'null' && !seenWH.has(wl)) { seenWH.add(wl); d.wormholes.push(wl); }
            }
        }

        if (!hex.planets) continue;
        for (const p of hex.planets) {
            d.planetCount++;
            d.totalRes += p.resources || 0;
            d.totalInf += p.influence || 0;

            const r = p.resources || 0, inf = p.influence || 0;
            if (r === inf && r > 0) {
                // Equal planet: contributes 0.5 each to ideal, full value to equalVal
                d.idealRes += r / 2; d.idealInf += inf / 2; d.equalVal += r;
            } else if (r > inf) {
                d.idealRes += r; d.pureRes += r;
            } else {
                d.idealInf += inf; d.pureInf += inf;
            }

            if (p.legendaryAbilityName) {
                d.legendaries++;
                d.legendaryNames.push(String(p.name || p.legendaryAbilityName).toLowerCase());
            }
            if (p.isTradeStation || /trade.?station/i.test(String(p.name || ''))) d.tradeStations++;

            const allT = [];
            if (p.techSpecialty) allT.push(p.techSpecialty.toUpperCase());
            if (Array.isArray(p.techSpecialties)) p.techSpecialties.forEach(t => { if (t) allT.push(t.toUpperCase()); });
            for (const t of allT) { d.techs[t] = (d.techs[t] || 0) + 1; d.techSpecialtyCount++; }

            const types = [];
            if (typeof p.planetType === 'string' && p.planetType) types.push(p.planetType.toUpperCase());
            else if (Array.isArray(p.planetTypes)) p.planetTypes.forEach(t => { if (t) types.push(t.toUpperCase()); });
            // Planet-type counts for scoring (matches generator: checks each planet's primary type)
            if (types.includes('INDUSTRIAL')) d.industrialCount++;
            if (types.includes('CULTURAL'))   d.culturalCount++;
            if (types.includes('HAZARDOUS'))   d.hazardousCount++;

            const isSpace = types.some(t => t === 'SPACESTATION');
            d.planets.push({
                c1: PLANET_COLOR[types[0]] ?? NEUTRAL_COLOR,
                c2: types[1] ? (PLANET_COLOR[types[1]] ?? NEUTRAL_COLOR) : null,
                legendary:    !!p.legendaryAbilityName,
                spaceStation: isSpace,
            });
        }
    }
    return d;
}

// Default scoring weights — mirror DEFAULT_WEIGHTS in miltyBuilderRandomTool.js
const SCORE_WEIGHTS = {
    supernova: -3, asteroidField: -1, nebula: 0, gravityRift: -1, entropicScar: 1,
    resourceValue: 0.9, influenceValue: 1.0,
    resourceInfluenceImbalance: -0.5,
    techSpecialty: 2,
    legendaryPlanet: 1.5, legendaryIndustrex: 2.5, legendaryEmelpar: 3,
    wormhole: 0.5, gammaWormhole: 1.5,
    tradeStation: 0.5,
    industrial: 0.5, cultural: 0.5, hazardous: 0.5,
    lowPlanetCount: -3, highPlanetCount: -1,
};

// Replicates calculateSliceScore() from miltyBuilderRandomTool.js exactly
function computeSliceScore(d, W = SCORE_WEIGHTS) {
    let score = 0;
    score += d.totalRes * W.resourceValue;
    score += d.totalInf * W.influenceValue;
    score += Math.abs(d.totalRes - d.totalInf) * W.resourceInfluenceImbalance;

    if (d.legendaryNames.length > 0) {
        d.legendaryNames.forEach(name => {
            if (name.includes('industrex')) score += W.legendaryIndustrex ?? 2.5;
            else if (name.includes('emelpar')) score += W.legendaryEmelpar ?? 3;
            else score += W.legendaryPlanet;
        });
    } else {
        score += d.legendaries * W.legendaryPlanet;
    }

    score += d.techSpecialtyCount * W.techSpecialty;

    const gammaCount = d.wormholes.filter(w => w === 'gamma').length;
    score += (d.wormholes.length - gammaCount) * W.wormhole;
    score += gammaCount * (W.gammaWormhole ?? 1.5);

    score += d.tradeStations * (W.tradeStation ?? 0.5);

    score += d.industrialCount * W.industrial;
    score += d.culturalCount   * W.cultural;
    score += d.hazardousCount  * W.hazardous;

    d.anomalies.forEach(a => { score += W[a] || 0; });

    if (d.planetCount < 3) score += W.lowPlanetCount;
    if (d.planetCount > 5) score += W.highPlanetCount;

    return score;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
// Circle with optional outline ring
function dot(cx, cy, r, fill, stroke = null) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', r);   c.setAttribute('fill', fill);
    if (stroke) {
        c.setAttribute('stroke', stroke);
        c.setAttribute('stroke-width', r * 0.2);
    }
    return c;
}

// Plain text — no effects
function txt(x, y, text, size, fill, weight = 'bold', anchor = 'middle') {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('font-size', size); t.setAttribute('fill', fill);
    t.setAttribute('font-weight', weight);
    t.textContent = text;
    return t;
}

// Rounded pill with centred value
function pill(cx, cy, value, S, colors, pillW) {
    const w = pillW, h = 10 * S, rx = 4.5 * S;
    const g = document.createElementNS(SVG_NS, 'g');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', cx - w / 2); rect.setAttribute('y', cy - h / 2);
    rect.setAttribute('width', w);      rect.setAttribute('height', h);
    rect.setAttribute('rx', rx);        rect.setAttribute('fill', colors.bg);
    rect.setAttribute('stroke', 'rgba(0,0,0,0.22)');
    rect.setAttribute('stroke-width', 0.7 * S);
    g.appendChild(rect);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', cx); t.setAttribute('y', cy + h * 0.32);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', 6.5 * S);
    t.setAttribute('font-weight', 'bold');
    t.setAttribute('fill', colors.text);
    t.textContent = fmt(value);
    g.appendChild(t);
    return g;
}

function fmt(v) {
    if (typeof v === 'string') return v;
    const r = Math.round(v * 10) / 10;
    return r === Math.round(r) ? String(Math.round(r)) : String(r);
}

// ── R/I row builder ───────────────────────────────────────────────────────────
/**
 * Draws a labelled R/I row.
 * For Ideal row: pass pureR/pureI/eqVal; when _idealSplit is active
 *   these replace idealR/idealI and a third +eq pill is shown.
 * For Total row: omit pureR/pureI/eqVal → always 2-pill layout.
 *
 * Both modes shift the row +6S right so the label clears the hex edge.
 *
 * SPLIT math: pureRes/pureInf/equalVal are SEPARATE from idealRes/idealInf.
 *   - 2/1 planet  → pureRes+=2,  idealRes+=2
 *   - 1/2 planet  → pureInf+=2,  idealInf+=2
 *   - 1/1 planet  → equalVal+=1, idealRes+=0.5, idealInf+=0.5
 *   Split shows:  pureRes / pureInf  +equalVal   (i.e. 2/2 +1, NOT 2.5/2.5 +1)
 */
function drawRIRow(g, cx, rowY, S, labelText, idealR, idealI, pureR, pureI, eqVal) {
    const useSplit = _idealSplit && pureR !== undefined && eqVal !== undefined;

    // Pill text baseline is at rowY + 10S*0.32 = rowY + 3.2S
    const textBaselineY = rowY + 10 * S * 0.32;

    if (useSplit) {
        // 3-pill layout, centred at cx+4S
        const pw = 13 * S, gap = 1 * S;
        const total3 = 3 * pw + 2 * gap;              // 41S
        const rowCX  = cx + 4 * S;
        const rX  = rowCX - total3 / 2 + pw / 2;      // cx - 13.5
        const iX  = rX + pw + gap;                     // cx + 0.5
        const eqX = iX + pw + gap;                     // cx + 14.5
        const labelX = rX - pw / 2 - 2.5 * S;         // right anchor

        g.appendChild(txt(labelX, textBaselineY, labelText, 5 * S, '#000000', 'bold', 'end'));
        g.appendChild(pill(rX, rowY, pureR, S, PILL_RES, pw));
        g.appendChild(pill(iX, rowY, pureI, S, PILL_INF, pw));
        // Always show gray pill in split mode — empty background when no equal planets
        g.appendChild(pill(eqX, rowY, eqVal > 0 ? `+${fmt(eqVal)}` : '', S, PILL_EQ, pw));
    } else {
        // 2-pill layout, centred at cx+6S
        const pw = 16 * S, gap = 1 * S;
        const total2 = 2 * pw + gap;                   // 33S
        const rowCX  = cx + 6 * S;
        const rX = rowCX - total2 / 2 + pw / 2;        // cx - 2.5
        const iX = rX + pw + gap;                       // cx + 14.5
        const labelX = rX - pw / 2 - 2.5 * S;         // right anchor

        g.appendChild(txt(labelX, textBaselineY, labelText, 5 * S, '#000000', 'bold', 'end'));
        g.appendChild(pill(rX, rowY, idealR, S, PILL_RES, pw));
        g.appendChild(pill(iX, rowY, idealI, S, PILL_INF, pw));
    }
}

// ── Main group builder ────────────────────────────────────────────────────────
function buildGroup(data, cx, cy, R) {
    const g = document.createElementNS(SVG_NS, 'g');
    const S = R / 40;

    // ── Icon strip ─────────────────────────────────────────────────
    const iconY   = cy - 20 * S;
    const iconR   = 5  * S;

    const icons = [];
    for (const [type, count] of Object.entries(data.techs)) {
        const letter = (count > 1 ? String(count) : '') + (TECH_LETTER[type] ?? type[0]);
        icons.push({ bg: TECH_COLOR[type] ?? '#aaa', letter, textColor: '#000000' });
    }
    for (const w of data.wormholes) {
        const greek = WORMHOLE_GREEK[w] ?? w[0]?.toUpperCase() ?? '?';
        icons.push({ bg: WORMHOLE_COLOR[w] ?? '#aaa', letter: greek, textColor: '#000000' });
    }
    // Legendary and space station are shown on the planet balls directly, not in the icon strip

    // Auto-compress spacing so strip stays within hex at y=-20S (hex half-width ≈ 28.4S)
    const maxHalf  = 27 * S;
    const idealGap = 11 * S;
    const iconGap  = icons.length > 1
        ? Math.min(idealGap, (maxHalf * 2) / icons.length)
        : idealGap;

    const stripW = icons.length * iconGap;
    let ix = cx - stripW / 2 + iconGap / 2;
    for (const icon of icons) {
        if (icon.bg) {
            // Circle with dark outline ring
            g.appendChild(dot(ix, iconY, iconR, icon.bg, 'rgba(0,0,0,0.5)'));
        }
        // Pure black text, no stroke — legendary uses larger font
        const fs = (icon.fontSize ?? 6) * S;
        g.appendChild(txt(ix, iconY + iconR * 0.55, icon.letter, fs, icon.textColor, 'bold'));
        ix += iconGap;
    }

    // ── Total row (above centre) ───────────────────────────────────
    drawRIRow(g, cx, cy - 9 * S, S, 'Total:', data.totalRes, data.totalInf);

    // ── Ideal row (below centre) — split uses pureRes/pureInf/equalVal
    drawRIRow(g, cx, cy + 2 * S, S, 'Ideal:',
        data.idealRes, data.idealInf,
        data.pureRes, data.pureInf, data.equalVal);

    // ── Milty score badge — left of ball row 1, aligned to top of grid ──
    {
        const mScore = computeSliceScore(data, getCurrentWeights());
        const mLabel = fmt(Math.round(mScore * 10) / 10);

        const sbx = cx - 19.5 * S;
        const sby = cy + 16.5 * S;
        const bw = 11 * S, bh = 12 * S, brx = 4 * S;

        // Grouped so the export pipeline can remove just the badge via .milty-score-badge
        const badge = document.createElementNS(SVG_NS, 'g');
        badge.setAttribute('class', 'milty-score-badge');

        const bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('x', sbx - bw / 2); bg.setAttribute('y', sby - bh / 2);
        bg.setAttribute('width', bw);        bg.setAttribute('height', bh);
        bg.setAttribute('rx', brx);
        bg.setAttribute('fill', 'rgba(210,210,210,0.75)');
        bg.setAttribute('stroke', 'rgba(130,130,130,0.45)');
        bg.setAttribute('stroke-width', 0.6 * S);
        badge.appendChild(bg);
        badge.appendChild(txt(sbx, sby - 3 * S, 'M', 3.5 * S, '#666666', 'bold'));
        badge.appendChild(txt(sbx, sby + 2.5 * S, mLabel, 5 * S, '#222222', 'bold'));
        g.appendChild(badge);
    }

    // ── Planet-type balls (4 × 3 grid) ────────────────────────────
    const ballR = 3.5 * S;
    const colXc = [-10.5, -3.5, 3.5, 10.5].map(f => cx + f * S);
    const rowY  = [cy + 13 * S, cy + 20.5 * S, cy + 28 * S];

    for (let i = 0; i < Math.min(data.planets.length, 12); i++) {
        const bx = colXc[i % 4];
        const by = rowY[Math.floor(i / 4)];
        const { c1, c2, legendary, spaceStation } = data.planets[i];

        if (c2) {
            const lp = document.createElementNS(SVG_NS, 'path');
            lp.setAttribute('d', `M${bx},${by - ballR} A${ballR},${ballR} 0 0 0 ${bx},${by + ballR} Z`);
            lp.setAttribute('fill', c1);
            g.appendChild(lp);
            const rp = document.createElementNS(SVG_NS, 'path');
            rp.setAttribute('d', `M${bx},${by - ballR} A${ballR},${ballR} 0 0 1 ${bx},${by + ballR} Z`);
            rp.setAttribute('fill', c2);
            g.appendChild(rp);
        } else {
            g.appendChild(dot(bx, by, ballR, c1));
        }
        // Outline ring
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', bx); ring.setAttribute('cy', by); ring.setAttribute('r', ballR);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'rgba(0,0,0,0.35)');
        ring.setAttribute('stroke-width', 0.6 * S);
        g.appendChild(ring);

        // Legendary: purple ★ with dark outline so it reads on any planet color
        if (legendary) {
            const star = document.createElementNS(SVG_NS, 'text');
            star.setAttribute('x', bx);
            star.setAttribute('y', by + ballR * 0.45);
            star.setAttribute('text-anchor', 'middle');
            star.setAttribute('font-size', ballR * 1.1);
            star.setAttribute('font-weight', 'bold');
            star.setAttribute('fill', '#cc00ff');
            star.setAttribute('stroke', 'rgba(0,0,0,0.65)');
            star.setAttribute('stroke-width', ballR * 0.28);
            star.setAttribute('stroke-linejoin', 'round');
            star.setAttribute('paint-order', 'stroke fill');
            star.textContent = '★';
            g.appendChild(star);
        }
        // Space station: $ centred on ball
        if (spaceStation) {
            g.appendChild(txt(bx, by + ballR * 0.45, '$', ballR * 1.0, '#ffffff', 'bold'));
        }
    }

    return g;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function drawMiltyHomeOverlay(editor) {
    if (!editor?.svg) return;
    if (!_enabled) { clearMiltyHomeOverlay(editor); return; }

    editor.svg.querySelector(`#${LAYER_ID}`)?.remove();

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const R = editor.hexRadius || 40;

    for (const hexIds of Object.values(slotPositions)) {
        const homeHex = editor.hexes[String(hexIds[0])];
        if (!homeHex?.center) continue;
        if (!hexIds.slice(1).some(id => editor.hexes[String(id)]?.realId)) continue;

        const data  = collectSliceData(editor, hexIds);
        const group = buildGroup(data, homeHex.center.x, homeHex.center.y, R);
        layer.appendChild(group);
    }
}

export function clearMiltyHomeOverlay(editor) {
    editor?.svg?.querySelector(`#${LAYER_ID}`)?.remove();
}
