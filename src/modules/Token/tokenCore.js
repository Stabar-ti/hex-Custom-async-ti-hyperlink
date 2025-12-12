/**
 * Token Module Core - Token management and data loading
 * Handles CRUD operations for system and planet tokens
 */

import { categorizeTokens, findTokenById } from './tokenCategories.js';

export class TokenManager {
    constructor(editor) {
        this.editor = editor;
        this.tokenData = null;           // Raw token data from tokens.json
        this.attachmentData = null;      // Raw attachment data from attachments.json
        this.categorizedTokens = null;   // Categorized and filtered tokens (includes attachments)
        this.initialized = false;
    }

    /**
     * Initialize token manager by loading tokens.json and attachments.json
     */
    async initialize() {
        if (this.initialized) {
            console.log('TokenManager already initialized');
            return true;
        }

        try {
            console.log('Loading tokens.json and attachments.json...');
            
            // Load both tokens and attachments in parallel
            const [tokensResponse, attachmentsResponse] = await Promise.all([
                fetch('./public/data/tokens.json'),
                fetch('./public/data/attachments.json')
            ]);
            
            if (!tokensResponse.ok) {
                throw new Error(`Failed to load tokens.json: ${tokensResponse.status}`);
            }
            if (!attachmentsResponse.ok) {
                throw new Error(`Failed to load attachments.json: ${attachmentsResponse.status}`);
            }
            
            this.tokenData = await tokensResponse.json();
            this.attachmentData = await attachmentsResponse.json();
            
            console.log('Tokens loaded:', this.tokenData.flat().length, 'total tokens');
            console.log('Attachments loaded:', this.attachmentData.flat().length, 'total attachments');
            
            // Mark attachments as planet-only and add properties
            const processedAttachments = this.attachmentData.flat().map(att => ({
                ...att,
                isPlanet: true,
                isAttachment: true,
                spaceOrPlanet: 'planet',
                // Classify attachment type based on properties
                modifiesResources: att.resourcesModifier !== undefined,
                modifiesInfluence: att.influenceModifier !== undefined,
                addsTechSpeciality: att.techSpeciality !== undefined,
                isLegendary: att.isLegendary === true,
                modifiesPlanetType: att.planetType !== undefined
            }));
            
            // Merge tokens and attachments for categorization
            const mergedData = [...this.tokenData, processedAttachments];
            
            // Categorize tokens (excluding wormholes)
            this.categorizedTokens = categorizeTokens(mergedData);
            
            this.initialized = true;
            console.log('TokenManager initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize TokenManager:', error);
            return false;
        }
    }

    /**
     * Add a token to a system (hex)
     */
    addSystemToken(hexLabel, tokenId) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.warn(`Hex ${hexLabel} not found`);
            return false;
        }

        // Initialize systemTokens array if not exists
        if (!hex.systemTokens) {
            hex.systemTokens = [];
        }

        // Check if token already exists
        if (hex.systemTokens.includes(tokenId)) {
            console.warn(`Token ${tokenId} already exists on system ${hexLabel}`);
            return false;
        }

        // Verify token exists
        const tokenInfo = this.getTokenInfo(tokenId);
        if (!tokenInfo) {
            console.warn(`Token ${tokenId} not found in token data`);
            return false;
        }

        hex.systemTokens.push(tokenId);
        console.log(`Added system token ${tokenId} to hex ${hexLabel}`);
        return true;
    }

    /**
     * Remove a token from a system
     */
    removeSystemToken(hexLabel, tokenId) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.systemTokens) {
            return false;
        }

        const index = hex.systemTokens.indexOf(tokenId);
        if (index === -1) {
            return false;
        }

        hex.systemTokens.splice(index, 1);
        console.log(`Removed system token ${tokenId} from hex ${hexLabel}`);
        return true;
    }

    /**
     * Add a token to a planet
     */
    addPlanetToken(hexLabel, planetIndex, tokenId) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.warn(`Hex ${hexLabel} not found`);
            return false;
        }

        // Verify planet exists
        if (!hex.planets || !hex.planets[planetIndex]) {
            console.warn(`Planet ${planetIndex} not found in hex ${hexLabel}`);
            return false;
        }

        // Initialize planetTokens object if not exists
        if (!hex.planetTokens) {
            hex.planetTokens = {};
        }

        // Initialize array for this planet if not exists
        if (!hex.planetTokens[planetIndex]) {
            hex.planetTokens[planetIndex] = [];
        }

        // Check if token already exists
        if (hex.planetTokens[planetIndex].includes(tokenId)) {
            console.warn(`Token ${tokenId} already exists on planet ${planetIndex} of hex ${hexLabel}`);
            return false;
        }

        // Verify token exists
        const tokenInfo = this.getTokenInfo(tokenId);
        if (!tokenInfo) {
            console.warn(`Token ${tokenId} not found in token data`);
            return false;
        }

        hex.planetTokens[planetIndex].push(tokenId);
        console.log(`Added planet token ${tokenId} to hex ${hexLabel}, planet ${planetIndex}`);
        return true;
    }

    /**
     * Remove a token from a planet
     */
    removePlanetToken(hexLabel, planetIndex, tokenId) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex || !hex.planetTokens || !hex.planetTokens[planetIndex]) {
            return false;
        }

        const index = hex.planetTokens[planetIndex].indexOf(tokenId);
        if (index === -1) {
            return false;
        }

        hex.planetTokens[planetIndex].splice(index, 1);
        
        // Clean up empty arrays
        if (hex.planetTokens[planetIndex].length === 0) {
            delete hex.planetTokens[planetIndex];
        }

        console.log(`Removed planet token ${tokenId} from hex ${hexLabel}, planet ${planetIndex}`);
        return true;
    }

    /**
     * Get all tokens for a hex (both system and planet)
     */
    getTokensForHex(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return null;

        return {
            system: hex.systemTokens || [],
            planets: hex.planetTokens || {}
        };
    }

    /**
     * Get token information by ID
     */
    getTokenInfo(tokenId) {
        if (!this.categorizedTokens) return null;
        return findTokenById(this.categorizedTokens, tokenId);
    }

    /**
     * Get all hexes with tokens
     */
    getHexesWithTokens() {
        const hexesWithTokens = [];
        
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            const hasSystemTokens = hex.systemTokens && hex.systemTokens.length > 0;
            const hasPlanetTokens = hex.planetTokens && Object.keys(hex.planetTokens).length > 0;
            
            if (hasSystemTokens || hasPlanetTokens) {
                hexesWithTokens.push({
                    label,
                    systemTokens: hex.systemTokens || [],
                    planetTokens: hex.planetTokens || {}
                });
            }
        }
        
        return hexesWithTokens;
    }

    /**
     * Clear all tokens from a hex
     */
    clearHexTokens(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return false;

        hex.systemTokens = [];
        hex.planetTokens = {};
        console.log(`Cleared all tokens from hex ${hexLabel}`);
        return true;
    }

    /**
     * Clear all tokens from the entire map
     */
    clearAllTokens() {
        let clearedCount = 0;
        
        for (const hex of Object.values(this.editor.hexes)) {
            const hadTokens = (hex.systemTokens && hex.systemTokens.length > 0) ||
                            (hex.planetTokens && Object.keys(hex.planetTokens).length > 0);
            
            if (hadTokens) {
                hex.systemTokens = [];
                hex.planetTokens = {};
                clearedCount++;
            }
        }
        
        console.log(`Cleared tokens from ${clearedCount} hexes`);
        return clearedCount;
    }

    /**
     * Export all token data
     */
    exportTokens() {
        const tokenData = {};
        
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            if ((hex.systemTokens && hex.systemTokens.length > 0) ||
                (hex.planetTokens && Object.keys(hex.planetTokens).length > 0)) {
                
                tokenData[label] = {
                    system: hex.systemTokens || [],
                    planets: hex.planetTokens || {}
                };
            }
        }
        
        return tokenData;
    }

    /**
     * Import token data
     */
    importTokens(tokenData) {
        if (!tokenData || typeof tokenData !== 'object') {
            console.warn('Invalid token data for import');
            return 0;
        }

        let importedCount = 0;
        
        for (const [hexLabel, hexTokens] of Object.entries(tokenData)) {
            const hex = this.editor.hexes[hexLabel];
            if (!hex) {
                console.warn(`Hex ${hexLabel} not found during import`);
                continue;
            }

            // Import system tokens
            if (hexTokens.system && Array.isArray(hexTokens.system)) {
                hex.systemTokens = [...hexTokens.system];
            }

            // Import planet tokens
            if (hexTokens.planets && typeof hexTokens.planets === 'object') {
                hex.planetTokens = {};
                for (const [planetIdx, tokens] of Object.entries(hexTokens.planets)) {
                    if (Array.isArray(tokens)) {
                        hex.planetTokens[planetIdx] = [...tokens];
                    }
                }
            }

            importedCount++;
        }

        console.log(`Imported tokens for ${importedCount} hexes`);
        
        // Refresh token overlay if it exists and is active
        if (this.editor && this.editor.tokenOverlay) {
            this.editor.tokenOverlay.refresh();
        }

        return importedCount;
    }

    /**
     * Get categorized tokens for UI display
     */
    getCategorizedTokens() {
        return this.categorizedTokens;
    }
}

// Export convenience function
export function createTokenManager(editor) {
    return new TokenManager(editor);
}
