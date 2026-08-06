/**
 * The small visual vocabulary a tile is described with: tech letters, wormhole letters,
 * planet-type initials, anomaly emoji, effective R/I.
 *
 * Three places need to render the same badges — the table row, the grid cell and the hover
 * preview — and in the old picker each built its own copy inline, which is why the hover
 * card and the table disagreed about how to show a planet with two tech specialties.
 *
 * Everything returns a DOM node or a plain string; colours come from constants.js so the
 * picker agrees with the map overlays.
 */

import { wormholeTypes, techSpecialtyColors, effectEmojiMap } from '../../constants/constants.js';
import { wormholesOf, effectiveValue, anomaliesOf, totalResources, totalInfluence } from './pickerModel.js';

export const TILE_IMAGE_BASE = 'public/data/tiles/';

const TECH_LETTER = { CYBERNETIC: 'Y', BIOTIC: 'G', WARFARE: 'R', PROPULSION: 'B' };
const TYPE_LETTER = { CULTURAL: 'C', HAZARDOUS: 'H', INDUSTRIAL: 'I' };
const TYPE_COLOR = { CULTURAL: '#4a9eff', HAZARDOUS: '#e74c3c', INDUSTRIAL: '#27ae60' };

/** The tile art URL, or null when the system has no image. */
export function tileImageSrc(sys) {
    return sys.imagePath && sys.imagePath.trim() ? TILE_IMAGE_BASE + sys.imagePath : null;
}

/**
 * A tile thumbnail. Always lazy: the table used to set `src` on all ~671 rows at once,
 * pulling well over 100 MB of art every time the picker opened.
 */
export function tileImage(sys, { size = 36, className = 'sp-thumb' } = {}) {
    const src = tileImageSrc(sys);
    if (!src) return null;
    const img = document.createElement('img');
    img.src = src;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.className = className;
    if (size) { img.width = size; img.height = size; }
    img.title = `${sys.id} — ${sys.name || 'Unnamed'}`;
    img.onerror = () => { img.replaceWith(textFallback(sys)); };
    return img;
}

function textFallback(sys) {
    const span = document.createElement('span');
    span.className = 'sp-thumb-fallback';
    span.textContent = sys.id;
    return span;
}

function badge(text, color, title) {
    const span = document.createElement('span');
    span.className = 'sp-badge';
    span.textContent = text;
    span.style.color = color;
    if (title) span.title = title;
    return span;
}

/** Tech specialties as coloured letters, with a ×N when a tile carries duplicates. */
export function techBadges(sys) {
    const frag = document.createDocumentFragment();
    const all = [];
    for (const p of sys.planets || []) {
        if (Array.isArray(p.techSpecialties)) {
            for (const t of p.techSpecialties) if (t) all.push(String(t).toUpperCase());
        } else if (p.techSpecialty) {
            all.push(String(p.techSpecialty).toUpperCase());
        }
    }
    if (!all.length) return frag;

    const counts = {};
    for (const t of all) counts[t] = (counts[t] || 0) + 1;
    for (const [tech, n] of Object.entries(counts)) {
        const letter = TECH_LETTER[tech] || tech.charAt(0);
        frag.appendChild(badge(
            n > 1 ? `${n}${letter}` : letter,
            techSpecialtyColors[tech] || '#9C27B0',
            n > 1 ? `${tech} x${n}` : tech
        ));
    }
    return frag;
}

/** Wormholes as coloured initials. */
export function wormholeBadges(sys) {
    const frag = document.createDocumentFragment();
    for (const w of wormholesOf(sys)) {
        const info = wormholeTypes[String(w).toLowerCase()];
        frag.appendChild(badge(
            info ? info.label.charAt(0) : String(w).charAt(0).toUpperCase(),
            info ? info.color : '#888',
            info ? info.label : String(w)
        ));
    }
    return frag;
}

/**
 * Planet types as initials, one per type per planet. Handles both `planetType` (string)
 * and `planetTypes` (array); planets with neither show as N for neutral.
 */
export function planetTypeBadges(sys) {
    const frag = document.createDocumentFragment();
    let untyped = false;
    for (const p of sys.planets || []) {
        const types = [];
        if (typeof p.planetType === 'string' && p.planetType) {
            types.push(p.planetType.toUpperCase());
        } else if (Array.isArray(p.planetTypes) && p.planetTypes.length) {
            for (const t of p.planetTypes) if (t) types.push(String(t).toUpperCase());
        }
        if (!types.length) { untyped = true; continue; }
        for (const t of types) frag.appendChild(badge(TYPE_LETTER[t] || 'N', TYPE_COLOR[t] || '#999', t));
    }
    if (untyped) frag.appendChild(badge('N', '#999', 'Neutral'));
    return frag;
}

/** Anomalies as emoji. */
export function anomalyText(sys) {
    return anomaliesOf(sys).map(a => effectEmojiMap[a.key === 'gravity' ? 'rift' : a.key] || a.emoji).join(' ');
}

export function anomalyTitle(sys) {
    return anomaliesOf(sys).map(a => a.label).join(', ');
}

/** "3/2+1" — resource-leaning, influence-leaning, and the flexible remainder. */
export function effectiveText(sys) {
    const { res, inf, flex, total } = effectiveValue(sys);
    if (!total) return '';
    return flex > 0 ? `${res}/${inf}+${flex}` : `${res}/${inf}`;
}

export function legendaryPlanet(sys) {
    return (sys.planets || []).find(p => p.legendaryAbilityName) || null;
}

/**
 * The hover card: art plus everything the table columns would have told you, for when the
 * columns are switched off or you are in the grid.
 */
export function buildPreview(sys) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-preview';

    const img = tileImage(sys, { size: 0, className: 'sp-preview-img' });
    if (img) wrap.appendChild(img);

    const info = document.createElement('div');
    info.className = 'sp-preview-info';

    const title = document.createElement('div');
    title.className = 'sp-preview-title';
    title.textContent = `${sys.id} — ${sys.name || 'Unnamed'}`;
    info.appendChild(title);

    const src = document.createElement('div');
    src.className = 'sp-preview-source';
    src.textContent = sys.source || '';
    info.appendChild(src);

    if (sys.planets?.length) {
        const list = document.createElement('div');
        list.className = 'sp-preview-planets';
        for (const p of sys.planets) {
            const row = document.createElement('div');
            row.textContent = `${p.name || 'Unnamed'} (${p.resources || 0}/${p.influence || 0})`;
            list.appendChild(row);
        }
        info.appendChild(list);

        const totals = document.createElement('div');
        totals.className = 'sp-preview-row';
        totals.textContent = `Total ${totalResources(sys)}/${totalInfluence(sys)}`;
        const eff = effectiveText(sys);
        if (eff) totals.textContent += `  ·  Effective ${eff}`;
        info.appendChild(totals);
    }

    const addRow = (label, node) => {
        if (!node.childNodes.length) return;
        const row = document.createElement('div');
        row.className = 'sp-preview-row';
        const b = document.createElement('strong');
        b.textContent = `${label} `;
        row.appendChild(b);
        row.appendChild(node);
        info.appendChild(row);
    };
    addRow('Tech:', techBadges(sys));
    addRow('Wormholes:', wormholeBadges(sys));

    const anomalies = anomalyTitle(sys);
    if (anomalies) {
        const row = document.createElement('div');
        row.className = 'sp-preview-row';
        row.textContent = `${anomalyText(sys)} ${anomalies}`;
        info.appendChild(row);
    }

    const legendary = legendaryPlanet(sys);
    if (legendary) {
        const row = document.createElement('div');
        row.className = 'sp-preview-legendary';
        row.textContent = `★ ${legendary.legendaryAbilityName}`;
        info.appendChild(row);
        if (legendary.legendaryAbilityText) {
            const text = document.createElement('div');
            text.className = 'sp-preview-legendary-text';
            text.textContent = legendary.legendaryAbilityText;
            info.appendChild(text);
        }
    }

    if (sys.isHyperlane) {
        const row = document.createElement('div');
        row.className = 'sp-preview-row';
        row.textContent = 'Hyperlane tile';
        info.appendChild(row);
    }

    wrap.appendChild(info);
    return wrap;
}
