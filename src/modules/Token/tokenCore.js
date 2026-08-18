/**
 * Token Module Core - Token management and data loading
 * Handles CRUD operations for system and planet tokens
 */

import { categorizeTokens, findTokenById } from './tokenCategories.js';

// tokenSemantics.json is built by .github/workflows/sync-asyncti4.yml. It is optional:
// a checkout from before that step existed (or a fork that has never run the sync) simply
// has no file, and the picker then falls back to ids with no hints. Never let it throw.
const EMPTY_SEMANTICS = { tokens: {}, attachments: {} };

/**
 * Fields the semantics bundle contributes to a token/attachment record.
 * Kept in one place so tokens and attachments are enriched identically.
 */
function enrich(entry, semantics) {
    const info = semantics?.[entry.id];
    if (!info) return entry;
    return {
        ...entry,
        displayName: info.displayName,
        effects: info.effects || [],
        effectText: info.text || null,
        effectTextSource: info.textSource || null,
        botCodeRefs: info.botCodeRefs || null,
        hasData: info.hasData === true
    };
}

export class TokenManager {
    constructor(editor) {
        this.editor = editor;
        this.tokenData = null;           // Raw token data from tokens.json
        this.attachmentData = null;      // Raw attachment data from attachments.json
        this.semantics = EMPTY_SEMANTICS; // Effects/card text/bot-code refs from tokenSemantics.json
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
            const [tokensResponse, attachmentsResponse, semanticsResponse] = await Promise.all([
                fetch('./public/data/tokens.json'),
                fetch('./public/data/attachments.json'),
                fetch('./public/data/tokenSemantics.json').catch(() => null)
            ]);

            if (!tokensResponse.ok) {
                throw new Error(`Failed to load tokens.json: ${tokensResponse.status}`);
            }
            if (!attachmentsResponse.ok) {
                throw new Error(`Failed to load attachments.json: ${attachmentsResponse.status}`);
            }

            this.tokenData = await tokensResponse.json();
            this.attachmentData = await attachmentsResponse.json();

            // Optional bundle - the picker degrades to plain ids when it is absent.
            this.semantics = EMPTY_SEMANTICS;
            if (semanticsResponse?.ok) {
                try {
                    const parsed = await semanticsResponse.json();
                    this.semantics = { tokens: parsed.tokens || {}, attachments: parsed.attachments || {} };
                } catch (e) {
                    console.warn('tokenSemantics.json is unreadable, continuing without it:', e);
                }
            } else {
                console.warn('tokenSemantics.json not found - token hints and tooltips will be limited');
            }

            console.log('Tokens loaded:', this.tokenData.flat().length, 'total tokens');
            console.log('Attachments loaded:', this.attachmentData.flat().length, 'total attachments');

            // Mark attachments as planet-only and add properties
            const processedAttachments = this.attachmentData.flat().map(att => enrich({
                ...att,
                isPlanet: true,
                isAttachment: true,
                spaceOrPlanet: 'planet',
                // Classify attachment type based on properties
                modifiesResources: att.resourcesModifier !== undefined,
                modifiesInfluence: att.influenceModifier !== undefined,
                addsTechSpeciality: att.techSpeciality !== undefined,
                isLegendary: att.isLegendary === true
            }, this.semantics.attachments));

            const processedTokens = this.tokenData.flat().map(tok => enrich(tok, this.semantics.tokens));

            // Merge tokens and attachments for categorization
            const mergedData = [processedTokens, processedAttachments];
            
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

        this.editor.saveState(hexLabel);
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

        this.editor.saveState(hexLabel);
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

        this.editor.saveState(hexLabel);
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

        this.editor.saveState(hexLabel);
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
     * Semantics for a token or attachment id, or null when the bundle is missing.
     */
    getTokenSemantics(tokenId) {
        return this.semantics?.tokens?.[tokenId] || this.semantics?.attachments?.[tokenId] || null;
    }

    /**
     * Get categorized tokens for UI display
     */
    getCategorizedTokens() {
        return this.categorizedTokens;
    }
}

/**
 * The one tooltip formatter, shared by the picker cards (tokenUI.js) and the placed-token
 * overlay (tokenOverlay.js) so the two never drift apart.
 *
 * @param {object|null} tokenInfo  merged token/attachment record (already enriched)
 * @param {string} tokenId         fallback when tokenInfo is missing
 * @param {object} [opts]          { type: 'system'|'planet'|..., planetName }
 */
export function buildTokenTooltip(tokenInfo, tokenId, opts = {}) {
    const { type, planetName } = opts;
    const lines = [];

    let heading = tokenInfo?.displayName || tokenInfo?.name || tokenId;
    if (type) heading += ` (${type})`;
    if (planetName) heading += ` - ${planetName}`;
    lines.push(heading);

    if (!tokenInfo) return lines.join('\n');

    lines.push(`Source: ${tokenInfo.source || 'unknown'}`);

    const effects = tokenInfo.effects || [];
    if (effects.length) {
        lines.push('---');
        effects.forEach(effect => lines.push(`• ${effect}`));
    }

    if (tokenInfo.effectText) {
        lines.push('---');
        lines.push(tokenInfo.effectText);
    }

    // Deliberately worded as "referenced", not "automated": the build step counts the id
    // as a quoted Java string literal in the bot source, which cannot prove automation.
    const refs = tokenInfo.botCodeRefs;
    if (refs && typeof refs.count === 'number') {
        lines.push('---');
        lines.push(refs.count > 0
            ? `⚙ Referenced in bot code (${refs.count} place${refs.count === 1 ? '' : 's'})`
            : (tokenInfo.hasData
                ? '○ Not referenced by id in bot code'
                : '○ No effect data - likely cosmetic only'));
    }

    return lines.join('\n');
}

// Export convenience function
export function createTokenManager(editor) {
    return new TokenManager(editor);
}
