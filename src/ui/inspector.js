// @ts-check
/**
 * The inspector: what is on the hex you are looking at.
 *
 * The shell has reserved this column since the layout landed. It is the answer to a
 * question the editor could not previously answer without opening something: what *is*
 * this tile? The information existed — the hover tooltip computes it — but only as a
 * tooltip, which vanishes the moment you move the pointer to act on what you just read.
 *
 * It works two ways. With nothing armed, clicking a hex selects it: the hex is ringed on
 * the map and pinned here until you pick another or click it again. Hovering browses, and
 * only while nothing is pinned — a panel that changed under the pointer while you were
 * reading the thing you had just clicked would be useless for the job it exists to do.
 *
 * Moving off the map never blanks it; the last hex remains, which is what makes it
 * readable rather than a tooltip. Nothing here intercepts clicks — painting a hex has to
 * keep working while you read about it.
 *
 * Built with the kit, so it carries classes rather than inline styles, and it uses
 * textContent throughout: tile and planet names come from SystemInfo, which is synced
 * from the bot repository, and must never be parsed as markup.
 */

import { el } from './kit/index.js';
import { isMatrixEmpty } from '../utils/matrix.js';
import { buildValueTiers, getFactors, getTypeGroup } from '../features/valueOverlay.js';
import { HEX_SELECTED, selectedHex, clearHexSelection } from '../features/hexSelection.js';

/**
 * One label/value line.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} [className]
 */
function field(label, value, className = '') {
    return el('div', {
        className: ('insp-field ' + className).trim(),
        children: [
            el('span', { className: 'insp-field__label', text: label }),
            el('span', { className: 'insp-field__value', text: value }),
        ],
    });
}

/** @param {string} text */
function heading(text) {
    return el('div', { className: 'insp-heading', text });
}

/**
 * Wormholes on a hex, inherent and placed together — the distinction matters when
 * editing but not when reading.
 *
 * @param {any} hex
 * @returns {string[]}
 */
function wormholesOf(hex) {
    const all = new Set([...(hex.inherentWormholes || []), ...(hex.customWormholes || [])]);
    return [...all].map(w => String(w));
}

/**
 * The tile art, when the system has any and the file is really there.
 *
 * SystemInfo carries an imagePath for most real tiles and nothing for the rest, and the
 * files themselves are an optional download — the repo ships the manifest, not always the
 * art. So the element is created hidden and reveals itself on load: a broken-image icon in
 * a panel that is meant to tell you what a tile is would be worse than no picture.
 *
 * @param {any} sys
 * @returns {HTMLElement|null}
 */
function tileImage(sys) {
    if (!sys?.imagePath) return null;

    const img = document.createElement('img');
    img.className = 'insp-tile';
    img.alt = '';
    img.hidden = true;
    // Not lazy: it is one small image that is on screen the moment it is built, and a lazy
    // one never loads at all while the document is hidden.
    img.src = `public/data/tiles/${sys.imagePath}`;
    img.addEventListener('load', () => { img.hidden = false; });
    img.addEventListener('error', () => { img.remove(); });
    return img;
}

/**
 * Token ids as their readable names.
 *
 * tokenManager holds the catalogue and is created asynchronously at boot, so everything
 * here degrades to the raw id rather than waiting for it — the id is what export and
 * removal key off anyway, so it is never meaningless.
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
function tokenNames(ids) {
    const mgr = /** @type {any} */ (window).tokenManager;
    return (ids || []).map(id => {
        const info = mgr?.getTokenInfo?.(id);
        return info?.displayName || info?.name || String(id);
    });
}

/** The value hint painted on a hex, as one readable string. */
function hintText(vt) {
    if (!vt) return null;
    const bits = [];
    if (vt.tier) bits.push(`tier ${vt.tier}`);
    const skew = [vt.r && 'resources', vt.i && 'influence', vt.t && 'tech'].filter(Boolean);
    if (skew.length) bits.push(`favour ${skew.join(' + ')}`);
    return bits.length ? bits.join(', ') : null;
}

/**
 * @param {any} editor
 * @param {string} label
 * @returns {HTMLElement}
 */
function renderHex(editor, label) {
    const hex = editor.hexes?.[label];
    const box = el('div', { className: 'insp-body' });
    if (!hex) return box;

    const sys = hex.realId
        ? editor.sectorIDLookup?.[String(hex.realId).toUpperCase()]
        : null;

    const art = tileImage(sys);
    if (art) box.appendChild(art);

    box.appendChild(field('Hex', label));
    if (hex.realId) box.appendChild(field('Tile', String(hex.realId)));
    if (sys?.name) box.appendChild(field('System', sys.name));
    box.appendChild(field('Type', hex.baseType || '—'));

    const effects = [...(hex.effects || [])];
    if (effects.length) box.appendChild(field('Effects', effects.join(', ')));

    const wormholes = wormholesOf(hex);
    if (wormholes.length) box.appendChild(field('Wormholes', wormholes.join(', ')));

    const planets = hex.planets || [];
    if (planets.length) {
        box.appendChild(heading(planets.length === 1 ? 'Planet' : `Planets (${planets.length})`));
        planets.forEach((p, i) => {
            const type = p.planetType || (p.planetTypes || []).join(', ');
            const tech = p.techSpecialty || (p.techSpecialties || []).join(', ');
            const bits = [];
            // SystemInfo records a planet with no type as the string "NONE" — Mecatol Rex,
            // faction homeworlds. Printing "none" as though it were a type is noise.
            if (type && String(type).toUpperCase() !== 'NONE') bits.push(String(type).toLowerCase());
            if (tech) bits.push(String(tech).toLowerCase());
            if (p.legendaryAbilityName) bits.push('legendary');

            const rows = [
                el('div', { className: 'insp-planet__name', text: p.name || `Planet ${i + 1}` }),
                el('div', {
                    className: 'insp-planet__stats',
                    text: `${p.resources ?? 0} / ${p.influence ?? 0}` + (bits.length ? ' · ' + bits.join(' · ') : ''),
                }),
            ];

            // Tokens sit on a specific planet, so they are listed against it rather than
            // counted into one number at the bottom of the panel.
            const onPlanet = tokenNames(hex.planetTokens?.[i]);
            if (onPlanet.length) {
                rows.push(el('div', { className: 'insp-planet__tokens', text: onPlanet.join(', ') }));
            }

            box.appendChild(el('div', { className: 'insp-planet', children: rows }));
        });

        const r = planets.reduce((n, p) => n + (Number(p.resources) || 0), 0);
        const i = planets.reduce((n, p) => n + (Number(p.influence) || 0), 0);
        if (planets.length > 1) box.appendChild(field('Total R/I', `${r} / ${i}`, 'insp-field--total'));
    }

    // ── What the map says about this hex, as opposed to what the tile is ──

    const systemTokens = tokenNames(hex.systemTokens);
    if (systemTokens.length) {
        box.appendChild(heading(systemTokens.length === 1 ? 'Token' : 'Tokens'));
        box.appendChild(el('div', { className: 'insp-tokens', text: systemTokens.join(', ') }));
    }

    const hint = hintText(hex.valueTarget);
    if (hint) box.appendChild(field('Value hint', hint, 'insp-field--hint'));

    // The tier of the system actually placed here, ranked against everything else on the
    // map. Read from the shared layer rather than recomputed, so it always agrees with the
    // Value tiers overlay and with what the AutoMapper was working to.
    const tier = placedTier(editor, label);
    if (tier) box.appendChild(field('Value tier', `${tier} of 5`, 'insp-field--tier'));

    const anomalies = Object.keys(hex.borderAnomalies || {});
    if (anomalies.length) box.appendChild(field('Border', `${anomalies.length} side(s)`));

    if (!isMatrixEmpty(hex.matrix)) box.appendChild(field('Hyperlanes', 'yes'));

    return box;
}

/**
 * The value tier of the system placed on a hex, or null.
 *
 * Tiers are quintiles of the systems currently on the map, ranked within their planet
 * count, so the number only means anything once there are enough of them to rank. Below
 * five in a group every system lands in its own tier by position alone — the only
 * 1-planet system on a map reads "tier 1 of 5", which says nothing about the tile and
 * sounds like it says a lot. So it is withheld rather than guessed.
 *
 * Cached for a second: the map changes far more slowly than the pointer moves, and
 * ranking 130 hexes on every mousemove is work for nothing.
 *
 * @param {any} editor
 * @param {string} label
 * @returns {number|null}
 */
const MIN_GROUP_FOR_TIERS = 5;
let tierCache = null;
let tierGroupSizes = null;
let tierCacheAt = 0;

function placedTier(editor, label) {
    const hex = editor.hexes?.[label];
    if (!hex?.realId) return null;

    const now = Date.now();
    if (!tierCache || now - tierCacheAt > 1000) {
        try {
            tierCache = buildValueTiers(editor, getFactors(false, false, false));
            tierGroupSizes = new Map();
            for (const h of Object.values(editor.hexes || {})) {
                const s = h.realId && editor.sectorIDLookup?.[String(h.realId).toUpperCase()];
                if (!s) continue;
                const g = getTypeGroup(s);
                tierGroupSizes.set(g, (tierGroupSizes.get(g) || 0) + 1);
            }
            tierCacheAt = now;
        } catch {
            return null;
        }
    }

    const sys = editor.sectorIDLookup?.[String(hex.realId).toUpperCase()];
    if (!sys) return null;
    if ((tierGroupSizes?.get(getTypeGroup(sys)) || 0) < MIN_GROUP_FOR_TIERS) return null;

    return tierCache.get(label)?.tier ?? null;
}

// ── The tool region ──────────────────────────────────────────────────────────
/**
 * Tools render their controls into the top of the inspector rather than opening a window
 * over the map. Wormholes, Custom Links and Border Anomalies are all "pick an option, then
 * click hexes" — you need the map and the options visible at the same time, which is
 * exactly what a floating panel covering the map makes hard.
 *
 * The hex detail stays below it, so arming a wormhole and reading what is already on the
 * tile you are about to change are not two different views.
 */

/** @returns {HTMLElement|null} */
function toolHost() {
    return document.getElementById('inspectorTool');
}

/**
 * Show a tool's controls in the inspector.
 *
 * @param {string} title
 * @param {HTMLElement} content
 * @returns {HTMLElement|null} the region, so callers can query their own controls back
 */
export function setInspectorTool(title, content) {
    const host = toolHost();
    if (!host) return null;

    host.textContent = '';
    host.appendChild(el('div', { className: 'insp-tool__title', text: title }));
    host.appendChild(content);
    host.hidden = false;
    return host;
}

/** Empty the tool region — the tool was disarmed, or another took over. */
export function clearInspectorTool() {
    const host = toolHost();
    if (!host) return;
    host.textContent = '';
    host.hidden = true;
}

/** @param {string} title */
export function isInspectorToolShowing(title) {
    const host = toolHost();
    if (!host || host.hidden) return false;
    return host.querySelector('.insp-tool__title')?.textContent === title;
}

/**
 * Wire the inspector to an editor.
 *
 * @param {any} editor
 */
export function installInspector(editor) {
    const host = document.getElementById('inspector');
    const svg = editor?.svg;
    if (!host || !svg) return;

    host.hidden = false;
    host.textContent = '';

    const title = el('div', { className: 'insp-title', text: 'Inspector' });
    const toolLine = field('Tool', 'none', 'insp-field--tool');

    // Where an armed tool puts its controls. Empty and hidden until one does.
    const toolRegion = el('div', { className: 'insp-tool', id: 'inspectorTool' });
    toolRegion.hidden = true;

    const empty = el('div', {
        className: 'insp-empty',
        text: 'Click a hex to read it, or point at one to browse.',
    });
    /** @type {HTMLElement} */
    let body = empty;

    // Shown only while a hex is pinned, so the panel says which of its two modes it is in.
    const pinned = el('div', { className: 'insp-pinned' });
    pinned.hidden = true;
    const pinnedText = el('span', { className: 'insp-pinned__text', text: '' });
    const unpin = el('button', { className: 'insp-pinned__clear', text: 'Clear' });
    unpin.setAttribute('type', 'button');
    unpin.title = 'Stop pinning this hex and go back to browsing on hover';
    unpin.addEventListener('click', () => clearHexSelection(editor));
    pinned.append(pinnedText, unpin);

    host.append(title, toolLine, pinned, toolRegion, body);

    const setTool = () => {
        const slot = toolLine.querySelector('.insp-field__value');
        const idle = !editor.mode || editor.mode === 'none' || editor.mode === 'select';
        if (slot) slot.textContent = idle ? 'none' : String(editor.mode).replace(/[-_]/g, ' ');
    };
    setTool();

    let shown = null;
    const show = (label, { force = false } = {}) => {
        if (!label || (label === shown && !force)) return;
        shown = label;
        const next = renderHex(editor, label);
        host.replaceChild(next, body);
        body = next;
    };

    const syncPinned = () => {
        const label = selectedHex(editor);
        pinned.hidden = !label;
        pinnedText.textContent = label ? `Pinned: ${label}` : '';
    };

    svg.addEventListener('mousemove', (ev) => {
        // A pinned hex is the one being read. Browsing resumes when it is cleared.
        if (selectedHex(editor)) return;
        const target = /** @type {Element|null} */ (ev.target);
        const hex = target?.closest?.('[data-label]');
        const label = hex?.getAttribute('data-label');
        if (label) show(label);
    });

    // Deliberately no mouseleave handler: the panel keeps the last hex so you can read it
    // after moving the pointer away, which is the whole reason it is not a tooltip.

    document.addEventListener(HEX_SELECTED, (ev) => {
        const label = /** @type {any} */ (ev).detail?.label;
        syncPinned();
        // Forced, because clicking the hex the pointer is already over would otherwise be
        // a no-op — it is the same label the hover just rendered, but now it is pinned and
        // may have gained a token or a hint since.
        if (label) show(label, { force: true });
    });
    syncPinned();

    // setMode is already wrapped by the status bar; polling would be worse, so listen for
    // the same interactions that can change it.
    svg.addEventListener('click', () => setTimeout(setTool, 0));
    document.addEventListener('click', () => setTimeout(setTool, 0));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setTimeout(setTool, 0); });
}
