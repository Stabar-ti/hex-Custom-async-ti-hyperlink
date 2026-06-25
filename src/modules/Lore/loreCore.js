/**
 * Lore Module - Core functionality for managing system and planet lore
 * Handles creation, modification, and storage of lore data for hexes
 */

export class LoreManager {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Create a new system lore object with default values
     */
    createSystemLore() {
        return {
            loreText: "",
            footerText: "",
            receiver: "CURRENT",     // CURRENT, ADJACENT, ALL
            trigger: "CONTROLLED",   // CONTROLLED, ACTIVATED, EXPLORED
            ping: "NO",              // YES, NO
            persistance: "ONCE"      // ONCE, ALWAYS, CONDITIONAL
        };
    }

    /**
     * Create a new planet lore object with default values
     */
    createPlanetLore() {
        return {
            loreText: "",
            footerText: "",
            receiver: "CURRENT",     // CURRENT, ADJACENT, ALL
            trigger: "CONTROLLED",   // CONTROLLED, ACTIVATED, EXPLORED
            ping: "NO",              // YES, NO
            persistance: "ONCE"      // ONCE, ALWAYS, CONDITIONAL
        };
    }

    /**
     * Set system lore for a hex
     */
    setSystemLore(hexLabel, loreData) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.warn(`Hex ${hexLabel} not found`);
            return false;
        }

        // Validate lore data structure
        if (!this.validateLoreData(loreData)) {
            console.warn('Invalid lore data structure');
            return false;
        }

        this.editor.saveState(hexLabel);
        hex.systemLore = { ...loreData };
        return true;
    }

    /**
     * Get system lore for a hex
     */
    getSystemLore(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        return hex?.systemLore || null;
    }

    /**
     * Add planet lore for a hex
     */
    addPlanetLore(hexLabel, planetIndex, loreData) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.warn(`Hex ${hexLabel} not found`);
            return false;
        }

        // Validate lore data structure
        if (!this.validateLoreData(loreData)) {
            console.warn('Invalid lore data structure');
            return false;
        }

        // Use plain object keyed by planet index (consistent with import/export/history paths)
        if (!hex.planetLore || Array.isArray(hex.planetLore)) {
            hex.planetLore = {};
        }

        this.editor.saveState(hexLabel);
        hex.planetLore[planetIndex] = { ...loreData };
        return true;
    }

    /**
     * Get planet lore for a hex and planet index
     */
    getPlanetLore(hexLabel, planetIndex) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.planetLore) return null;
        return hex.planetLore[planetIndex] ?? null;
    }

    /**
     * Get all planet lore for a hex
     */
    getAllPlanetLore(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        return hex?.planetLore || {};
    }

    /**
     * Remove system lore from a hex
     */
    removeSystemLore(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return false;

        this.editor.saveState(hexLabel);
        hex.systemLore = null;
        return true;
    }

    /**
     * Remove planet lore from a hex
     */
    removePlanetLore(hexLabel, planetIndex) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.planetLore || !(planetIndex in hex.planetLore)) {
            return false;
        }

        this.editor.saveState(hexLabel);
        delete hex.planetLore[planetIndex];
        return true;
    }

    /**
     * Validate lore data structure
     */
    validateLoreData(loreData) {
        if (!loreData || typeof loreData !== 'object') return false;
        
        const validReceivers = LORE_RECEIVERS;
        const validTriggers = LORE_TRIGGERS;
        const validPings = LORE_PINGS;
        const validPersistance = LORE_PERSISTANCE;
        
        // Check length constraints
        const loreTextLength = (loreData.loreText || '').length;
        const footerTextLength = (loreData.footerText || '').length;
        
        if (loreTextLength > 1000) {
            console.warn(`Lore text too long: ${loreTextLength} characters (max 1000)`);
            return false;
        }
        
        if (footerTextLength > 200) {
            console.warn(`Footer text too long: ${footerTextLength} characters (max 200)`);
            return false;
        }
        
        return (
            typeof loreData.loreText === 'string' &&
            typeof loreData.footerText === 'string' &&
            validReceivers.includes(loreData.receiver) &&
            validTriggers.includes(loreData.trigger) &&
            validPings.includes(loreData.ping) &&
            validPersistance.includes(loreData.persistance)
        );
    }

    /**
     * Get all hexes with lore data
     */
    getHexesWithLore() {
        const hexesWithLore = [];
        
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            const hasSystemLore = hex.systemLore !== null && hex.systemLore !== undefined;
            const hasPlanetLore = hex.planetLore && Object.values(hex.planetLore).some(lore => lore != null);
            
            if (hasSystemLore || hasPlanetLore) {
                hexesWithLore.push({
                    label,
                    hasSystemLore,
                    hasPlanetLore,
                    systemLore: hex.systemLore,
                    planetLore: hex.planetLore
                });
            }
        }
        
        return hexesWithLore;
    }

    /**
     * Clear all lore data from the map
     */
    clearAllLore() {
        let clearedCount = 0;
        
        for (const hex of Object.values(this.editor.hexes)) {
            if (hex.systemLore || (hex.planetLore && Object.keys(hex.planetLore).length > 0)) {
                hex.systemLore = null;
                hex.planetLore = {};
                clearedCount++;
            }
        }
        return clearedCount;
    }

    /**
     * Export lore data for all hexes
     */
    exportLore() {
        const loreData = {};
        
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            if (hex.systemLore || (hex.planetLore && Object.values(hex.planetLore).some(lore => lore != null))) {
                loreData[label] = {};
                
                if (hex.systemLore) {
                    loreData[label].systemLore = hex.systemLore;
                }
                
                if (hex.planetLore && Object.values(hex.planetLore).some(lore => lore != null)) {
                    loreData[label].planetLore = hex.planetLore;
                }
            }
        }
        
        return loreData;
    }

    /**
     * Export lore in the bot's wire format: "target;loreText;footerText;receiver;trigger;ping;persistance"
     * entries joined by "|". System lore targets are the hex label; planet lore targets are the planet's
     * identifier (matching Mapper.getPlanet on the bot side), since the bot keys all lore by a flat
     * target string rather than by hex+slot like this editor does.
     */
    exportWireFormat() {
        const entries = [];

        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            if (hex.systemLore) {
                entries.push(this._loreEntryToWireString(label, hex.systemLore));
            }

            if (hex.planetLore) {
                for (const [idx, lore] of Object.entries(hex.planetLore)) {
                    if (!lore) continue;
                    const planet = hex.planets?.[idx];
                    const target = (planet && (planet.planetID || planet.id || planet.name))
                        || `${label}_planet${Number(idx) + 1}`;
                    entries.push(this._loreEntryToWireString(target, lore));
                }
            }
        }

        return entries.join('|');
    }

    _loreEntryToWireString(target, lore) {
        const clean = (s) => (s || '').replace(/;/g, '').replace(/\|/g, '');
        return [
            clean(target), clean(lore.loreText), clean(lore.footerText),
            lore.receiver, lore.trigger, lore.ping, lore.persistance
        ].join(';');
    }

    /**
     * Import lore from the bot's wire format. Each target is matched against hex labels (system lore)
     * and against every hex's planet identifiers (planet lore) — entries that match neither are skipped
     * and reported back to the caller.
     */
    importWireFormat(wireString) {
        const result = { systemCount: 0, planetCount: 0, skipped: [] };
        if (!wireString || typeof wireString !== 'string') return result;

        // Build a target -> {hexLabel, planetIndex} lookup for planet identifiers
        const planetTargets = new Map();
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            (hex.planets || []).forEach((planet, idx) => {
                const id = planet && (planet.planetID || planet.id || planet.name);
                if (id) planetTargets.set(id, { hexLabel: label, planetIndex: idx });
            });
        }

        for (const raw of wireString.split('|')) {
            if (!raw.trim()) continue;
            const fields = raw.split(';');
            if (fields.length < 2) {
                result.skipped.push(raw);
                continue;
            }

            const target = fields[0].trim();
            const loreData = {
                loreText: fields[1] ?? '',
                footerText: fields[2] ?? '',
                receiver: LORE_RECEIVERS.includes(fields[3]) ? fields[3] : 'CURRENT',
                trigger: LORE_TRIGGERS.includes(fields[4]) ? fields[4] : 'CONTROLLED',
                ping: LORE_PINGS.includes(fields[5]) ? fields[5] : 'NO',
                persistance: LORE_PERSISTANCE.includes(fields[6]) ? fields[6] : 'ONCE'
            };

            if (this.editor.hexes[target]) {
                if (this.setSystemLore(target, loreData)) result.systemCount++;
                else result.skipped.push(raw);
                continue;
            }

            const planetMatch = planetTargets.get(target);
            if (planetMatch) {
                if (this.addPlanetLore(planetMatch.hexLabel, planetMatch.planetIndex, loreData)) result.planetCount++;
                else result.skipped.push(raw);
                continue;
            }

            result.skipped.push(raw);
        }

        if (this.editor && this.editor.loreOverlay) {
            this.editor.loreOverlay.refresh();
        }

        return result;
    }

    /**
     * Import lore data for hexes
     */
    importLore(loreData) {
        if (!loreData || typeof loreData !== 'object') {
            console.warn('Invalid lore data for import');
            return false;
        }
        
        let importedCount = 0;
        
        for (const [hexLabel, hexLore] of Object.entries(loreData)) {
            const hex = this.editor.hexes[hexLabel];
            if (!hex) {
                console.warn(`Hex ${hexLabel} not found during import`);
                continue;
            }
            
            if (hexLore.systemLore && this.validateLoreData(hexLore.systemLore)) {
                hex.systemLore = { ...hexLore.systemLore };
            }
            
            if (hexLore.planetLore && typeof hexLore.planetLore === 'object') {
                hex.planetLore = {};
                Object.entries(hexLore.planetLore).forEach(([idx, lore]) => {
                    if (lore && this.validateLoreData(lore)) {
                        hex.planetLore[idx] = { ...lore };
                    }
                });
            }

            importedCount++;
        }
        
        // Refresh lore overlay if it exists and is active
        if (this.editor && this.editor.loreOverlay) {
            this.editor.loreOverlay.refresh();
        }
        
        return importedCount;
    }
}

// Export convenience functions
export function createLoreManager(editor) {
    return new LoreManager(editor);
}

export const LORE_RECEIVERS = ['CURRENT', 'ADJACENT', 'ALL', 'GM', 'CARDS', 'WINNER', 'LOSER'];
export const LORE_TRIGGERS = ['CONTROLLED', 'ACTIVATED', 'MOVED', 'SPACE_BATTLE', 'GROUND_BATTLE'];
export const LORE_PINGS = ['YES', 'NO'];
export const LORE_PERSISTANCE = ['ONCE', 'ALWAYS', 'ONCE_PER_PLAYER'];

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
    GROUND_BATTLE: 'A ground battle was fought here'
};

export const LORE_PERSISTANCE_LABELS = {
    ONCE: 'Once',
    ALWAYS: 'Every time',
    ONCE_PER_PLAYER: 'Once per player'
};