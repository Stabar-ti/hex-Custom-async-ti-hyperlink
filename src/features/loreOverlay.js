// loreOverlay.js - Visual indicators for systems and planets with lore
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { planetDisplayName } from '../draw/hexAnchors.js';
import { markerPosition, drawMarker, drawEffectArc, TRIGGER_LEGEND } from '../draw/loreDraw.js';
import {
    getDisplayFooter, getEffectLines, getGate,
    retargetFooterReferences, parseEffectLine
} from '../modules/Lore/loreEffects.js';
import { normalizeLoreEntries, isNonEmptyLoreEntry, formatRoundWindow, LORE_PHASE_TARGETS } from '../modules/Lore/loreCore.js';

const PHASE_SHORT = { strategy: 'Str', action: 'Act', status: 'Sta', agenda: 'Agn' };

/**
 * What one marker stands for. A target can hold several entries, so the marker shows the
 * first entry's trigger and gate (the common case is one entry) plus a count, and flags
 * whether ANY entry is round-restricted or carries effects.
 */
function summarizeEntries(entries) {
    const first = entries[0] || {};
    const gate = getGate(first.footerText || '').type;
    return {
        count: entries.length,
        trigger: first.trigger,
        gate,
        triggers: entries.map(e => e.trigger),
        receivers: entries.map(e => e.receiver),
        hasRounds: entries.some(e => e.fromRound > 0 || e.tillRound > 0),
        hasEffects: entries.some(e => getEffectLines(e.footerText || '').length > 0)
    };
}

/**
 * Tiles the entries act on, derived from their effect lines:
 *   !swap a b        -> both positions
 *   ... @target      -> the redirect, when it names a hex
 *   tile-default verbs with no @target act on the entry's own hex, so they're not links.
 * Returns [{ hexLabel, kind }] with kind driving the arc's styling.
 */
function effectTargets(entries, editor, ownLabel) {
    const links = new Map();
    const add = (label, kind) => {
        if (!label || label === ownLabel || !editor.hexes?.[label]) return;
        if (!links.has(label)) links.set(label, kind);
    };

    for (const entry of entries) {
        for (const line of getEffectLines(entry.footerText || '')) {
            const parsed = parseEffectLine(line);
            if (!parsed) continue;
            if (parsed.verb === 'swap') {
                add(parsed.args[0], 'swap');
                add(parsed.args[1], 'swap');
                continue;
            }
            if (parsed.targetRef) {
                const removes = parsed.verb.startsWith('remove') || parsed.verb === 'clearunits';
                add(parsed.targetRef, removes ? 'removes' : 'affects');
            }
        }
    }
    return [...links].map(([hexLabel, kind]) => ({ hexLabel, kind }));
}

class LoreOverlay {
    constructor(editor) {
        this.editor = editor;
        this.isActive = false;
        this.overlayGroup = null;
        this._hideTimer = null;
        this._clipboard = null;        // { type, data, sourceLabel, planetIndex }
        this._ctrlClickBound = null;   // bound Ctrl+click handler reference
        this._focus = null;            // target ref the editor/user is looking at
        this._hover = null;            // target ref under the cursor
        this._filter = null;           // {trigger?, receiver?, gate?, withEffects?, withRounds?}
    }

    initialize() {
        if (!this.overlayGroup) {
            this.overlayGroup = this.editor.svg.querySelector('#lore-overlay');
            if (!this.overlayGroup) {
                this.overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                this.overlayGroup.setAttribute('id', 'lore-overlay');
                this.overlayGroup.style.pointerEvents = 'none';
                this.overlayGroup.style.display = 'block';
                this.overlayGroup.style.opacity = '1';
                this.editor.svg.appendChild(this.overlayGroup);
            }
        }
    }

    toggle() {
        this.isActive = !this.isActive;
        if (this.isActive) {
            this.show();
        } else {
            this.hide();
        }
        return this.isActive;
    }

    show() {
        this.initialize();
        this.isActive = true;
        this.render();
        this.overlayGroup.style.display = 'block';
        enforceSvgLayerOrder(this.editor.svg);
        this._attachCtrlClickHandler();
        this._updateClipboardBadge();
        this._updatePhaseBanner();
        this._updateFilterStrip();
    }

    hide() {
        this.isActive = false;
        if (this.overlayGroup) {
            this.overlayGroup.style.display = 'none';
        }
        this._hideTooltip();
        this._detachCtrlClickHandler();
        this._updateClipboardBadge();
        this._updatePhaseBanner();
        this._updateFilterStrip();
    }

    // ── Tooltip ──────────────────────────────────────────────────

    _getOrCreateTooltip() {
        let tip = document.getElementById('lore-icon-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'lore-icon-tooltip';
            Object.assign(tip.style, {
                position:     'fixed',
                display:      'none',
                zIndex:       '9999',
                maxWidth:     '320px',
                padding:      '10px 12px',
                background:   '#1c1c2e',
                color:        '#f0f0f0',
                border:       '1px solid #555',
                borderRadius: '6px',
                boxShadow:    '0 4px 16px rgba(0,0,0,0.7)',
                fontSize:     '13px',
                lineHeight:   '1.5',
                pointerEvents:'auto',
                fontFamily:   'inherit',
            });
            tip.addEventListener('mouseenter', () => clearTimeout(this._hideTimer));
            tip.addEventListener('mouseleave', () => this._scheduleHideTooltip());
            document.body.appendChild(tip);
        }
        return tip;
    }

    _showTooltip(hexLabel, e) {
        clearTimeout(this._hideTimer);
        const tip = this._getOrCreateTooltip();
        tip.innerHTML = '';
        this._buildTooltipContent(tip, hexLabel);
        tip.style.display = 'block';
        this._positionTooltip(e);
    }

    _positionTooltip(e) {
        const tip = document.getElementById('lore-icon-tooltip');
        if (!tip || tip.style.display === 'none') return;
        const pad = 16;
        let x = e.clientX + pad;
        let y = e.clientY + pad;
        requestAnimationFrame(() => {
            const w = tip.offsetWidth;
            const h = tip.offsetHeight;
            if (x + w > window.innerWidth)  x = e.clientX - w - pad;
            if (y + h > window.innerHeight) y = e.clientY - h - pad;
            tip.style.left = x + 'px';
            tip.style.top  = y + 'px';
        });
    }

    _scheduleHideTooltip() {
        clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(() => this._hideTooltip(), 180);
    }

    _hideTooltip() {
        clearTimeout(this._hideTimer);
        const tip = document.getElementById('lore-icon-tooltip');
        if (tip) tip.style.display = 'none';
    }

    _buildTooltipContent(tip, hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return;

        const mkLabel = (text) => {
            const s = document.createElement('span');
            s.style.cssText = 'color:#aaa;font-size:11px';
            s.textContent = text;
            return s;
        };

        const mkMeta = (entry, parent) => {
            const row = document.createElement('div');
            row.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px';
            row.append(mkLabel('Trigger: '), entry.trigger, '  ',
                       mkLabel('Receiver: '), entry.receiver, '  ',
                       mkLabel('Ping: '), entry.ping, '  ',
                       mkLabel('Persist: '), entry.persistance);
            const rounds = formatRoundWindow(entry.fromRound, entry.tillRound);
            if (rounds) row.append('  ', mkLabel('Rounds: '), rounds);
            parent.appendChild(row);
        };

        const mkCopyBtn = (label, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = 'padding:2px 8px;font-size:11px;cursor:pointer;' +
                'border:1px solid #666;border-radius:3px;background:#2c2c3e;color:#ccc;margin:2px 2px 4px 0';
            btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return btn;
        };

        const renderEntry = (entry, i, entryCount, copyLabel, onCopy) => {
            if (entryCount > 1 || entry.tag) {
                const tagLine = document.createElement('div');
                tagLine.style.cssText = 'font-size:11px;color:#b39ddb;margin-bottom:2px';
                tagLine.textContent = entry.tag ? `#${entry.tag}` : `(entry ${i + 1})`;
                tip.appendChild(tagLine);
            }
            if (entry.loreText?.trim()) {
                const t = document.createElement('div');
                t.style.marginBottom = '4px';
                t.textContent = entry.loreText.trim();
                tip.appendChild(t);
            }
            this._appendFooterPreview(tip, entry.footerText);
            mkMeta(entry, tip);
            tip.appendChild(mkCopyBtn(copyLabel, onCopy));
        };

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold;margin-bottom:8px;border-bottom:1px solid #444;padding-bottom:4px';
        header.textContent = `Hex ${hexLabel}`;
        tip.appendChild(header);

        // System lore entries
        const systemEntries = normalizeLoreEntries(hex.systemLore).filter(isNonEmptyLoreEntry);
        if (systemEntries.length) {
            const title = document.createElement('div');
            title.style.cssText = 'color:#4CAF50;font-weight:bold;margin-bottom:4px';
            title.textContent = systemEntries.length > 1 ? `System Lore (×${systemEntries.length})` : 'System Lore';
            tip.appendChild(title);
            systemEntries.forEach((entry, i) => renderEntry(entry, i, systemEntries.length,
                systemEntries.length > 1 ? `Copy ${entry.tag ? '#' + entry.tag : 'entry ' + (i + 1)}` : 'Copy System Lore',
                () => this._copyLore(hexLabel, 'system', null, i)));
        }

        // Planet lore entries
        if (hex.planetLore) {
            Object.entries(hex.planetLore).forEach(([idx, list]) => {
                const entries = normalizeLoreEntries(list).filter(isNonEmptyLoreEntry);
                if (!entries.length) return;
                const planetIdx = parseInt(idx);
                const planet = hex.planets?.[planetIdx];
                const planetName = planetDisplayName(planet, Number(planetIdx));

                const sep = document.createElement('div');
                sep.style.cssText = 'border-top:1px solid #333;margin:6px 0 4px';
                tip.appendChild(sep);

                const ptitle = document.createElement('div');
                ptitle.style.cssText = 'color:#FF9800;font-weight:bold;margin-bottom:4px';
                ptitle.textContent = entries.length > 1 ? `${planetName} (×${entries.length})` : planetName;
                tip.appendChild(ptitle);

                entries.forEach((entry, i) => renderEntry(entry, i, entries.length,
                    entries.length > 1 ? `Copy ${entry.tag ? '#' + entry.tag : 'entry ' + (i + 1)}` : `Copy ${planetName} Lore`,
                    () => this._copyLore(hexLabel, 'planet', planetIdx, i)));
            });
        }

        // Paste button (shown whenever clipboard has data) — pasting APPENDS to the target's list
        if (this._clipboard) {
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid #444;margin:6px 0 4px';
            tip.appendChild(sep);

            const cb = this._clipboard;
            const pasteLabel = cb.type === 'system'
                ? `Paste System Lore (from ${cb.sourceLabel})`
                : `Paste Planet Lore (from ${cb.sourceLabel})`;
            tip.appendChild(mkCopyBtn(pasteLabel, () => this._pasteLore(hexLabel)));
        }
    }

    /** Shows only what players actually see (strips !effect lines and the !choice marker), plus an effects badge. */
    _appendFooterPreview(tip, footerText) {
        const display = (footerText || '').trim();
        const displayOnly = getDisplayFooter(footerText);
        const effectCount = getEffectLines(footerText).length;

        if (displayOnly) {
            const f = document.createElement('div');
            f.style.cssText = 'font-style:italic;color:#bbb;margin-bottom:4px';
            f.textContent = displayOnly;
            tip.appendChild(f);
        }

        if (effectCount > 0) {
            const badge = document.createElement('div');
            badge.style.cssText = 'font-size:11px;color:#7fd3ff;margin-bottom:4px';
            const gate = getGate(footerText);
            const gateNote = gate.type === 'choice' ? ' — gated behind Accept/Reject'
                : gate.type === 'roll' ? ` — gated behind a ${gate.count}d${gate.sides} roll` : '';
            badge.textContent = `⚙ ${effectCount} bot effect${effectCount > 1 ? 's' : ''}` + gateNote;
            tip.appendChild(badge);
        } else if (display && !displayOnly) {
            // Footer has content but it's entirely machine syntax (e.g. just "!choice")
            const note = document.createElement('div');
            note.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px';
            note.textContent = '(footer is bot-only — nothing shown to players)';
            tip.appendChild(note);
        }
    }

    _copyLore(hexLabel, type, planetIndex, entryIndex = 0) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return;

        const source = type === 'system' ? hex.systemLore : hex.planetLore?.[planetIndex];
        const entry = normalizeLoreEntries(source)[entryIndex];
        if (!entry) return;
        this._clipboard = { type, data: { ...entry }, sourceLabel: hexLabel, planetIndex: type === 'planet' ? planetIndex : null };

        this._updateClipboardBadge();

        // Rebuild tooltip to show Paste button immediately
        const tip = document.getElementById('lore-icon-tooltip');
        if (tip && tip.style.display !== 'none') {
            tip.innerHTML = '';
            this._buildTooltipContent(tip, hexLabel);
        }
    }

    _pasteLore(targetLabel) {
        if (!this._clipboard) return;
        const hex = this.editor.hexes[targetLabel];
        if (!hex) return;

        const loreData = { ...this._clipboard.data };
        const pastedPlanetIndex = this._clipboard.type === 'planet' ? this._clipboard.planetIndex : null;
        loreData.footerText = retargetFooterReferences(loreData.footerText, hex, pastedPlanetIndex);

        this.editor.saveState(targetLabel);
        // Append to the target's entry list (a target holds many entries)
        if (this._clipboard.type === 'system') {
            hex.systemLore = normalizeLoreEntries(hex.systemLore);
            hex.systemLore.push(loreData);
        } else {
            if (!hex.planetLore || Array.isArray(hex.planetLore)) hex.planetLore = {};
            const idx = this._clipboard.planetIndex;
            hex.planetLore[idx] = normalizeLoreEntries(hex.planetLore[idx]);
            hex.planetLore[idx].push(loreData);
        }

        this.refresh();

        // Rebuild tooltip to reflect updated lore on the target
        const tip = document.getElementById('lore-icon-tooltip');
        if (tip && tip.style.display !== 'none') {
            tip.innerHTML = '';
            this._buildTooltipContent(tip, targetLabel);
        }
    }

    render() {
        if (!this.overlayGroup || !this.isActive) return;
        this.overlayGroup.innerHTML = '';
        for (const hexLabel of Object.keys(this.editor.hexes)) {
            this.renderHex(hexLabel);
        }
        this.renderArcs();
    }

    /**
     * Draw one hex's markers: one for its system lore, one on each planet that holds lore.
     * Separate from render() so focus and edits can repaint a single hex instead of the whole
     * board — a full innerHTML wipe destroys hover and focus state.
     */
    renderHex(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.center || !this.overlayGroup) return;

        for (const stale of this.overlayGroup.querySelectorAll(`[data-lore-hex="${hexLabel}"]`)) {
            stale.remove();
        }

        for (const target of this.targetsOn(hexLabel)) {
            const pos = markerPosition(hex, this.editor.hexRadius, target.kind, target.planetIndex);
            if (!pos) continue;
            if (!this.passesFilter(target.summary)) continue;

            const group = drawMarker(this.overlayGroup, {
                x: pos.x, y: pos.y,
                kind: target.kind,
                summary: target.summary,
                focused: this.isFocused(target.ref)
            });
            group.setAttribute('data-lore-hex', hexLabel);
            group.style.pointerEvents = 'all';
            group.style.cursor = 'pointer';
            this.wireMarker(group, target);
        }
    }

    /** Every lore-bearing target on a hex, with a summary of what's behind each marker. */
    targetsOn(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        const out = [];
        if (!hex) return out;

        const systemEntries = normalizeLoreEntries(hex.systemLore).filter(isNonEmptyLoreEntry);
        if (systemEntries.length) {
            out.push({
                kind: 'system',
                planetIndex: null,
                ref: { kind: 'system', hexLabel },
                entries: systemEntries,
                summary: summarizeEntries(systemEntries)
            });
        }

        for (const [idx, list] of Object.entries(hex.planetLore || {})) {
            const entries = normalizeLoreEntries(list).filter(isNonEmptyLoreEntry);
            if (!entries.length) continue;
            const planetIndex = Number(idx);
            out.push({
                kind: 'planet',
                planetIndex,
                ref: { kind: 'planet', hexLabel, planetIndex },
                entries,
                summary: summarizeEntries(entries)
            });
        }
        return out;
    }

    wireMarker(group, target) {
        const hexLabel = target.ref.hexLabel;
        group.addEventListener('mouseenter', (e) => {
            this.setHover(target.ref);
            this._showTooltip(hexLabel, e);
        });
        group.addEventListener('mousemove', (e) => this._positionTooltip(e));
        group.addEventListener('mouseleave', () => {
            this.setHover(null);
            this._scheduleHideTooltip();
        });
        group.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) return;   // Ctrl+click is still paste
            e.preventDefault();
            e.stopPropagation();
            this.setFocus(target.ref);
            window.openLoreEditor?.(target.ref);
        });
    }

    // ── focus, hover and filtering ───────────────────────────────────────

    static sameRef(a, b) {
        if (!a || !b || a.kind !== b.kind) return false;
        if (a.kind === 'phase') return a.phase === b.phase;
        return a.hexLabel === b.hexLabel && (a.planetIndex ?? null) === (b.planetIndex ?? null);
    }

    isFocused(ref) {
        return LoreOverlay.sameRef(this._focus, ref) || LoreOverlay.sameRef(this._hover, ref);
    }

    /** Highlight one target and draw the tiles its effects reach. */
    setFocus(ref) {
        const previous = this._focus;
        this._focus = ref || null;
        if (previous?.hexLabel) this.renderHex(previous.hexLabel);
        if (ref?.hexLabel) this.renderHex(ref.hexLabel);
        this.renderArcs();
    }

    setHover(ref) {
        const previous = this._hover;
        if (LoreOverlay.sameRef(previous, ref)) return;
        this._hover = ref || null;
        if (previous?.hexLabel) this.renderHex(previous.hexLabel);
        if (ref?.hexLabel) this.renderHex(ref.hexLabel);
        this.renderArcs();
    }

    /**
     * Show only markers matching the active filter. Filtering dims rather than deletes so the
     * board's shape stays recognisable — a lore-heavy map is otherwise an undifferentiated
     * field of icons you can't audit.
     */
    passesFilter(summary) {
        const f = this._filter;
        if (!f) return true;
        if (f.trigger && !summary.triggers.includes(f.trigger)) return false;
        if (f.receiver && !summary.receivers.includes(f.receiver)) return false;
        if (f.gate && summary.gate !== f.gate) return false;
        if (f.withEffects && !summary.hasEffects) return false;
        if (f.withRounds && !summary.hasRounds) return false;
        return true;
    }

    setFilter(filter) {
        this._filter = filter && Object.keys(filter).length ? filter : null;
        this.render();
        this._updateFilterStrip();
    }

    getFilter() {
        return this._filter;
    }

    /**
     * Control strip for the filter. A lore-heavy map is otherwise an undifferentiated field of
     * markers you can't audit — this lets you ask "what fires on activation?" or "what has
     * effects?" and see only that. State lives here, not on the editor, so it never reaches a
     * save file.
     */
    _updateFilterStrip() {
        let strip = document.getElementById('lore-filter-strip');

        if (!this.isActive) {
            if (strip) strip.remove();
            return;
        }
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'lore-filter-strip';
            strip.className = 'lore-filter-strip';
            document.body.appendChild(strip);
        }
        strip.innerHTML = '';

        const active = this._filter || {};
        const chip = (label, title, isOn, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lore-filter-chip' + (isOn ? ' is-on' : '');
            btn.textContent = label;
            btn.title = title;
            btn.onclick = onClick;
            strip.appendChild(btn);
        };

        const toggle = (key, value) => {
            const next = { ...(this._filter || {}) };
            if (next[key] === value) delete next[key];
            else next[key] = value;
            this.setFilter(next);
        };

        const heading = document.createElement('span');
        heading.className = 'lore-filter-label';
        heading.textContent = 'Lore:';
        strip.appendChild(heading);

        for (const [trigger, glyph, description] of TRIGGER_LEGEND) {
            chip(glyph, description, active.trigger === trigger, () => toggle('trigger', trigger));
        }
        chip('⚖', 'Only entries behind an Accept/Reject choice',
            active.gate === 'choice', () => toggle('gate', 'choice'));
        chip('🎲', 'Only entries behind a dice roll',
            active.gate === 'roll', () => toggle('gate', 'roll'));
        chip('!', 'Only entries that carry bot effects',
            !!active.withEffects, () => toggle('withEffects', true));
        chip('⏱', 'Only entries restricted to a round window',
            !!active.withRounds, () => toggle('withRounds', true));

        if (Object.keys(active).length) {
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'lore-filter-clear';
            clear.textContent = 'Clear';
            clear.onclick = () => this.setFilter(null);
            strip.appendChild(clear);

            const hidden = this._countHiddenByFilter();
            if (hidden) {
                const note = document.createElement('span');
                note.className = 'lore-filter-note';
                note.textContent = `${hidden} hidden`;
                strip.appendChild(note);
            }
        }
    }

    _countHiddenByFilter() {
        let hidden = 0;
        for (const hexLabel of Object.keys(this.editor.hexes || {})) {
            for (const target of this.targetsOn(hexLabel)) {
                if (!this.passesFilter(target.summary)) hidden++;
            }
        }
        return hidden;
    }

    // ── relationship arcs ────────────────────────────────────────────────

    _getOrCreateArcLayer() {
        let layer = this.editor.svg.querySelector('#lore-link-layer');
        if (!layer) {
            layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            layer.setAttribute('id', 'lore-link-layer');
            layer.style.pointerEvents = 'none';
            this.editor.svg.appendChild(layer);
        }
        return layer;
    }

    /**
     * Draw arcs from the focused (or hovered) marker to every tile its effects act on.
     * These relationships — !swap, @target redirects, token and unit placements — were
     * completely invisible before: nothing on the map showed that lore on one hex moves
     * or alters another.
     */
    renderArcs() {
        if (!this.isActive) return;
        const layer = this._getOrCreateArcLayer();
        layer.innerHTML = '';

        const ref = this._focus || this._hover;
        if (!ref || !ref.hexLabel) return;

        const hex = this.editor.hexes[ref.hexLabel];
        if (!hex?.center) return;

        const target = this.targetsOn(ref.hexLabel)
            .find(t => LoreOverlay.sameRef(t.ref, ref));
        if (!target) return;

        const from = markerPosition(hex, this.editor.hexRadius, target.kind, target.planetIndex);
        if (!from) return;

        for (const link of effectTargets(target.entries, this.editor, ref.hexLabel)) {
            const destination = this.editor.hexes[link.hexLabel];
            if (!destination?.center) continue;
            drawEffectArc(layer, from, destination.center, { kind: link.kind });
        }
    }

    /**
     * Open the lore editor on this hex. Each marker now wires its own click to its own
     * target, so this only matters for callers that have a hex label and nothing finer.
     */
    async _openEditorFor(hexLabel, event) {
        const open = window.openLoreEditor;
        if (typeof open !== 'function') return;

        const hex = this.editor.hexes[hexLabel];
        if (!hex) return;

        const targets = [];
        if (normalizeLoreEntries(hex.systemLore).filter(isNonEmptyLoreEntry).length) {
            targets.push({ ref: { kind: 'system', hexLabel }, label: `${hexLabel} — System` });
        }
        for (const [idx, list] of Object.entries(hex.planetLore || {})) {
            if (!normalizeLoreEntries(list).filter(isNonEmptyLoreEntry).length) continue;
            const i = Number(idx);
            targets.push({
                ref: { kind: 'planet', hexLabel, planetIndex: i },
                label: planetDisplayName(hex.planets?.[i], i)
            });
        }

        if (targets.length === 0) return;
        if (targets.length === 1) { open(targets[0].ref); return; }

        this._hideTooltip();
        const { openListPicker } = await import('../modules/Lore/loreEffectPickers.js');
        const anchor = document.createElement('div');
        anchor.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;` +
            'width:0;height:0;pointer-events:none';
        document.body.appendChild(anchor);
        try {
            const choice = await openListPicker(
                anchor,
                targets.map((t, i) => ({ value: String(i), label: t.label })),
                { title: 'Edit lore on…', searchable: false, width: 220 }
            );
            if (choice != null) open(targets[Number(choice)].ref);
        } finally {
            anchor.remove();
        }
    }

    refresh() {
        // Re-initialize if the SVG was rebuilt (generateMap wipes all children)
        if (this.overlayGroup && !this.overlayGroup.isConnected) {
            this.overlayGroup = null;
        }
        if (this.isActive) {
            this.show();
        } else {
            this._updatePhaseBanner();
        }
    }

    destroy() {
        if (this.overlayGroup) {
            this.overlayGroup.remove();
        }
        this._detachCtrlClickHandler();
        document.getElementById('lore-icon-tooltip')?.remove();
        document.getElementById('lore-clipboard-badge')?.remove();
        document.getElementById('lore-planet-picker')?.remove();
        document.getElementById('lore-phase-banner')?.remove();
        this.isActive = false;
    }

    // ── Phase lore banner ─────────────────────────────────────────

    /** Phase lore isn't hex-bound, so while the overlay is on it shows as a fixed corner
     *  chip like "📜 Phase lore: Str(2) Sta(1)" — clicking opens the Lore popup on that list. */
    _updatePhaseBanner() {
        let banner = document.getElementById('lore-phase-banner');
        const counts = [];
        const phaseLore = this.editor.phaseLore || {};
        for (const phase of LORE_PHASE_TARGETS) {
            const n = normalizeLoreEntries(phaseLore[phase]).filter(isNonEmptyLoreEntry).length;
            if (n) counts.push([phase, n]);
        }

        if (!this.isActive || counts.length === 0) {
            if (banner) banner.style.display = 'none';
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'lore-phase-banner';
            Object.assign(banner.style, {
                position:      'fixed',
                bottom:        '24px',
                left:          '24px',
                padding:       '5px 14px',
                background:    '#1c1c2e',
                color:         '#ccc',
                border:        '1px solid #9b59b6',
                borderRadius:  '20px',
                fontSize:      '12px',
                zIndex:        '8888',
                cursor:        'pointer',
                boxShadow:     '0 2px 10px rgba(0,0,0,0.6)',
                whiteSpace:    'nowrap',
            });
            banner.title = 'Lore attached to game phases (strategy/action/status/agenda). Click to open.';
            document.body.appendChild(banner);
        }
        banner.textContent = '📜 Phase lore: ' + counts.map(([p, n]) => `${PHASE_SHORT[p]}(${n})`).join(' ');
        banner.style.display = 'block';
        banner.onclick = () => {
            const firstPhase = counts[0][0];
            if (typeof window.openLorePopupAtPhase === 'function') window.openLorePopupAtPhase(firstPhase);
            else if (typeof window.showLorePopup === 'function') window.showLorePopup();
        };
    }

    // ── Ctrl+click paste ─────────────────────────────────────────

    _attachCtrlClickHandler() {
        if (this._ctrlClickBound) return;
        this._ctrlClickBound = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (!this._clipboard) return;

            const hexEl = e.target.closest('[data-label]');
            if (!hexEl) return;
            const hexLabel = hexEl.getAttribute('data-label');
            if (!hexLabel) return;

            e.preventDefault();
            e.stopPropagation();

            if (this._clipboard.type === 'planet') {
                const planetCount = this.editor.hexes[hexLabel]?.planets?.length || 0;
                if (planetCount === 0) {
                    this._updateClipboardBadge(`⚠ Hex ${hexLabel} has no planets — nothing pasted`);
                    clearTimeout(this._badgeRevertTimer);
                    this._badgeRevertTimer = setTimeout(() => this._updateClipboardBadge(), 2500);
                } else if (planetCount === 1) {
                    this._pasteLoreToIndex(hexLabel, 0);
                    this._flashBadge(`✓ Pasted to ${hexLabel} planet 1 — Ctrl+click another hex to paste again`);
                } else {
                    this._showPlanetPicker(hexLabel, e.clientX, e.clientY);
                }
            } else {
                this._pasteLore(hexLabel);
                this._flashBadge(`✓ Pasted to ${hexLabel} — Ctrl+click another hex to paste again`);
            }
        };
        this.editor.svg.addEventListener('click', this._ctrlClickBound, true);
    }

    _flashBadge(message) {
        this._updateClipboardBadge(message);
        clearTimeout(this._badgeRevertTimer);
        this._badgeRevertTimer = setTimeout(() => this._updateClipboardBadge(), 2000);
    }

    _showPlanetPicker(hexLabel, clientX, clientY) {
        document.getElementById('lore-planet-picker')?.remove();

        const hex = this.editor.hexes[hexLabel];
        if (!hex) return;

        const picker = document.createElement('div');
        picker.id = 'lore-planet-picker';
        Object.assign(picker.style, {
            position:     'fixed',
            zIndex:       '10000',
            background:   '#1c1c2e',
            border:       '1px solid #9b59b6',
            borderRadius: '6px',
            padding:      '10px',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.7)',
            fontSize:     '13px',
            color:        '#f0f0f0',
            minWidth:     '180px',
        });

        const title = document.createElement('div');
        title.style.cssText = 'font-size:11px;color:#9b59b6;font-weight:bold;margin-bottom:8px';
        title.textContent = `Paste planet lore to ${hexLabel}:`;
        picker.appendChild(title);

        (hex.planets || []).forEach((planet, idx) => {
            const name = planetDisplayName(planet, idx);
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.style.cssText = 'display:block;width:100%;text-align:left;padding:5px 10px;' +
                'margin-bottom:4px;border:1px solid #555;border-radius:4px;' +
                'background:#2c2c3e;color:#ddd;cursor:pointer;font-size:13px';
            btn.addEventListener('mouseenter', () => { btn.style.background = '#3c3c5e'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#2c2c3e'; });
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                picker.remove();
                document.removeEventListener('click', closeOnOutside, true);
                this._pasteLoreToIndex(hexLabel, idx);
                this._flashBadge(`✓ Pasted to ${hexLabel} — ${name} — Ctrl+click another hex to paste again`);
            });
            picker.appendChild(btn);
        });

        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'display:block;width:100%;padding:4px 10px;margin-top:2px;' +
            'border:1px solid #555;border-radius:4px;background:transparent;color:#888;cursor:pointer;font-size:12px';
        cancel.addEventListener('click', (ev) => { ev.stopPropagation(); picker.remove(); document.removeEventListener('click', closeOnOutside, true); });
        picker.appendChild(cancel);

        document.body.appendChild(picker);

        // Position near click, clamped to viewport
        requestAnimationFrame(() => {
            const pad = 8;
            let x = clientX + pad;
            let y = clientY + pad;
            if (x + picker.offsetWidth  > window.innerWidth)  x = clientX - picker.offsetWidth  - pad;
            if (y + picker.offsetHeight > window.innerHeight) y = clientY - picker.offsetHeight - pad;
            picker.style.left = x + 'px';
            picker.style.top  = y + 'px';
        });

        // Dismiss on outside click or Escape
        const closeOnOutside = (ev) => {
            if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', closeOnOutside, true); }
        };
        setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);

        const closeOnEsc = (ev) => {
            if (ev.key === 'Escape') { picker.remove(); document.removeEventListener('keydown', closeOnEsc); }
        };
        document.addEventListener('keydown', closeOnEsc);
    }

    _pasteLoreToIndex(targetLabel, targetPlanetIdx) {
        if (!this._clipboard) return;
        const hex = this.editor.hexes[targetLabel];
        if (!hex) return;

        const loreData = { ...this._clipboard.data };
        loreData.footerText = retargetFooterReferences(loreData.footerText, hex, targetPlanetIdx);

        this.editor.saveState(targetLabel);
        // Append, like _pasteLore — a planet slot holds a LIST of entries, and the tooltip
        // tells the user pasting appends. Assigning here wiped every entry already there.
        if (!hex.planetLore || Array.isArray(hex.planetLore)) hex.planetLore = {};
        hex.planetLore[targetPlanetIdx] = normalizeLoreEntries(hex.planetLore[targetPlanetIdx]);
        hex.planetLore[targetPlanetIdx].push(loreData);

        this.refresh();

        const tip = document.getElementById('lore-icon-tooltip');
        if (tip && tip.style.display !== 'none') {
            tip.innerHTML = '';
            this._buildTooltipContent(tip, targetLabel);
        }
    }

    _detachCtrlClickHandler() {
        if (!this._ctrlClickBound) return;
        this.editor.svg.removeEventListener('click', this._ctrlClickBound, true);
        this._ctrlClickBound = null;
    }

    // ── Clipboard badge ───────────────────────────────────────────

    _updateClipboardBadge(overrideText) {
        let badge = document.getElementById('lore-clipboard-badge');
        if (!this._clipboard || !this.isActive) {
            if (badge) badge.style.display = 'none';
            return;
        }
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'lore-clipboard-badge';
            Object.assign(badge.style, {
                position:      'fixed',
                bottom:        '24px',
                left:          '50%',
                transform:     'translateX(-50%)',
                padding:       '5px 16px',
                background:    '#1c1c2e',
                color:         '#ccc',
                border:        '1px solid #9b59b6',
                borderRadius:  '20px',
                fontSize:      '12px',
                zIndex:        '8888',
                pointerEvents: 'none',
                boxShadow:     '0 2px 10px rgba(0,0,0,0.6)',
                whiteSpace:    'nowrap',
            });
            document.body.appendChild(badge);
        }
        const typeLabel = this._clipboard.type === 'system' ? 'System Lore' : 'Planet Lore';
        badge.textContent = overrideText ||
            `📋 Clipboard: ${typeLabel} from ${this._clipboard.sourceLabel} — Ctrl+click any hex to paste`;
        badge.style.display = 'block';
    }
}

export default LoreOverlay;
