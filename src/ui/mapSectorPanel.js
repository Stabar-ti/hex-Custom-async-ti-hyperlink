// @ts-check
/**
 * The Sectors panel: the list of map sectors, the four paint tools, and the bot settings.
 *
 * It is a tool panel (toolPanel.js) like Wormholes: the rail button opens and closes it,
 * the tool buttons arm a map mode, and right-click / Escape disarm without closing it.
 *
 * The list shows, for each sector, whether the bot can use it today — "circle r2 @ 000",
 * "cluster @ 301" — or whether it is "editor only": exported in the explicit `sectors`
 * list the bot does not read yet. See features/mapSectors.js for how that is decided.
 */

import { el, checkbox, select, field, note, buttonRow, button } from './kit/index.js';
import { createToolPanel } from './toolPanel.js';
import { askText } from './askText.js';
import { showToast } from './uiToast.js';
import { setHexSelection } from '../features/hexSelection.js';
import {
    sectorReports, sectorWarnings, describeBotSector, normalizeSectorName,
    sectorNameProblem, suggestSectorName, clampGap, MAX_SECTOR_RADIUS, MAX_SECTOR_GAP,
} from '../features/mapSectors.js';
import {
    MAP_SECTOR_MODES, MAP_SECTORS_CHANGED, knownMapSectors, addPendingMapSector,
    forgetPendingMapSector, mapSectorColours, renameMapSector, deleteMapSector, sectorGap, announceMapSectorsChanged,
} from '../features/mapSectorEditing.js';
import {
    drawMapSectorLayer, mapSectorsVisible, setMapSectorsVisible, MAP_SECTORS_VISIBILITY_CHANGED,
} from '../features/mapSectorOverlay.js';

const MODE_MAP_SECTORS = 'mapSectors';
export const MAP_SECTORS_LAUNCHER_ID = 'launchMapSectorsPopup';

const TOOLS = [
    { mode: MAP_SECTOR_MODES.brush, label: '🖌 Brush', title: 'Click a hex to put it in the active sector. Shift+Drag paints a stroke.' },
    { mode: MAP_SECTOR_MODES.erase, label: '⌫ Erase', title: 'Click a hex to take it out of its sector. Shift+Drag erases a stroke.' },
    { mode: MAP_SECTOR_MODES.circle, label: '◯ Circle', title: 'Click a centre: every hex within the radius joins the active sector, void included. This is the bot\'s manual_circle.' },
    { mode: MAP_SECTOR_MODES.cluster, label: '⁂ Cluster', title: 'Click a tile: its whole island of tiles joins the active sector, grown with the gap and clipped to the cap. This is the bot\'s manual_auto.' },
];

/**
 * Build the panel and its rail button handler.
 *
 * @param {any} editor
 * @returns {{ toggle: () => void, isOpen: () => boolean }}
 */
export function createMapSectorPanel(editor) {
    if (!editor._mapSectorTool) editor._mapSectorTool = { radius: 1, cap: 0 };

    /** @type {(() => void) | null} */
    let refresh = null;

    const panel = createToolPanel({
        id: 'mapSectorsPopup',
        title: '⬣ Sectors',
        mode: MODE_MAP_SECTORS,
        launcherId: MAP_SECTORS_LAUNCHER_ID,
        accent: 'var(--popup-border-sector)',
        width: '330px',
        build: () => {
            const built = buildPanel(editor);
            refresh = built.refresh;
            return built.root;
        },
    });

    const refreshIfOpen = () => { if (panel.isOpen()) refresh?.(); };
    document.addEventListener(MAP_SECTORS_CHANGED, refreshIfOpen);
    document.addEventListener(MAP_SECTORS_VISIBILITY_CHANGED, refreshIfOpen);
    // Generate and ring resizes rebuild or cut the grid under the layer.
    document.addEventListener('ti4:map-reshaped', () => {
        drawMapSectorLayer(editor);
        refreshIfOpen();
    });

    return panel;
}

/** @param {any} editor */
function buildPanel(editor) {
    const root = el('div', { className: 'sector-panel ui-stack ui-stack--normal' });

    // ── Settings ──
    const visible = checkbox({
        label: 'Show sectors',
        checked: mapSectorsVisible(),
        title: 'Show or hide the sector layer on the map',
        onChange: (on) => setMapSectorsVisible(editor, on),
    });
    const gap = select({
        label: 'Gap',
        value: String(sectorGap(editor)),
        title: 'The bot\'s game-wide sectorGap: how many empty hexes may separate two tiles and still leave '
            + 'them in one cluster. The bot uses it for its automatic sectors and whenever it regrows a '
            + 'cluster sector, so it decides which painted sectors export as bot clusters.\n\n'
            + 'In the editor a sector has to be one connected region, so the Cluster tool only reaches '
            + 'across empty hexes when nothing is in between: use 0 to paint clusters here.',
        options: Array.from({ length: MAX_SECTOR_GAP + 1 }, (_, i) => ({ value: String(i), label: String(i) })),
        onChange: (v) => {
            editor.sectorGap = clampGap(v);
            announceMapSectorsChanged(editor);
        },
    });
    root.appendChild(el('div', { className: 'sector-panel__settings', children: [visible, gap] }));

    // ── The list ──
    const list = el('div', { className: 'sector-list' });
    root.appendChild(list);

    const nameField = field({ label: 'New', placeholder: suggestSectorName(knownMapSectors(editor)) });
    const addBtn = button({ text: '+ Add', title: 'Add a sector and make it the one you paint with' });
    root.appendChild(el('div', { className: 'sector-panel__add', children: [nameField, addBtn] }));

    /** Add the typed (or suggested) name and paint with it. @returns {string|null} */
    const addSector = () => {
        const typed = nameField.input.value.trim();
        const name = normalizeSectorName(typed || nameField.input.placeholder);
        const problem = sectorNameProblem(name);
        if (problem) { showToast(problem, 'warning', 5000); return null; }
        addPendingMapSector(editor, name);
        editor._activeMapSector = name;
        nameField.input.value = '';
        refresh();
        drawMapSectorLayer(editor);
        return name;
    };
    addBtn.addEventListener('click', () => addSector());
    nameField.input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addSector(); });

    // ── Tools ──
    const activeLabel = el('div', { className: 'sector-panel__active' });
    root.appendChild(activeLabel);

    const grid = el('div', { className: 'tool-panel__grid' });
    for (const tool of TOOLS) {
        const btn = button({ text: tool.label, title: tool.title });
        btn.dataset.tool = '';
        btn.dataset.sectorMode = tool.mode;
        btn.addEventListener('click', () => {
            const turningOff = btn.classList.contains('active');
            grid.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
            if (turningOff) {
                editor.setMode('none');
                return;
            }
            // Painting needs a sector to paint with. With none chosen, the name in the box
            // (or the suggestion under it) becomes one, rather than the tool doing nothing.
            if (tool.mode !== MAP_SECTOR_MODES.erase && !editor._activeMapSector && !addSector()) return;
            btn.classList.add('active');
            editor.setMode(tool.mode);
        });
        grid.appendChild(btn);
    }
    root.appendChild(grid);

    const radius = field({
        label: 'Circle radius', type: 'number', value: String(editor._mapSectorTool.radius),
        title: `0–${MAX_SECTOR_RADIUS} hexes from the centre`,
        onInput: (v) => { editor._mapSectorTool.radius = clampInt(v, 0, MAX_SECTOR_RADIUS, 1); },
    });
    const cap = field({
        label: 'Cluster cap', type: 'number', value: String(editor._mapSectorTool.cap),
        title: `0 = the whole island; 1–${MAX_SECTOR_RADIUS} = only tiles that close to the clicked one`,
        onInput: (v) => { editor._mapSectorTool.cap = clampInt(v, 0, MAX_SECTOR_RADIUS, 0); },
    });
    for (const f of [radius, cap]) {
        f.input.min = '0';
        f.input.max = String(MAX_SECTOR_RADIUS);
    }
    root.appendChild(el('div', { className: 'sector-panel__numbers', children: [radius, cap] }));

    const warnings = el('div', { className: 'ui-stack ui-stack--tight' });
    root.appendChild(warnings);

    root.appendChild(note(
        'A sector is one connected region, and a hex is only ever in one sector. Fills take hexes from other sectors, unless that would cut one in two. '
        + 'Right-click a tile with no tool armed for Sector ▸ on it or on the whole selection.'));

    function refresh() {
        const gapNow = sectorGap(editor);
        const reports = sectorReports(editor.hexes, gapNow);
        const byName = new Map(reports.map(r => [r.name, r]));
        const names = knownMapSectors(editor);
        if (editor._activeMapSector && !names.includes(editor._activeMapSector)) editor._activeMapSector = null;

        const colours = mapSectorColours(editor);
        list.textContent = '';
        if (!names.length) {
            list.appendChild(note('No sectors yet. Add one, then paint with it.'));
        }
        for (const name of names) {
            const r = byName.get(name);
            const count = r ? r.positions.length : 0;
            const status = r && r.pieces > 1 ? `split into ${r.pieces} pieces — must be one region`
                : r?.problem ? 'name rejected by the bot'
                : (r ? describeBotSector(r.bot) : 'empty');
            const isActive = editor._activeMapSector === name;

            const row = el('div', {
                className: 'sector-row' + (isActive ? ' is-active' : ''),
                title: isActive ? 'Painting with this sector' : 'Click to paint with this sector',
                children: [
                    el('span', { className: 'sector-row__swatch', style: { background: colours.get(name) || '' } }),
                    el('span', { className: 'sector-row__name', text: name }),
                    el('span', { className: 'sector-row__count', text: String(count) }),
                    el('span', {
                        className: 'sector-row__status' + (r?.bot && !r.problem && r.pieces <= 1 ? ' is-bot' : ''),
                        text: status,
                    }),
                ],
            });
            row.addEventListener('click', () => {
                editor._activeMapSector = name;
                refresh();
                drawMapSectorLayer(editor);
            });

            const actions = buttonRow([
                rowButton('⌖', 'Select its hexes', () => {
                    if (r) setHexSelection(editor, r.positions);
                }, !r),
                rowButton('✎', 'Rename', () => renameSector(editor, name)),
                // No "are you sure": deleting is one undo step, which is quicker than a dialog.
                rowButton('✕', 'Delete (Ctrl+Z brings it back)', () => {
                    forgetPendingMapSector(editor, name);
                    if (count) deleteMapSector(editor, name);
                    if (editor._activeMapSector === name) editor._activeMapSector = null;
                    refresh();
                    drawMapSectorLayer(editor);
                    if (count) showToast(`Deleted ${name} — Ctrl+Z to undo.`, 'info', 4000);
                }),
            ], { className: 'sector-row__actions' });
            row.appendChild(actions);
            list.appendChild(row);
        }

        const active = editor._activeMapSector;
        activeLabel.textContent = active ? `Painting with: ${active}` : 'Pick or add a sector to paint with';
        activeLabel.style.color = active ? (colours.get(active) || '') : '';

        nameField.input.placeholder = suggestSectorName(names);
        gap.select.value = String(gapNow);
        visible.input.checked = mapSectorsVisible();

        warnings.textContent = '';
        for (const w of sectorWarnings(reports)) warnings.appendChild(note(w, { tone: 'warning' }));
    }

    refresh();
    return { root, refresh };
}

/** @param {any} editor @param {string} from */
async function renameSector(editor, from) {
    const to = await askText({
        title: '⬣ Rename sector',
        label: `New name for "${from}":`,
        value: from,
        okLabel: 'Rename',
        normalize: normalizeSectorName,
        validate: sectorNameProblem,
    });
    if (!to || to === from) return;
    if (knownMapSectors(editor).includes(to)
        && !window.confirm(`"${to}" already exists. Merge "${from}" into it?`)) return;
    const painted = Object.values(editor.hexes).some(h => h.mapSector === from);
    // Refused when merging into a sector it does not touch; the toast says why, and
    // nothing changes.
    if (painted && !renameMapSector(editor, from, to)) return;
    forgetPendingMapSector(editor, from);
    if (!painted) addPendingMapSector(editor, to);
    if (editor._activeMapSector === from) editor._activeMapSector = to;
    announceMapSectorsChanged(editor);
}

/**
 * @param {string} text @param {string} title @param {() => void} onClick
 * @param {boolean} [disabled]
 */
function rowButton(text, title, onClick, disabled = false) {
    const b = button({ text, title, className: 'sector-row__btn' });
    b.disabled = disabled;
    b.addEventListener('click', (ev) => {
        // The row itself picks the sector; its buttons should not also do that.
        ev.stopPropagation();
        onClick();
    });
    return b;
}

/** @param {string} v @param {number} lo @param {number} hi @param {number} fallback */
function clampInt(v, lo, hi, fallback) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}
