// @ts-check
/**
 * The inspector: what is on the hex you are looking at.
 *
 * The shell has reserved this column since the layout landed. It is the answer to a
 * question the editor could not previously answer without opening something: what *is*
 * this tile? The information existed — the hover tooltip computes it — but only as a
 * tooltip, which vanishes the moment you move the pointer to act on what you just read.
 *
 * So this follows the pointer and then stays put. Moving off the map does not blank it;
 * the last hex you looked at remains, which is what makes it readable. Nothing here
 * intercepts clicks — painting a hex has to keep working while you read about it.
 *
 * Built with the kit, so it carries classes rather than inline styles, and it uses
 * textContent throughout: tile and planet names come from SystemInfo, which is synced
 * from the bot repository, and must never be parsed as markup.
 */

import { el } from './kit/index.js';

/** @param {any} editor @param {string} label */
function systemName(editor, label) {
    const hex = editor.hexes?.[label];
    if (!hex?.realId) return null;
    const sys = editor.sectorIDLookup?.[String(hex.realId).toUpperCase()];
    return sys?.name || null;
}

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
 * @param {any} editor
 * @param {string} label
 * @returns {HTMLElement}
 */
function renderHex(editor, label) {
    const hex = editor.hexes?.[label];
    const box = el('div', { className: 'insp-body' });
    if (!hex) return box;

    const name = systemName(editor, label);
    box.appendChild(field('Hex', label));
    if (hex.realId) box.appendChild(field('Tile', String(hex.realId)));
    if (name) box.appendChild(field('System', name));
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

            box.appendChild(el('div', {
                className: 'insp-planet',
                children: [
                    el('div', {
                        className: 'insp-planet__name',
                        text: p.name || `Planet ${i + 1}`,
                    }),
                    el('div', {
                        className: 'insp-planet__stats',
                        text: `${p.resources ?? 0} / ${p.influence ?? 0}` + (bits.length ? ' · ' + bits.join(' · ') : ''),
                    }),
                ],
            }));
        });

        const r = planets.reduce((n, p) => n + (Number(p.resources) || 0), 0);
        const i = planets.reduce((n, p) => n + (Number(p.influence) || 0), 0);
        if (planets.length > 1) box.appendChild(field('Total R/I', `${r} / ${i}`, 'insp-field--total'));
    }

    const tokenCount = (hex.systemTokens?.length || 0)
        + Object.values(hex.planetTokens || {}).reduce((n, list) => n + (list?.length || 0), 0);
    if (tokenCount) box.appendChild(field('Tokens', String(tokenCount)));

    const anomalies = Object.keys(hex.borderAnomalies || {});
    if (anomalies.length) box.appendChild(field('Border', `${anomalies.length} side(s)`));

    if (hex.matrix?.length) box.appendChild(field('Hyperlanes', 'yes'));

    return box;
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

    const empty = el('div', { className: 'insp-empty', text: 'Point at a hex to see what is on it.' });
    /** @type {HTMLElement} */
    let body = empty;

    host.append(title, toolLine, toolRegion, body);

    const setTool = () => {
        const slot = toolLine.querySelector('.insp-field__value');
        if (slot) slot.textContent = editor.mode && editor.mode !== 'none' ? String(editor.mode).replace(/[-_]/g, ' ') : 'none';
    };
    setTool();

    let shown = null;
    const show = (label) => {
        if (!label || label === shown) return;
        shown = label;
        const next = renderHex(editor, label);
        host.replaceChild(next, body);
        body = next;
    };

    svg.addEventListener('mousemove', (ev) => {
        const target = /** @type {Element|null} */ (ev.target);
        const hex = target?.closest?.('[data-label]');
        const label = hex?.getAttribute('data-label');
        if (label) show(label);
    });

    // Deliberately no mouseleave handler: the panel keeps the last hex so you can read it
    // after moving the pointer away, which is the whole reason it is not a tooltip.

    // setMode is already wrapped by the status bar; polling would be worse, so listen for
    // the same interactions that can change it.
    svg.addEventListener('click', () => setTimeout(setTool, 0));
    document.addEventListener('click', () => setTimeout(setTool, 0));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setTimeout(setTool, 0); });
}
