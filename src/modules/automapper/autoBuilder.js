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
import { COLORS } from '../../constants/designTokens.js';

// ---- Styles ----
const S = {
    panel:   `background:${COLORS.autoPanelBg};border-radius:6px;padding:10px 12px;`,
    label:   `display:block;color:${COLORS.popupAutomapper};font-weight:600;font-size:12px;margin-bottom:5px;`,
    row:     'display:flex;gap:8px;align-items:center;flex-wrap:wrap;',
    btnBlue: `padding:7px 16px;background:${COLORS.autoBtnBlue};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;`,
    btnGreen:`padding:7px 16px;background:${COLORS.success};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;`,
    btnGrey: `padding:7px 14px;background:${COLORS.autoBtnGrey};color:#ccc;border:none;border-radius:4px;font-size:12px;cursor:pointer;`,
    btnLink: `padding:4px 8px;background:none;color:${COLORS.autoBtnLink};border:none;font-size:11px;cursor:pointer;text-decoration:underline;`,
    warn:    `color:${COLORS.autoWarnText};font-size:12px;`,
    ok:      `color:${COLORS.popupSpecial};font-size:12px;`,
    muted:   `color:${COLORS.textMuted};font-size:11px;`,
    input:   `width:54px;padding:4px 6px;background:${COLORS.autoInputBg};border:1px solid ${COLORS.autoInputBorder};border-radius:3px;color:#eee;font-size:12px;`,
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

    container.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px;font-family:var(--font-ui);color:#eee;min-width:360px;';

    // ---- State ----
    let opts = {
        balanced:               false,
        iterations:             8,
        balanceRange:           2,
        includeHomeSystems:     false,
        includeWormholes:       false,
        allowDuplicatesNoPlanet:false,
        sources:                null, // null = use DOM source filters from search panel
        valueROn:               false,
        valueIOn:               false,
        valueTOn:               false,
    };
    let lastResult  = null;
    let justApplied = false; // true after a successful apply → shows Undo button
    let excludedLabels = new Set(); // hexes the user unchecked — left unfilled on Apply

    // ---- Render ----
    function render() {
        container.innerHTML = '';

        if (!editor.allSystems?.length) {
            container.appendChild(el('div', S.panel, `<span style="${S.warn}">⚠ System data not loaded. Load a map first, then re-open AutoMapper.</span>`));
            return;
        }

        const analysis = analyzeMap(editor, {
            includeHomeSystems: opts.includeHomeSystems,
            includeWormholes: opts.includeWormholes,
            allowDuplicatesNoPlanet: opts.allowDuplicatesNoPlanet,
            sources: opts.sources,
        });

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

        // Include wormholes toggle
        const { wrap: whWrap } = toggle('Include wormhole systems', opts.includeWormholes, v => { opts.includeWormholes = v; render(); }, 'Wormhole systems are excluded by default');
        row1.appendChild(whWrap);

        // Allow duplicate no-planet systems (req 7)
        const { wrap: dupWrap } = toggle('Duplicate empty/anomaly systems', opts.allowDuplicatesNoPlanet, v => { opts.allowDuplicatesNoPlanet = v; render(); }, 'Allow the same no-planet system (empty, anomaly) to be placed more than once');
        row1.appendChild(dupWrap);

        optsPanel.appendChild(row1);

        // Source selection (req 3)
        const srcPanel = el('div', S.panel + 'margin-top:4px;');
        srcPanel.appendChild(el('span', S.label + 'margin-bottom:3px;', 'Sources (leave all off to use the Search panel filter):'));
        const srcRow = el('div', S.row + 'flex-wrap:wrap;gap:4px;');
        const SRC_DEFS = [
            { key: 'base',    label: 'Base' },
            { key: 'pok',     label: 'PoK' },
            { key: 'te',      label: 'Thunders Edge' },
            { key: 'ds',      label: 'DS/Uncharted' },
            { key: 'eronous', label: 'Eronous' },
            { key: 'others',  label: 'Others' },
        ];
        SRC_DEFS.forEach(({ key, label }) => {
            // Eronous data currently excluded — see sync workflow; un-hide if re-enabled
            if (key === 'eronous') return;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.style.marginRight = '3px';
            const checked = opts.sources ? !!opts.sources[key] : false;
            cb.checked = checked;
            cb.onchange = () => {
                if (!opts.sources) opts.sources = {};
                opts.sources[key] = cb.checked;
                // If all unchecked, reset to null (use DOM filters)
                const anyOn = SRC_DEFS.some(d => opts.sources[d.key]);
                if (!anyOn) opts.sources = null;
                render();
            };
            const lbl = el('label', 'display:flex;align-items:center;font-size:11px;cursor:pointer;white-space:nowrap;');
            lbl.appendChild(cb); lbl.append(label);
            srcRow.appendChild(lbl);
        });
        srcPanel.appendChild(srcRow);
        container.appendChild(srcPanel);

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

        // Value-tier weighting (mirrors Draw Helpers V1–V5 targets)
        const row3 = el('div', S.row + 'margin-top:6px;');
        const vtInfo = el('span', 'font-size:11px;color:#888;margin-right:6px;', 'Value-target bias:');
        row3.appendChild(vtInfo);

        function makeVtToggle(label, color, key, title) {
            const b = el('button', `padding:3px 8px;border:1px solid #555;border-radius:3px;font-size:11px;font-weight:bold;cursor:pointer;color:${color};`, label);
            b.title = title;
            b.onclick = () => {
                opts[key] = !opts[key];
                b.style.background = opts[key] ? color : '';
                b.style.color      = opts[key] ? '#111' : color;
                b.style.border     = opts[key] ? `1px solid ${color}` : '1px solid #555';
            };
            return b;
        }
        row3.appendChild(makeVtToggle('R', '#f5a623', 'valueROn', 'Boost resource weight when selecting tier-matched systems'));
        row3.appendChild(makeVtToggle('I', '#7ecfff', 'valueIOn', 'Boost influence weight when selecting tier-matched systems'));
        row3.appendChild(makeVtToggle('T', '#b07cff', 'valueTOn', 'Boost tech-skip weight when selecting tier-matched systems'));
        optsPanel.appendChild(row3);

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
        excludedLabels = new Set();
        render();
    }

    // ---- Preview ----
    function renderPreview() {
        const { assignments, tokenPlacements, downgrades, unmatched, score } = lastResult;

        const wrap = el('div', S.panel);
        const scoreStr = score != null ? ` &nbsp;<span style="${S.muted}">σ ${score.toFixed(1)} (lower=better)</span>` : '';
        wrap.innerHTML = `<b style="color:#2ecc40">${assignments.length} matched${scoreStr}</b>`;

        // Warnings — report every fallback and why (req: surface reason, let user opt out)
        if (downgrades.length) {
            const d = el('div', S.warn + 'margin-top:3px;');
            const groups = {};
            for (const dg of downgrades) {
                const k = `${dg.from} → ${dg.to}`;
                groups[k] = (groups[k] || 0) + 1;
            }
            d.textContent = `⚠ Downgraded: ${Object.entries(groups).map(([k,v]) => `${v}× ${k}`).join(', ')} — uncheck any hex below to leave it unfilled instead.`;
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
        if (excludedLabels.size) {
            const ex = el('div', S.muted + 'margin-top:3px;');
            ex.textContent = `${excludedLabels.size} hex${excludedLabels.size !== 1 ? 'es' : ''} unchecked — will be left unfilled.`;
            wrap.appendChild(ex);
        }

        // Per-hex reason lookup (downgrade reason takes priority; else token-effect reason)
        const downgradeMap = new Map(downgrades.map(dg => [dg.label, dg]));
        const tokenMap = new Map((tokenPlacements || []).map(tp => [tp.label, tp]));

        // Compact assignment list — fallback hexes shown in orange with a checkbox to opt out
        const list = el('div', `margin-top:6px;max-height:200px;overflow-y:auto;
            display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:3px;font-size:11px;`);
        for (const { label, sys } of assignments) {
            const planets = sys.planets || [];
            const val = planets.reduce((s, p) => s + (p.resources || 0) + (p.influence || 0), 0);
            const eff = getEffectTag(sys);
            const dg = downgradeMap.get(label);
            const tp = tokenMap.get(label);
            const isFallback = !!(dg || tp);
            const excluded = excludedLabels.has(label);

            let reason = '';
            if (dg) reason = dg.reason || `Downgraded ${dg.from} → ${dg.to}.`;
            else if (tp) reason = `No matching system with effect(s) ${tp.effects.join(',')} — an anomaly token will be placed instead.`;

            const item = el('label', `display:flex;align-items:center;gap:4px;
                background:${excluded ? '#1a1a1a' : isFallback ? '#3a1a00' : '#0d1d0d'};
                padding:2px 5px;border-radius:3px;
                color:${excluded ? '#777' : isFallback ? '#ffb347' : '#ccc'};
                cursor:pointer;${excluded ? 'text-decoration:line-through;' : ''}`);
            item.title = reason;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !excluded;
            cb.style.flexShrink = '0';
            cb.onchange = () => {
                if (cb.checked) excludedLabels.delete(label); else excludedLabels.add(label);
                renderPreviewOnly();
            };
            item.appendChild(cb);

            const span = document.createElement('span');
            span.textContent = `${isFallback ? '⚠ ' : ''}${label} → ${sys.id} (${planets.length}p ${val}v${eff})${tp ? ' +token' : ''}`;
            item.appendChild(span);

            list.appendChild(item);
        }
        wrap.appendChild(list);
        container.appendChild(wrap);

        // Apply / Discard
        const includedCount = assignments.length - excludedLabels.size;
        const applyRow = el('div', S.row + 'padding:2px 0;');
        const applyBtn = el('button', S.btnGreen, `✅ Apply ${includedCount} to Map`);
        applyBtn.disabled = includedCount === 0;
        applyBtn.onclick = () => applyToMap(lastResult);
        const discardBtn = el('button', S.btnGrey, 'Discard');
        discardBtn.onclick = () => { lastResult = null; render(); };
        applyRow.appendChild(applyBtn);
        applyRow.appendChild(discardBtn);
        container.appendChild(applyRow);
    }

    // Re-renders the panel after a per-hex include checkbox is toggled.
    function renderPreviewOnly() {
        render();
    }

    // ---- Apply ----
    function applyToMap({ assignments: allAssignments, tokenPlacements: allTokenPlacements }) {
        // Hexes the user unchecked in the preview are left unfilled entirely.
        const assignments = allAssignments.filter(a => !excludedLabels.has(a.label));
        const tokenPlacements = (allTokenPlacements || []).filter(t => !excludedLabels.has(t.label));
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
            scar:      'entropicscar',
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

export function showAutoMapperHelp() {
    import('../../ui/popupUI.js').then(({ showPopup }) => {
        showPopup({
            id: 'automapper-help-popup',
            title: '🤖 AutoMapper & Draw Helpers — Help',
            content: `<div style="line-height:1.6;font-size:13px;max-height:70vh;overflow-y:auto;padding-right:8px;">

<h3 style="color:#2ecc40;margin:0 0 8px 0;">Draw Helpers</h3>
<p>Open from <b>Layout Options → Draw Helpers</b>. Paint tile properties directly onto hexes without searching for specific systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Tile types</h4>
<p>Click a type button, then click hexes: <b>1/2/3 Planet</b>, <b>Legendary</b>, <b>Empty</b>, <b>Special</b> (anomaly), <b>Fracture</b> (Thunders Edge).</p>
<p>A <b>Special</b> tile with no effects painted acts the same as <b>Empty</b>.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Effects</h4>
<p>Paint an anomaly overlay on top of a hex: <b>Nebula ☁️</b>, <b>Rift 🕳️</b>, <b>Asteroid 🪨</b>, <b>Supernova ☀️</b>, <b>Scar ☄️</b>.</p>
<p>If a system with that exact effect isn't available, an <b>anomaly token</b> is placed instead.</p>

<hr style="border-color:#333;margin:10px 0;">
<h3 style="color:#2ecc40;margin:0 0 8px 0;">🤖 AutoMapper</h3>
<p>After painting tile types with Draw Helpers, AutoMapper fills those hexes with real systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Workflow</h4>
<ol style="margin:0 0 8px 16px;padding:0;">
  <li>Paint tile types on hexes using Draw Helpers.</li>
  <li>Open AutoMapper — the <b>Type breakdown</b> table shows how many hexes need filling and how many matching systems are available.</li>
  <li>Choose options and click <b>Fill Remaining</b>.</li>
  <li>Review the preview — click <b>Reshuffle</b> for a different arrangement.</li>
  <li>Click <b>Apply to Map</b>. One Ctrl+Z undoes the entire fill.</li>
</ol>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Options</h4>
<ul style="margin:0 0 8px 16px;padding:0;">
  <li><b>Balanced</b> — runs multiple shuffles, keeps the assignment with the most even resource spread across player slices.</li>
  <li><b>Iterations</b> — how many shuffles balanced mode tries.</li>
  <li><b>Balance range</b> — how many hexes from each home system to consider for scoring.</li>
  <li><b>Include HS tiles</b> — allows filling home-system hexes (off by default).</li>
  <li><b>Include wormhole systems</b> — adds wormhole tiles to the pool.</li>
  <li><b>Duplicate empty/anomaly systems</b> — allows the same no-planet system to be placed multiple times.</li>
  <li><b>Sources</b> — restrict the pool to specific expansions. Leave all unchecked to use the active Search panel filter.</li>
</ul>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Value hints</h4>
<p>Use <b>V1–V5</b> to paint a target value tier on a hex. Use <b>R / I / T</b> to request high resources, influence, or tech skips. These are preferences — AutoMapper picks the best available match, falling back gracefully if unavailable.</p>
<p>Tiers are relative within each planet-count group: V5 on a 2-planet hex means "best 2-planet system available", not "best overall".</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Value overlay</h4>
<p>After filling, click <b>📊 Show Value Overlay</b> to see T1–T5 tier badges on placed systems (relative to their type group). Toggle R/I/T to see how different weightings would rank the systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Preview colours</h4>
<ul style="margin:0 0 8px 16px;padding:0;">
  <li><span style="color:#2ecc40">■</span> <b>Green</b> — matched correctly with a real system.</li>
  <li><span style="color:#ffb347">■</span> <b>Orange</b> — no matching system found; will use an anomaly token for effects, or a downgraded/fallback system.</li>
</ul>

</div>`,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                minWidth: '440px', maxWidth: '640px',
                border: '2px solid var(--popup-border-special)',
                borderRadius: '10px',
                boxShadow: '0 8px 40px #000a',
                padding: '20px',
            },
            actions: [{ label: 'Close', action: () => import('../../ui/popupUI.js').then(({ hidePopup }) => hidePopup('automapper-help-popup')) }],
        });
    });
}

// Returns a short effect tag string for the preview list
function getEffectTag(sys) {
    const tags = [];
    if (sys.isNebula)        tags.push('neb');
    if (sys.isGravityRift)   tags.push('rift');
    if (sys.isSupernova)     tags.push('SN');
    if (sys.isAsteroidField) tags.push('ast');
    if (sys.isScar)          tags.push('scar');
    if (sys.wormholes?.length) tags.push(sys.wormholes.join('+'));
    return tags.length ? ' ' + tags.join(',') : '';
}
