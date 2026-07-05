// loreOverlay.js - Visual indicators for systems and planets with lore
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { getDisplayFooter, getEffectLines, isChoiceGated, isRollGated, getGate } from '../modules/Lore/loreEffects.js';
import { normalizeLoreEntries, isNonEmptyLoreEntry, formatRoundWindow, LORE_PHASE_TARGETS } from '../modules/Lore/loreCore.js';

const PHASE_SHORT = { strategy: 'Str', action: 'Act', status: 'Sta', agenda: 'Agn' };

class LoreOverlay {
    constructor(editor) {
        this.editor = editor;
        this.isActive = false;
        this.overlayGroup = null;
        this._hideTimer = null;
        this._clipboard = null;        // { type, data, sourceLabel, planetIndex }
        this._ctrlClickBound = null;   // bound Ctrl+click handler reference
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
                const planetName = planet?.name || planet?.planetID || `Planet ${planetIdx + 1}`;

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

        // Update tile_name references in footerText for the target hex
        if (loreData.footerText?.includes('tile_name:')) {
            loreData.footerText = loreData.footerText.replace(/tile_name:\w+/g, `tile_name:${hex.label}`);

            if (this._clipboard.type === 'planet' && this._clipboard.planetIndex !== null) {
                const planet = hex.planets?.[this._clipboard.planetIndex];
                if (planet) {
                    const pName = (planet.name || planet.planetID || planet.id || '').replace(/\s+/g, '');
                    if (pName) loreData.footerText = loreData.footerText.replace(/planet:\w+/g, `planet:${pName}`);
                }
            }
        }

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

        // Clear existing indicators
        this.overlayGroup.innerHTML = '';

        Object.keys(this.editor.hexes).forEach(hexLabel => {
            const hex = this.editor.hexes[hexLabel];
            if (!hex || !hex.center) return;

            const loreData = this.getLoreData(hexLabel);
            if (loreData.hasSystemLore || loreData.hasPlanetLore) {
                this.createLoreIndicator(hex, loreData, hexLabel);
            }
        });
    }

    getLoreData(hexLabel) {
        const result = {
            hasSystemLore: false,
            hasPlanetLore: false,
            planetCount: 0,     // planets holding lore
            entryCount: 0,      // total entries on the hex
            hasGate: false,     // any entry choice/roll-gated
            hasRounds: false    // any entry round-restricted
        };

        const hex = this.editor.hexes[hexLabel];
        if (!hex) return result;

        const tally = (list) => {
            for (const entry of list) {
                result.entryCount++;
                if (isChoiceGated(entry.footerText) || isRollGated(entry.footerText)) result.hasGate = true;
                if (entry.fromRound > 0 || entry.tillRound > 0) result.hasRounds = true;
            }
        };

        const systemEntries = normalizeLoreEntries(hex.systemLore).filter(isNonEmptyLoreEntry);
        if (systemEntries.length) {
            result.hasSystemLore = true;
            tally(systemEntries);
        }

        if (hex.planetLore) {
            Object.keys(hex.planetLore).forEach(planetIndex => {
                const entries = normalizeLoreEntries(hex.planetLore[planetIndex]).filter(isNonEmptyLoreEntry);
                if (entries.length) {
                    result.hasPlanetLore = true;
                    result.planetCount++;
                    tally(entries);
                }
            });
        }

        return result;
    }

    hasNonEmptyLore(loreObj) {
        // Any historical shape: single entry object or a list of entries
        return normalizeLoreEntries(loreObj).some(isNonEmptyLoreEntry);
    }

    createLoreIndicator(hex, loreData, hexLabel) {
        const x = hex.center.x;
        const y = hex.center.y;
        const hexRadius = this.editor.hexRadius;

        const hexGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hexGroup.setAttribute('class', 'lore-hex-indicator');
        hexGroup.style.pointerEvents = 'all';
        hexGroup.style.cursor = 'help';
        this.overlayGroup.appendChild(hexGroup);

        const iconY = y - hexRadius * 0.3;
        if (loreData.hasSystemLore && loreData.hasPlanetLore) {
            this.createStarIcon(hexGroup, x, iconY, '#9C27B0', `System & Planet Lore (${loreData.planetCount} planets, ${loreData.entryCount} entries)`);
        } else if (loreData.hasSystemLore) {
            this.createBookIcon(hexGroup, x, iconY, '#4CAF50', `System Lore (${loreData.entryCount} entries)`);
        } else if (loreData.hasPlanetLore) {
            this.createScrollIcon(hexGroup, x, iconY, '#FF9800', `Planet Lore (${loreData.planetCount} planets, ${loreData.entryCount} entries)`);
        }

        // Entry-count badge when a hex holds more than one entry
        if (loreData.entryCount > 1) {
            this.createCountBadge(hexGroup, x + 14, iconY - 9, loreData.entryCount);
        }
        // Tiny markers: 🎲 = a gated entry, ⏱ = a round-restricted entry
        const markers = (loreData.hasGate ? '🎲' : '') + (loreData.hasRounds ? '⏱' : '');
        if (markers) {
            const markerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            markerText.setAttribute('x', x - 14);
            markerText.setAttribute('y', iconY - 8);
            markerText.setAttribute('text-anchor', 'end');
            markerText.setAttribute('font-size', '11');
            markerText.textContent = markers;
            hexGroup.appendChild(markerText);
        }

        hexGroup.addEventListener('mouseenter', (e) => this._showTooltip(hexLabel, e));
        hexGroup.addEventListener('mousemove',  (e) => this._positionTooltip(e));
        hexGroup.addEventListener('mouseleave', ()  => this._scheduleHideTooltip());
    }

    createCountBadge(group, x, y, count) {
        const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeGroup.setAttribute('transform', `translate(${x}, ${y})`);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '8');
        circle.setAttribute('fill', '#1c1c2e');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1.5');
        badgeGroup.appendChild(circle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#fff');
        text.textContent = `×${count}`;
        badgeGroup.appendChild(text);
        group.appendChild(badgeGroup);
    }

    createBookIcon(group, x, y, color, title) {
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        const bookCover = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bookCover.setAttribute('x', '-12');
        bookCover.setAttribute('y', '-9');
        bookCover.setAttribute('width', '24');
        bookCover.setAttribute('height', '18');
        bookCover.setAttribute('fill', color);
        bookCover.setAttribute('stroke', '#fff');
        bookCover.setAttribute('stroke-width', '2');
        bookCover.setAttribute('rx', '3');
        iconGroup.appendChild(bookCover);

        const bookSpine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        bookSpine.setAttribute('x1', '-6');
        bookSpine.setAttribute('y1', '-9');
        bookSpine.setAttribute('x2', '-6');
        bookSpine.setAttribute('y2', '9');
        bookSpine.setAttribute('stroke', '#fff');
        bookSpine.setAttribute('stroke-width', '2');
        iconGroup.appendChild(bookSpine);

        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createScrollIcon(group, x, y, color, title) {
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        const scrollBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        scrollBg.setAttribute('x', '-12');
        scrollBg.setAttribute('y', '-9');
        scrollBg.setAttribute('width', '24');
        scrollBg.setAttribute('height', '18');
        scrollBg.setAttribute('fill', color);
        scrollBg.setAttribute('stroke', '#fff');
        scrollBg.setAttribute('stroke-width', '2');
        scrollBg.setAttribute('rx', '3');
        iconGroup.appendChild(scrollBg);

        [-4, 0, 4].forEach(offset => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '-9');
            line.setAttribute('y1', offset);
            line.setAttribute('x2', '9');
            line.setAttribute('y2', offset);
            line.setAttribute('stroke', '#fff');
            line.setAttribute('stroke-width', '2');
            iconGroup.appendChild(line);
        });

        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createStarIcon(group, x, y, color, title) {
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        const starPath = this.createStarPath(10);
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        star.setAttribute('d', starPath);
        star.setAttribute('fill', color);
        star.setAttribute('stroke', '#fff');
        star.setAttribute('stroke-width', '2');
        iconGroup.appendChild(star);

        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createStarPath(radius) {
        const points = [];
        const numPoints = 5;
        const innerRadius = radius * 0.4;

        for (let i = 0; i < numPoints * 2; i++) {
            const r = (i % 2 === 0) ? radius : innerRadius;
            const angle = (i * Math.PI) / numPoints - Math.PI / 2;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            points.push(`${x},${y}`);
        }

        return `M${points.join('L')}Z`;
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
            const name = planet?.name || planet?.planetID || `Planet ${idx + 1}`;
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

        if (loreData.footerText?.includes('tile_name:')) {
            loreData.footerText = loreData.footerText.replace(/tile_name:\w+/g, `tile_name:${hex.label}`);
            const planet = hex.planets?.[targetPlanetIdx];
            if (planet) {
                const pName = (planet.name || planet.planetID || planet.id || '').replace(/\s+/g, '');
                if (pName) loreData.footerText = loreData.footerText.replace(/planet:\w+/g, `planet:${pName}`);
            }
        }

        this.editor.saveState(targetLabel);
        if (!hex.planetLore) hex.planetLore = {};
        hex.planetLore[targetPlanetIdx] = loreData;

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
