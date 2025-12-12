/**
 * Token Categories - Smart categorization of tokens from tokens.json
 * Filters and groups tokens based on their properties
 */

/**
 * Category definitions with filters
 */
const CATEGORY_DEFINITIONS = {
    attachments: {
        label: "Planet Attachments",
        icon: "📎",
        filter: (token) => token.isAttachment === true,
        subcategories: {
            legendary: { 
                label: "Legendary", 
                filter: (token) => token.isLegendary === true,
                className: "legendary-attachment"
            },
            techSpeciality: { 
                label: "Tech Specialties", 
                filter: (token) => token.addsTechSpeciality === true,
                className: "tech-attachment"
            },
            resources: { 
                label: "Resource Modifiers", 
                filter: (token) => token.modifiesResources === true && !token.modifiesInfluence,
                className: "resource-attachment"
            },
            influence: { 
                label: "Influence Modifiers", 
                filter: (token) => token.modifiesInfluence === true && !token.modifiesResources,
                className: "influence-attachment"
            },
            mixed: { 
                label: "Mixed Modifiers", 
                filter: (token) => token.modifiesResources === true && token.modifiesInfluence === true,
                className: "mixed-attachment"
            },
            other: { 
                label: "Other", 
                filter: (token) => true,
                className: "other-attachment"
            }
        }
    },
    
    anomalies: {
        label: "Anomalies & Hazards",
        icon: "🌊",
        filter: (token) => token.isAnomaly === true,
        subcategories: {
            rifts: { label: "Rifts", filter: (token) => token.isRift === true },
            nebulas: { label: "Nebulas", filter: (token) => token.isNebula === true },
            novas: { label: "Supernovas", filter: (token) => token.isNova === true },
            scars: { label: "Gravity Rifts", filter: (token) => token.isScar === true },
            asteroids: { label: "Asteroid Fields", filter: (token) => token.isAsteroids === true },
            other: { label: "Other", filter: (token) => true }
        }
    },
    
    planets: {
        label: "Planet Tokens",
        icon: "🪐",
        filter: (token) => (token.spaceOrPlanet === "planet" || token.isPlanet === true) && !token.id.includes('custodian') && !token.isAttachment,
        subcategories: {
            special: { label: "Special Planets", filter: (token) => token.tokenPlanetName !== undefined },
            relics: { label: "Relics", filter: (token) => token.id.includes('relic') || token.id.includes('fragment') },
            structures: { label: "Structures", filter: (token) => token.id.includes('sleeper') || token.id.includes('dmz') || token.id.includes('core') },
            other: { label: "Other", filter: (token) => true }
        }
    },
    
    custodians: {
        label: "Custodian Tokens",
        icon: "👑",
        filter: (token) => token.id.includes('custodian') || token.id.includes('cust'),
        subcategories: {
            planet: { label: "Planet Custodians", filter: (token) => token.spaceOrPlanet === "planet" },
            space: { label: "Space Custodians", filter: (token) => token.spaceOrPlanet === "space" },
            other: { label: "Other", filter: (token) => true }
        }
    },
    
    space: {
        label: "Space Tokens",
        icon: "🚀",
        filter: (token) => token.spaceOrPlanet === "space" && !token.isAnomaly && !token.wormholes && !token.id.includes('custodian'),
        subcategories: {
            frontier: { label: "Frontier", filter: (token) => token.id.includes('frontier') },
            breach: { label: "Breach/Ingress", filter: (token) => token.id.includes('breach') || token.id.includes('ingress') },
            special: { label: "Special", filter: (token) => token.source === "ascendant_sun" || token.source === "thunders_edge" || token.source === "ds" },
            other: { label: "Other", filter: (token) => true }
        }
    },
    
    special: {
        label: "Special Tokens",
        icon: "⭐",
        filter: (token) => token.id.includes('speaker') || 
                          token.id.includes('tyrant') ||
                          token.id.includes('glory') ||
                          token.id.includes('consulate') ||
                          token.id.includes('freepeople') ||
                          token.id.includes('raccoon'),
        subcategories: {
            all: { label: "All Special", filter: (token) => true }
        }
    }
};

/**
 * Categorize tokens from tokens.json data
 * @param {Array} tokensData - The tokens.json data (array of arrays)
 * @returns {Object} Categorized tokens
 */
export function categorizeTokens(tokensData) {
    console.log('Categorizing tokens...');
    
    // Flatten the nested array structure and filter out wormhole tokens
    const allTokens = tokensData.flat().filter(token => {
        // Exclude wormhole tokens (keep them separate)
        if (token.wormholes && token.wormholes.length > 0) {
            return false;
        }
        return true;
    });
    
    console.log(`Total tokens after filtering wormholes: ${allTokens.length}`);
    
    const categorized = {};
    
    // Process each category
    Object.entries(CATEGORY_DEFINITIONS).forEach(([categoryKey, categoryDef]) => {
        const categoryTokens = allTokens.filter(categoryDef.filter);
        
        categorized[categoryKey] = {
            label: categoryDef.label,
            icon: categoryDef.icon,
            tokens: categoryTokens,
            subcategories: {}
        };
        
        // Process subcategories
        if (categoryDef.subcategories) {
            Object.entries(categoryDef.subcategories).forEach(([subKey, subDef]) => {
                const subTokens = categoryTokens.filter(subDef.filter);
                categorized[categoryKey].subcategories[subKey] = {
                    label: subDef.label,
                    tokens: subTokens
                };
            });
        }
        
        console.log(`Category ${categoryKey}: ${categoryTokens.length} tokens`);
    });
    
    return categorized;
}

/**
 * Get all available categories
 */
export function getCategories() {
    return Object.keys(CATEGORY_DEFINITIONS).map(key => ({
        key,
        label: CATEGORY_DEFINITIONS[key].label,
        icon: CATEGORY_DEFINITIONS[key].icon
    }));
}

/**
 * Get token by ID from categorized data
 */
export function findTokenById(categorizedTokens, tokenId) {
    for (const category of Object.values(categorizedTokens)) {
        const token = category.tokens.find(t => t.id === tokenId);
        if (token) return token;
    }
    return null;
}
