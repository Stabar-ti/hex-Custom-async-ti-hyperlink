/**
 * Lore Module - Small floating "smart" pickers for the effects builder in loreUI.js.
 * Each picker is a positioned popup anchored to the button that opened it; it closes
 * itself as soon as a choice is made (or on outside click / Escape), and resolves a
 * Promise so callers can stay simple: `const value = await openXyzPicker(...)`.
 */

import { hasLinks } from '../../utils/matrix.js';

let activePicker = null;
let activeResolve = null;

/** Closes the open picker. If it's still awaiting a choice (dismissed via outside-click/Escape
 *  rather than an explicit selection), resolves its Promise with null so callers don't hang. */
function closeActivePicker() {
    if (activePicker) {
        activePicker.remove();
        activePicker = null;
    }
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onEscape, true);
    if (activeResolve) {
        const resolveFn = activeResolve;
        activeResolve = null;
        resolveFn(null);
    }
}

function onOutsideClick(e) {
    if (activePicker && !activePicker.contains(e.target)) closeActivePicker();
}

function onEscape(e) {
    if (e.key === 'Escape') closeActivePicker();
}

/** Creates and positions an empty picker panel under/near anchorEl, replacing any open picker. */
function createPanel(anchorEl, { width = 220 } = {}) {
    closeActivePicker();

    const panel = document.createElement('div');
    panel.className = 'lore-mini-picker';
    panel.style.cssText = `position:fixed;z-index:10050;width:${width}px;max-height:70vh;overflow-y:auto;` +
        'background:#2c3e50;border:1px solid #666;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.5);' +
        'padding:8px;color:#fff;font-size:0.85em';

    const anchorRect = anchorEl.getBoundingClientRect();
    panel.style.top = `${anchorRect.bottom + 4}px`;
    panel.style.left = `${anchorRect.left}px`;

    document.body.appendChild(panel);

    activePicker = panel;
    setTimeout(() => {
        // Reposition now that the caller has finished filling the panel with content,
        // so clamping uses the panel's real (post-render) size rather than an empty box.
        const rect = anchorEl.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.left;
        const panelRect = panel.getBoundingClientRect();
        if (left + panelRect.width > window.innerWidth - 8) left = window.innerWidth - panelRect.width - 8;
        if (top + panelRect.height > window.innerHeight - 8) top = rect.top - panelRect.height - 4;
        left = Math.min(left, window.innerWidth - panelRect.width - 8);
        top = Math.min(top, window.innerHeight - panelRect.height - 8);
        panel.style.left = `${Math.max(8, left)}px`;
        panel.style.top = `${Math.max(8, top)}px`;

        document.addEventListener('mousedown', onOutsideClick, true);
        document.addEventListener('keydown', onEscape, true);
    }, 0);

    return panel;
}

function styledButton(text, { bg = '#3498db', flex = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.cssText = `padding:4px 8px;font-size:0.9em;border:1px solid #666;border-radius:3px;` +
        `background:${bg};color:#fff;cursor:pointer;${flex ? 'flex:1;' : ''}`;
    return btn;
}

/**
 * Shows a row of number buttons from min to max (skipping 0 when the range straddles
 * zero, since a zero-change effect is a no-op) and resolves with the chosen value.
 * Signed verbs (min<0) render with explicit "+"/"-"; positive-only verbs render plain.
 */
export function openNumberPicker(anchorEl, { min, max }) {
    return new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 200 });
        activeResolve = resolve;

        const title = document.createElement('div');
        title.textContent = 'Choose amount:';
        title.style.cssText = 'font-size:0.85em;color:#aaa;margin-bottom:6px';
        panel.appendChild(title);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
        for (let n = min; n <= max; n++) {
            if (n === 0 && min < 0 && max > 0) continue;
            const label = min < 0 ? (n > 0 ? `+${n}` : `${n}`) : `${n}`;
            const btn = styledButton(label, { bg: n < 0 ? '#e74c3c' : '#27ae60' });
            btn.onclick = () => { activeResolve = null; closeActivePicker(); resolve(n); };
            row.appendChild(btn);
        }
        panel.appendChild(row);
    });
}

/**
 * Shows a searchable list of {value, label, icon?} items; clicking one resolves immediately.
 * `icon`, if present, is an image src shown at 20x20 to the left of the label.
 */
export function openListPicker(anchorEl, items, { title = null, searchable = true, width = 240 } = {}) {
    return new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width });
        activeResolve = resolve;

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            titleEl.style.cssText = 'font-size:0.85em;color:#aaa;margin-bottom:6px';
            panel.appendChild(titleEl);
        }

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:40vh;overflow-y:auto';

        function renderList(filter) {
            listDiv.innerHTML = '';
            const lower = filter.trim().toLowerCase();
            const filtered = lower
                ? items.filter(it => it.label.toLowerCase().includes(lower) || it.value.toLowerCase().includes(lower))
                : items;
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = 'No matches';
                empty.style.cssText = 'color:#888;font-style:italic;padding:4px';
                listDiv.appendChild(empty);
                return;
            }
            filtered.slice(0, 200).forEach(it => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.style.cssText = 'display:flex;align-items:center;gap:6px;text-align:left;padding:4px 6px;' +
                    'border:none;border-radius:3px;background:transparent;color:#ddd;cursor:pointer;font-size:0.9em';
                if (it.icon) {
                    const img = document.createElement('img');
                    img.src = it.icon;
                    img.alt = '';
                    img.style.cssText = 'width:20px;height:20px;object-fit:contain;flex:0 0 auto';
                    img.onerror = () => { img.style.display = 'none'; };
                    btn.appendChild(img);
                }
                const labelSpan = document.createElement('span');
                labelSpan.textContent = it.label;
                btn.appendChild(labelSpan);
                btn.onmouseover = () => btn.style.backgroundColor = '#34495e';
                btn.onmouseout = () => btn.style.backgroundColor = 'transparent';
                btn.onclick = () => { activeResolve = null; closeActivePicker(); resolve(it.value); };
                listDiv.appendChild(btn);
            });
        }

        if (searchable) {
            const search = document.createElement('input');
            search.type = 'text';
            search.placeholder = 'Filter…';
            search.style.cssText = 'width:100%;margin-bottom:6px;padding:4px 6px;border:1px solid #666;' +
                'border-radius:4px;background:#1c2733;color:#fff;box-sizing:border-box';
            search.oninput = () => renderList(search.value);
            panel.appendChild(search);
            setTimeout(() => search.focus(), 0);
        }

        panel.appendChild(listDiv);
        renderList('');
    });
}

const UNIT_TYPES = [
    { id: 'infantry', label: 'Infantry' },
    { id: 'fighter', label: 'Fighter' },
    { id: 'destroyer', label: 'Destroyer' },
    { id: 'cruiser', label: 'Cruiser' },
    { id: 'carrier', label: 'Carrier' },
    { id: 'dreadnought', label: 'Dreadnought' },
    { id: 'warsun', label: 'War Sun' },
    { id: 'flagship', label: 'Flagship' },
    { id: 'mech', label: 'Mech' },
    { id: 'spacedock', label: 'Space Dock', planetOnly: true },
    { id: 'pds', label: 'PDS', planetOnly: true }
];

const FALLBACK_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white'];

/** Player colors from the synced loreData bundle, falling back to the classic nine. */
function getPlayerColors(editor) {
    const synced = (editor || window.loreManager?.editor)?.loreData?.colors;
    if (synced?.length) return synced.map(c => ({ id: c.name, label: c.display || c.name }));
    return FALLBACK_COLORS.map(c => ({ id: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
}

function getUnitOwners(editor) {
    return [
        { id: '', label: 'Current player' },
        { id: 'neutral', label: 'Neutral' },
        ...getPlayerColors(editor)
    ];
}

/**
 * Composite popup for "unit"/"removeunit": owner, count, unit type, and an optional
 * planet override (needed for spacedock/pds, useful to disambiguate other systems too).
 * Resolves the assembled operand string, e.g. "red 2 infantry" or "2 pds mecatolrex".
 */
export function openUnitPicker(anchorEl, mode = 'add') {
    return new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 260 });
        activeResolve = resolve;
        let selectedUnit = null;

        const title = document.createElement('div');
        title.textContent = mode === 'remove' ? 'Remove units' : 'Add units';
        title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#9b59b6;margin-bottom:6px';
        panel.appendChild(title);

        const ownerRow = document.createElement('div');
        ownerRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
        const ownerLabel = document.createElement('span');
        ownerLabel.textContent = 'Owner:';
        ownerLabel.style.cssText = 'font-size:0.85em;color:#aaa';
        const ownerSelect = document.createElement('select');
        ownerSelect.style.cssText = 'flex:1;padding:3px;border:1px solid #666;border-radius:4px;' +
            'background:#1c2733;color:#fff';
        getUnitOwners().forEach(({ id, label }) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;
            ownerSelect.appendChild(opt);
        });
        ownerRow.appendChild(ownerLabel);
        ownerRow.appendChild(ownerSelect);
        panel.appendChild(ownerRow);

        const countRow = document.createElement('div');
        countRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
        const countLabel = document.createElement('span');
        countLabel.textContent = 'Count:';
        countLabel.style.cssText = 'font-size:0.85em;color:#aaa';
        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '1';
        countInput.max = '20';
        countInput.value = '1';
        countInput.style.cssText = 'width:60px;padding:3px;border:1px solid #666;border-radius:4px;' +
            'background:#1c2733;color:#fff';
        countRow.appendChild(countLabel);
        countRow.appendChild(countInput);
        panel.appendChild(countRow);

        const unitGrid = document.createElement('div');
        unitGrid.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px';
        const unitButtons = [];
        UNIT_TYPES.forEach((unit) => {
            const btn = styledButton(unit.label, { bg: '#34495e' });
            btn.style.fontSize = '0.8em';
            btn.onclick = () => {
                selectedUnit = unit;
                unitButtons.forEach(b => b.style.outline = 'none');
                btn.style.outline = '2px solid #f39c12';
                planetInput.placeholder = unit.planetOnly
                    ? 'Planet (required for this unit)'
                    : 'Planet (optional)';
            };
            unitButtons.push(btn);
            unitGrid.appendChild(btn);
        });
        panel.appendChild(unitGrid);

        const planetInput = document.createElement('input');
        planetInput.type = 'text';
        planetInput.placeholder = 'Planet (optional)';
        planetInput.style.cssText = 'width:100%;margin-bottom:6px;padding:4px 6px;border:1px solid #666;' +
            'border-radius:4px;background:#1c2733;color:#fff;box-sizing:border-box';
        panel.appendChild(planetInput);

        const warning = document.createElement('div');
        warning.style.cssText = 'display:none;color:#e74c3c;font-size:0.8em;margin-bottom:6px';
        panel.appendChild(warning);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px';
        const insertBtn = styledButton('Insert', { bg: '#27ae60', flex: true });
        const cancelBtn = styledButton('Cancel', { bg: '#555', flex: true });
        insertBtn.onclick = () => {
            if (!selectedUnit) {
                warning.textContent = 'Pick a unit type first.';
                warning.style.display = 'block';
                return;
            }
            const planet = planetInput.value.trim().replace(/\s+/g, '');
            if (selectedUnit.planetOnly && !planet) {
                warning.textContent = `${selectedUnit.label} needs a planet — type one above.`;
                warning.style.display = 'block';
                return;
            }
            const count = Math.max(1, parseInt(countInput.value, 10) || 1);
            const parts = [];
            if (ownerSelect.value) parts.push(ownerSelect.value);
            parts.push(String(count), selectedUnit.id);
            if (planet) parts.push(planet);
            activeResolve = null;
            closeActivePicker();
            resolve(parts.join(' '));
        };
        cancelBtn.onclick = () => { activeResolve = null; closeActivePicker(); resolve(null); };
        btnRow.appendChild(insertBtn);
        btnRow.appendChild(cancelBtn);
        panel.appendChild(btnRow);
    });
}

/**
 * Searchable picker over the app's real token list (window.tokenManager), so GMs pick
 * the same token IDs already used by the map's token module instead of typing them.
 * @param {'space'|'planet'} scope - system lore can only sensibly drop space tokens
 *   (anomalies, wormholes, frontier, etc.); planet lore can only drop planet
 *   tokens/attachments — matches what the bot's `!token`/`!removetoken` effects do
 *   with whichever holder the lore (or its @target) resolves to.
 */
export async function openTokenPicker(anchorEl, scope = 'space') {
    const tm = window.tokenManager;
    if (tm && !tm.initialized && typeof tm.initialize === 'function') {
        await tm.initialize();
    }

    const categorized = tm?.getCategorizedTokens?.();
    if (!categorized) {
        const id = prompt('Token module not loaded — type a token id (e.g. "gravityrift"):');
        return id ? id.trim() : null;
    }

    const seen = new Set();
    const items = [];
    Object.values(categorized).forEach(cat => {
        cat.tokens.forEach(t => {
            if (seen.has(t.id)) return;
            if (t.spaceOrPlanet !== scope) return;
            seen.add(t.id);
            const icon = t.imagePath
                ? (t.isAttachment ? `./public/attachment_token/${t.imagePath}` : `./public/tokens/${t.imagePath}`)
                : null;
            items.push({ value: t.id, label: t.id, icon });
        });
    });
    items.sort((a, b) => a.label.localeCompare(b.label));

    const title = scope === 'planet' ? 'Choose a planet token/attachment' : 'Choose a space token';
    return openListPicker(anchorEl, items, { title, width: 240 });
}

/**
 * Searchable picker over every hex label and every planet identifier on the current map,
 * for the "@target" reference that redirects an effect at a specific system or planet.
 */
export function getTargetItems(editor) {
    const items = [];
    for (const [label, hex] of Object.entries(editor.hexes || {})) {
        items.push({ value: label, label: `${label} (system)` });
        (hex.planets || []).forEach((planet) => {
            const id = planet && (planet.planetID || planet.id || planet.name);
            if (id) items.push({ value: id, label: `${planet.name || id} — ${label}` });
        });
    }
    return items;
}

export function openTargetPicker(anchorEl, editor) {
    const items = [{ value: '', label: '(no target — use the lore\'s own system/planet)' }, ...getTargetItems(editor)];
    return openListPicker(anchorEl, items, { title: 'Redirect effect to…', width: 260 });
}

/** Searchable player-color picker (from loreData.colors). Resolves the color name or null. */
export function openColorPicker(anchorEl, editor, { title = 'Choose a color', allowNeutral = true, allowCurrent = false } = {}) {
    const items = [];
    if (allowCurrent) items.push({ value: '', label: '(current player)' });
    if (allowNeutral) items.push({ value: 'neutral', label: 'Neutral' });
    items.push(...getPlayerColors(editor).map(c => ({ value: c.id, label: c.label })));
    return openListPicker(anchorEl, items, { title, width: 220 });
}

/** Searchable faction picker (from loreData.factions). Resolves the faction id or null. */
export function openFactionPicker(anchorEl, editor, { title = 'Choose a faction' } = {}) {
    const factions = (editor || window.loreManager?.editor)?.loreData?.factions;
    if (!factions?.length) {
        const id = prompt('Faction data not loaded — type a faction id (e.g. "winnu"):');
        return Promise.resolve(id ? id.trim().toLowerCase() : null);
    }
    const items = factions.map(f => ({
        value: f.id,
        label: f.source && f.source !== 'base' && f.source !== 'pok' ? `${f.name} (${f.source})` : f.name
    }));
    return openListPicker(anchorEl, items, { title, width: 280 });
}

const TECH_TYPE_FILTERS = [
    { id: '', label: 'Any type' },
    { id: 'blue', label: 'Blue (Propulsion)', type: 'PROPULSION' },
    { id: 'green', label: 'Green (Biotic)', type: 'BIOTIC' },
    { id: 'yellow', label: 'Yellow (Cybernetic)', type: 'CYBERNETIC' },
    { id: 'red', label: 'Red (Warfare)', type: 'WARFARE' },
    { id: 'unit', label: 'Unit upgrade', type: 'UNITUPGRADE' }
];

/**
 * Composite picker for the "tech" effect's three modes:
 * a specific tech id ("gd"), "random <type>", or "choose <type>" (player picks their own).
 * Resolves the operand string or null.
 */
export function openTechPicker(anchorEl, editor, { mode = 'grant' } = {}) {
    const loreData = (editor || window.loreManager?.editor)?.loreData;
    if (!loreData?.techs?.length) {
        const id = prompt('Tech data not loaded — type a tech id (e.g. "gd"):');
        return Promise.resolve(id ? id.trim() : null);
    }

    return new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 300 });
        activeResolve = resolve;
        const done = (value) => { activeResolve = null; closeActivePicker(); resolve(value); };

        const title = document.createElement('div');
        title.textContent = mode === 'remove' ? 'Remove a researched tech' : 'Grant technology';
        title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#9b59b6;margin-bottom:6px';
        panel.appendChild(title);

        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = 'width:100%;margin-bottom:6px;padding:3px;border:1px solid #666;' +
            'border-radius:4px;background:#1c2733;color:#fff';
        TECH_TYPE_FILTERS.forEach(({ id, label }) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;
            typeSelect.appendChild(opt);
        });
        panel.appendChild(typeSelect);

        // random / choose shortcuts (grant mode only — removetech always names a tech)
        if (mode !== 'remove') {
            const modeRow = document.createElement('div');
            modeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
            const randomBtn = styledButton('Random draw', { bg: '#8e44ad', flex: true });
            randomBtn.title = 'Draw a random unowned tech of the selected type from the deck';
            randomBtn.onclick = () => done(('random ' + typeSelect.value).trim());
            const chooseBtn = styledButton("Player's choice", { bg: '#2980b9', flex: true });
            chooseBtn.title = 'Send the receiving player buttons to pick their own tech (free, no prerequisites)';
            chooseBtn.onclick = () => done(('choose ' + typeSelect.value).trim());
            modeRow.appendChild(randomBtn);
            modeRow.appendChild(chooseBtn);
            panel.appendChild(modeRow);

            const orLabel = document.createElement('div');
            orLabel.textContent = '…or pick a specific tech:';
            orLabel.style.cssText = 'font-size:0.8em;color:#aaa;margin-bottom:4px';
            panel.appendChild(orLabel);
        }

        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Filter techs…';
        search.style.cssText = 'width:100%;margin-bottom:6px;padding:4px 6px;border:1px solid #666;' +
            'border-radius:4px;background:#1c2733;color:#fff;box-sizing:border-box';
        panel.appendChild(search);

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:35vh;overflow-y:auto';
        panel.appendChild(listDiv);

        function renderTechs() {
            listDiv.innerHTML = '';
            const lower = search.value.trim().toLowerCase();
            const typeFilter = TECH_TYPE_FILTERS.find(t => t.id === typeSelect.value)?.type;
            const filtered = loreData.techs.filter(t =>
                (!typeFilter || (t.types || []).includes(typeFilter)) &&
                (!lower || t.name.toLowerCase().includes(lower) || t.id.toLowerCase().includes(lower)));
            filtered.slice(0, 200).forEach(t => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.style.cssText = 'text-align:left;padding:3px 6px;border:none;border-radius:3px;' +
                    'background:transparent;color:#ddd;cursor:pointer;font-size:0.85em';
                const src = t.source && t.source !== 'base' && t.source !== 'pok' ? ` · ${t.source}` : '';
                btn.textContent = `${t.name} (${t.id}${src})`;
                btn.onmouseover = () => btn.style.backgroundColor = '#34495e';
                btn.onmouseout = () => btn.style.backgroundColor = 'transparent';
                btn.onclick = () => done(t.id);
                listDiv.appendChild(btn);
            });
            if (!filtered.length) {
                const empty = document.createElement('div');
                empty.textContent = 'No matches';
                empty.style.cssText = 'color:#888;font-style:italic;padding:4px';
                listDiv.appendChild(empty);
            }
        }
        search.oninput = renderTechs;
        typeSelect.onchange = renderTechs;
        setTimeout(() => search.focus(), 0);
        renderTechs();
    });
}

/** Searchable tile picker over SystemInfo. Resolves a tile id or null. */
export function openTilePicker(anchorEl, editor, { title = 'Choose a tile' } = {}) {
    const systems = (editor || window.loreManager?.editor)?.allSystems;
    if (!systems?.length) {
        const id = prompt('System data not loaded — type a tile id (e.g. "41"):');
        return Promise.resolve(id ? id.trim() : null);
    }
    const items = systems
        .filter(s => s.id != null && s.id !== '')
        .map(s => ({ value: String(s.id), label: `${s.id} — ${s.name || '(unnamed)'}` }));
    return openListPicker(anchorEl, items, { title, width: 280 });
}

const SETTILE_FILTER_OPTIONS = ['blue', 'red', 'wormhole', 'anomaly', 'empty'];

/**
 * Composite picker for "settile": position, then a specific tile or a random draw with
 * optional filters. Resolves the full operand string, e.g. "305 41" or "305 random red wormhole".
 */
export async function openSetTilePicker(anchorEl, editor) {
    const positions = Object.keys(editor.hexes || {}).sort().map(label => ({ value: label, label }));
    const position = await openListPicker(anchorEl, positions, { title: 'Set tile — at position…', width: 200 });
    if (!position) return null;

    const choice = await new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 240 });
        activeResolve = resolve;
        const done = (value) => { activeResolve = null; closeActivePicker(); resolve(value); };

        const title = document.createElement('div');
        title.textContent = `Tile for ${position}:`;
        title.style.cssText = 'font-size:0.85em;color:#aaa;margin-bottom:6px';
        panel.appendChild(title);

        const specificBtn = styledButton('Pick a specific tile…', { bg: '#3498db' });
        specificBtn.style.width = '100%';
        specificBtn.style.marginBottom = '8px';
        specificBtn.onclick = () => done({ mode: 'specific' });
        panel.appendChild(specificBtn);

        const randLabel = document.createElement('div');
        randLabel.textContent = 'Or draw random with filters:';
        randLabel.style.cssText = 'font-size:0.8em;color:#aaa;margin-bottom:4px';
        panel.appendChild(randLabel);

        const checks = [];
        SETTILE_FILTER_OPTIONS.forEach(f => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85em;color:#ddd;cursor:pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = f;
            checks.push(cb);
            row.appendChild(cb);
            row.appendChild(document.createTextNode(f));
            panel.appendChild(row);
        });

        const randomBtn = styledButton('Insert random draw', { bg: '#8e44ad' });
        randomBtn.style.cssText += 'width:100%;margin-top:8px';
        randomBtn.onclick = () => done({ mode: 'random', filters: checks.filter(c => c.checked).map(c => c.value) });
        panel.appendChild(randomBtn);
    });
    if (!choice) return null;

    if (choice.mode === 'random') {
        return [position, 'random', ...choice.filters].join(' ');
    }
    const tileId = await openTilePicker(anchorEl, editor, { title: `Tile for ${position}…` });
    return tileId ? `${position} ${tileId}` : null;
}

/** Position + step count for "rotatehyperlane". Resolves e.g. "305 2" or null. */
export async function openRotateHyperlanePicker(anchorEl, editor) {
    const positions = Object.keys(editor.hexes || {}).sort().map(label => ({ value: label, label }));
    const position = await openListPicker(anchorEl, positions, { title: 'Rotate hyperlane at…', width: 200 });
    if (!position) return null;
    const steps = await openNumberPicker(anchorEl, { min: -5, max: 5 });
    if (steps === null) return null;
    return `${position} ${steps}`;
}

/**
 * Position + encoded matrix for "sethyperlane". The bot's effect only accepts a 9-hex-char
 * packed form or the plain 36-character 0/1 string — never the readable semicolon/comma matrix
 * its own GM modal uses. We use the 36-char binary form here (never hex): it's exactly this
 * builder's own `hex.matrix.flat()` representation, so it can be copied straight off an existing
 * hex on the map instead of asking a GM to hand-type an opaque hex string. Resolves
 * e.g. "305 000100000000000000100000000000000000" or null.
 */
export async function openSetHyperlanePicker(anchorEl, editor) {
    const positions = Object.keys(editor.hexes || {}).sort().map(label => ({ value: label, label }));
    const position = await openListPicker(anchorEl, positions, { title: 'Set hyperlane at…', width: 200 });
    if (!position) return null;

    const choice = await new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 260 });
        activeResolve = resolve;
        const done = (value) => { activeResolve = null; closeActivePicker(); resolve(value); };

        const title = document.createElement('div');
        title.textContent = `Hyperlane pattern for ${position}:`;
        title.style.cssText = 'font-size:0.85em;color:#aaa;margin-bottom:6px';
        panel.appendChild(title);

        const copyBtn = styledButton("Copy from a hex's hyperlane…", { bg: '#3498db' });
        copyBtn.style.cssText += 'width:100%;margin-bottom:8px';
        copyBtn.onclick = () => done('copy');
        panel.appendChild(copyBtn);

        const manualBtn = styledButton('Type the 36-char 0/1 string…', { bg: '#8e44ad' });
        manualBtn.style.cssText += 'width:100%';
        manualBtn.onclick = () => done('manual');
        panel.appendChild(manualBtn);
    });
    if (!choice) return null;

    let binary;
    if (choice === 'copy') {
        const sourceItems = Object.entries(editor.hexes || {})
            .filter(([, hex]) => hasLinks(hex.matrix))
            .map(([label]) => ({ value: label, label }));
        if (!sourceItems.length) {
            alert('No hex on the map currently has a custom hyperlane drawn — draw one first, or type the pattern manually.');
            return null;
        }
        const source = await openListPicker(anchorEl, sourceItems, { title: 'Copy hyperlane pattern from…', width: 200 });
        if (!source) return null;
        binary = editor.hexes[source].matrix.flat().join('');
    } else {
        const typed = prompt("Hyperlane pattern as a plain 36-character string of 0s and 1s (matches the map's own hyperlane matrix, row by row):");
        if (!typed) return null;
        binary = typed.trim();
        if (!/^[01]{36}$/.test(binary)) {
            alert('That needs to be exactly 36 characters of 0/1 (six rows of six), not the hex-encoded form.');
            return null;
        }
    }
    return `${position} ${binary}`;
}

/**
 * Tile id + optional label for the FoW-only "addfogtile" — this plants what the
 * RECEIVING PLAYER believes sits at this (still-fogged) position on their own view.
 * It never touches the real board or any other player. Resolves e.g. "41 Decoy" or null.
 */
export async function openFogTilePicker(anchorEl, editor) {
    const tileId = await openTilePicker(anchorEl, editor, { title: "Receiving player's fog view shows tile…" });
    if (!tileId) return null;
    const label = prompt("Optional label to show alongside the sighting (blank for none):") || '';
    return (tileId + ' ' + label.trim()).trim();
}

/**
 * Composite builder for a per-line "?condition" token: color / faction / round,
 * with optional negation. Resolves e.g. "?red", "?!faction:winnu", "?round:3-" or null.
 */
export function openConditionPicker(anchorEl, editor) {
    return new Promise((resolve) => {
        const panel = createPanel(anchorEl, { width: 260 });
        activeResolve = resolve;
        const done = (value) => { activeResolve = null; closeActivePicker(); resolve(value); };

        const title = document.createElement('div');
        title.textContent = 'Add a condition to the last effect line';
        title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#f39c12;margin-bottom:6px';
        panel.appendChild(title);

        const negateRow = document.createElement('label');
        negateRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85em;color:#ddd;' +
            'cursor:pointer;margin-bottom:8px';
        const negateCb = document.createElement('input');
        negateCb.type = 'checkbox';
        negateRow.appendChild(negateCb);
        negateRow.appendChild(document.createTextNode('Negate (fires when the condition does NOT hold)'));
        panel.appendChild(negateRow);

        const neg = () => negateCb.checked ? '!' : '';

        const colorBtn = styledButton('Player color…', { bg: '#c0392b' });
        colorBtn.style.cssText += 'width:100%;margin-bottom:6px';
        colorBtn.onclick = async () => {
            const negate = neg();
            // Detach this panel's resolver before the nested picker replaces it,
            // so createPanel's cleanup doesn't null-resolve us mid-flow.
            activeResolve = null;
            const color = await openColorPicker(anchorEl, editor, { title: 'Condition: player color is…', allowNeutral: false });
            resolve(color ? `?${negate}${color}` : null);
        };
        panel.appendChild(colorBtn);

        const factionBtn = styledButton('Player faction…', { bg: '#16a085' });
        factionBtn.style.cssText += 'width:100%;margin-bottom:6px';
        factionBtn.onclick = async () => {
            const negate = neg();
            activeResolve = null;
            const faction = await openFactionPicker(anchorEl, editor, { title: 'Condition: player faction is…' });
            resolve(faction ? `?${negate}faction:${faction}` : null);
        };
        panel.appendChild(factionBtn);

        const roundRow = document.createElement('div');
        roundRow.style.cssText = 'display:flex;gap:6px;align-items:center';
        const roundInput = document.createElement('input');
        roundInput.type = 'text';
        roundInput.placeholder = 'Rounds: 3, 3-6, 3-, -6';
        roundInput.title = 'Restricts only THIS ONE effect line — the whole-entry "Rounds" field in the editor ' +
            'restricts the entire entry instead.';
        roundInput.style.cssText = 'flex:1;padding:4px 6px;border:1px solid #666;border-radius:4px;' +
            'background:#1c2733;color:#fff;box-sizing:border-box';
        const roundBtn = styledButton('Add', { bg: '#27ae60' });
        roundBtn.onclick = () => {
            const range = roundInput.value.trim();
            if (!/^(\d+(-\d*)?|-\d+)$/.test(range)) {
                roundInput.style.borderColor = '#e74c3c';
                return;
            }
            done(`?${neg()}round:${range}`);
        };
        roundRow.appendChild(roundInput);
        roundRow.appendChild(roundBtn);
        panel.appendChild(roundRow);
    });
}

/**
 * Two-step picker for "swap": choose the first hex, then the second (excluding the first).
 * Resolves [pos1, pos2] or null if cancelled at either step.
 */
export async function openSwapPicker(anchorEl, editor) {
    const allHexes = Object.keys(editor.hexes || {}).sort().map(label => ({ value: label, label }));
    if (allHexes.length < 2) {
        alert('Not enough hexes on the map to swap.');
        return null;
    }

    const first = await openListPicker(anchorEl, allHexes, { title: 'Swap — first sector', width: 200 });
    if (!first) return null;

    const remaining = allHexes.filter(h => h.value !== first);
    const second = await openListPicker(anchorEl, remaining, { title: `Swap ${first} with…`, width: 200 });
    if (!second) return null;

    return [first, second];
}
