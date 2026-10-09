// @ts-check
/**
 * The clipboard history, in the inspector.
 *
 * The clipboard keeps the last dozen things you copied. Until now nothing showed them, so
 * "copy something else in between" still meant losing the first one in practice — the data
 * was there and unreachable.
 *
 * This is the list. Picking a clip makes it the one that pastes and brings the ghost back
 * to the cursor, so an older block goes down with one click and no re-selecting. The active
 * clip is marked, because with several in the list "what will Ctrl+V do" stops being
 * obvious.
 *
 * Each row carries a small map of the block's own shape. Two clips of the same systems in
 * different rotations have the same summary text and are otherwise indistinguishable in a
 * list; the shape is the thing that tells them apart, and it is what you are placing.
 */

import { el } from './kit/index.js';
import {
    CLIPBOARD_CHANGED, clips, activeClip, setActiveClip, removeClip, clearClipboard,
} from '../features/tileClipboard.js';
import { armGhost } from '../features/pasteGhost.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A thumbnail of a clip's footprint.
 *
 * Axial to pixel with the same flat-top layout the map uses, scaled to fit whatever box is
 * left over. Tiles that carry a system are filled solid; painted and empty ones are
 * outlined, so a block of real tiles reads differently from a block of placeholders.
 *
 * @param {any[]} tiles
 * @returns {SVGElement}
 */
function shapeOf(tiles) {
    const W = 34, H = 26;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'clip-shape');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));

    const pts = tiles.filter(Boolean).map(t => ({
        // Flat-top axial to pixel, unit size; the scale comes out in the fit below.
        x: 1.5 * t.q,
        y: Math.sqrt(3) * (t.r + t.q / 2),
        solid: !!t.realId,
    }));
    if (!pts.length) return svg;

    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    // Leave room for a dot's radius at every edge, so a single-tile clip is not a dot in
    // the corner and a wide one does not clip its ends.
    const pad = 4;
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY, 7);

    for (const p of pts) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(W / 2 + (p.x - (minX + maxX) / 2) * scale));
        dot.setAttribute('cy', String(H / 2 + (p.y - (minY + maxY) / 2) * scale));
        dot.setAttribute('r', '2.6');
        dot.setAttribute('fill', p.solid ? '#4fc3f7' : 'none');
        dot.setAttribute('stroke', '#4fc3f7');
        dot.setAttribute('stroke-width', '1');
        svg.appendChild(dot);
    }
    return svg;
}

/** "just now", "4m", "2h" — enough to tell one copy from another, no more. */
function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
}

/**
 * Build the panel body.
 *
 * @param {any} editor
 * @returns {HTMLElement}
 */
function render(editor) {
    const list = el('div', { className: 'clip-list' });
    const all = clips();
    const active = activeClip();

    if (!all.length) {
        list.appendChild(el('div', {
            className: 'clip-empty',
            text: 'Select hexes and press Ctrl+C. The last 12 copies stay here.',
        }));
        return list;
    }

    for (const clip of all) {
        const row = el('div', {
            className: 'clip-row' + (clip.id === active?.id ? ' is-active' : ''),
        });
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.title = clip.id === active?.id
            ? 'The clip Ctrl+V will place. Click to bring the ghost back.'
            : 'Make this the clip that pastes, and show its ghost';

        row.appendChild(shapeOf(clip.tiles));

        const n = clip.tiles.length;
        row.appendChild(el('div', {
            className: 'clip-row__text',
            children: [
                el('div', { className: 'clip-row__name', text: clip.summary }),
                el('div', {
                    className: 'clip-row__meta',
                    text: `${n} tile${n === 1 ? '' : 's'} · ${clip.cut ? 'cut' : 'copied'} ${ago(clip.at)}`,
                }),
            ],
        }));

        const drop = el('button', { className: 'clip-row__drop', text: '×' });
        drop.setAttribute('type', 'button');
        drop.title = 'Forget this clip';
        drop.addEventListener('click', (ev) => {
            // The row itself is a pick; the × must not also select what it is removing.
            ev.stopPropagation();
            removeClip(clip.id);
        });
        row.appendChild(drop);

        const choose = () => {
            setActiveClip(clip.id);
            armGhost(editor);
        };
        row.addEventListener('click', choose);
        row.addEventListener('keydown', (ev) => {
            const key = /** @type {KeyboardEvent} */ (ev).key;
            if (key === 'Enter' || key === ' ') { ev.preventDefault(); choose(); }
        });

        list.appendChild(row);
    }

    return list;
}

/**
 * Add the clipboard section to the inspector and keep it in step with the clipboard.
 *
 * Must run after installInspector, which empties the column before building it.
 *
 * @param {any} editor
 */
export function installClipboardPanel(editor) {
    const host = document.getElementById('inspector');
    if (!host) return;

    const section = el('div', { className: 'clip-panel' });

    const head = el('div', { className: 'clip-panel__head' });
    const title = el('span', { className: 'clip-panel__title', text: 'Clipboard' });
    const count = el('span', { className: 'clip-panel__count', text: '' });
    const clearBtn = el('button', { className: 'clip-panel__clear', text: 'Clear' });
    clearBtn.setAttribute('type', 'button');
    clearBtn.title = 'Forget every clip';
    clearBtn.addEventListener('click', () => clearClipboard());
    head.append(title, count, clearBtn);

    /** @type {HTMLElement} */
    let body = render(editor);
    section.append(head, body);

    // Appended after the hex detail, which the inspector swaps out in place with
    // replaceChild — so this stays put across every hover.
    host.appendChild(section);

    const sync = () => {
        const n = clips().length;
        count.textContent = n ? String(n) : '';
        clearBtn.hidden = !n;
        const next = render(editor);
        section.replaceChild(next, body);
        body = next;
    };
    sync();

    document.addEventListener(CLIPBOARD_CHANGED, sync);
}
