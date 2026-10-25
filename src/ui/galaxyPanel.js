// @ts-check
/**
 * The Galaxies panel: the main map and the extra boards a–g, each one a galaxy in the bot.
 *
 * Add a galaxy and it appears to the right of the main map. Each row names it, sizes it,
 * frames it in the view, or removes it. Opened from Map size ▾.
 */

import { el, button, note } from './kit/index.js';
import { showPopup, togglePopup, isPopupOpen } from './popupUI.js';
import { resetView } from './viewControls.js';
import { hasContent } from './uiBindings.js';import { GALAXY_BOARDS, MAX_BOARD_RINGS } from '../utils/hexGrid.js';
import {
    GALAXIES_CHANGED, boardsOf, addGalaxy, removeGalaxy, setGalaxyRings, hexesCutFromBoard,
    hexesOnBoard, setGalaxyName, focusGalaxy,
} from '../features/galaxies.js';
import {
    galaxyId, normalizeGalaxyName, galaxyNameProblem, galaxyNameRisk,
} from '../features/galaxyModel.js';

const POPUP_ID = 'galaxiesPopup';

/** Open or close the panel. @param {any} editor */
export function toggleGalaxyPanel(editor) {
    togglePopup(POPUP_ID, () => openGalaxyPanel(editor));
}

/** @param {any} editor */
function openGalaxyPanel(editor) {
    const root = el('div', { className: 'galaxy-panel ui-stack ui-stack--normal' });
    const list = el('div', { className: 'galaxy-list' });
    const addBtn = button({ text: '+ Add galaxy', title: 'Add a board to the right of the map' });
    const allBtn = button({ text: 'Show whole map', title: 'Frame every galaxy in the view' });
    addBtn.addEventListener('click', () => {
        const board = addGalaxy(editor);
        if (board) focusGalaxy(editor, board);
    });
    allBtn.addEventListener('click', () => resetView(editor));

    root.append(
        list,
        el('div', { className: 'ui-btn-row', children: [addBtn, allBtn] }),
        note('Galaxies other than main need a Fog of War game: the bot refuses their tiles otherwise.', { tone: 'warning' }),
        note(`Extra galaxies hold up to ${MAX_BOARD_RINGS} rings, the most the bot's positions (a000 … g848) can name. `
            + 'Hexes never neighbour across galaxies; connect them with wormholes or custom links. '
            + 'An unnamed galaxy is named by the bot.'),
    );

    const refresh = () => {
        list.textContent = '';
        list.appendChild(galaxyRow(editor, ''));
        for (const b of GALAXY_BOARDS) if (boardsOf(editor)[b]) list.appendChild(galaxyRow(editor, b));
        addBtn.disabled = GALAXY_BOARDS.every(b => boardsOf(editor)[b]);
    };
    refresh();

    const onChange = () => { if (isPopupOpen(POPUP_ID)) refresh(); };
    document.addEventListener(GALAXIES_CHANGED, onChange);
    document.addEventListener('ti4:map-reshaped', onChange);

    showPopup({
        id: POPUP_ID,
        title: '🌌 Galaxies',
        content: root,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        className: 'tool-panel',
        style: { width: '360px' },
        onClose: () => {
            document.removeEventListener(GALAXIES_CHANGED, onChange);
            document.removeEventListener('ti4:map-reshaped', onChange);
        },
    });
}

/**
 * One galaxy: its id, its name, its size (extra boards only), Focus and Remove.
 * @param {any} editor @param {string} board  '' for main
 */
function galaxyRow(editor, board) {
    const id = galaxyId(board);
    const names = editor.galaxyNames || {};
    const message = el('div', { className: 'galaxy-row__message' });

    const name = /** @type {HTMLInputElement} */ (el('input', {
        className: 'input-dark galaxy-row__name',
        attrs: { placeholder: board ? 'named by the bot' : 'milky-way (bot default)', spellcheck: 'false' },
        title: 'Lowercase letters, digits and -, up to 20 characters. Leave empty to let the bot name it.',
    }));
    name.value = names[id] || '';
    const showRisk = () => {
        const risk = galaxyNameRisk(names[id] || '', id);
        message.textContent = risk || '';
        message.classList.toggle('is-warning', !!risk);
    };
    name.addEventListener('change', () => {
        const value = normalizeGalaxyName(name.value);
        const problem = galaxyNameProblem(value, id, names);
        if (problem) {
            message.textContent = problem;
            message.classList.add('is-warning');
            name.value = names[id] || '';
            return;
        }
        name.value = value;
        setGalaxyName(editor, id, value);
    });
    showRisk();

    const focus = button({ text: 'View', title: 'Frame this galaxy in the view', className: 'galaxy-row__btn' });
    focus.addEventListener('click', () => focusGalaxy(editor, board));

    const children = [el('span', { className: 'galaxy-row__id', text: id }), name];

    if (board) {
        const rings = boardsOf(editor)[board].rings;
        const minus = button({ text: '−', title: 'One ring fewer', className: 'galaxy-row__btn' });
        const plus = button({ text: '+', title: 'One ring more', className: 'galaxy-row__btn' });
        minus.disabled = rings <= 1;
        plus.disabled = rings >= MAX_BOARD_RINGS;
        // Only asked when something would be lost: these cannot be undone.
        minus.addEventListener('click', () => {
            const lost = hexesCutFromBoard(editor, board, rings - 1).filter(hasContent);
            if (lost.length && !window.confirm(`${lost.length} hex(es) with data on galaxy ${board} will be removed. This cannot be undone. Proceed?`)) return;
            setGalaxyRings(editor, board, rings - 1);
        });
        plus.addEventListener('click', () => setGalaxyRings(editor, board, rings + 1));

        const remove = button({ text: '✕', title: 'Remove this galaxy and everything on it', className: 'galaxy-row__btn' });
        remove.addEventListener('click', () => {
            const used = hexesOnBoard(editor, board).filter(hasContent).length;
            if (used && !window.confirm(`Remove galaxy ${board}? ${used} hex(es) on it hold data, and links into it go too. This cannot be undone.`)) return;
            removeGalaxy(editor, board);
        });

        children.push(
            el('span', {
                className: 'galaxy-row__rings',
                title: `Rings, 1–${MAX_BOARD_RINGS}`,
                children: [minus, el('span', { text: String(rings) }), plus],
            }),
            focus,
            remove,
        );
    } else {
        children.push(el('span', { className: 'galaxy-row__rings galaxy-row__muted', text: 'Map size ▾', title: 'The main map is sized from Map size' }), focus);
    }

    return el('div', { className: 'galaxy-row', children: [...children, message] });
}
