// Sanity Check Feature
// Checks for duplicate realIDs on the map with configurable rules

/**
 * Check for duplicate realIDs on the map
 * @param {boolean} planetsOnly - If true, only check hexes with planets
 * @param {boolean} checkAll - If true, check all realIDs regardless of content
 * @returns {Object} - Analysis results with duplicates and summary
 */
export function checkRealIdUniqueness(planetsOnly = true, checkAll = false) {
    if (!window.editor?.hexes) {
        return {
            success: false,
            error: "No hex editor or hexes available",
            duplicates: [],
            totalChecked: 0,
            uniqueCount: 0
        };
    }

    const hexes = window.editor.hexes;
    const realIdMap = new Map(); // realId -> array of hex labels
    const duplicates = [];
    let totalChecked = 0;

    // Collect all realIDs based on the filter criteria
    for (const [hexLabel, hex] of Object.entries(hexes)) {
        if (!hex.realId) continue;

        // Apply filtering rules
        if (planetsOnly && (!hex.planets || hex.planets.length === 0)) {
            continue; // Skip hexes without planets when planetsOnly is enabled
        }

        if (!checkAll && !planetsOnly) {
            // Default behavior: skip if no specific rule is set
            continue;
        }

        totalChecked++;

        if (!realIdMap.has(hex.realId)) {
            realIdMap.set(hex.realId, []);
        }
        realIdMap.get(hex.realId).push(hexLabel);
    }

    // Find duplicates
    for (const [realId, hexLabels] of realIdMap.entries()) {
        if (hexLabels.length > 1) {
            duplicates.push({
                realId: realId,
                hexLabels: hexLabels,
                count: hexLabels.length,
                hexDetails: hexLabels.map(label => {
                    const hex = hexes[label];
                    return {
                        label: label,
                        hasRealId: !!hex.realId,
                        hasPlanets: hex.planets && hex.planets.length > 0,
                        planetCount: hex.planets ? hex.planets.length : 0,
                        planetNames: hex.planets ? hex.planets.map(p => p.name).join(', ') : 'None'
                    };
                })
            });
        }
    }

    const uniqueCount = realIdMap.size - duplicates.length;

    return {
        success: true,
        duplicates: duplicates,
        totalChecked: totalChecked,
        uniqueCount: uniqueCount,
        duplicateCount: duplicates.length,
        totalRealIds: realIdMap.size
    };
}

/**
 * Generate a human-readable summary of the sanity check results
 * @param {Object} results - Results from checkRealIdUniqueness
 * @param {boolean} planetsOnly - Whether planets-only mode was used
 * @param {boolean} checkAll - Whether check-all mode was used
 * @returns {string} - HTML formatted summary
 */
export function generateSanityCheckSummary(results, planetsOnly, checkAll) {
    if (!results.success) {
        return `<p style="color: #dc3545;">Error: ${results.error}</p>`;
    }

    let modeDescription = '';
    if (planetsOnly) {
        modeDescription = 'Checking only hexes with planets';
    } else if (checkAll) {
        modeDescription = 'Checking all hexes with realIDs';
    } else {
        modeDescription = 'No check mode selected';
    }

    let summary = `<div style="margin-bottom: 15px;">
        <p><strong>Mode:</strong> ${modeDescription}</p>
        <p><strong>Total hexes checked:</strong> ${results.totalChecked}</p>
        <p><strong>Unique realIDs:</strong> ${results.uniqueCount}</p>
        <p><strong>Duplicate realIDs found:</strong> ${results.duplicateCount}</p>
    </div>`;

    if (results.duplicates.length === 0) {
        summary += `<p style="color: #28a745; font-weight: bold;">✓ All realIDs are unique!</p>`;
    } else {
        summary += `<div style="color: #dc3545;">
            <p style="font-weight: bold;">⚠ Found ${results.duplicates.length} duplicate realID(s):</p>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; padding: 10px; background: #2a2a2a;">`;

        results.duplicates.forEach((duplicate, index) => {
            summary += `<div style="margin-bottom: 15px; ${index > 0 ? 'border-top: 1px solid #555; padding-top: 10px;' : ''}">
                <p style="font-weight: bold; color: #ffe066;">RealID: ${duplicate.realId} (appears ${duplicate.count} times)</p>
                <ul style="margin: 5px 0; padding-left: 20px;">`;

            duplicate.hexDetails.forEach(hex => {
                const planetInfo = hex.hasPlanets ?
                    ` - ${hex.planetCount} planet(s): ${hex.planetNames}` :
                    ' - No planets';
                summary += `<li style="margin: 2px 0;">Hex ${hex.label}${planetInfo}</li>`;
            });

            summary += `</ul></div>`;
        });

        summary += `</div></div>`;
    }

    return summary;
}
