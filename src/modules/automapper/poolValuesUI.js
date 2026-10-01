/**
 * The AutoMapper's pool view: every tile the fill may use, with the value it scored, the
 * parts that value is made of, and the tier it landed in.
 *
 * Until this existed, a value hint was a request against a ranking nobody could see. The
 * Tier supply table said how many tiles each tier held, but not which ones or why, so a
 * fill that put a 2/1 planet on a V5 hex could not be told apart from a bug. Everything
 * here comes from rankPool — the same ranking the fill uses — so the view explains the
 * fill rather than restating it.
 *
 * The value is the tile's Milty value (miltyScore), under the Milty Weighting Settings. A
 * scar, a wormhole or a legendary planet is the first thing a player notices about a tile,
 * so the view names what each one adds, and the weights table lists every weight —
 * including the two that belong to a whole slice and are never charged to one tile.
 *
 * It is a popup of its own rather than a section of the AutoMapper panel: a pool is a
 * hundred and more rows, and it is most useful kept open next to the panel while the
 * sources and the R/I/T bias change. The panel calls refreshPoolValues after every render,
 * so the view follows whatever the panel currently describes.
 */

import { COLORS } from '../../constants/designTokens.js';
import { valueWeights } from '../../features/valueOverlay.js';
import { flexWeightOf } from '../Milty/miltyScore.js';

export const POOL_VALUES_POPUP_ID = 'automapper-pool-values';

const TIER_COLOR = {
    1: COLORS.autoTier1, 2: COLORS.autoTier2, 3: COLORS.autoTier3,
    4: COLORS.autoTier4, 5: COLORS.autoTier5,
};

export const GROUP_LABEL = {
    '1': '1 planet', '2': '2 planet', '3+': '3+ planet',
    legendary: 'Legendary', home: 'Home', empty: 'No planets',
};

/** Tech specialty -> the letter and colour it is known by. */
const SKIP = {
    PROPULSION: ['B', '#4aa3ff'], BIOTIC: ['G', '#3ecf6a'],
    CYBERNETIC: ['Y', '#ffd23f'], WARFARE: ['R', '#ff5c5c'],
    UNITSKIP: ['U', '#bbbbbb'], NONUNITSKIP: ['N', '#bbbbbb'],
};

const FLEX_COLOR = '#c9d36a';

/** Where the view is, kept across refreshes so a bias change does not throw it away. */
const view = { group: null, tier: null, filter: '' };

/** @type {null | (() => any)} */
let readAnalysis = null;
/** @type {HTMLElement | null} */
let root = null;

function el(tag, style = '', text = '') {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text) e.textContent = text;
    return e;
}

/** 1, 1.5, 0.6 — never 1.0000000002 or 2.00. */
function num(n) {
    return String(Math.round(n * 100) / 100);
}

function tierBadge(tier) {
    return el('span', `display:inline-block;min-width:24px;text-align:center;padding:0 4px;
        border-radius:3px;font-weight:700;font-size:11px;color:#111;
        background:${tier ? TIER_COLOR[tier] : COLORS.surface4};`, tier ? `T${tier}` : '—');
}

/** Signed, for a term: +1.5, −1, +0. */
function signed(n) {
    const v = Math.round(n * 100) / 100;
    return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
}

/**
 * What a tile carries beyond its planets' R / I / F and skips, each with what it adds to
 * the value under the current weights — the Milty terms a player notices first.
 */
function featureTags(row) {
    // rankPool rows carry the parts flat (systemValueParts spreads them), beside `terms`.
    const { terms } = row;
    const parts = row;
    const tags = [];
    if (parts.legendaries.length) tags.push([`★ legendary ${signed(terms.legendary)}`,
        'Legendary planet — Industrex and Emelpar carry their own weights']);
    for (const w of parts.wormholes) tags.push([`${w} wormhole`, 'Wormhole — gamma carries its own weight']);
    if (parts.wormholes.length) tags.push([`wormholes ${signed(terms.wormhole)}`, 'What the wormholes add']);
    if (parts.stations) tags.push([`trade station ${signed(terms.station)}`, 'A planet named as a station']);
    if (parts.traits) {
        const names = Object.entries(parts.traitCounts).filter(([, n]) => n).map(([k, n]) => (n > 1 ? `${n} ` : '') + k);
        tags.push([`${names.join(', ')} ${signed(terms.traits)}`, 'Planet traits']);
    }
    const ANOMALY = { supernova: 'supernova', asteroidField: 'asteroid field', nebula: 'nebula',
        gravityRift: 'gravity rift', entropicScar: 'entropic scar' };
    for (const a of parts.anomalies) tags.push([`${ANOMALY[a] || a}`, 'Anomaly']);
    if (parts.anomalies.length) tags.push([`anomaly ${signed(terms.anomaly)}`, 'What the anomaly adds']);
    return tags;
}

// ── How the value is made ────────────────────────────────────────────────────

function renderFormula(parent, factors) {
    const w = valueWeights(factors);
    const box = el('div', `background:${COLORS.autoPanelBg};border-radius:6px;padding:8px 10px;
        font-size:12px;line-height:1.5;display:flex;flex-direction:column;gap:6px;`);

    const f = el('div', 'font-size:13px;');
    f.append('value = the tile\'s ', el('b', '', 'Milty value'),
        ' — what it adds to the score of any Milty slice it is in');
    box.appendChild(f);

    const biased = factors.f_R !== 1 || factors.f_I !== 1 || factors.f_T !== 2;
    if (biased) {
        box.appendChild(el('div', `color:${COLORS.autoWarnText};font-size:11px;`,
            'The R / I / T bias in the AutoMapper panel scales the resource, influence and tech weights below.'));
    }

    // Every weight, including the two that only a whole slice has.
    const W = el('table', 'border-collapse:collapse;font-size:11px;width:100%;');
    const ROWS = [
        ['R — optimal resources', `${num(w.resourceValue)} per point`, COLORS.autoValueR,
            'Planets with more resources than influence add their resources.'],
        ['I — optimal influence', `${num(w.influenceValue)} per point`, COLORS.autoValueI,
            'Planets with more influence than resources add their influence.'],
        ['F — flex', `${num(flexWeightOf(w))} per point`, FLEX_COLOR,
            'Planets with equal resources and influence add that number: a 2/2 is 2 F. '
            + 'Worth the average of the R and I weights, because it can be spent either way.'],
        ['Tech skip', `${num(w.techSpecialty)} each`, COLORS.autoValueT,
            'Any colour, and unit and non-unit skips too.'],
        ['Legendary planet', `${num(w.legendaryPlanet)} · Industrex ${num(w.legendaryIndustrex)} · Emelpar ${num(w.legendaryEmelpar)}`, '#eee',
            'Also puts the tile in the Legendary group, ranked against other legendaries.'],
        ['Wormhole', `${num(w.wormhole)} · gamma ${num(w.gammaWormhole)}`, '#eee', ''],
        ['Trade station', `${num(w.tradeStation)}`, '#eee', 'A planet named as a station, such as Tsion Station.'],
        ['Planet trait', `industrial ${num(w.industrial)} · cultural ${num(w.cultural)} · hazardous ${num(w.hazardous)}`, '#eee', 'Per planet.'],
        ['Anomaly', `supernova ${num(w.supernova)} · asteroid ${num(w.asteroidField)} · nebula ${num(w.nebula)} · rift ${num(w.gravityRift)} · scar ${num(w.entropicScar)}`, '#eee',
            'A planet tile with an anomaly adds the anomaly to its planets.'],
        ['R/I imbalance', `${num(w.resourceInfluenceImbalance)} per point`, null,
            'Slice score only — never a tile\'s: a 3/0 is not worse for being lopsided, since a 0/3 beside it balances the slice. Measured after flex.'],
        ['Planet count', `under 3: ${num(w.lowPlanetCount)} · over 5: ${num(w.highPlanetCount)}`, null,
            'Slice score only. For a tile, planet count decides the group it is ranked in (1, 2, 3+).'],
    ];
    for (const [what, worth, color, note] of ROWS) {
        const tr = el('tr', `border-top:1px solid ${COLORS.autoRowBorder};`);
        tr.appendChild(el('td', `padding:2px 6px 2px 0;color:${color || COLORS.textMuted};white-space:nowrap;`, what));
        tr.appendChild(el('td', `padding:2px 6px;font-weight:${color ? 700 : 400};
            color:${color ? '#eee' : COLORS.textMuted};`, worth));
        tr.appendChild(el('td', `padding:2px 0 2px 6px;color:${COLORS.textMuted};`, note));
        W.appendChild(tr);
    }
    box.appendChild(W);

    const edit = el('button', `align-self:flex-start;padding:2px 0;background:none;border:none;
        color:${COLORS.autoBtnLink};font-size:11px;cursor:pointer;text-decoration:underline;`,
    '⚖ Edit the Milty weights');
    edit.title = 'The Milty Slice Designer\'s Weighting Settings. They are shared by the Milty generator, '
        + 'Slice Analysis and the AutoMapper, and saved across reloads. The tiers here follow any change.';
    edit.onclick = () => import('../Milty/miltyRandomToolUI.js').then(m => m.showWeightingSettingsPopup?.());
    box.appendChild(edit);

    box.appendChild(el('div', `color:${COLORS.textMuted};font-size:11px;`,
        'Tiers: within each group, the range from the lowest value to the highest is cut into '
        + 'five equal bands, and a tile\'s tier is the band its value falls in. Tiles with the '
        + 'same value are always the same tier. Tiles without planets are not ranked. Tiles '
        + 'already on the map are not in the pool.'));
    parent.appendChild(box);
}

// ── Group tabs, band summary and filter ──────────────────────────────────────

function renderTabs(parent, groups) {
    const row = el('div', 'display:flex;gap:4px;flex-wrap:wrap;');
    for (const { group, rows } of groups) {
        const on = group === view.group;
        const b = el('button', `padding:3px 10px;border-radius:3px;font-size:11px;cursor:pointer;
            border:1px solid ${on ? COLORS.popupAutomapper : COLORS.surface5};
            background:${on ? COLORS.popupAutomapper : 'transparent'};
            color:${on ? '#111' : '#ccc'};font-weight:${on ? 700 : 400};`,
        `${GROUP_LABEL[group] || group} · ${rows.length}`);
        b.onclick = () => { view.group = group; view.tier = null; paint(); };
        row.appendChild(b);
    }
    parent.appendChild(row);
}

function renderBandSummary(parent, g) {
    if (!g.edges) return;
    const counts = [1, 2, 3, 4, 5].map(t => g.rows.filter(r => r.tier === t).length);
    const width = (g.hi - g.lo) / 5;
    const line = el('div', `font-size:11px;color:${COLORS.textMuted};`);
    line.textContent = g.hi > g.lo
        ? `${GROUP_LABEL[g.group] || g.group}: values ${num(g.lo)} to ${num(g.hi)}, `
            + `five bands ${num(width)} wide. Tiles per tier, T1 to T5: ${counts.join(' / ')}.`
        : `${GROUP_LABEL[g.group] || g.group}: every tile scores ${num(g.lo)}, so there is `
            + 'nothing to rank them by and all of them are T3.';
    parent.appendChild(line);
}

function renderFilter(parent) {
    const filter = el('input', `width:100%;box-sizing:border-box;padding:4px 8px;font-size:12px;
        background:${COLORS.autoInputBg};border:1px solid ${COLORS.autoInputBorder};
        border-radius:3px;color:#eee;`);
    filter.type = 'search';
    filter.placeholder = 'Filter by tile id or name…';
    filter.value = view.filter;
    filter.oninput = () => {
        view.filter = filter.value;
        paintTable();
    };
    parent.appendChild(filter);
}

// ── The table ────────────────────────────────────────────────────────────────

function planetsCell(sys) {
    const td = el('td', 'padding:2px 6px;white-space:nowrap;');
    const planets = Array.isArray(sys.planets) ? sys.planets : [];
    planets.forEach((p, i) => {
        if (i) td.append(el('span', `color:${COLORS.surface5};`, ' · '));
        const res = p.resources || 0, inf = p.influence || 0;
        // Coloured by where the planet's value goes: R, I or flex.
        const color = res > inf ? COLORS.autoValueR : inf > res ? COLORS.autoValueI : FLEX_COLOR;
        const ri = el('span', `color:${color};`, `${res}/${inf}`);
        ri.title = `${p.name}: ${res} resources, ${inf} influence — counts as `
            + (res > inf ? `${res} R` : inf > res ? `${inf} I` : `${res} F (flex)`)
            + (p.legendaryAbilityName ? `. Legendary: ${p.legendaryAbilityName}` : '');
        td.append(ri);
        for (const skip of p.techSpecialties || []) {
            const [letter, c] = SKIP[skip] || ['?', '#bbb'];
            const s = el('sup', `color:${c};font-weight:700;margin-left:1px;`, letter);
            s.title = `${skip.toLowerCase()} tech skip`;
            td.append(s);
        }
        if (p.legendaryAbilityName) td.append(el('sup', `color:${COLORS.accent};margin-left:1px;`, '★'));
    });
    if (!planets.length) td.append(el('span', `color:${COLORS.textMuted};`, 'no planets'));
    return td;
}

function paintTable() {
    const host = root?.querySelector('[data-pool-table]');
    if (!host) return;
    host.replaceChildren();

    const analysis = readAnalysis?.();
    const group = analysis?.poolRanking?.find(g => g.group === view.group);
    if (!group) return;

    const q = view.filter.trim().toLowerCase();
    const rows = group.rows.slice().reverse()   // best first
        .filter(r => !q || r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));

    const demand = (analysis.tierDemand || []).find(d => d.group === view.group);

    const table = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
    const head = el('tr', `color:${COLORS.popupAutomapper};border-bottom:1px solid ${COLORS.autoSectionBorder};`);
    const COLS = [
        ['Tier', 'center', 'The band of the group\'s value range this tile falls in, T1 lowest to T5 highest'],
        ['Tile', 'left', 'Tags name what the tile carries beyond its planets, and what each adds'],
        ['Planets', 'left', 'Resources / influence per planet, coloured by where it counts (R, I or F), with tech skips and ★ for a legendary planet'],
        ['R', 'right', 'Optimal resources, in points: planets with more resources than influence'],
        ['I', 'right', 'Optimal influence, in points: planets with more influence than resources'],
        ['F', 'right', 'Flex, in points: planets with equal resources and influence, at that number'],
        ['Tech', 'right', 'Tech skips'],
        ['Other', 'right', 'What legendary planets, wormholes, trade stations, planet traits and anomalies add, together — the tags name each'],
        ['Value', 'right', 'The tile\'s Milty value — what the tier is decided by'],
    ];
    for (const [label, align, title] of COLS) {
        const th = el('th', `text-align:${align};padding:3px 6px;font-weight:600;`, label);
        if (title) th.title = title;
        head.appendChild(th);
    }
    const thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    const tbody = el('tbody');

    /** A band header: the band's edges, how many tiles it holds, and what is painted. */
    const bandHeader = (tier, count) => {
        const band = el('tr');
        band.dataset.tier = String(tier ?? 0);
        const td = el('td', `padding:6px 6px 2px;font-size:11px;color:${COLORS.textMuted};
            border-bottom:1px solid ${COLORS.autoRowBorder};`);
        td.colSpan = COLS.length;
        if (!tier || !group.edges) {
            td.textContent = 'Not ranked — every tile without planets scores 0, so a value '
                + 'hint has nothing to choose between them.';
        } else {
            const from = group.edges[tier - 1], to = group.edges[tier];
            const range = group.hi > group.lo
                ? `value ${num(from)} to ${tier === 5 ? num(to) : `under ${num(to)}`}`
                : `value ${num(from)}`;
            td.append(tierBadge(tier), ` ${range} · `);
            td.append(count
                ? `${count} tile${count !== 1 ? 's' : ''}`
                : el('span', `color:${COLORS.autoWarnText};`, 'no tile scores in this band'));
            const want = demand ? demand.tiers[tier - 1] : 0;
            if (want) {
                const short = want > count;
                td.append(el('span', `color:${short ? COLORS.autoWarnText : COLORS.popupSpecial};
                    font-weight:${short ? 700 : 400};`,
                ` · ${want} hex${want !== 1 ? 'es' : ''} painted at T${tier}`
                    + (short ? ` — ${want - count} more than exist` : '')));
            }
        }
        band.appendChild(td);
        tbody.appendChild(band);
    };

    const tileRow = r => {
        const tr = el('tr', `border-bottom:1px solid ${COLORS.autoRowBorder};`);
        const tierTd = el('td', 'padding:2px 6px;text-align:center;');
        tierTd.appendChild(tierBadge(r.tier));
        tr.appendChild(tierTd);

        const tile = el('td', 'padding:2px 6px;');
        tile.append(el('span', `font-family:monospace;color:${COLORS.popupAutomapper};`, r.id), ' ');
        tile.append(el('span', 'color:#ddd;', r.name));
        for (const [tag, title] of featureTags(r)) {
            const t = el('span', `margin-left:4px;padding:0 4px;border-radius:3px;font-size:10px;
                color:${COLORS.textMuted};border:1px solid ${COLORS.surface4};white-space:nowrap;`, tag);
            t.title = title;
            tile.append(t);
        }
        tr.appendChild(tile);

        tr.appendChild(planetsCell(r.sys));
        for (const [v, color] of [[r.r, COLORS.autoValueR], [r.i, COLORS.autoValueI],
            [r.flex, FLEX_COLOR], [r.tech, COLORS.autoValueT]]) {
            tr.appendChild(el('td', `padding:2px 6px;text-align:right;color:${v ? color : COLORS.surface5};`, num(v)));
        }
        const other = r.terms.legendary + r.terms.wormhole + r.terms.station + r.terms.traits + r.terms.anomaly;
        tr.appendChild(el('td', `padding:2px 6px;text-align:right;color:${other ? '#ddd' : COLORS.surface5};`,
            other ? signed(other) : '0'));
        tr.appendChild(el('td', 'padding:2px 6px;text-align:right;font-weight:700;', num(r.value)));
        tbody.appendChild(tr);
    };

    if (group.edges) {
        // Every band, the empty ones too — a band nothing scores in is part of the shape
        // of the pool. While filtering, only the bands with a match are worth the space.
        for (const tier of [5, 4, 3, 2, 1]) {
            const inTier = rows.filter(r => r.tier === tier);
            if (q && !inTier.length) continue;
            // One value and no range: there are no bands, only the middle tier.
            if (!(group.hi > group.lo) && tier !== 3) continue;
            bandHeader(tier, group.rows.filter(r => r.tier === tier).length);
            inTier.forEach(tileRow);
        }
    } else {
        bandHeader(null, rows.length);
        rows.forEach(tileRow);
    }
    if (!rows.length) {
        const tr = el('tr');
        const td = el('td', `padding:8px;color:${COLORS.textMuted};text-align:center;`, 'No tile matches that.');
        td.colSpan = COLS.length;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    host.appendChild(table);

    if (view.tier) {
        host.querySelector(`tr[data-tier="${view.tier}"]`)?.scrollIntoView({ block: 'start' });
        view.tier = null;
    }
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function paint() {
    if (!root) return;
    root.replaceChildren();

    const analysis = readAnalysis?.();
    const groups = analysis?.poolRanking || [];
    if (!groups.length) {
        root.appendChild(el('div', `color:${COLORS.textMuted};padding:12px;`,
            'The pool is empty — no tile passes the current sources and options.'));
        return;
    }
    if (!groups.some(g => g.group === view.group)) {
        view.group = (groups.find(g => g.group !== 'empty') || groups[0]).group;
    }

    // One scrolling column: with the weights table on top, pinning it would leave the
    // list too little room in a short window.
    const scroller = el('div', 'flex:1 1 auto;overflow-y:auto;min-height:120px;display:flex;flex-direction:column;gap:8px;');
    root.appendChild(scroller);
    renderFormula(scroller, analysis.factors);
    renderTabs(scroller, groups);
    renderBandSummary(scroller, groups.find(g => g.group === view.group));
    renderFilter(scroller);
    const tableHost = el('div');
    tableHost.dataset.poolTable = '';
    scroller.appendChild(tableHost);
    paintTable();
}

/**
 * Opens the pool view, or refocuses it.
 *
 * @param {() => any} getAnalysis  returns the AutoMapper panel's current analyzeMap result;
 *                                 read on every paint, so the view never shows a stale pool
 * @param {{group?: string, tier?: number}} [focus]  a group to show and a tier to scroll to
 */
export function showPoolValues(getAnalysis, focus = {}) {
    readAnalysis = getAnalysis;
    if (focus.group) view.group = focus.group;
    view.tier = focus.tier ?? null;

    if (root?.isConnected) {
        paint();
        return Promise.resolve();
    }

    return import('../../ui/popupUI.js').then(({ showPopup }) => {
        root = el('div', `display:flex;flex-direction:column;gap:8px;height:100%;max-height:75vh;
            box-sizing:border-box;padding:4px;font-family:var(--font-ui);color:#eee;`);
        showPopup({
            id: POOL_VALUES_POPUP_ID,
            title: '📋 AutoMapper — Pool values',
            content: root,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            onClose: () => { root = null; },
            style: {
                minWidth: '560px', maxWidth: '820px',
                border: '2px solid var(--popup-border-special)',
                borderRadius: '10px',
                boxShadow: '0 8px 40px #000a',
                padding: '14px',
            },
        });
        paint();
    });
}

/** Repaints the view if it is open. The AutoMapper panel calls this after every render. */
export function refreshPoolValues() {
    if (root?.isConnected) paint();
}
