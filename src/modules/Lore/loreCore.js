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

        hex.systemLore = { ...loreData };
        console.log(`Set system lore for hex ${hexLabel}`);
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

        // Initialize planet lore array if not exists
        if (!hex.planetLore) {
            hex.planetLore = [];
        }

        // Ensure array is large enough
        while (hex.planetLore.length <= planetIndex) {
            hex.planetLore.push(null);
        }

        hex.planetLore[planetIndex] = { ...loreData };
        console.log(`Set planet lore for hex ${hexLabel}, planet ${planetIndex}`);
        return true;
    }

    /**
     * Get planet lore for a hex and planet index
     */
    getPlanetLore(hexLabel, planetIndex) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.planetLore || planetIndex >= hex.planetLore.length) {
            return null;
        }
        return hex.planetLore[planetIndex];
    }

    /**
     * Get all planet lore for a hex
     */
    getAllPlanetLore(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        return hex?.planetLore || [];
    }

    /**
     * Remove system lore from a hex
     */
    removeSystemLore(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return false;
        
        hex.systemLore = null;
        console.log(`Removed system lore from hex ${hexLabel}`);
        return true;
    }

    /**
     * Remove planet lore from a hex
     */
    removePlanetLore(hexLabel, planetIndex) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.planetLore || planetIndex >= hex.planetLore.length) {
            return false;
        }
        
        hex.planetLore[planetIndex] = null;
        console.log(`Removed planet lore from hex ${hexLabel}, planet ${planetIndex}`);
        return true;
    }

    /**
     * Validate lore data structure
     */
    validateLoreData(loreData) {
        if (!loreData || typeof loreData !== 'object') return false;
        
        const validReceivers = ['CURRENT', 'ADJACENT', 'ALL', 'GM'];
        const validTriggers = ['CONTROLLED', 'ACTIVATED', 'MOVED'];
        const validPings = ['YES', 'NO'];
        const validPersistance = ['ONCE', 'ALWAYS'];
        
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
            const hasPlanetLore = hex.planetLore && hex.planetLore.some(lore => lore !== null);
            
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
            if (hex.systemLore || (hex.planetLore && hex.planetLore.length > 0)) {
                hex.systemLore = null;
                hex.planetLore = [];
                clearedCount++;
            }
        }
        
        console.log(`Cleared lore from ${clearedCount} hexes`);
        return clearedCount;
    }

    /**
     * Export lore data for all hexes
     */
    exportLore() {
        const loreData = {};
        
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            if (hex.systemLore || (hex.planetLore && hex.planetLore.some(lore => lore !== null))) {
                loreData[label] = {};
                
                if (hex.systemLore) {
                    loreData[label].systemLore = hex.systemLore;
                }
                
                if (hex.planetLore && hex.planetLore.some(lore => lore !== null)) {
                    loreData[label].planetLore = hex.planetLore;
                }
            }
        }
        
        return loreData;
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
            
            if (hexLore.planetLore && Array.isArray(hexLore.planetLore)) {
                hex.planetLore = hexLore.planetLore.map(lore => 
                    lore && this.validateLoreData(lore) ? { ...lore } : null
                );
            }
            
            importedCount++;
        }
        
        console.log(`Imported lore data for ${importedCount} hexes`);
        
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

export const LORE_RECEIVERS = ['CURRENT', 'ADJACENT', 'ALL', 'GM'];
export const LORE_TRIGGERS = ['CONTROLLED', 'ACTIVATED', 'MOVED'];
export const LORE_PINGS = ['YES', 'NO'];
export const LORE_PERSISTANCE = ['ONCE', 'ALWAYS'];