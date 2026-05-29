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
                filter: (token) => !token.isLegendary && !token.addsTechSpeciality && !token.modifiesResources && !token.modifiesInfluence,
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
            other: { label: "Other", filter: (token) => !token.isRift && !token.isNebula && !token.isNova && !token.isScar && !token.isAsteroids }
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
            other: { 
                label: "Other", 
                filter: (token) => !token.tokenPlanetName && 
                                   !token.id.includes('relic') && !token.id.includes('fragment') && 
                                   !token.id.includes('sleeper') && !token.id.includes('dmz') && !token.id.includes('core')
            }
        }
    },
    
    custodians: {
        label: "Custodian Tokens",
        icon: "👑",
        filter: (token) => token.id.includes('custodian') || token.id.includes('cust'),
        subcategories: {
            planet: { label: "Planet Custodians", filter: (token) => token.spaceOrPlanet === "planet" },
            space: { label: "Space Custodians", filter: (token) => token.spaceOrPlanet === "space" },
            other: { label: "Other", filter: (token) => token.spaceOrPlanet !== "planet" && token.spaceOrPlanet !== "space" }
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
            other: { 
                label: "Other", 
                filter: (token) => !token.id.includes('frontier') && 
                                   !token.id.includes('breach') && !token.id.includes('ingress') && 
                                   token.source !== "ascendant_sun" && token.source !== "thunders_edge" && token.source !== "ds"
            }
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
    // Flatten and strip wormhole tokens (managed separately)
    const allTokens = tokensData.flat().filter(t => !(t.wormholes && t.wormholes.length > 0));

    const categorized = {};

    Object.entries(CATEGORY_DEFINITIONS).forEach(([categoryKey, categoryDef]) => {
        const categoryTokens = allTokens.filter(categoryDef.filter);

        categorized[categoryKey] = {
            label: categoryDef.label,
            icon: categoryDef.icon,
            tokens: categoryTokens,
            subcategories: {}
        };

        if (categoryDef.subcategories) {
            Object.entries(categoryDef.subcategories).forEach(([subKey, subDef]) => {
                categorized[categoryKey].subcategories[subKey] = {
                    label: subDef.label,
                    tokens: categoryTokens.filter(subDef.filter)
                };
            });
        }
    });

    // Collect tokens not matched by any defined category
    const categorizedIds = new Set(
        Object.values(categorized).flatMap(c => c.tokens.map(t => t.id))
    );
    const uncategorized = allTokens.filter(t => !categorizedIds.has(t.id));
    if (uncategorized.length > 0) {
        categorized['other'] = {
            label: 'Other',
            icon: '🎲',
            tokens: uncategorized,
            subcategories: {}
        };
    }

    return categorized;
}

/**
 * Get all available categories, optionally including dynamic ones from categorized data.
 * @param {Object} [categorized] - Result of categorizeTokens(); if provided, dynamic
 *   categories (e.g. "other") and per-category token counts are included.
 */
export function getCategories(categorized) {
    const base = Object.keys(CATEGORY_DEFINITIONS).map(key => ({
        key,
        label: CATEGORY_DEFINITIONS[key].label,
        icon: CATEGORY_DEFINITIONS[key].icon,
        count: categorized ? (categorized[key]?.tokens.length ?? 0) : null
    }));

    if (categorized && categorized.other) {
        base.push({ key: 'other', label: 'Other', icon: '🎲', count: categorized.other.tokens.length });
    }

    return base;
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
