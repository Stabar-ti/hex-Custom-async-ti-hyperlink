/**
 * Arming a tile and placing it on the map.
 *
 * The old flow was: click a row (which set `editor.pendingSystemId`), then click a hex.
 * Three things were wrong with it.
 *
 * It was invisible. Nothing about the map said you were in a placing mode, so a stray
 * click on the map put a tile somewhere you didn't want one, and the only way to notice
 * was to see it happen.
 *
 * It was single-shot with no way to say otherwise. Filling a ring with the same anomaly,
 * or laying a run of hyperlanes, meant going back to the list for every single hex.
 *
 * And it fired twice. The polygon's own click handler (uiEvents.js, via drawHexes) runs
 * before the SVG-level assignment handler in main.js, so clicking a hex with a system
 * pending FIRST painted the hex with whatever the current mode was, and only then
 * assigned the system over the top. Both went into the undo history. This module owns the
 * click in the capture phase instead, so while a tile is armed the map does exactly one
 * thing.
 *
 * Modes: 'once' (default — the old behaviour), 'keep' (stays armed), 'count' (N, then
 * disarms). Escape always disarms. The armed banner lives on document.body, not inside
 * the popup, because the popup gets dragged off-screen and the state has to stay visible.
 * It sits at the bottom of the screen: the top belongs to the toolbar and to wherever
 * popups happen to be, and an overlay there covered the picker's own help and close
 * buttons.
 */

import { assignSystem } from '../../features/assignSystem.js';
import { redrawAllRealIDOverlays } from '../../features/realIDsOverlays.js';
import { tileImage } from './pickerCells.js';
import * as state from './pickerState.js';

let editorRef = null;
let clickHandler = null;
let keyHandler = null;
let banner = null;
let undoBand = null;
let undoTimer = null;
let unsubscribe = null;

const UNDO_VISIBLE_MS = 6000;

// ── Install ───────────────────────────────────────────────────────────────────

/**
 * Starts watching the store. Arming and disarming follow `state.armed`, so anything that
 * can arm a tile — a grid cell, a table row, the random-tile popup — gets the banner, the
 * crosshair and the click handling for free.
 */
export function installPlacement(editor) {
    editorRef = editor;
    unsubscribe?.();
    unsubscribe = state.subscribe(syncToStore);
    syncToStore();
}

export function uninstallPlacement() {
    unsubscribe?.();
    unsubscribe = null;
    detachListeners();
    removeBanner();
    hideUndoBand();
    editorRef = null;
}

function syncToStore() {
    const armed = state.getArmed();
    if (armed) {
        attachListeners();
        renderBanner(armed);
        document.body.classList.add('sp-placing');
    } else {
        detachListeners();
        removeBanner();
        document.body.classList.remove('sp-placing');
    }
}

// ── Map listeners ─────────────────────────────────────────────────────────────

function mapSvg() {
    return editorRef?.svg || document.querySelector('#hexMap');
}

function attachListeners() {
    if (clickHandler) return;
    const svg = mapSvg();
    if (!svg) return;

    clickHandler = event => {
        const node = event.target.closest?.('[data-label]');
        const hexId = node?.getAttribute('data-label');
        if (!hexId) return;
        // Capture phase + stopPropagation: while armed, a map click places and does
        // nothing else. This is what stops the current paint mode from also firing.
        event.preventDefault();
        event.stopPropagation();
        placeArmedOn(hexId);
    };
    svg.addEventListener('click', clickHandler, true);

    keyHandler = event => {
        if (event.key !== 'Escape') return;
        if (!state.isArmed()) return;
        event.preventDefault();
        event.stopPropagation();
        state.disarm();
    };
    // Capture phase so Escape disarms before the global handler closes a popup —
    // "stop what I'm doing" should undo the most recent thing first.
    document.addEventListener('keydown', keyHandler, true);
}

function detachListeners() {
    const svg = mapSvg();
    if (svg && clickHandler) svg.removeEventListener('click', clickHandler, true);
    if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
    clickHandler = null;
    keyHandler = null;
}

// ── Placement ─────────────────────────────────────────────────────────────────

/**
 * Assigns the armed tile to a hex as one undo step.
 *
 * The history dance mirrors what main.js did: snapshot before mutating, lock history so
 * the cascade of setSectorType/applyEffect calls inside assignSystem don't each record
 * their own step, then commit one group.
 */
export function placeArmedOn(hexId) {
    const armed = state.getArmed();
    const editor = editorRef;
    if (!armed || !editor) return false;

    const sys = editor.sectorIDLookup?.[armed.id];
    if (!sys) {
        console.warn(`[SystemPicker] armed tile ${armed.id} is not in sectorIDLookup`);
        state.disarm();
        return false;
    }

    editor.beginUndoGroup();
    editor.saveState(hexId);
    editor._historyLocked = true;
    try {
        assignSystem(editor, sys, hexId);
    } finally {
        editor._historyLocked = false;
        editor.commitUndoGroup();
    }
    redrawAllRealIDOverlays(editor);

    editor.selectedHex = hexId;

    state.noteRecent(armed.id);
    const stillArmed = state.consumeArmed();
    showUndoBand(armed, hexId, stillArmed);
    return true;
}

// ── Armed banner ──────────────────────────────────────────────────────────────

function renderBanner(armed) {
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sp-armed-banner';
        banner.className = 'sp-armed';
        document.body.appendChild(banner);
    }
    banner.innerHTML = '';

    const thumb = tileImage(armed.system, { size: 34, className: 'sp-armed-thumb' });
    if (thumb) banner.appendChild(thumb);

    const text = document.createElement('div');
    text.className = 'sp-armed-text';
    const title = document.createElement('div');
    title.className = 'sp-armed-title';
    title.textContent = `${armed.id} — ${armed.name || 'Unnamed'}`;
    const hint = document.createElement('div');
    hint.className = 'sp-armed-hint';
    hint.textContent = armed.mode === 'count'
        ? `Click a hex to place — ${armed.remaining} left`
        : armed.mode === 'keep'
            ? 'Click hexes to keep placing — Esc to stop'
            : 'Click a hex to place — Esc to cancel';
    text.appendChild(title);
    text.appendChild(hint);
    banner.appendChild(text);

    const modes = document.createElement('div');
    modes.className = 'sp-armed-modes';
    modes.appendChild(modeButton('Once', 'once', armed, 'Place once, then stop'));
    modes.appendChild(modeButton('Keep', 'keep', armed, 'Stay armed until you press Escape'));
    modes.appendChild(countButton(armed));
    banner.appendChild(modes);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sp-armed-close';
    close.textContent = '×';
    close.title = 'Cancel placement (Esc)';
    close.addEventListener('click', () => state.disarm());
    banner.appendChild(close);
}

function modeButton(label, mode, armed, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sp-armed-mode${armed.mode === mode ? ' is-on' : ''}`;
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => state.setArmedMode(mode));
    return btn;
}

function countButton(armed) {
    const wrap = document.createElement('span');
    wrap.className = `sp-armed-mode sp-armed-count${armed.mode === 'count' ? ' is-on' : ''}`;
    wrap.title = 'Place a fixed number of copies, then stop';

    const label = document.createElement('span');
    label.textContent = '×';
    wrap.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '99';
    input.value = String(armed.mode === 'count' ? armed.remaining : 3);
    input.className = 'sp-armed-count-input';
    // Switching to count mode is what typing a number means; no separate click needed.
    input.addEventListener('input', () => {
        const n = Math.max(1, Math.min(99, Number(input.value) || 1));
        state.setArmedMode('count', n);
    });
    input.addEventListener('click', e => e.stopPropagation());
    wrap.appendChild(input);
    return wrap;
}

function removeBanner() {
    banner?.remove();
    banner = null;
}

// ── Undo band ─────────────────────────────────────────────────────────────────

/**
 * "Placed 42 — Lodor on 203. [Undo]", for a few seconds.
 *
 * Placement is otherwise silent, and a tile dropped on the wrong hex is easy to do and
 * easy to miss. This is also the only place the app tells you Ctrl+Z is available here.
 */
function showUndoBand(armed, hexId, stillArmed) {
    hideUndoBand();
    undoBand = document.createElement('div');
    undoBand.className = 'sp-undo-band';

    const text = document.createElement('span');
    text.textContent = `Placed ${armed.id} — ${armed.name || 'Unnamed'} on ${hexId}.`;
    undoBand.appendChild(text);

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'sp-undo-btn';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => {
        editorRef?.undo?.();
        hideUndoBand();
    });
    undoBand.appendChild(undo);

    if (stillArmed) {
        const note = document.createElement('span');
        note.className = 'sp-undo-note';
        note.textContent = 'still armed';
        undoBand.appendChild(note);
    }

    document.body.appendChild(undoBand);
    undoTimer = setTimeout(hideUndoBand, UNDO_VISIBLE_MS);
}

function hideUndoBand() {
    if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
    undoBand?.remove();
    undoBand = null;
}
