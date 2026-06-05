/**
 * Spin-To-Win — visualise and export ring-spin settings for the AsyncTI4 bot.
 * Mirrors the logic in SpinRingsHelper.java (AsyncTI4 TI4_map_generator_bot).
 *
 * Overlay layers:
 *  1. spinToWinOverlay    — coloured ring highlights + direction arcs
 *  2. spinToWinSimOverlay — movement arrows (no map change)
 *
 * Apply actions (each is its own undo group, so Ctrl+Z undoes one at a time):
 *  - Per-ring ⚡ button
 *  - Phase buttons (STATUS / STRATEGY)
 *  - Apply ALL
 *
 * Snapshot: hard save/restore outside the undo stack — safety net for testing.
 */

import { enforceSvgLayerOrder } from '../../draw/enforceSvgLayerOrder.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const RING_DIRS = [
    [1, 0],  // SE
    [0, 1],  // S
    [-1, 1],  // SW
    [-1, 0],  // NW
    [0, -1],  // N
    [1, -1],  // NE
];

/**
 * Generate a distinct ring color for any index ≥ 0.
 * Round 0 (idx 0–5):  hues 0°,60°,120°,180°,240°,300°  — lightness 60%
 * Round 1 (idx 6–11): hues 30°,90°,150°,210°,270°,330° — lightness 73% (lighter)
 * Round 2+ (idx 12+): same hues, lightness 45% (darker)
 * This gives 12 visually distinct colours before any repetition.
 */
function getRingColor(idx) {
    const round = Math.floor(idx / 6);
    const pos = idx % 6;
    const hue = pos * 60 + round * 30;
    const lht = round === 0 ? 60 : round === 1 ? 73 : 45;
    const stroke = `hsl(${hue}, 100%, ${lht}%)`;
    const fill = `hsla(${hue}, 100%, ${lht}%, 0.22)`;
    const glow = `hsla(${hue}, 100%, ${lht}%, 0.55)`;
    return { fill, stroke, glow };
}

// ── Core geometry ──────────────────────────────────────────────────────────────

function buildRing(cq, cr, ring) {
    const result = [];
    let q = cq, r = cr - ring;
    for (let d = 0; d < 6; d++) {
        for (let i = 0; i < ring; i++) {
            result.push({ q, r });
            q += RING_DIRS[d][0];
            r += RING_DIRS[d][1];
        }
    }
    return result;
}

function buildCoordMap(editor) {
    const map = new Map();
    for (const [label, hex] of Object.entries(editor.hexes)) {
        if (hex.q !== null && hex.r !== null) map.set(`${hex.q},${hex.r}`, label);
    }
    return map;
}

/**
 * @param {boolean} deterministic - true = pick first from comma-sep lists (sim preview)
 * @returns {{ moves, ring, steps, dir } | null}
 */
function computeMoves(editor, spin, coordMap, deterministic = false) {
    const centerHex = editor.hexes[spin.position || '000'];
    if (!centerHex || centerHex.q === null) return null;

    const ringVal = String(spin.ring || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);
    const stepsVal = String(spin.steps || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);

    const ring = deterministic ? (ringVal[0] || 1) : (ringVal[Math.floor(Math.random() * ringVal.length)] || 1);
    const steps = deterministic ? (stepsVal[0] || 1) : (stepsVal[Math.floor(Math.random() * stepsVal.length)] || 1);

    let dir = spin.direction || 'CW';
    if (dir === 'RND') dir = deterministic ? 'CW' : (Math.random() < 0.5 ? 'CW' : 'CCW');
    const cw = dir === 'CW';

    const ringHexes = buildRing(centerHex.q, centerHex.r, ring);
    const n = ringHexes.length;
    const labels = ringHexes.map(h => coordMap.get(`${h.q},${h.r}`) || null);

    const moves = [];
    for (let i = 0; i < n; i++) {
        const from = labels[i];
        if (!from) continue;
        const newIdx = cw ? (i + steps) % n : (i - steps + n) % n;
        const to = labels[newIdx];
        if (to) moves.push({ from, to });
    }
    return { moves, ring, steps, dir };
}

// ── SVG helpers ────────────────────────────────────────────────────────────────

function hexPolygonPoints(center, hexRadius) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i);
        return `${center.x + hexRadius * Math.cos(a)},${center.y + hexRadius * Math.sin(a)}`;
    }).join(' ');
}

function drawDirectionArc(layer, cx, cy, arcRadius, cw, color, strokeWidth = 3, dashed = true) {
    const toRad = d => d * Math.PI / 180;
    const sx = cx + arcRadius * Math.cos(toRad(cw ? -20 : 200));
    const sy = cy + arcRadius * Math.sin(toRad(cw ? -20 : 200));
    const ex = cx + arcRadius * Math.cos(toRad(cw ? 200 : -20));
    const ey = cy + arcRadius * Math.sin(toRad(cw ? 200 : -20));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${sx},${sy} A${arcRadius},${arcRadius} 0 1,${cw ? 1 : 0} ${ex},${ey}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(strokeWidth));
    path.setAttribute('stroke-linecap', 'round');
    if (dashed) path.setAttribute('stroke-dasharray', '8 4');
    path.setAttribute('marker-end', `url(#spin-arc-${cw ? 'cw' : 'ccw'}-v2)`);
    layer.appendChild(path);
}

function ensureGlowFilter(svg) {
    if (svg.querySelector('#spin-glow-filter')) return;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(SVG_NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'spin-glow-filter');
    filter.setAttribute('x', '-40%'); filter.setAttribute('y', '-40%');
    filter.setAttribute('width', '180%'); filter.setAttribute('height', '180%');
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '3.5'); blur.setAttribute('result', 'blur');
    const merge = document.createElementNS(SVG_NS, 'feMerge');
    for (const inName of ['blur', 'SourceGraphic']) {
        const node = document.createElementNS(SVG_NS, 'feMergeNode');
        node.setAttribute('in', inName); merge.appendChild(node);
    }
    filter.appendChild(blur); filter.appendChild(merge); defs.appendChild(filter);
}

function drawCenterMarker(layer, cx, cy, color) {
    const r = 8;
    // X cross
    for (const [x1, y1, x2, y2] of [
        [cx - r, cy - r, cx + r, cy + r],
        [cx + r, cy - r, cx - r, cy + r],
    ]) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#000'); line.setAttribute('stroke-width', '4');
        line.setAttribute('stroke-linecap', 'round');
        layer.appendChild(line);
    }
    for (const [x1, y1, x2, y2] of [
        [cx - r, cy - r, cx + r, cy + r],
        [cx + r, cy - r, cx - r, cy + r],
    ]) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        layer.appendChild(line);
    }
}

function ensureSpinMarkers(svg) {
    if (svg.querySelector('#spin-arc-cw-v2')) return;
    // Remove any old v1 markers (had white fill)
    svg.querySelector('#spin-arc-cw')?.remove();
    svg.querySelector('#spin-arc-ccw')?.remove();
    svg.querySelector('#spin-sim-arrow')?.remove();
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS(SVG_NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }

    for (const [id, orient] of [['spin-arc-cw-v2', 'auto'], ['spin-arc-ccw-v2', 'auto-start-reverse']]) {
        const marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('markerWidth', '8'); marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '4'); marker.setAttribute('refY', '2.5');
        marker.setAttribute('orient', orient);
        const p = document.createElementNS(SVG_NS, 'polygon');
        p.setAttribute('points', '0 0, 6 2.5, 0 5');
        p.setAttribute('fill', 'context-stroke'); // inherits stroke colour of the referencing path
        marker.appendChild(p); defs.appendChild(marker);
    }
    const simM = document.createElementNS(SVG_NS, 'marker');
    simM.setAttribute('id', 'spin-sim-arrow');
    simM.setAttribute('markerWidth', '10'); simM.setAttribute('markerHeight', '7');
    simM.setAttribute('refX', '9'); simM.setAttribute('refY', '3.5');
    simM.setAttribute('orient', 'auto');
    const simP = document.createElementNS(SVG_NS, 'polygon');
    simP.setAttribute('points', '0 0, 10 3.5, 0 7');
    simP.setAttribute('fill', 'context-stroke');
    simM.appendChild(simP); defs.appendChild(simM);
}

// ── Ring highlight overlay ─────────────────────────────────────────────────────

export function drawSpinOverlay(editor, spinSettings) {
    clearSpinOverlay(editor);
    const visible = spinSettings?.filter(s => s.visible !== false);
    if (!visible?.length) return;

    ensureSpinMarkers(editor.svg);
    ensureGlowFilter(editor.svg);

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'spinToWinOverlay'; layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    // Glow sub-layer (rendered first, blurred — creates the halo effect)
    const glowLayer = document.createElementNS(SVG_NS, 'g');
    glowLayer.setAttribute('filter', 'url(#spin-glow-filter)');
    layer.appendChild(glowLayer);

    // Main sub-layer (rendered on top, crisp)
    const mainLayer = document.createElementNS(SVG_NS, 'g');
    layer.appendChild(mainLayer);

    const coordMap = buildCoordMap(editor);
    const hexR = editor.hexRadius || 40;
    const polyR = hexR * 0.91;

    for (const spin of visible) {
        const idx = spinSettings.indexOf(spin);
        const centerHex = editor.hexes[spin.position || '000'];
        if (!centerHex?.center) continue;

        const ring = parseInt(spin.ring) || 1;
        const color = getRingColor(idx);
        const cw = spin.direction !== 'CCW';

        const ringHexes = buildRing(centerHex.q, centerHex.r, ring);
        let sumX = 0, sumY = 0, count = 0;

        for (const { q, r: rr } of ringHexes) {
            const lbl = coordMap.get(`${q},${rr}`);
            const hex = lbl && editor.hexes[lbl];
            if (!hex?.center) continue;
            sumX += hex.center.x; sumY += hex.center.y; count++;

            // Glow polygon — thick stroke, will be blurred
            const glowPoly = document.createElementNS(SVG_NS, 'polygon');
            glowPoly.setAttribute('points', hexPolygonPoints(hex.center, polyR));
            glowPoly.setAttribute('fill', color.glow.replace('0.55', '0.18'));
            glowPoly.setAttribute('stroke', color.glow);
            glowPoly.setAttribute('stroke-width', '9');
            glowPoly.setAttribute('stroke-linejoin', 'round');
            glowLayer.appendChild(glowPoly);

            // Main polygon — solid fill + crisp border
            const poly = document.createElementNS(SVG_NS, 'polygon');
            poly.setAttribute('points', hexPolygonPoints(hex.center, polyR));
            poly.setAttribute('fill', color.fill);
            poly.setAttribute('stroke', color.stroke);
            poly.setAttribute('stroke-width', '2.5');
            poly.setAttribute('stroke-linejoin', 'round');
            mainLayer.appendChild(poly);

            // Ring label — circle badge
            const bx = hex.center.x, by = hex.center.y - polyR * 0.58;
            const circ = document.createElementNS(SVG_NS, 'circle');
            circ.setAttribute('cx', bx); circ.setAttribute('cy', by); circ.setAttribute('r', '11');
            circ.setAttribute('fill', '#000c'); circ.setAttribute('stroke', color.stroke);
            circ.setAttribute('stroke-width', '1.5');
            mainLayer.appendChild(circ);
            const txt = document.createElementNS(SVG_NS, 'text');
            txt.setAttribute('x', bx); txt.setAttribute('y', by + 4);
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '10');
            txt.setAttribute('font-weight', 'bold'); txt.setAttribute('fill', color.stroke);
            txt.textContent = `R${ring}`;
            mainLayer.appendChild(txt);
        }

        if (count > 0) {
            const cx = sumX / count, cy = sumY / count;
            const arcR = hexR * ring * 0.85;
            // Glow arc
            drawDirectionArc(glowLayer, cx, cy, arcR, cw, color.glow, 10, false);
            // Main arc
            drawDirectionArc(mainLayer, cx, cy, arcR, cw, color.stroke, 3, true);
        }

        // Center hex marker (X on the position hex)
        drawCenterMarker(mainLayer, centerHex.center.x, centerHex.center.y, color.stroke);
    }
    enforceSvgLayerOrder(editor.svg);
}

export function clearSpinOverlay(editor) {
    editor?.svg?.querySelector('#spinToWinOverlay')?.remove();
}

// ── Simulation overlay — movement arrows, NO map change ────────────────────────

export function drawSimOverlay(editor, allSettings, targetSpins) {
    clearSimOverlay(editor);
    if (!targetSpins?.length) return;

    ensureSpinMarkers(editor.svg);
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'spinToWinSimOverlay'; layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const coordMap = buildCoordMap(editor);
    const hexR = editor.hexRadius || 40;
    const margin = hexR * 0.38;

    for (const spin of targetSpins) {
        const idx = allSettings.indexOf(spin);
        const color = getRingColor(idx);
        const result = computeMoves(editor, spin, coordMap, true);
        if (!result) continue;

        for (const { from, to } of result.moves) {
            if (from === to) continue;
            const fh = editor.hexes[from], th = editor.hexes[to];
            if (!fh?.center || !th?.center) continue;

            const fx = fh.center.x, fy = fh.center.y;
            const tx = th.center.x, ty = th.center.y;
            const dx = tx - fx, dy = ty - fy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', fx + (dx / dist) * margin);
            line.setAttribute('y1', fy + (dy / dist) * margin);
            line.setAttribute('x2', tx - (dx / dist) * (margin + 4));
            line.setAttribute('y2', ty - (dy / dist) * (margin + 4));
            line.setAttribute('stroke', color.stroke); line.setAttribute('stroke-width', '2.5');
            line.setAttribute('marker-end', 'url(#spin-sim-arrow)');
            layer.appendChild(line);

            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', fx); dot.setAttribute('cy', fy); dot.setAttribute('r', 5);
            dot.setAttribute('fill', color.stroke); dot.setAttribute('fill-opacity', '0.65');
            dot.setAttribute('stroke', '#000'); dot.setAttribute('stroke-width', '0.5');
            layer.appendChild(dot);
        }
    }
    enforceSvgLayerOrder(editor.svg);
}

export function clearSimOverlay(editor) {
    editor?.svg?.querySelector('#spinToWinSimOverlay')?.remove();
}

// ── Snapshot — save/restore using editor's authoritative clone/restore ─────────

/**
 * Save the full map state using editor._cloneState (same as history system).
 * Returns a { label → snap } map, or null if _cloneState is unavailable.
 */
export function saveMapSnapshot(editor) {
    if (!editor?._cloneState) {
        console.error('[SpinToWin] editor._cloneState not available — history module not loaded?');
        return null;
    }
    const snaps = {};
    for (const label of Object.keys(editor.hexes)) {
        try { snaps[label] = editor._cloneState(label); }
        catch (e) { console.error('[SpinToWin] _cloneState failed for', label, e); }
    }
    return snaps;
}

/**
 * Restore the map from a snapshot taken by saveMapSnapshot.
 * Uses editor._restoreState per hex so all visual teardown/rebuild is handled.
 * The whole restore is one undo group — Ctrl+Z undoes it.
 */
export function restoreMapSnapshot(editor, snaps) {
    if (!snaps) return false;
    if (!editor?._restoreState) {
        console.error('[SpinToWin] editor._restoreState not available — history module not loaded?');
        return false;
    }

    editor.beginUndoGroup?.();
    for (const label of Object.keys(snaps)) {
        try { editor.saveState?.(label); } catch (_) { }
    }

    editor._historyLocked = true;
    let errorCount = 0;
    try {
        for (const snap of Object.values(snaps)) {
            try { editor._restoreState(snap); }
            catch (e) { errorCount++; console.error('[SpinToWin] _restoreState failed for', snap?.id, e); }
        }
    } finally {
        editor._historyLocked = false;
    }
    editor.commitUndoGroup?.();

    if (errorCount) console.warn(`[SpinToWin] ${errorCount} hex(es) failed to restore`);
    _fullRebuild(editor);
    return true;
}

async function _fullRebuild(editor) {
    try {
        const [{ redrawAllRealIDOverlays }, { updateTileImageLayer }] = await Promise.all([
            import('../../features/realIDsOverlays.js'),
            import('../../features/imageSystemsOverlay.js'),
        ]);
        redrawAllRealIDOverlays(editor);
        updateTileImageLayer(editor);
    } catch (e) { console.error('[SpinToWin] _fullRebuild overlays failed', e); }
    try { editor.tokenOverlay?.refresh(); editor.loreOverlay?.refresh(); } catch (_) { }
    try {
        const { drawValueTargetLayer } = await import('../../features/valueOverlay.js');
        drawValueTargetLayer(editor);
    } catch (_) { }
    enforceSvgLayerOrder(editor.svg);
}

// ── Spin execution — permanent map change, one undo group per call ─────────────

/**
 * Apply spinsToApply to the map using _cloneState/_restoreState for full
 * visual correctness (effect icons, wormholes, hyperlane lines all update).
 * Each call is one undo group.
 */
export function executeSpinOnEditor(editor, spinsToApply) {
    if (!editor?._cloneState || !editor?._restoreState) {
        console.error('[SpinToWin] editor history methods not available');
        return false;
    }
    const coordMap = buildCoordMap(editor);
    const affected = new Set();
    const allMoves = [];

    for (const spin of spinsToApply) {
        const result = computeMoves(editor, spin, coordMap, false);
        if (!result) continue;
        for (const { from, to } of result.moves) { affected.add(from); affected.add(to); }
        allMoves.push(...result.moves);
    }
    if (!allMoves.length) return false;

    // Capture pre-move state with the authoritative _cloneState
    const snapshots = {};
    for (const label of affected) {
        try { snapshots[label] = editor._cloneState(label); }
        catch (e) { console.error('[SpinToWin] _cloneState failed for', label, e); }
    }

    editor.beginUndoGroup?.();
    for (const label of affected) editor.saveState(label);
    editor._historyLocked = true;

    try {
        // One-way copy: each tile's pre-move snapshot flows into its destination.
        // Every ring position appears as `to` exactly once (bijection), so every
        // position gets set correctly without touching it twice.
        // DO NOT swap — swapping with pre-snapshots scrambles multi-step rotations.
        for (const { from, to } of allMoves) {
            const srcSnap = snapshots[from];
            if (!srcSnap) continue;
            editor._restoreState({ ...srcSnap, id: to });
        }
    } finally {
        editor._historyLocked = false;
    }

    editor.commitUndoGroup?.();
    _fullRebuild(editor);
    return true;
}

// ── Export commands ────────────────────────────────────────────────────────────

export function generateExportCommands(spinSettings, gameId = '<game_id>') {
    if (!spinSettings?.length) return '// No spin settings configured';
    return spinSettings.map(spin => {
        const ring = spin.ring || 1;
        const dir = (spin.direction || 'CW').toUpperCase();
        const steps = spin.steps || 1;
        const pos = spin.position && spin.position !== '000' ? ` position:${spin.position}` : '';
        const trigger = spin.auto_trigger && spin.auto_trigger !== 'STATUS' ? ` auto_trigger:${spin.auto_trigger}` : '';
        const toSpin = spin.to_spin && spin.to_spin !== 'ALL' ? ` to_spin:${spin.to_spin}` : '';
        return `/spin add ring:${ring} direction:${dir} steps:${steps}${pos}${trigger}${toSpin}`;
    }).join('\n');
}

// ── Main popup ─────────────────────────────────────────────────────────────────

export function showSpinToWinUI(container) {
    if (!container) return;
    const editor = window.editor;
    if (!editor) { container.innerHTML = '<p style="color:#f66;padding:12px">No editor instance.</p>'; return; }

    container.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px;font-family:"Segoe UI",Arial,sans-serif;color:#eee;min-width:460px;';

    const S = {
        panel: 'background:#1a2535;border-radius:6px;padding:10px 12px;',
        row: 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;',
        lbl: 'display:block;color:#00d4ff;font-weight:600;font-size:12px;margin-bottom:5px;',
        btn: (c = '#444') => `padding:5px 10px;background:${c};color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;`,
        inp: 'background:#2a3a4a;border:1px solid #445;border-radius:3px;color:#eee;font-size:12px;padding:3px 5px;',
        smBtn: (c = '#444', bc = '#555') => `padding:3px 8px;background:${c};border:1px solid ${bc};color:#fff;border-radius:4px;font-size:11px;cursor:pointer;`,
    };

    let spinSettings = [{ ring: 1, direction: 'CW', steps: 1, position: '000', auto_trigger: 'STATUS', to_spin: 'ALL', visible: true }];
    let ringOverlayOn = false;
    let activeSimMode = null;    // null | 'all' | 'STATUS' | 'STRATEGY' | 'ring:N'
    let mapSnapshot = null;
    let snapshotTime = null;

    function el(tag, style = '', html = '') {
        const e = document.createElement(tag);
        if (style) e.style.cssText = style;
        if (html) e.innerHTML = html;
        return e;
    }

    function refreshRingOverlay() {
        if (ringOverlayOn) drawSpinOverlay(editor, spinSettings);
        else clearSpinOverlay(editor);
    }

    function simSpins(mode) {
        if (!mode || !spinSettings.length) return [];
        if (mode === 'all') return spinSettings;
        if (mode === 'STATUS') return spinSettings.filter(s => (s.auto_trigger || 'STATUS') === 'STATUS');
        if (mode === 'STRATEGY') return spinSettings.filter(s => s.auto_trigger === 'STRATEGY');
        if (mode.startsWith('ring:')) {
            const h = spinSettings[parseInt(mode.slice(5))];
            return h ? [h] : [];
        }
        return [];
    }

    function refreshSimOverlay() {
        if (activeSimMode) drawSimOverlay(editor, spinSettings, simSpins(activeSimMode));
        else clearSimOverlay(editor);
    }

    function afterApply() {
        setTimeout(() => { refreshRingOverlay(); refreshSimOverlay(); }, 80);
    }

    // Apply helpers — each is its own undo group
    function applySpins(spins, btn, label) {
        if (!spins.length) return;
        const moved = executeSpinOnEditor(editor, spins);
        if (!moved) return;
        afterApply();
        if (btn) {
            btn.textContent = '✓ Done!'; btn.style.background = '#27ae60';
            setTimeout(() => { btn.textContent = label; btn.style.background = btn._origBg || '#7a2000'; }, 2000);
        }
    }

    function render() {
        container.innerHTML = '';

        // ── SNAPSHOT panel (top) ─────────────────────────────────────────────
        const snapPanel = el('div', S.panel + 'border:1px solid #1a4a3a;');
        snapPanel.appendChild(el('span', S.lbl + 'color:#2ecc71;', '📸 Map Snapshot — safety restore point'));
        const snapRow = el('div', S.row);

        const saveSnapBtn = el('button', S.btn('#1a5a3a') + 'border:1px solid #2ecc71;');
        saveSnapBtn.textContent = '📸 Save Snapshot';
        saveSnapBtn.title = 'Capture the current map state. Restore at any time to undo all spins.';
        saveSnapBtn.onclick = () => {
            mapSnapshot = saveMapSnapshot(editor);
            snapshotTime = new Date().toLocaleTimeString();
            render();
        };
        snapRow.appendChild(saveSnapBtn);

        if (mapSnapshot) {
            snapRow.appendChild(el('span', 'font-size:11px;color:#888;margin:0 6px;', `Saved ${snapshotTime}`));
            const restoreBtn = el('button', S.btn('#3a5000') + 'border:1px solid #aacc00;');
            restoreBtn.textContent = '↩ Restore Snapshot';
            restoreBtn.title = 'Restore the map to the saved snapshot state (undoable with Ctrl+Z).';
            restoreBtn.onclick = () => {
                restoreMapSnapshot(editor, mapSnapshot);
                afterApply();
                restoreBtn.textContent = '✓ Restored!'; restoreBtn.style.background = '#27ae60';
                setTimeout(() => { restoreBtn.textContent = '↩ Restore Snapshot'; restoreBtn.style.background = '#3a5000'; }, 2500);
            };
            snapRow.appendChild(restoreBtn);
        } else {
            snapRow.appendChild(el('span', 'font-size:11px;color:#666;font-style:italic;', 'No snapshot yet — save one before testing spins'));
        }

        snapPanel.appendChild(snapRow);
        container.appendChild(snapPanel);

        // ── Ring configuration list ──────────────────────────────────────────
        const listPanel = el('div', S.panel);
        listPanel.appendChild(el('span', S.lbl, 'Ring Configurations'));

        if (!spinSettings.length) {
            listPanel.appendChild(el('div', 'color:#888;font-size:12px;padding:4px 0;', 'No rings. Click "+ Add Ring" to begin.'));
        }

        spinSettings.forEach((spin, idx) => {
            const color = getRingColor(idx);
            const rowColor = color.stroke;
            const isRingSim = activeSimMode === `ring:${idx}`;

            // Main row
            const row = el('div', `display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:4px;background:#0d1a2a;border-radius:4px;padding:5px 7px;border-left:3px solid ${rowColor};`);

            // Index label
            row.appendChild(el('span', `font-size:11px;color:${rowColor};font-weight:bold;min-width:16px;`, `${idx + 1}.`));

            // Visibility toggle
            const isVis = spin.visible !== false;
            const visBtn = el('button', S.smBtn(isVis ? '#1a3a2a' : '#2a2a2a', isVis ? rowColor : '#555'));
            visBtn.textContent = isVis ? '👁' : '🚫';
            visBtn.title = isVis ? 'Hide ring from overlay' : 'Show ring in overlay';
            visBtn.onclick = () => { spin.visible = !isVis; refreshRingOverlay(); render(); };
            row.appendChild(visBtn);

            // Ring number
            const ringLbl = el('label', 'display:flex;align-items:center;gap:3px;font-size:11px;');
            ringLbl.append('Ring:');
            const ringInp = el('input');
            ringInp.type = 'number'; ringInp.min = 1; ringInp.max = 8; ringInp.value = spin.ring;
            ringInp.style.cssText = S.inp + 'width:34px;';
            ringInp.oninput = () => { spin.ring = Math.max(1, parseInt(ringInp.value) || 1); refreshRingOverlay(); refreshSimOverlay(); };
            ringLbl.appendChild(ringInp);
            row.appendChild(ringLbl);

            // Direction (cycles CW → CCW → RND)
            const DIR_CYCLE = ['CW', 'CCW', 'RND'];
            const DIR_COLORS = { CW: '#2980b9', CCW: '#8e44ad', RND: '#c0392b' };
            const DIR_ICONS = { CW: '↻ CW', CCW: '↺ CCW', RND: '🎲 RND' };
            const dirBtn = el('button', S.smBtn(DIR_COLORS[spin.direction] || '#2980b9', DIR_COLORS[spin.direction] || '#2980b9'));
            dirBtn.textContent = DIR_ICONS[spin.direction] || '↻ CW';
            dirBtn.title = 'Click to cycle direction';
            dirBtn.onclick = () => {
                spin.direction = DIR_CYCLE[(DIR_CYCLE.indexOf(spin.direction) + 1) % 3];
                dirBtn.textContent = DIR_ICONS[spin.direction];
                dirBtn.style.background = DIR_COLORS[spin.direction];
                dirBtn.style.borderColor = DIR_COLORS[spin.direction];
                refreshRingOverlay(); refreshSimOverlay();
            };
            row.appendChild(dirBtn);

            // Steps
            const stepsLbl = el('label', 'display:flex;align-items:center;gap:3px;font-size:11px;');
            stepsLbl.append('Steps:');
            const stepsInp = el('input');
            stepsInp.type = 'text'; stepsInp.value = spin.steps;
            stepsInp.title = 'Steps to rotate — comma-sep for randomisation e.g. 1,2,3';
            stepsInp.style.cssText = S.inp + 'width:42px;';
            stepsInp.oninput = () => { spin.steps = stepsInp.value.trim() || 1; refreshRingOverlay(); refreshSimOverlay(); };
            stepsLbl.appendChild(stepsInp);
            row.appendChild(stepsLbl);

            // Position
            const posLbl = el('label', 'display:flex;align-items:center;gap:3px;font-size:11px;');
            posLbl.append('Pos:');
            const posInp = el('input');
            posInp.type = 'text'; posInp.value = spin.position || '000'; posInp.maxLength = 5;
            posInp.title = 'Center hex label (default 000 = Mecatol)';
            posInp.style.cssText = S.inp + 'width:36px;';
            posInp.oninput = () => { spin.position = posInp.value.trim() || '000'; refreshRingOverlay(); refreshSimOverlay(); };
            posLbl.appendChild(posInp);
            row.appendChild(posLbl);

            // Trigger
            const trgSel = el('select');
            trgSel.style.cssText = S.inp + 'padding:2px 3px;font-size:11px;';
            trgSel.title = 'When bot auto-triggers this spin';
            for (const opt of ['STATUS', 'STRATEGY', 'NO']) {
                const o = document.createElement('option');
                o.value = opt; o.textContent = opt;
                if ((spin.auto_trigger || 'STATUS') === opt) o.selected = true;
                trgSel.appendChild(o);
            }
            trgSel.onchange = () => { spin.auto_trigger = trgSel.value; };
            row.appendChild(trgSel);

            // to_spin
            const tsInp = el('input');
            tsInp.type = 'text'; tsInp.value = spin.to_spin || 'ALL';
            tsInp.placeholder = 'ALL';
            tsInp.title = 'What to spin (default ALL)';
            tsInp.style.cssText = S.inp + 'width:34px;font-size:11px;';
            tsInp.oninput = () => { spin.to_spin = tsInp.value.trim() || 'ALL'; };
            row.appendChild(tsInp);

            // 🧪 Test (sim, no map change)
            const testBtn = el('button', S.smBtn(isRingSim ? '#1a5a3a' : '#2a3a4a', isRingSim ? '#2ecc71' : '#445'));
            testBtn.textContent = isRingSim ? '✓ Sim' : '🧪 Sim';
            testBtn.title = 'Preview movement arrows for this ring (no map change)';
            testBtn.onclick = () => {
                activeSimMode = isRingSim ? null : `ring:${idx}`;
                refreshSimOverlay(); render();
            };
            row.appendChild(testBtn);

            // ⚡ Apply this ring only
            const applyOneBtn = el('button', S.smBtn('#5a2000', '#e67e22'));
            applyOneBtn._origBg = '#5a2000';
            applyOneBtn.textContent = '⚡';
            applyOneBtn.title = `Apply ring ${idx + 1} spin to map (undoable)`;
            applyOneBtn.onclick = () => applySpins([spin], applyOneBtn, '⚡');
            row.appendChild(applyOneBtn);

            // ✕ Remove
            const rmBtn = el('button', S.smBtn('#c0392b', '#c0392b') + 'margin-left:auto;');
            rmBtn.textContent = '✕';
            rmBtn.title = 'Remove this ring configuration';
            rmBtn.onclick = () => {
                spinSettings.splice(idx, 1);
                if (activeSimMode === `ring:${idx}`) activeSimMode = null;
                refreshRingOverlay(); refreshSimOverlay(); render();
            };
            row.appendChild(rmBtn);
            listPanel.appendChild(row);
        });

        // Add ring
        const addBtn = el('button', S.btn('#27ae60') + 'margin-top:6px;');
        addBtn.textContent = '+ Add Ring';
        addBtn.onclick = () => {
            const last = spinSettings[spinSettings.length - 1];
            spinSettings.push({
                ring: last ? (parseInt(last.ring) + 1) : 1,
                direction: last?.direction === 'CW' ? 'CCW' : 'CW',
                steps: last ? (parseInt(last.ring) + 1) : 1,
                position: last?.position || '000',
                auto_trigger: 'STATUS', to_spin: 'ALL', visible: true,
            });
            render();
        };
        listPanel.appendChild(addBtn);
        container.appendChild(listPanel);

        // ── Overlay & Simulation Tests ────────────────────────────────────────
        const testPanel = el('div', S.panel);
        testPanel.appendChild(el('span', S.lbl, '🔍 Overlay & Tests — no map changes'));

        const row1 = el('div', S.row + 'margin-bottom:7px;');
        const ringOvBtn = el('button', S.btn(ringOverlayOn ? '#1a5a3a' : '#2c3e50'));
        ringOvBtn.textContent = ringOverlayOn ? '👁 Hide Ring Overlay' : '👁 Show Ring Overlay';
        ringOvBtn.title = 'Show coloured ring highlights + direction arcs';
        ringOvBtn.onclick = () => {
            ringOverlayOn = !ringOverlayOn; refreshRingOverlay();
            ringOvBtn.textContent = ringOverlayOn ? '👁 Hide Ring Overlay' : '👁 Show Ring Overlay';
            ringOvBtn.style.background = ringOverlayOn ? '#1a5a3a' : '#2c3e50';
        };
        row1.appendChild(ringOvBtn);
        testPanel.appendChild(row1);

        const row2 = el('div', S.row);
        for (const { mode, label, title, color } of [
            { mode: 'STATUS', label: '▶ Test STATUS', title: 'Show movement arrows for STATUS-trigger rings', color: '#2980b9' },
            { mode: 'STRATEGY', label: '▶ Test STRATEGY', title: 'Show movement arrows for STRATEGY-trigger rings', color: '#8e44ad' },
            { mode: 'all', label: '▶ Test ALL', title: 'Show movement arrows for all rings', color: '#e67e22' },
        ]) {
            const isActive = activeSimMode === mode;
            const btn = el('button', '');
            btn.textContent = isActive ? label.replace('▶', '✓') : label;
            btn.title = title;
            btn.style.cssText = `padding:5px 10px;background:${isActive ? '#1a4a2a' : color + '55'};border:1px solid ${color};color:#fff;border-radius:4px;font-size:12px;cursor:pointer;`;
            btn.onclick = () => { activeSimMode = isActive ? null : mode; refreshSimOverlay(); render(); };
            row2.appendChild(btn);
        }
        const clearSimBtn = el('button', S.btn('#555') + 'margin-left:auto;');
        clearSimBtn.textContent = '✕ Clear';
        clearSimBtn.onclick = () => { activeSimMode = null; clearSimOverlay(editor); render(); };
        row2.appendChild(clearSimBtn);
        testPanel.appendChild(row2);
        container.appendChild(testPanel);

        // ── Apply to Map ─────────────────────────────────────────────────────
        const applyPanel = el('div', S.panel + 'border:1px solid #a0390022;');
        applyPanel.appendChild(el('span', S.lbl + 'color:#e67e22;', '⚡ Apply to Map — each action is independently undoable (Ctrl+Z)'));

        // Phase apply row
        const phaseRow = el('div', S.row + 'margin-bottom:7px;');

        for (const { mode, label, title, color } of [
            { mode: 'STATUS', label: '⚡ Apply STATUS', title: 'Apply all STATUS-trigger rings (one undo step)', color: '#2980b9' },
            { mode: 'STRATEGY', label: '⚡ Apply STRATEGY', title: 'Apply all STRATEGY-trigger rings (one undo step)', color: '#8e44ad' },
        ]) {
            const phaseBtn = el('button', '');
            phaseBtn.textContent = label;
            phaseBtn.title = title;
            phaseBtn._origBg = color + '88';
            phaseBtn.style.cssText = `padding:5px 10px;background:${color}88;border:1px solid ${color};color:#fff;border-radius:4px;font-size:12px;cursor:pointer;`;
            phaseBtn.onclick = () => applySpins(simSpins(mode), phaseBtn, label);
            phaseRow.appendChild(phaseBtn);
        }

        const applyAllBtn = el('button', S.btn('#7a2000') + 'border:1px solid #e67e22;');
        applyAllBtn._origBg = '#7a2000';
        applyAllBtn.textContent = '⚡ Apply ALL Rings';
        applyAllBtn.title = 'Apply every configured ring in one undo step';
        applyAllBtn.onclick = () => applySpins(spinSettings, applyAllBtn, '⚡ Apply ALL Rings');
        phaseRow.appendChild(applyAllBtn);

        applyPanel.appendChild(phaseRow);

        // Undo / reset row
        const undoRow = el('div', S.row);
        const undoBtn = el('button', S.btn('#7f8c8d'));
        undoBtn.textContent = '↩ Undo Last';
        undoBtn.title = 'Undo last apply (same as Ctrl+Z). Each ring/phase apply is its own step.';
        undoBtn.onclick = () => { editor.undo?.(); setTimeout(() => { refreshRingOverlay(); refreshSimOverlay(); }, 80); };
        undoRow.appendChild(undoBtn);

        const resetBtn = el('button', S.btn('#c0392b') + 'opacity:0.7;margin-left:auto;');
        resetBtn.textContent = '🗑 Reset Config';
        resetBtn.title = 'Clear all ring configurations (does not change the map)';
        resetBtn.onclick = () => {
            spinSettings = []; ringOverlayOn = false; activeSimMode = null;
            clearSpinOverlay(editor); clearSimOverlay(editor); render();
        };
        undoRow.appendChild(resetBtn);
        applyPanel.appendChild(undoRow);
        container.appendChild(applyPanel);

        // ── Presets ─────────────────────────────────────────────────────────
        const presetPanel = el('div', S.panel);
        presetPanel.appendChild(el('span', S.lbl, 'Presets'));
        const classicBtn = el('button', S.btn('#16a085'));
        classicBtn.textContent = '⟳ Classic (R1 ↻+1, R2 ↺+2, R3 ↻+3)';
        classicBtn.onclick = () => {
            spinSettings = [
                { ring: 1, direction: 'CW', steps: 1, position: '000', auto_trigger: 'STATUS', to_spin: 'ALL', visible: true },
                { ring: 2, direction: 'CCW', steps: 2, position: '000', auto_trigger: 'STATUS', to_spin: 'ALL', visible: true },
                { ring: 3, direction: 'CW', steps: 3, position: '000', auto_trigger: 'STATUS', to_spin: 'ALL', visible: true },
            ];
            refreshRingOverlay(); refreshSimOverlay(); render();
        };
        presetPanel.appendChild(classicBtn);
        container.appendChild(presetPanel);

        // ── Export ───────────────────────────────────────────────────────────
        const expPanel = el('div', S.panel);
        expPanel.appendChild(el('span', S.lbl, 'Export — AsyncTI4 /spin add commands'));

        const gameRow = el('div', S.row + 'margin-bottom:6px;');
        gameRow.appendChild(el('span', 'font-size:11px;', 'Game name:'));
        const gameInp = el('input');
        gameInp.type = 'text'; gameInp.placeholder = 'my_game';
        gameInp.style.cssText = S.inp + 'width:120px;';
        gameRow.appendChild(gameInp);
        expPanel.appendChild(gameRow);

        const exportArea = el('textarea');
        exportArea.style.cssText = 'width:100%;height:80px;background:#0d1a0d;border:1px solid #2a4a2a;border-radius:3px;color:#2ecc40;font-family:monospace;font-size:11px;padding:6px;box-sizing:border-box;resize:vertical;';
        exportArea.readOnly = true;
        exportArea.value = generateExportCommands(spinSettings, gameInp.value || '<game_id>');
        gameInp.oninput = () => { exportArea.value = generateExportCommands(spinSettings, gameInp.value || '<game_id>'); };
        expPanel.appendChild(exportArea);

        const copyBtn = el('button', S.btn('#2ecc40') + 'margin-top:4px;');
        copyBtn.textContent = '📋 Copy Commands';
        copyBtn.onclick = () => navigator.clipboard?.writeText(exportArea.value).then(() => {
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = '📋 Copy Commands'; }, 2000);
        });
        expPanel.appendChild(copyBtn);
        container.appendChild(expPanel);
    }

    render();
}

export function showSpinToWinHelp() {
    import('../../ui/popupUI.js').then(({ showPopup }) => {
        showPopup({
            id: 'spin-help-popup',
            title: '⚙️ Spin-To-Win — Help',
            content: `<div style="font-size:13px;line-height:1.6;max-height:60vh;overflow-y:auto;">
<h4 style="color:#2ecc71">📸 Map Snapshot</h4>
<p>Click <b>Save Snapshot</b> before testing any spins. If you mess up the map, <b>Restore Snapshot</b> brings it back exactly.
The restore is itself undoable (Ctrl+Z) so you can go back even from a restore.</p>

<h4 style="color:#ffe066">Per-Ring Settings</h4>
<ul style="margin-left:16px">
  <li><b>👁 / 🚫</b> — show or hide this ring in the overlay</li>
  <li><b>Ring</b> — ring number (1 = inner ring around center, 2 = next, …)</li>
  <li><b>Direction</b> — click to cycle: ↻ CW → ↺ CCW → 🎲 RND</li>
  <li><b>Steps</b> — positions to rotate; comma-sep for bot randomisation (e.g. 1,2,3)</li>
  <li><b>Pos</b> — center hex label (000 = Mecatol Rex)</li>
  <li><b>Trigger</b> — when the bot auto-spins: STATUS / STRATEGY / NO</li>
  <li><b>To</b> — what to spin (default ALL)</li>
  <li><b>🧪 Sim</b> — show movement arrows for this ring only (no map change)</li>
  <li><b>⚡</b> — apply just this ring to the map (one undo step)</li>
</ul>

<h4 style="color:#ffe066">Test Modes (no map change)</h4>
<ul style="margin-left:16px">
  <li><b>▶ Test STATUS / STRATEGY / ALL</b> — show movement arrows for that phase's rings</li>
</ul>

<h4 style="color:#e67e22">Apply to Map</h4>
<ul style="margin-left:16px">
  <li><b>⚡ Apply STATUS / STRATEGY</b> — applies all rings for that trigger phase</li>
  <li><b>⚡ Apply ALL Rings</b> — applies every configured ring in one step</li>
  <li>Each apply is <b>independently undoable</b> — Ctrl+Z or ↩ Undo reverses one apply at a time</li>
</ul>

<h4 style="color:#ffe066">Bot Export</h4>
<p>Enter your game name and copy the <code style="color:#2ecc40">/spin add</code> commands to paste into the AsyncTI4 Discord bot.</p>
</div>`,
            draggable: true, dragHandleSelector: '.popup-ui-titlebar',
            scalable: true, rememberPosition: true,
            style: { minWidth: '400px', maxWidth: '600px', border: '2px solid var(--popup-border-spin)', borderRadius: '10px', padding: '20px' },
            actions: [{ label: 'Close', action: () => import('../../ui/popupUI.js').then(({ hidePopup }) => hidePopup('spin-help-popup')) }],
        });
    });
}
