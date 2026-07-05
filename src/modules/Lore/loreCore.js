/**
 * Lore Module - Core functionality for managing system, planet, and phase lore.
 *
 * Mirrors the bot's LoreService data model (ti4.service.fow.LoreService):
 *  - every target (system position / planet / phase) holds a LIST of entries,
 *  - entries carry a #tag (letters+digits) so several can live on one target,
 *  - entries carry a round window (fromRound/tillRound, 0 = unbounded),
 *  - wire format: target;loreText;footerText;receiver;trigger;ping;persistance;fromRound;tillRound
 *    joined by "|" (7-field legacy entries still import).
 *
 * Storage on the editor:
 *  - hex.systemLore            -> [entry, ...]
 *  - hex.planetLore            -> { [planetIndex]: [entry, ...] }
 *  - editor.phaseLore          -> { strategy: [], action: [], status: [], agenda: [] }
 *  - editor.loreGameType       -> 'fow' | 'normal' | 'unknown' (validation context)
 * Legacy single-object shapes are accepted everywhere via normalizeLoreEntries().
 */

export const LORE_RECEIVERS = ['CURRENT', 'ADJACENT', 'ALL', 'GM', 'CARDS', 'WINNER', 'LOSER'];
export const LORE_TRIGGERS = ['CONTROLLED', 'ACTIVATED', 'MOVED', 'SPACE_BATTLE', 'GROUND_BATTLE', 'PHASE_START', 'PHASE_END'];
export const LORE_PINGS = ['YES', 'NO'];
export const LORE_PERSISTANCE = ['ONCE', 'ALWAYS', 'ONCE_PER_PLAYER'];

export const LORE_PHASE_TARGETS = ['strategy', 'action', 'status', 'agenda'];
export const LORE_PHASE_TRIGGERS = ['PHASE_START', 'PHASE_END'];

export const LORE_TEXT_LIMIT = 1000;
export const LORE_FOOTER_LIMIT = 300;

export const LORE_RECEIVER_LABELS = {
    CURRENT: 'Current Player',
    ADJACENT: 'Adjacent Players',
    ALL: 'All Players',
    GM: 'GM',
    CARDS: 'Private Card Thread',
    WINNER: 'Battle Winner',
    LOSER: 'Battle Loser'
};

export const LORE_TRIGGER_LABELS = {
    CONTROLLED: 'Target is in control',
    ACTIVATED: 'Target is activated',
    MOVED: 'Units are moved in',
    SPACE_BATTLE: 'A space battle was fought here',
    GROUND_BATTLE: 'A ground battle was fought here',
    PHASE_START: 'Phase begins',
    PHASE_END: 'Phase ends'
};

export const LORE_PERSISTANCE_LABELS = {
    ONCE: 'Once',
    ALWAYS: 'Every time',
    ONCE_PER_PLAYER: 'Once per player'
};

// Availability of receivers / ping by game type (the bot's add-UI hides these):
//  - ADJACENT, GM and ping=YES only make sense in FoW games,
//  - CARDS (private card thread) only exists in non-FoW games.
export const LORE_FOW_ONLY_RECEIVERS = ['ADJACENT', 'GM'];
export const LORE_NON_FOW_ONLY_RECEIVERS = ['CARDS'];

export const LORE_GAME_TYPES = ['fow', 'normal', 'unknown'];

const TAG_PATTERN = /^[A-Za-z0-9]+$/;

/** Strip the characters the wire format reserves (';' field / '|' entry separators). */
export function cleanLoreText(s) {
    return (s || '').replace(/[;|]/g, '').trim();
}

/** A complete entry with defaults, optionally overridden. */
export function createLoreEntry(overrides = {}) {
    return {
        loreText: '',
        footerText: '',
        receiver: 'CURRENT',
        trigger: 'CONTROLLED',
        ping: 'NO',
        persistance: 'ONCE',
        fromRound: 0,
        tillRound: 0,
        tag: '',
        ...overrides
    };
}

/**
 * Accepts any historical lore shape and returns a fresh array of complete entries:
 *  - null/undefined            -> []
 *  - single entry object       -> [entry]   (legacy pre-multi-entry saves)
 *  - array of entries          -> filled copies
 * Unknown fields are dropped; missing fields get defaults.
 */
export function normalizeLoreEntries(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    const out = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        out.push(createLoreEntry({
            loreText: typeof item.loreText === 'string' ? item.loreText : '',
            footerText: typeof item.footerText === 'string' ? item.footerText : '',
            receiver: LORE_RECEIVERS.includes(item.receiver) ? item.receiver : 'CURRENT',
            trigger: LORE_TRIGGERS.includes(item.trigger) ? item.trigger : 'CONTROLLED',
            ping: LORE_PINGS.includes(item.ping) ? item.ping : 'NO',
            persistance: LORE_PERSISTANCE.includes(item.persistance) ? item.persistance : 'ONCE',
            fromRound: Number.isInteger(item.fromRound) && item.fromRound > 0 ? item.fromRound : 0,
            tillRound: Number.isInteger(item.tillRound) && item.tillRound > 0 ? item.tillRound : 0,
            tag: (typeof item.tag === 'string' && TAG_PATTERN.test(item.tag)) ? item.tag : ''
        }));
    }
    return out;
}

/** True when the entry has anything worth keeping/exporting. */
export function isNonEmptyLoreEntry(entry) {
    return !!(entry && ((entry.loreText || '').trim() || (entry.footerText || '').trim()));
}

// Short-key form used by the compact full-state save format (export.js / import.js):
// lt/ft/r/t/p/pe as before, plus fr (fromRound), tr (tillRound), tg (tag) when non-default.

/** One entry -> compact save object. */
export function loreEntryToShort(entry) {
    const s = {
        lt: entry.loreText || '',
        ft: entry.footerText || '',
        r: entry.receiver || 'CURRENT',
        t: entry.trigger || 'CONTROLLED',
        p: entry.ping || 'NO',
        pe: entry.persistance || 'ONCE'
    };
    if (entry.fromRound > 0) s.fr = entry.fromRound;
    if (entry.tillRound > 0) s.tr = entry.tillRound;
    if (entry.tag) s.tg = entry.tag;
    return s;
}

/**
 * Compact save form -> normalized entry array. Accepts the legacy single short
 * object, an array of short objects, or anything normalizeLoreEntries takes.
 */
export function shortToLoreEntries(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return normalizeLoreEntries(list.map(s => (s && typeof s === 'object' && ('lt' in s || 'ft' in s)) ? {
        loreText: s.lt || '',
        footerText: s.ft || '',
        receiver: s.r,
        trigger: s.t,
        ping: s.p,
        persistance: s.pe,
        fromRound: s.fr,
        tillRound: s.tr,
        tag: s.tg
    } : s));
}

/**
 * Round-window shorthand used by the bot's "Rounds" modal field:
 *   '' -> any · 'N' -> exactly N · 'N-M' -> N..M · 'N-' -> N onward · '-M' -> up to M.
 * Backwards or non-numeric input parses as unbounded plus a warning (same as the bot).
 * Returns { fromRound, tillRound, warning }.
 */
export function parseRoundWindow(input) {
    const str = (input || '').trim();
    if (!str) return { fromRound: 0, tillRound: 0, warning: null };

    const m = str.match(/^(\d*)\s*(-?)\s*(\d*)$/);
    if (!m || (!m[1] && !m[3])) {
        return { fromRound: 0, tillRound: 0, warning: `Rounds "${str}" not understood — treated as unrestricted. Use N, N-M, N- or -M.` };
    }
    const from = m[1] ? parseInt(m[1], 10) : 0;
    const till = m[3] ? parseInt(m[3], 10) : 0;
    if (!m[2]) {
        // plain "N"
        return { fromRound: from, tillRound: from, warning: null };
    }
    if (from > 0 && till > 0 && from > till) {
        return { fromRound: 0, tillRound: 0, warning: `Rounds "${str}" is backwards — treated as unrestricted.` };
    }
    return { fromRound: from, tillRound: till, warning: null };
}

/** Inverse of parseRoundWindow for display: 0/0 -> '', N/N -> 'N', etc. */
export function formatRoundWindow(fromRound, tillRound) {
    const from = fromRound > 0 ? fromRound : 0;
    const till = tillRound > 0 ? tillRound : 0;
    if (!from && !till) return '';
    if (from && till) return from === till ? `${from}` : `${from}-${till}`;
    if (from) return `${from}-`;
    return `-${till}`;
}

/** '' for valid tags (or empty = untagged), otherwise a problem description. */
export function validateTag(tag) {
    if (!tag) return '';
    return TAG_PATTERN.test(tag) ? '' : `Tag "${tag}" must be letters and digits only.`;
}

export function isPhaseTrigger(trigger) {
    return LORE_PHASE_TRIGGERS.includes(trigger);
}

export function isPhaseTarget(target) {
    return LORE_PHASE_TARGETS.includes((target || '').toLowerCase());
}

export class LoreManager {
    constructor(editor) {
        this.editor = editor;
        if (!editor.phaseLore) {
            editor.phaseLore = { strategy: [], action: [], status: [], agenda: [] };
        }
        if (!editor.loreGameType) {
            editor.loreGameType = 'unknown';
        }
    }

    // ---------- shape helpers ----------

    /** Bring a hex's lore fields to the canonical array shapes, in place. */
    _ensureHexShapes(hex) {
        if (!Array.isArray(hex.systemLore)) {
            hex.systemLore = normalizeLoreEntries(hex.systemLore);
        }
        if (!hex.planetLore || Array.isArray(hex.planetLore) || typeof hex.planetLore !== 'object') {
            hex.planetLore = {};
        }
        for (const idx of Object.keys(hex.planetLore)) {
            if (!Array.isArray(hex.planetLore[idx])) {
                hex.planetLore[idx] = normalizeLoreEntries(hex.planetLore[idx]);
            }
        }
        return hex;
    }

    _hex(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.warn(`Hex ${hexLabel} not found`);
            return null;
        }
        return this._ensureHexShapes(hex);
    }

    _phaseList(phase) {
        const key = (phase || '').toLowerCase();
        if (!LORE_PHASE_TARGETS.includes(key)) {
            console.warn(`Unknown phase "${phase}"`);
            return null;
        }
        if (!this.editor.phaseLore) this.editor.phaseLore = { strategy: [], action: [], status: [], agenda: [] };
        if (!Array.isArray(this.editor.phaseLore[key])) this.editor.phaseLore[key] = normalizeLoreEntries(this.editor.phaseLore[key]);
        return this.editor.phaseLore[key];
    }

    /** Entry list for any target ref: {kind:'system',hexLabel} | {kind:'planet',hexLabel,planetIndex} | {kind:'phase',phase}. */
    getEntries(ref) {
        if (!ref) return [];
        if (ref.kind === 'phase') return this._phaseList(ref.phase) || [];
        const hex = this._hex(ref.hexLabel);
        if (!hex) return [];
        if (ref.kind === 'system') return hex.systemLore;
        if (!Array.isArray(hex.planetLore[ref.planetIndex])) hex.planetLore[ref.planetIndex] = [];
        return hex.planetLore[ref.planetIndex];
    }

    // ---------- entry CRUD ----------

    /**
     * Validate + append an entry to a target. On a bare-tag collision the entry is
     * auto-tagged (mirrors the bot's auto-tag on save). Returns
     * { ok, index, warnings: [], error } — error set means nothing was saved.
     */
    addEntry(ref, entryData) {
        const check = this.validateLoreData(entryData, ref);
        if (check.error) return { ok: false, error: check.error, warnings: check.warnings };

        const list = this.getEntries(ref);
        if (ref.kind !== 'phase') this.editor.saveState(ref.hexLabel);

        const entry = normalizeLoreEntries(entryData)[0] || createLoreEntry();
        const collision = list.some(e => (e.tag || '') === (entry.tag || ''));
        const warnings = [...check.warnings];
        if (collision) {
            entry.tag = this._autoTag(list, entry);
            warnings.push(`Target already had an entry with that tag — saved as #${entry.tag}.`);
        }
        list.push(entry);
        return { ok: true, index: list.length - 1, warnings };
    }

    updateEntry(ref, index, entryData) {
        const check = this.validateLoreData(entryData, ref);
        if (check.error) return { ok: false, error: check.error, warnings: check.warnings };

        const list = this.getEntries(ref);
        if (index < 0 || index >= list.length) return { ok: false, error: 'Entry no longer exists.', warnings: [] };
        if (ref.kind !== 'phase') this.editor.saveState(ref.hexLabel);

        const entry = normalizeLoreEntries(entryData)[0] || createLoreEntry();
        const collision = list.some((e, i) => i !== index && (e.tag || '') === (entry.tag || ''));
        const warnings = [...check.warnings];
        if (collision) {
            entry.tag = this._autoTag(list, entry, index);
            warnings.push(`Another entry already had that tag — saved as #${entry.tag}.`);
        }
        list[index] = entry;
        return { ok: true, index, warnings };
    }

    removeEntry(ref, index) {
        const list = this.getEntries(ref);
        if (index < 0 || index >= list.length) return false;
        if (ref.kind !== 'phase') this.editor.saveState(ref.hexLabel);
        list.splice(index, 1);
        return true;
    }

    /** Smallest numeric-suffix tag not colliding with any other entry on the list. */
    _autoTag(list, entry, skipIndex = -1) {
        const base = entry.tag || (LORE_TRIGGER_LABELS[entry.trigger] ? entry.trigger.replace(/[^A-Za-z0-9]/g, '') : 'Entry');
        const taken = new Set(list.filter((_, i) => i !== skipIndex).map(e => e.tag || ''));
        if (!taken.has(base)) return base;
        let n = 2;
        while (taken.has(`${base}${n}`)) n++;
        return `${base}${n}`;
    }

    // ---------- legacy single-entry API (kept for compatibility) ----------

    /** Legacy: replace the system list with this one entry. */
    setSystemLore(hexLabel, loreData) {
        const hex = this._hex(hexLabel);
        if (!hex) return false;
        const check = this.validateLoreData(loreData, { kind: 'system', hexLabel });
        if (check.error) { console.warn(check.error); return false; }
        this.editor.saveState(hexLabel);
        hex.systemLore = normalizeLoreEntries(loreData);
        return true;
    }

    /** Legacy: first system entry or null. */
    getSystemLore(hexLabel) {
        const hex = this._hex(hexLabel);
        return hex?.systemLore[0] || null;
    }

    /** Legacy: replace the planet slot's list with this one entry. */
    addPlanetLore(hexLabel, planetIndex, loreData) {
        const hex = this._hex(hexLabel);
        if (!hex) return false;
        const check = this.validateLoreData(loreData, { kind: 'planet', hexLabel, planetIndex });
        if (check.error) { console.warn(check.error); return false; }
        this.editor.saveState(hexLabel);
        hex.planetLore[planetIndex] = normalizeLoreEntries(loreData);
        return true;
    }

    /** Legacy: first entry of the planet slot or null. */
    getPlanetLore(hexLabel, planetIndex) {
        const hex = this._hex(hexLabel);
        return hex?.planetLore[planetIndex]?.[0] ?? null;
    }

    getAllPlanetLore(hexLabel) {
        const hex = this._hex(hexLabel);
        return hex?.planetLore || {};
    }

    removeSystemLore(hexLabel) {
        const hex = this._hex(hexLabel);
        if (!hex) return false;
        this.editor.saveState(hexLabel);
        hex.systemLore = [];
        return true;
    }

    removePlanetLore(hexLabel, planetIndex) {
        const hex = this._hex(hexLabel);
        if (!hex || !(planetIndex in hex.planetLore)) return false;
        this.editor.saveState(hexLabel);
        delete hex.planetLore[planetIndex];
        return true;
    }

    // ---------- validation ----------

    /**
     * Save-gate validation, mirroring the bot's hard fails (spec §10):
     * bad types, text over limits, bad enum, bad tag, phase-target/trigger mismatch,
     * reserved ';'/'|' characters. Returns { error: string|null, warnings: [] }.
     */
    validateLoreData(loreData, ref = null) {
        const warnings = [];
        if (!loreData || typeof loreData !== 'object') return { error: 'Invalid lore data.', warnings };
        if (typeof loreData.loreText !== 'string' || typeof loreData.footerText !== 'string') {
            return { error: 'Lore and footer text must be strings.', warnings };
        }
        if (loreData.loreText.length > LORE_TEXT_LIMIT) {
            return { error: `Lore text too long: ${loreData.loreText.length} characters (max ${LORE_TEXT_LIMIT}).`, warnings };
        }
        if (loreData.footerText.length > LORE_FOOTER_LIMIT) {
            return { error: `Footer text too long: ${loreData.footerText.length} characters (max ${LORE_FOOTER_LIMIT}).`, warnings };
        }
        if (/[;|]/.test(loreData.loreText) || /[;|]/.test(loreData.footerText)) {
            return { error: 'Semicolons and "|" are reserved by the export format and not allowed in lore text.', warnings };
        }
        if (!LORE_RECEIVERS.includes(loreData.receiver)) return { error: `Unknown receiver "${loreData.receiver}".`, warnings };
        if (!LORE_TRIGGERS.includes(loreData.trigger)) return { error: `Unknown trigger "${loreData.trigger}".`, warnings };
        if (!LORE_PINGS.includes(loreData.ping)) return { error: `Unknown ping "${loreData.ping}".`, warnings };
        if (!LORE_PERSISTANCE.includes(loreData.persistance)) return { error: `Unknown persistance "${loreData.persistance}".`, warnings };

        const tagProblem = validateTag(loreData.tag);
        if (tagProblem) return { error: tagProblem, warnings };

        const isPhase = ref?.kind === 'phase';
        if (isPhase && !isPhaseTrigger(loreData.trigger)) {
            return { error: 'Phase lore must use a Phase begins/ends trigger — anything else could never fire.', warnings };
        }
        if (!isPhase && ref && isPhaseTrigger(loreData.trigger)) {
            return { error: 'Phase begins/ends triggers only work on phase targets (strategy/action/status/agenda).', warnings };
        }
        if (isPhase && loreData.persistance === 'ONCE_PER_PLAYER') {
            warnings.push('"Once per player" is meaningless for phase lore — the bot treats it as Once.');
        }
        if (isPhase && !['ALL', 'GM'].includes(loreData.receiver)) {
            warnings.push('Phase lore has no acting player — the bot falls back to announcing to All Players.');
        }
        return { error: null, warnings };
    }

    // ---------- queries ----------

    /** Every hex holding at least one non-empty entry, with normalized shapes. */
    getHexesWithLore() {
        const out = [];
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            this._ensureHexShapes(hex);
            const systemEntries = hex.systemLore.filter(isNonEmptyLoreEntry);
            const planetEntries = {};
            for (const [idx, list] of Object.entries(hex.planetLore)) {
                const kept = (list || []).filter(isNonEmptyLoreEntry);
                if (kept.length) planetEntries[idx] = kept;
            }
            if (systemEntries.length || Object.keys(planetEntries).length) {
                out.push({
                    label,
                    hasSystemLore: systemEntries.length > 0,
                    hasPlanetLore: Object.keys(planetEntries).length > 0,
                    systemEntries,
                    planetEntries,
                    // legacy fields (first entries) so old readers keep limping along
                    systemLore: systemEntries[0] || null,
                    planetLore: planetEntries
                });
            }
        }
        return out;
    }

    /** { strategy: [entries], ... } with empty phases omitted. */
    getPhaseLoreSummary() {
        const out = {};
        for (const phase of LORE_PHASE_TARGETS) {
            const list = (this._phaseList(phase) || []).filter(isNonEmptyLoreEntry);
            if (list.length) out[phase] = list;
        }
        return out;
    }

    clearAllLore() {
        let clearedCount = 0;
        for (const hex of Object.values(this.editor.hexes)) {
            this._ensureHexShapes(hex);
            if (hex.systemLore.length || Object.keys(hex.planetLore).length) {
                hex.systemLore = [];
                hex.planetLore = {};
                clearedCount++;
            }
        }
        for (const phase of LORE_PHASE_TARGETS) {
            const list = this._phaseList(phase);
            if (list && list.length) {
                list.length = 0;
                clearedCount++;
            }
        }
        return clearedCount;
    }

    // ---------- JSON export/import (builder-native format) ----------

    exportLore() {
        const loreData = {};
        for (const info of this.getHexesWithLore()) {
            loreData[info.label] = {};
            if (info.systemEntries.length) loreData[info.label].systemLore = info.systemEntries;
            if (Object.keys(info.planetEntries).length) loreData[info.label].planetLore = info.planetEntries;
        }
        const phases = this.getPhaseLoreSummary();
        if (Object.keys(phases).length) loreData.__phases = phases;
        if (this.editor.loreGameType && this.editor.loreGameType !== 'unknown') {
            loreData.__gameType = this.editor.loreGameType;
        }
        return loreData;
    }

    importLore(loreData) {
        if (!loreData || typeof loreData !== 'object') {
            console.warn('Invalid lore data for import');
            return false;
        }
        let importedCount = 0;
        for (const [key, hexLore] of Object.entries(loreData)) {
            if (key === '__phases') {
                for (const [phase, list] of Object.entries(hexLore || {})) {
                    const target = this._phaseList(phase);
                    if (target) { target.length = 0; target.push(...normalizeLoreEntries(list)); importedCount++; }
                }
                continue;
            }
            if (key === '__gameType') {
                if (LORE_GAME_TYPES.includes(hexLore)) this.editor.loreGameType = hexLore;
                continue;
            }
            const hex = this.editor.hexes[key];
            if (!hex) {
                console.warn(`Hex ${key} not found during import`);
                continue;
            }
            this._ensureHexShapes(hex);
            if (hexLore.systemLore) hex.systemLore = normalizeLoreEntries(hexLore.systemLore);
            if (hexLore.planetLore && typeof hexLore.planetLore === 'object') {
                hex.planetLore = {};
                for (const [idx, list] of Object.entries(hexLore.planetLore)) {
                    const entries = normalizeLoreEntries(list);
                    if (entries.length) hex.planetLore[idx] = entries;
                }
            }
            importedCount++;
        }
        this.editor.loreOverlay?.refresh();
        return importedCount;
    }

    // ---------- bot wire format ----------

    /** planet identifier used as the bot-side target (matches Mapper.getPlanet). */
    _planetTarget(hex, idx, label) {
        const planet = hex.planets?.[idx];
        return (planet && (planet.planetID || planet.id || planet.name)) || `${label}_planet${Number(idx) + 1}`;
    }

    /**
     * Full-fidelity export in the bot's 9-field format (spec §1), with #tags and
     * phase targets. This string is what the bot's GM Import-from-URL reads.
     */
    exportWireFormat() {
        const entries = [];
        for (const info of this.getHexesWithLore()) {
            for (const entry of info.systemEntries) {
                entries.push(this._loreEntryToWireString(info.label, entry));
            }
            const hex = this.editor.hexes[info.label];
            for (const [idx, list] of Object.entries(info.planetEntries)) {
                const target = this._planetTarget(hex, idx, info.label);
                for (const entry of list) entries.push(this._loreEntryToWireString(target, entry));
            }
        }
        for (const [phase, list] of Object.entries(this.getPhaseLoreSummary())) {
            for (const entry of list) entries.push(this._loreEntryToWireString(phase, entry));
        }
        return entries.join('|');
    }

    _loreEntryToWireString(target, entry) {
        const targetWithTag = entry.tag ? `${cleanLoreText(target)}#${entry.tag}` : cleanLoreText(target);
        return [
            targetWithTag,
            cleanLoreText(entry.loreText),
            cleanLoreText(entry.footerText),
            entry.receiver, entry.trigger, entry.ping, entry.persistance,
            entry.fromRound || 0, entry.tillRound || 0
        ].join(';');
    }

    /**
     * Import the bot wire format (7- or 9-field entries). Matches the bot's tolerance:
     * bad entries are skipped and reported individually, never the whole string.
     * Entries APPEND to existing lists (they don't wipe the target).
     * Returns { systemCount, planetCount, phaseCount, skipped: [{raw, reason}] }.
     */
    importWireFormat(wireString) {
        const result = { systemCount: 0, planetCount: 0, phaseCount: 0, skipped: [] };
        if (!wireString || typeof wireString !== 'string') return result;

        // target -> {hexLabel, planetIndex} lookup for planet identifiers (case-insensitive)
        const planetTargets = new Map();
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            (hex.planets || []).forEach((planet, idx) => {
                const id = planet && (planet.planetID || planet.id || planet.name);
                if (id) planetTargets.set(String(id).toLowerCase(), { hexLabel: label, planetIndex: idx });
            });
        }

        for (const raw of wireString.split('|')) {
            if (!raw.trim()) continue;
            const fields = raw.split(';');
            if (fields.length !== 7 && fields.length !== 9) {
                result.skipped.push({ raw, reason: `expected 7 or 9 fields, got ${fields.length}` });
                continue;
            }

            let target = fields[0].trim();
            let tag = '';
            const hashIdx = target.indexOf('#');
            if (hashIdx >= 0) {
                tag = target.substring(hashIdx + 1);
                target = target.substring(0, hashIdx);
                if (validateTag(tag)) {
                    result.skipped.push({ raw, reason: `bad tag "#${tag}"` });
                    continue;
                }
            }

            const [receiver, trigger, ping, persistance] = [fields[3], fields[4], fields[5], fields[6]];
            const enumProblem =
                (!LORE_RECEIVERS.includes(receiver) && `unknown receiver "${receiver}"`) ||
                (!LORE_TRIGGERS.includes(trigger) && `unknown trigger "${trigger}"`) ||
                (!LORE_PINGS.includes(ping) && `unknown ping "${ping}"`) ||
                (!LORE_PERSISTANCE.includes(persistance) && `unknown persistance "${persistance}"`);
            if (enumProblem) {
                result.skipped.push({ raw, reason: enumProblem });
                continue;
            }

            let fromRound = 0, tillRound = 0;
            if (fields.length === 9) {
                fromRound = parseInt(fields[7], 10);
                tillRound = parseInt(fields[8], 10);
                if (Number.isNaN(fromRound) || Number.isNaN(tillRound)) {
                    result.skipped.push({ raw, reason: 'non-numeric round window' });
                    continue;
                }
                if (fromRound < 0) fromRound = 0;
                if (tillRound < 0) tillRound = 0;
            }

            const entry = createLoreEntry({
                loreText: fields[1] ?? '', footerText: fields[2] ?? '',
                receiver, trigger, ping, persistance, fromRound, tillRound, tag
            });
            if (entry.loreText.length > LORE_TEXT_LIMIT || entry.footerText.length > LORE_FOOTER_LIMIT) {
                result.skipped.push({ raw, reason: 'text over length limit' });
                continue;
            }

            // Phase target? (checked before planets, same order as the bot)
            if (isPhaseTarget(target)) {
                if (!isPhaseTrigger(entry.trigger)) {
                    result.skipped.push({ raw, reason: 'phase target needs a PHASE_START/PHASE_END trigger' });
                    continue;
                }
                this._phaseList(target).push(entry);
                result.phaseCount++;
                continue;
            }
            if (isPhaseTrigger(entry.trigger)) {
                result.skipped.push({ raw, reason: 'PHASE_START/PHASE_END triggers need a phase target' });
                continue;
            }

            if (this.editor.hexes[target]) {
                this.getEntries({ kind: 'system', hexLabel: target }).push(entry);
                result.systemCount++;
                continue;
            }

            const planetMatch = planetTargets.get(target.toLowerCase());
            if (planetMatch) {
                this.getEntries({ kind: 'planet', ...planetMatch }).push(entry);
                result.planetCount++;
                continue;
            }

            result.skipped.push({ raw, reason: `target "${target}" matches no hex, planet or phase on this map` });
        }

        this.editor.loreOverlay?.refresh();
        return result;
    }
}

// Export convenience functions
export function createLoreManager(editor) {
    return new LoreManager(editor);
}
