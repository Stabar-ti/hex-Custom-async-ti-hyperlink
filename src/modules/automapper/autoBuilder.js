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
import { SOURCE_GROUPS } from '../SystemPicker/pickerModel.js';
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
    summary: `list-style:none;cursor:pointer;color:${COLORS.popupAutomapper};font-weight:600;font-size:12px;padding:2px 0;user-select:none;`,
};

function el(tag, style, html) {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (html)  e.innerHTML = html;
    return e;
}

function toggle(label, checked, onChange, title = '') {
    const wrap = el('label', 'display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;');
    if (title) wrap.title = title;   // a title lives on the element, not in its cssText
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

/**
 * A collapsible section. `open` is read back from the caller's state object on every
 * render, so a section keeps its expanded/collapsed state across re-renders.
 */
function section(title, isOpen, onToggle) {
    const details = el('details', 'border-top:1px solid ' + COLORS.autoSectionBorder + ';padding-top:4px;');
    details.open = isOpen;
    const summary = el('summary', S.summary, title);
    details.appendChild(summary);
    details.ontoggle = () => onToggle(details.open);
    const body = el('div', 'padding:6px 2px 4px 2px;display:flex;flex-direction:column;gap:6px;');
    details.appendChild(body);
    return { details, body };
}

// ---- Main UI ----

export function showAutoBuilderUI(container) {
    if (!container) return;
    const editor = window.editor;
    if (!editor) {
        container.innerHTML = '<p style="color:#f66;padding:12px">No editor instance found.</p>';
        return;
    }

    // Column layout with a scrolling body and a pinned action bar, so a long options list
    // or a 60-row preview can never push Fill/Apply out of reach. The cap has to leave room
    // for the popup's own titlebar and padding, or the bar lands under the viewport edge.
    container.style.cssText = `display:flex;flex-direction:column;gap:6px;padding:4px;
        font-family:var(--font-ui);color:#eee;min-width:360px;max-height:58vh;`;

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

    // Which sections are expanded. Held out here so a re-render doesn't collapse them.
    const open = { pool: true, balance: false, value: false };

    // The preview owns its own node so ticking a hex checkbox doesn't rebuild the controls
    // above it — that used to re-run analyzeMap and throw away the list's scroll position.
    const scrollArea = el('div', 'flex:1 1 auto;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;');
    const previewHost = el('div', 'display:flex;flex-direction:column;gap:6px;');
    const actionBar = el('div', `flex:0 0 auto;display:flex;flex-direction:column;gap:6px;
        padding-top:8px;border-top:1px solid ${COLORS.autoSectionBorder};background:${COLORS.autoPanelBg};`);

    // ---- Render ----
    function render() {
        scrollArea.innerHTML = '';
        actionBar.innerHTML = '';
        container.innerHTML = '';
        container.appendChild(scrollArea);
        container.appendChild(actionBar);

        if (!editor.allSystems?.length) {
            scrollArea.appendChild(el('div', S.panel, `<span style="${S.warn}">⚠ System data not loaded. Load a map first, then re-open AutoMapper.</span>`));
            return;
        }

        const analysis = analyzeMap(editor, {
            includeHomeSystems: opts.includeHomeSystems,
            includeWormholes: opts.includeWormholes,
            allowDuplicatesNoPlanet: opts.allowDuplicatesNoPlanet,
            sources: opts.sources,
        });

        renderStatus(analysis);
        if (analysis.totalUnfilled) {
            renderOptions(analysis);
            renderBreakdown(analysis);
        }
        scrollArea.appendChild(previewHost);
        renderPreview();
        // Also render the bar when there is nothing left to fill but an apply just landed —
        // a fill that consumed every painted hex is exactly when Undo is most wanted, and
        // bailing out on totalUnfilled === 0 was hiding the button in that case.
        if (analysis.totalUnfilled || justApplied) renderActions(analysis.totalUnfilled > 0);
    }

    // --- Status header ---
    function renderStatus(analysis) {
        const status = el('div', S.panel);
        if (analysis.totalUnfilled === 0) {
            status.innerHTML = `<span style="${S.ok}">✔ All painted tiles are filled.</span><br>` +
                `<span style="${S.muted}">Use Draw Helpers to paint tile types, then come back here.</span>`;
        } else {
            status.innerHTML = `<b style="color:${COLORS.popupAutomapper}">${analysis.totalUnfilled} unfilled tile${analysis.totalUnfilled !== 1 ? 's' : ''}</b>` +
                ` &nbsp;<span style="${S.muted}">${analysis.totalAvailable} systems in pool</span>`;
        }
        scrollArea.appendChild(status);
    }

    // --- Collapsible option sections ---
    function renderOptions(analysis) {
        const panel = el('div', S.panel + 'display:flex;flex-direction:column;gap:2px;');

        // Pool — what may be placed at all
        {
            const { details, body } = section('Pool', open.pool, v => { open.pool = v; });
            details.style.borderTop = 'none';

            const srcLabel = el('div', S.muted, 'Sources — ticking any overrides the System Picker\'s source filter. Leave all off to follow it:');
            srcLabel.title = 'These replace the picker\'s source choice rather than narrowing it, so a picker you left on one expansion cannot silently empty the pool here.';
            body.appendChild(srcLabel);

            const srcRow = el('div', S.row + 'gap:4px;');
            // Built from the picker's own groups so the two can never disagree about which
            // sources exist or what they are called.
            SOURCE_GROUPS.forEach(({ key, label }) => {
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.marginRight = '3px';
                cb.checked = opts.sources ? !!opts.sources[key] : false;
                cb.onchange = () => {
                    if (!opts.sources) opts.sources = {};
                    opts.sources[key] = cb.checked;
                    if (!SOURCE_GROUPS.some(g => opts.sources[g.key])) opts.sources = null;
                    render();
                };
                const lbl = el('label', 'display:flex;align-items:center;font-size:11px;cursor:pointer;white-space:nowrap;');
                lbl.appendChild(cb); lbl.append(label);
                srcRow.appendChild(lbl);
            });
            body.appendChild(srcRow);

            const togglesRow = el('div', S.row);
            togglesRow.appendChild(toggle('Include HS tiles', opts.includeHomeSystems,
                v => { opts.includeHomeSystems = v; render(); },
                'Fill painted home-system hexes, and admit faction homeworld tiles to the pool for them. They can never land on any other kind of hex.').wrap);
            togglesRow.appendChild(toggle('Wormhole systems', opts.includeWormholes,
                v => { opts.includeWormholes = v; render(); },
                'Wormhole systems are excluded by default').wrap);
            togglesRow.appendChild(toggle('Duplicate empty/anomaly', opts.allowDuplicatesNoPlanet,
                v => { opts.allowDuplicatesNoPlanet = v; render(); },
                'Let the same no-planet system (empty, anomaly) be placed on several hexes. Planet systems are never repeated.').wrap);
            body.appendChild(togglesRow);

            panel.appendChild(details);
        }

        // Balance — needs two homes to mean anything
        {
            const { details, body } = section('Balance', open.balance, v => { open.balance = v; });

            if (!analysis.canBalance) {
                body.appendChild(el('div', S.muted,
                    'ℹ Needs at least 2 placed home systems — with fewer there is no spread between slices to even out. Fill still works.'));
            }

            const row = el('div', S.row);
            const { wrap: balWrap, cb: balCb } = toggle('Balanced', opts.balanced, v => { opts.balanced = v; },
                'Run several shuffles and keep the one with the most even resource spread across slices');
            balCb.disabled = !analysis.canBalance;
            if (!analysis.canBalance) balWrap.style.opacity = '0.5';
            row.appendChild(balWrap);

            const itLabel = el('label', 'display:flex;align-items:center;gap:5px;font-size:12px;');
            itLabel.append('Iterations: ');
            itLabel.appendChild(numberInput(opts.iterations, 1, 100, v => { opts.iterations = v; }));
            row.appendChild(itLabel);

            const brLabel = el('label', 'display:flex;align-items:center;gap:5px;font-size:12px;');
            brLabel.append('Range: ');
            brLabel.appendChild(numberInput(opts.balanceRange, 1, 5, v => { opts.balanceRange = v; }));
            brLabel.title = 'How far from each home system to look when scoring a slice';
            row.appendChild(brLabel);
            body.appendChild(row);

            const wBtn = el('button', S.btnLink, '⚖ Milty Weight Settings');
            wBtn.title = 'Opens the Milty Slice Designer weighting popup — those weights are used here for balancing';
            wBtn.onclick = () => {
                import('../Milty/miltyRandomToolUI.js').then(m => m.showWeightingSettingsPopup?.()).catch(() => {
                    alert('Open Milty Slice Designer first, then use its Weighting Settings button.');
                });
            };
            body.appendChild(el('div', S.row)).appendChild(wBtn);

            panel.appendChild(details);
        }

        // Value bias — mirrors the Draw Helpers V1–V5 / R / I / T hints
        {
            const { details, body } = section('Value bias', open.value, v => { open.value = v; });
            body.appendChild(el('div', S.muted,
                'Applies to hexes painted with a V1–V5 value hint in Draw Helpers.'));

            const row = el('div', S.row);
            // The button's look is derived from state on every build. It used to be created
            // un-highlighted regardless, so any re-render made an active bias look inactive
            // while it went on quietly steering the fill.
            function makeVtToggle(label, color, key, title) {
                const b = el('button', '', label);
                b.title = title;
                const paint = () => {
                    b.style.cssText = `padding:3px 10px;border-radius:3px;font-size:11px;font-weight:bold;cursor:pointer;` +
                        `border:1px solid ${opts[key] ? color : COLORS.surface5};` +
                        `background:${opts[key] ? color : 'transparent'};` +
                        `color:${opts[key] ? '#111' : color};`;
                };
                paint();
                b.onclick = () => { opts[key] = !opts[key]; paint(); };
                return b;
            }
            row.appendChild(makeVtToggle('R', COLORS.autoValueR, 'valueROn', 'Prefer high-resource systems for value-targeted hexes'));
            row.appendChild(makeVtToggle('I', COLORS.autoValueI, 'valueIOn', 'Prefer high-influence systems for value-targeted hexes'));
            row.appendChild(makeVtToggle('T', COLORS.autoValueT, 'valueTOn', 'Prefer tech-skip systems for value-targeted hexes'));
            body.appendChild(row);

            panel.appendChild(details);
        }

        scrollArea.appendChild(panel);
    }

    // --- Type breakdown ---
    //
    // One row per distinct requirement, keyed the way the pool is keyed, so an asteroid
    // shortage can't hide inside a healthy-looking "special" total. The counts come from a
    // dry run of the real assignment pass, so what this table says is what Fill will do.
    function renderBreakdown(analysis) {
        const rows = analysis.requirements.filter(r => r.need);
        if (!rows.length) return;

        const wrap = el('div', S.panel);
        wrap.appendChild(el('span', S.label, 'Type breakdown'));
        const tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
        tbl.innerHTML = `<thead><tr style="color:${COLORS.popupAutomapper};border-bottom:1px solid ${COLORS.autoSectionBorder}">
            <th style="text-align:left;padding:2px 6px">Wanted</th>
            <th style="padding:2px 6px">Need</th><th style="padding:2px 6px">Have</th>
            <th style="text-align:left;padding:2px 6px">Result</th>
        </tr></thead>`;
        const tbody = document.createElement('tbody');

        for (const r of rows) {
            const tr = el('tr', `border-bottom:1px solid ${COLORS.autoRowBorder}`);

            // "special · asteroid" reads as one thing you can go and find more of.
            const name = r.effects?.length
                ? `${r.type} <span style="color:${COLORS.autoValueR}">· ${r.effects.join(' · ')}</span>`
                : r.type;
            const via = r.paintedAs?.length
                ? ` <span style="${S.muted}">(painted ${r.paintedAs.join(', ')})</span>` : '';

            // Say what will happen, not just that something is short. Each clause names the
            // count and the consequence, because that is the actionable part.
            const notes = [];
            if (r.token) notes.push(r.effects?.length
                ? `${r.token} will get ${r.effects.join('+')} token${r.token !== 1 ? 's' : ''}`
                : `${r.token} will use tokens`);
            if (r.substituted) notes.push(`${r.substituted} will use a different tile type`);
            if (r.unfilled) notes.push(`${r.unfilled} left unfilled`);
            // Enough stock on paper, but another row got there first.
            if (r.contended) notes.push('stock taken by other hexes');

            let result;
            if (r.ok) {
                result = r.repeatable && r.have < r.need
                    ? `✅ <span style="${S.muted}">reused</span>`
                    : '✅';
            } else {
                const severe = r.unfilled ? COLORS.popupDanger : COLORS.autoWarnText;
                result = `<span style="color:${severe};font-size:12px">⚠ ${notes.join(', ')}</span>`;
            }

            tr.innerHTML = `<td style="padding:2px 6px">${name}${via}</td>
                <td style="padding:2px 6px;text-align:center">${r.need}</td>
                <td style="padding:2px 6px;text-align:center">${r.have}</td>
                <td style="padding:2px 6px">${result}</td>`;
            tbody.appendChild(tr);
        }
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);

        // "Have" is exact-match stock, which is not the same as the pool total. Say so once
        // rather than leaving the two numbers looking contradictory.
        wrap.appendChild(el('div', S.muted + 'margin-top:4px;',
            'Have = tiles matching exactly. Anything short is resolved with tokens or a substitute, as shown.'));
        scrollArea.appendChild(wrap);
    }

    // --- Sticky action bar ---
    function renderActions(hasUnfilled = true) {
        if (justApplied) {
            const undoBtn = el('button',
                `padding:7px 16px;background:${COLORS.autoBtnUndo};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;`,
                '↩ Undo Last Apply');
            undoBtn.title = 'Undo the entire fill that was just applied';
            undoBtn.onclick = () => { editor.undo?.(); justApplied = false; render(); };
            actionBar.appendChild(el('div', S.row)).appendChild(undoBtn);
        }

        const btnRow = el('div', S.row);

        // Nothing painted and unfilled means nothing to fill — offering the button here
        // only leads to an alert saying so.
        if (hasUnfilled) {
            const fillBtn = el('button', S.btnBlue, lastResult ? '🔀 Reshuffle' : '🎲 Fill Remaining');
            fillBtn.onclick = () => { justApplied = false; runFill(); };
            btnRow.appendChild(fillBtn);
        }

        if (lastResult) {
            const includedCount = lastResult.assignments.length - excludedLabels.size;
            const applyBtn = el('button', S.btnGreen, `✅ Apply ${includedCount} to Map`);
            applyBtn.disabled = includedCount === 0;
            if (includedCount === 0) applyBtn.style.opacity = '0.5';
            applyBtn.onclick = () => applyToMap(lastResult);
            btnRow.appendChild(applyBtn);

            const discardBtn = el('button', S.btnGrey, 'Discard');
            discardBtn.onclick = () => { lastResult = null; excludedLabels = new Set(); render(); };
            btnRow.appendChild(discardBtn);
        }

        const scBtn = el('button', S.btnLink, '🔍 Sanity Check');
        scBtn.title = 'Check for duplicate system IDs on the map';
        scBtn.onclick = () => {
            import('../../ui/simplepPopup.js').then(m => m.showSanityCheckPopup?.()).catch(console.warn);
        };
        btnRow.appendChild(scBtn);

        actionBar.appendChild(btnRow);
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
        if (result.notice) {
            // An option was ignored but the fill succeeded — say so in the panel rather
            // than in a modal the user has to dismiss before seeing the result.
            opts.balanced = false;
        }
        lastResult = result;
        excludedLabels = new Set();
        render();
    }

    // ---- Preview ----
    function renderPreview() {
        previewHost.innerHTML = '';
        if (!lastResult) return;

        const { assignments, tokenPlacements, downgrades, unmatched, score, notice } = lastResult;

        const wrap = el('div', S.panel);
        const scoreStr = score != null ? ` &nbsp;<span style="${S.muted}">σ ${score.toFixed(1)} (lower=better)</span>` : '';
        wrap.innerHTML = `<b style="color:${COLORS.popupSpecial}">${assignments.length} matched${scoreStr}</b>`;

        if (notice) {
            wrap.appendChild(el('div', S.muted + 'margin-top:3px;')).textContent = `ℹ ${notice}`;
        }

        // Warnings — report every fallback and why, so the user can opt out per hex
        if (downgrades.length) {
            const groups = {};
            for (const dg of downgrades) {
                const k = `${dg.from} → ${dg.to}`;
                groups[k] = (groups[k] || 0) + 1;
            }
            const d = el('div', S.warn + 'margin-top:3px;');
            d.textContent = `⚠ Downgraded: ${Object.entries(groups).map(([k, v]) => `${v}× ${k}`).join(', ')} — uncheck any hex below to leave it unfilled instead.`;
            wrap.appendChild(d);
        }
        if (tokenPlacements.length) {
            const t = el('div', S.warn + 'margin-top:3px;');
            t.textContent = `⚠ ${tokenPlacements.length} hex${tokenPlacements.length !== 1 ? 'es' : ''} will use effect tokens (no matching effect system available)`;
            wrap.appendChild(t);
        }
        if (unmatched.length) {
            // unmatched entries carry their own reason now — a fracture hex left alone is a
            // different problem from a drained pool, and lumping them together hid that.
            const reasons = [...new Set(unmatched.map(u => u.reason).filter(Boolean))];
            const u = el('div', S.warn + 'margin-top:3px;');
            u.textContent = `⚠ ${unmatched.length} hex${unmatched.length !== 1 ? 'es' : ''} left unfilled: ${unmatched.map(x => x.label).join(', ')}`;
            u.title = reasons.join('\n');
            wrap.appendChild(u);
            for (const reason of reasons) {
                wrap.appendChild(el('div', S.muted + 'margin-left:14px;')).textContent = `· ${reason}`;
            }
        }
        if (excludedLabels.size) {
            const ex = el('div', S.muted + 'margin-top:3px;');
            ex.textContent = `${excludedLabels.size} hex${excludedLabels.size !== 1 ? 'es' : ''} unchecked — will be left unfilled.`;
            wrap.appendChild(ex);
        }

        // Per-hex reason lookup (downgrade reason takes priority; else token-effect reason)
        const downgradeMap = new Map(downgrades.map(dg => [dg.label, dg]));
        const tokenMap = new Map((tokenPlacements || []).map(tp => [tp.label, tp]));

        // Compact assignment list — fallback hexes shown in amber with a checkbox to opt out
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

            const bg   = excluded ? COLORS.autoRowOffBg   : isFallback ? COLORS.autoRowWarnBg   : COLORS.autoRowOkBg;
            const text = excluded ? COLORS.autoRowOffText : isFallback ? COLORS.autoRowWarnText : COLORS.autoRowOkText;
            const item = el('label', `display:flex;align-items:center;gap:4px;
                background:${bg};padding:2px 5px;border-radius:3px;color:${text};
                cursor:pointer;${excluded ? 'text-decoration:line-through;' : ''}`);
            item.title = reason;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !excluded;
            cb.style.flexShrink = '0';
            cb.onchange = () => {
                if (cb.checked) excludedLabels.delete(label); else excludedLabels.add(label);
                // Only the preview and the Apply count depend on this. Re-rendering the whole
                // panel here re-ran analyzeMap and reset the list's scroll position on every tick.
                renderPreview();
                actionBar.innerHTML = '';
                renderActions();
            };
            item.appendChild(cb);

            const span = document.createElement('span');
            span.textContent = `${isFallback ? '⚠ ' : ''}${label} → ${sys.id} (${planets.length}p ${val}v${eff})${tp ? ' +token' : ''}`;
            item.appendChild(span);

            list.appendChild(item);
        }
        wrap.appendChild(list);
        previewHost.appendChild(wrap);
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
        excludedLabels = new Set();
        justApplied  = true;  // show Undo button (fix 1)
        render();
    }

    render();
}

/**
 * Opens the AutoMapper panel in a popup.
 *
 * The three entry points (Sector Controls → Draw Helpers, Special Modes, Layout Options)
 * each carried their own copy of this block, and they had already drifted — one of them
 * pointed `onHelp` at a help page describing a feature set that does not exist.
 */
export function openAutoMapperPopup() {
    return import('../../ui/popupUI.js').then(({ showPopup }) => {
        const content = document.createElement('div');
        content.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;';
        showAutoBuilderUI(content);

        showPopup({
            id: 'automapper-popup',
            title: '🤖 AutoMapper',
            content,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            showHelp: true,
            onHelp: () => showAutoMapperHelp(),
            style: {
                minWidth: '380px', maxWidth: '700px',
                border: '2px solid var(--popup-border-special)',
                borderRadius: '10px',
                boxShadow: '0 8px 40px #000a',
                padding: '16px',
                zIndex: 10012,
            },
        });
    });
}

export function showAutoMapperHelp() {
    import('../../ui/popupUI.js').then(({ showPopup }) => {
        showPopup({
            id: 'automapper-help-popup',
            title: '🤖 AutoMapper & Draw Helpers — Help',
            content: `<div style="line-height:1.6;font-size:13px;max-height:70vh;overflow-y:auto;padding-right:8px;">

<h3 style="color:#2ecc40;margin:0 0 8px 0;">Draw Helpers</h3>
<p>Open from <b>Sector Controls → Draw Helpers…</b> (also under <b>Layout Options → Draw Helpers</b>). Paint tile properties directly onto hexes without searching for specific systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Tile types</h4>
<p>Click a type button, then click hexes: <b>1/2/3 Planet</b>, <b>Legendary</b>, <b>Empty</b>, <b>Special</b> (anomaly), <b>Fracture</b> (Thunders Edge).</p>
<p>A <b>Special</b> tile with no effects painted acts the same as <b>Empty</b>.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Effects</h4>
<p>Paint an anomaly overlay on top of a hex: <b>Nebula ☁️</b>, <b>Rift 🕳️</b>, <b>Asteroid 🪨</b>, <b>Supernova ☀️</b>, <b>Scar ☄️</b>.</p>
<p><b>Empty + an effect</b> and <b>Special + an effect</b> are the same request — a tile with no planets carrying that anomaly — and are filled identically. Use whichever you prefer.</p>
<p>If no tile with that exact effect is available, a plain tile is used and an <b>anomaly token</b> is drawn on it. A hex painted for one anomaly is never given a different one — a token is the better answer. Turn on <b>Duplicate empty/anomaly</b> to reuse the real anomaly tiles instead, which is usually what you want when a map needs more asteroid fields than the base game has.</p>

<hr style="border-color:#333;margin:10px 0;">
<h3 style="color:#2ecc40;margin:0 0 8px 0;">🤖 AutoMapper</h3>
<p>After painting tile types with Draw Helpers, AutoMapper fills those hexes with real systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Workflow</h4>
<ol style="margin:0 0 8px 16px;padding:0;">
  <li>Paint tile types on hexes using Draw Helpers.</li>
  <li>Open AutoMapper — the <b>Type breakdown</b> shows one row per thing your map asks for, and what each will actually get.</li>
  <li>Choose options and click <b>Fill Remaining</b>.</li>
  <li>Review the preview — click <b>Reshuffle</b> for a different arrangement, or untick individual hexes to leave them unfilled.</li>
  <li>Click <b>Apply to Map</b>. One Ctrl+Z undoes the entire fill.</li>
</ol>
<p>A tile is never placed on two hexes — the one exception is <b>Duplicate empty/anomaly</b> below, and even then only tiles with no planets can repeat.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Pool</h4>
<ul style="margin:0 0 8px 16px;padding:0;">
  <li><b>Sources</b> — restrict the pool to specific expansions. These <i>override</i> the System Picker's source filter rather than narrowing it, so a picker you left set to one expansion can't empty the pool here. Leave all unchecked to follow the picker instead.</li>
  <li><b>Include HS tiles</b> — fills painted home-system hexes, and admits faction homeworld tiles to the pool so there is something to fill them with. Those tiles can never land on any other kind of hex.</li>
  <li><b>Wormhole systems</b> — adds wormhole tiles to the pool.</li>
  <li><b>Duplicate empty/anomaly</b> — lets a planet-free tile (blank or anomaly) be placed on several hexes. Every distinct tile is used before any is reused, so variety is kept where the pool allows it. Essential for anomalies: the base game has only two asteroid fields and one of each other kind, so without this a map wanting eight asteroid hexes gets two real tiles and six tokens.</li>
</ul>
<p>FOW, blank draft and placeholder tiles are never placed, whatever the source settings say.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Balance</h4>
<ul style="margin:0 0 8px 16px;padding:0;">
  <li><b>Balanced</b> — runs several shuffles and keeps the assignment with the most even resource spread across player slices. Needs at least 2 placed home systems; with fewer there is no spread to even out and the option is disabled.</li>
  <li><b>Iterations</b> — how many shuffles balanced mode tries.</li>
  <li><b>Range</b> — how far from each home system to look when scoring a slice.</li>
</ul>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Type breakdown</h4>
<p>One row per distinct request — <b>special · asteroid</b> is counted separately from <b>special · nebula</b>, because they are separate tiles. <b>Have</b> is the number of tiles matching <i>exactly</i>; anything short is resolved with tokens or a substitute, and the <b>Result</b> column says which and how many.</p>
<p>The numbers come from a rehearsal of the real fill, so what the table says is what <b>Fill Remaining</b> will do — not an estimate of it.</p>
<p>A row can read <i>"stock taken by other hexes"</i> when it had enough tiles on paper but another request reached them first. Anomaly hexes with no matching tile borrow ordinary tiles as a base for their token, which is usually the cause.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Restricted hex types</h4>
<p><b>Fracture</b> and <b>Home system</b> hexes only ever accept a tile of that same type. If the pool runs out, the hex is left unfilled and listed under the preview rather than being quietly given an ordinary tile.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Value hints</h4>
<p>Use <b>V1–V5</b> to paint a target value tier on a hex. Use <b>R / I / T</b> to request high resources, influence, or tech skips. These are preferences — AutoMapper picks the best available match, falling back gracefully if unavailable.</p>
<p>Tiers are relative within each planet-count group: V5 on a 2-planet hex means "best 2-planet system available", not "best overall".</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Value overlay</h4>
<p>After filling, click <b>📊 Show Value Overlay</b> to see T1–T5 tier badges on placed systems (relative to their type group). Toggle R/I/T to see how different weightings would rank the systems.</p>

<h4 style="color:#ffe066;margin:8px 0 4px 0;">Preview colours</h4>
<ul style="margin:0 0 8px 16px;padding:0;">
  <li><span style="color:#2ecc40">■</span> <b>Green</b> — matched correctly with a real system.</li>
  <li><span style="color:#ffb347">■</span> <b>Amber</b> — a fallback: an anomaly token will stand in for a missing effect, or a downgraded system was used. Hover the row for the reason.</li>
  <li><span style="color:#777">■</span> <b>Grey, struck through</b> — you unticked it; the hex will be left as painted.</li>
</ul>
<p><b>Empty</b> and <b>Special</b> are the same underlying request — a tile with no planets — so they are normalised onto whichever the pool actually holds. A Special hex with no effects draws from the <i>empty</i> pool; an Empty hex with an effect draws from the <i>anomaly</i> pool. Neither is a downgrade and neither is flagged as one; the breakdown shows the pool being used, e.g. "special (painted empty)".</p>

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
