/**
 * AutoMapper UI — fill Draw-Helper-painted tiles with real TI4 systems.
 */

import { fillRemaining, analyzeMap, SCORING_WEIGHTS } from './autoBuilderCore.js';
import { assignSystem } from '../../features/assignSystem.js';
import { updateTileImageLayer } from '../../features/imageSystemsOverlay.js';
import { enforceSvgLayerOrder } from '../../draw/enforceSvgLayerOrder.js';
import { refreshSystemList } from '../../ui/uiFilters.js';
import { redrawAllRealIDOverlays } from '../../features/realIDsOverlays.js';
import { updateWormholeVisibility } from '../../features/baseOverlays.js';
import { toggleWormhole } from '../../features/wormholes.js';

// ---- Styles ----
const S = {
    panel:   'background:#1a2535;border-radius:6px;padding:10px 12px;',
    label:   'display:block;color:#00d4ff;font-weight:600;font-size:12px;margin-bottom:5px;',
    row:     'display:flex;gap:8px;align-items:center;flex-wrap:wrap;',
    btnBlue: 'padding:7px 16px;background:#0099cc;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;',
    btnGreen:'padding:7px 16px;background:#27ae60;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;',
    btnGrey: 'padding:7px 14px;background:#3a4a5a;color:#ccc;border:none;border-radius:4px;font-size:12px;cursor:pointer;',
    btnLink: 'padding:4px 8px;background:none;color:#00aaff;border:none;font-size:11px;cursor:pointer;text-decoration:underline;',
    warn:    'color:#f90;font-size:12px;',
    ok:      'color:#2ecc40;font-size:12px;',
    muted:   'color:#888;font-size:11px;',
    input:   'width:54px;padding:4px 6px;background:#2a3a4a;border:1px solid #445;border-radius:3px;color:#eee;font-size:12px;',
};

function el(tag, style, html) {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (html)  e.innerHTML = html;
    return e;
}

function toggle(label, checked, onChange, title = '') {
    const wrap = el('label', 'display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;' + (title ? 'title:' + title : ''));
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = checked;
    cb.onchange = () => onChange(cb.checked);
    wrap.appendChild(cb);
    wrap.append(label);
    return { wrap, cb };
}

function numberInput(val, min, max, onChange) {
    const inp = el('input');
    inp.type = 'number'; inp.value = val; inp.min = min; inp.max = max;
    inp.style.cssText = S.input;
    inp.onchange = () => onChange(Math.max(min, Math.min(max, +inp.value || val)));
    return inp;
}

// ---- Main UI ----

export function showAutoBuilderUI(container) {
    if (!container) return;
    const editor = window.editor;
    if (!editor) {
        container.innerHTML = '<p style="color:#f66;padding:12px">No editor instance found.</p>';
        return;
    }

    container.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px;font-family:"Segoe UI",Arial,sans-serif;color:#eee;min-width:360px;';

    // ---- State ----
    let opts = {
        balanced:           false,
        iterations:         8,
        balanceRange:       2,
        includeHomeSystems: false,
        includeWormholes:   false,
    };
    let lastResult  = null;
    let justApplied = false; // true after a successful apply → shows Undo button

    // ---- Render ----
    function render() {
        container.innerHTML = '';

        if (!editor.allSystems?.length) {
            container.appendChild(el('div', S.panel, `<span style="${S.warn}">⚠ System data not loaded. Load a map first, then re-open AutoMapper.</span>`));
            return;
        }

        const analysis = analyzeMap(editor, { includeHomeSystems: opts.includeHomeSystems, includeWormholes: opts.includeWormholes });

        // --- Status ---
        const status = el('div', S.panel);
        if (analysis.totalUnfilled === 0) {
            status.innerHTML = `<span style="${S.ok}">✔ All painted tiles are filled.</span><br><span style="${S.muted}">Use Draw Helpers to paint tile types, then come back here.</span>`;
        } else {
            status.innerHTML = `<b style="color:#00d4ff">${analysis.totalUnfilled} unfilled tile${analysis.totalUnfilled !== 1 ? 's' : ''}</b> &nbsp;<span style="${S.muted}">${analysis.totalAvailable} systems available</span>`;
            if (!analysis.hasHomeSystems) {
                status.innerHTML += `<br><span style="${S.muted}">ℹ No placed home systems found — balance scoring will be skipped.</span>`;
            }
        }
        container.appendChild(status);

        // --- Type breakdown ---
        if (Object.keys(analysis.typeStatus).length) {
            const wrap = el('div', S.panel);
            wrap.appendChild(el('span', S.label, 'Type breakdown'));
            const tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
            tbl.innerHTML = `<thead><tr style="color:#00d4ff;border-bottom:1px solid #334">
                <th style="text-align:left;padding:2px 6px">Type</th>
                <th style="padding:2px 6px">Need</th><th style="padding:2px 6px">Have</th><th></th>
            </tr></thead>`;
            const tbody = document.createElement('tbody');
            for (const [type, { need, have, ok }] of Object.entries(analysis.typeStatus)) {
                if (!need) continue;
                const tr = el('tr', 'border-bottom:1px solid #223');
                tr.innerHTML = `<td style="padding:2px 6px">${type}</td>
                    <td style="padding:2px 6px;text-align:center">${need}</td>
                    <td style="padding:2px 6px;text-align:center">${have}</td>
                    <td style="padding:2px 6px">${ok ? '✅' : `<span style="${S.warn}">⚠ short ${need - have}</span>`}</td>`;
                tbody.appendChild(tr);
            }
            tbl.appendChild(tbody);
            wrap.appendChild(tbl);
            container.appendChild(wrap);
        }

        if (!analysis.totalUnfilled) return;

        // --- Options ---
        const optsPanel = el('div', S.panel);
        optsPanel.appendChild(el('span', S.label, 'Options'));

        const row1 = el('div', S.row);

        // Include HS toggle (req 1)
        const { wrap: hsWrap } = toggle('Include HS tiles', opts.includeHomeSystems, v => { opts.includeHomeSystems = v; render(); }, 'Home system tiles are skipped by default');
        row1.appendChild(hsWrap);

        // Include wormholes toggle (req 3)
        const { wrap: whWrap } = toggle('Include wormhole systems', opts.includeWormholes, v => { opts.includeWormholes = v; render(); }, 'Wormhole systems are excluded by default');
        row1.appendChild(whWrap);

        optsPanel.appendChild(row1);

        const row2 = el('div', S.row + 'margin-top:6px;');

        // Balanced toggle
        const { wrap: balWrap } = toggle('Balanced', opts.balanced, v => { opts.balanced = v; });
        row2.appendChild(balWrap);

        // Iterations (req 10)
        const itLabel = el('label', 'display:flex;align-items:center;gap:5px;font-size:12px;');
        itLabel.append('Iterations: ');
        itLabel.appendChild(numberInput(opts.iterations, 1, 100, v => { opts.iterations = v; }));
        row2.appendChild(itLabel);

        // Balance range (req 9)
        const brLabel = el('label', 'display:flex;align-items:center;gap:5px;font-size:12px;');
        brLabel.append('Balance range: ');
        brLabel.appendChild(numberInput(opts.balanceRange, 1, 5, v => { opts.balanceRange = v; }));
        row2.appendChild(brLabel);

        optsPanel.appendChild(row2);

        // Links (req 5, req 8)
        const linkRow = el('div', 'margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;');

        const wBtn = el('button', S.btnLink, '⚖ Milty Weight Settings');
        wBtn.title = 'Opens the Milty Slice Designer weighting popup — weights used here for balancing';
        wBtn.onclick = () => {
            import('../Milty/miltyRandomToolUI.js').then(m => m.showWeightingSettingsPopup?.()).catch(() => {
                alert('Open Milty Slice Designer first, then use its Weighting Settings button.');
            });
        };
        linkRow.appendChild(wBtn);

        const scBtn = el('button', S.btnLink, '🔍 Sanity Check');
        scBtn.title = 'Check for duplicate system IDs on the map';
        scBtn.onclick = () => {
            import('../../ui/simplepPopup.js').then(m => m.showSanityCheckPopup?.()).catch(console.warn);
        };
        linkRow.appendChild(scBtn);

        optsPanel.appendChild(linkRow);
        container.appendChild(optsPanel);

        // --- Undo button (shown after a successful apply) ---
        if (justApplied) {
            const undoRow = el('div', S.row + 'padding:2px 0;');
            const undoBtn = el('button', 'padding:7px 16px;background:#7f4f00;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;', '↩ Undo Last Apply');
            undoBtn.title = 'Undo the entire fill that was just applied';
            undoBtn.onclick = () => { editor.undo?.(); justApplied = false; render(); };
            undoRow.appendChild(undoBtn);
            container.appendChild(undoRow);
        }

        // --- Action buttons ---
        const btnRow = el('div', S.row + 'padding:2px 0;');

        const fillBtn = el('button', S.btnBlue, '🎲 Fill Remaining');
        fillBtn.onclick = () => { justApplied = false; runFill(); };

        const reshuffleBtn = el('button', S.btnGrey, '🔀 Reshuffle');
        reshuffleBtn.disabled = !lastResult;
        reshuffleBtn.onclick = () => { justApplied = false; runFill(); };

        btnRow.appendChild(fillBtn);
        btnRow.appendChild(reshuffleBtn);
        container.appendChild(btnRow);

        // --- Preview ---
        if (lastResult) renderPreview();
    }

    // ---- Fill ----
    async function runFill() {
        let weights = { ...SCORING_WEIGHTS };
        let settings = null;
        if (opts.balanced) {
            try {
                const m = await import('../Milty/miltyBuilderRandomTool.js');
                weights  = m.getCurrentWeights?.()  ?? weights;  // live milty weights (req 8)
                settings = m.getCurrentSettings?.() ?? null;     // R/I min/max constraints (req 8)
            } catch { /* fall back to defaults */ }
        }

        const result = fillRemaining(editor, { ...opts, weights, settings });
        if (result.info) { alert(result.info); return; }
        lastResult = result;
        render();
    }

    // ---- Preview ----
    function renderPreview() {
        const { assignments, tokenPlacements, downgrades, unmatched, score } = lastResult;

        const wrap = el('div', S.panel);
        const scoreStr = score != null ? ` &nbsp;<span style="${S.muted}">σ ${score.toFixed(1)} (lower=better)</span>` : '';
        wrap.innerHTML = `<b style="color:#2ecc40">${assignments.length} matched${scoreStr}</b>`;

        // Warnings (req 11: downgrades)
        if (downgrades.length) {
            const d = el('div', S.warn + 'margin-top:3px;');
            const groups = {};
            for (const dg of downgrades) {
                const k = `${dg.from} → ${dg.to}`;
                groups[k] = (groups[k] || 0) + 1;
            }
            d.textContent = `⚠ Downgraded: ${Object.entries(groups).map(([k,v]) => `${v}× ${k}`).join(', ')}`;
            wrap.appendChild(d);
        }
        if (tokenPlacements.length) {
            const t = el('div', S.warn + 'margin-top:3px;');
            t.textContent = `⚠ ${tokenPlacements.length} hex${tokenPlacements.length !== 1 ? 'es' : ''} will use effect tokens (no matching effect system available)`;
            wrap.appendChild(t);
        }
        if (unmatched.length) {
            const u = el('div', S.warn + 'margin-top:3px;');
            u.textContent = `⚠ ${unmatched.length} tile${unmatched.length !== 1 ? 's' : ''} unmatched — insufficient systems`;
            wrap.appendChild(u);
        }

        // Compact assignment list — token-fallback hexes shown in orange (fix 2)
        const tokenLabels = new Set((tokenPlacements || []).map(t => t.label));
        const list = el('div', `margin-top:6px;max-height:160px;overflow-y:auto;
            display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:3px;font-size:11px;`);
        for (const { label, sys } of assignments) {
            const planets = sys.planets || [];
            const val = planets.reduce((s, p) => s + (p.resources || 0) + (p.influence || 0), 0);
            const eff = getEffectTag(sys);
            const isToken = tokenLabels.has(label);
            const item = el('div', `background:${isToken ? '#3a1a00' : '#0d1d0d'};padding:2px 5px;border-radius:3px;color:${isToken ? '#ffb347' : '#ccc'};`);
            item.textContent = `${isToken ? '⚠ ' : ''}${label} → ${sys.id} (${planets.length}p ${val}v${eff})${isToken ? ' +token' : ''}`;
            item.title = isToken ? 'No matching system with this effect — will place anomaly token instead' : '';
            list.appendChild(item);
        }
        wrap.appendChild(list);
        container.appendChild(wrap);

        // Apply / Discard
        const applyRow = el('div', S.row + 'padding:2px 0;');
        const applyBtn = el('button', S.btnGreen, '✅ Apply to Map');
        applyBtn.onclick = () => applyToMap(lastResult);
        const discardBtn = el('button', S.btnGrey, 'Discard');
        discardBtn.onclick = () => { lastResult = null; render(); };
        applyRow.appendChild(applyBtn);
        applyRow.appendChild(discardBtn);
        container.appendChild(applyRow);
    }

    // ---- Apply ----
    function applyToMap({ assignments, tokenPlacements }) {
        if (!assignments?.length) return;

        // BUG2 fix: snapshot custom wormholes before assignment.
        // assignSystem always clears customWormholes; we restore any that the new system doesn't cover.
        const wormholeSnapshots = new Map();
        for (const { label } of assignments) {
            const hex = editor.hexes[label];
            if (hex?.customWormholes?.size) wormholeSnapshots.set(label, new Set(hex.customWormholes));
        }

        editor.beginUndoGroup?.();

        for (const { label, sys } of assignments) {
            // BUG1 fix: saveState BEFORE locking, then lock to suppress cascading saves inside assignSystem
            editor.saveState(label);
            editor._historyLocked = true;
            assignSystem(editor, sys, label);
            editor._historyLocked = false;
        }

        // Place real anomaly tokens instead of effect overlays (fix 3)
        // Mapping from Draw Helper effect name → tokens.json token ID
        const EFFECT_TO_TOKEN = {
            nebula:    'nebula',
            rift:      'gravityrift',
            supernova: 'supernova',
            asteroid:  'asteroids',
        };
        const tm = editor.tokenManager;
        for (const { label, effects } of (tokenPlacements || [])) {
            for (const eff of effects) {
                const tokenId = EFFECT_TO_TOKEN[eff];
                if (tokenId && tm) {
                    // addSystemToken calls saveState internally — safe inside undo group
                    // (history.js only keeps the first snapshot per label, so this is a no-op for history)
                    tm.addSystemToken(label, tokenId);
                } else if (!tokenId) {
                    // Unknown effect — fall back to visual overlay
                    editor.applyEffect?.(label, eff);
                }
            }
        }

        // BUG2 fix: restore custom wormholes not covered by the newly assigned system's inherent wormholes
        for (const [label, prevWormholes] of wormholeSnapshots) {
            const hex = editor.hexes[label];
            if (!hex) continue;
            const inherent = hex.inherentWormholes instanceof Set ? hex.inherentWormholes : new Set();
            for (const type of prevWormholes) {
                if (!inherent.has(type)) {
                    // toggleWormhole adds it (hex.customWormholes is empty after assignSystem)
                    toggleWormhole(editor, label, type);
                }
            }
        }

        editor.commitUndoGroup?.();

        // Full overlay refresh after bulk assignment (req 7)
        redrawAllRealIDOverlays(editor);
        updateWormholeVisibility(editor);
        updateTileImageLayer(editor);
        enforceSvgLayerOrder(editor.svg);
        refreshSystemList();
        editor.loreOverlay?.refresh();
        editor.tokenOverlay?.refresh(); // refresh token visuals after placing anomaly tokens

        lastResult   = null;
        justApplied  = true;  // show Undo button (fix 1)
        render();
    }

    render();
}

// Returns a short effect tag string for the preview list
function getEffectTag(sys) {
    const tags = [];
    if (sys.isNebula)        tags.push('neb');
    if (sys.isGravityRift)   tags.push('rift');
    if (sys.isSupernova)     tags.push('SN');
    if (sys.isAsteroidField) tags.push('ast');
    if (sys.wormholes?.length) tags.push(sys.wormholes.join('+'));
    return tags.length ? ' ' + tags.join(',') : '';
}
