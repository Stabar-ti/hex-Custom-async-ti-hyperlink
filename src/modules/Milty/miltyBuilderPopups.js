// MiltyBuilder Popup Functions
// Contains help, output copy, and draft values analysis popups

import { showPopup } from '../../ui/popupUI.js';
import { wormholeTypes, planetTypeColors, techSpecialtyColors } from '../../constants/constants.js';

// Help function for tech display
function capitalizeTech(tech) {
    if (!tech) return '';
    const map = {
        CYBERNETIC: "Cybernetic",
        BIOTIC: "Biotic",
        WARFARE: "Warfare",
        PROPULSION: "Propulsion"
    };
    return map[tech.toUpperCase()] || (tech[0].toUpperCase() + tech.slice(1).toLowerCase());
}

// Generate output string from completed slices
function generateOutputString() {
    const slotPositions = {
        1: [836, 941, 837, 732, 942, 838],
        2: [624, 625, 521, 520, 626, 522],
        3: [724, 725, 621, 620, 622, 518],
        4: [617, 515, 514, 616, 412, 411],
        5: [510, 408, 509, 611, 407, 508],
        6: [813, 711, 812, 914, 710, 811],
        7: [936, 937, 833, 832, 938, 834],
        8: [1036, 1037, 933, 932, 934, 830],
        9: [1032, 1033, 929, 928, 930, 826],
        10: [1028, 926, 925, 1027, 823, 822],
        11: [1025, 923, 922, 1024, 820, 819],
        12: [817, 715, 826, 918, 714, 815]
    };

    const outputs = [];
    const completedSlots = [];

    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;

        const sliceIds = [];
        let allHaveIds = true;

        // Check positions 1-5 (skip homesystem at position 0)
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];

            if (hex && hex.realId) {
                sliceIds.push(hex.realId);
            } else {
                allHaveIds = false;
                break;
            }
        }

        if (allHaveIds && sliceIds.length === 5) {
            outputs.push(sliceIds.join(','));
            completedSlots.push(slotNum);
        }
    }

    return { outputString: outputs.join(';'), completedSlots, totalSlices: outputs.length };
}

// Show output copy popup with generated string and analysis
export function showOutputCopyPopup() {
    window.showOutputCopyPopup = showOutputCopyPopup;

    const { outputString, completedSlots, totalSlices } = generateOutputString();

    // Create container for the popup content
    const container = document.createElement('div');
    container.style.padding = '10px';

    if (totalSlices === 0) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = "No completed draft slices found. Each slice needs 5 systems with realId values.";
        noDataMsg.style.color = '#888';
        noDataMsg.style.fontStyle = 'italic';
        container.appendChild(noDataMsg);
    } else {
        // Header
        const header = document.createElement('h3');
        header.textContent = `Draft Output (${totalSlices} slice${totalSlices === 1 ? '' : 's'})`;
        header.style.marginTop = '0';
        header.style.color = '#ffe066';
        container.appendChild(header);

        // Slot positions for lookup
        const slotPositions = {
            1: [836, 941, 837, 732, 942, 838],
            2: [624, 625, 521, 520, 626, 522],
            3: [724, 725, 621, 620, 622, 518],
            4: [617, 515, 514, 616, 412, 411],
            5: [510, 408, 509, 611, 407, 508],
            6: [813, 711, 812, 914, 710, 811],
            7: [936, 937, 833, 832, 938, 834],
            8: [1036, 1037, 933, 932, 934, 830],
            9: [1032, 1033, 929, 928, 930, 826],
            10: [1028, 926, 925, 1027, 823, 822],
            11: [1025, 923, 922, 1024, 820, 819],
            12: [817, 715, 826, 918, 714, 815]
        };

        // Details section
        const detailsDiv = document.createElement('div');
        detailsDiv.style.marginBottom = '15px';
        detailsDiv.style.fontSize = '0.9em';
        detailsDiv.style.color = '#ccc';

        const sliceDetails = completedSlots.map(slotNum => {
            const slotHexes = slotPositions[slotNum];
            const realIds = [];

            // Get realIds from positions 1-5
            for (let i = 1; i < slotHexes.length; i++) {
                const hexId = slotHexes[i];
                const hex = window.editor?.hexes?.[hexId];
                if (hex && hex.realId) {
                    realIds.push(hex.realId);
                }
            }

            return `<strong>Slot ${slotNum}:</strong> ${realIds.join(', ')}`;
        }).join('<br>');

        detailsDiv.innerHTML = sliceDetails;
        container.appendChild(detailsDiv);

        // Output string textarea
        const outputLabel = document.createElement('label');
        outputLabel.textContent = 'Copy this string for draft:';
        outputLabel.style.display = 'block';
        outputLabel.style.marginBottom = '5px';
        outputLabel.style.fontWeight = 'bold';
        container.appendChild(outputLabel);

        const outputTextarea = document.createElement('textarea');
        outputTextarea.value = outputString;
        outputTextarea.style.width = '100%';
        outputTextarea.style.height = '80px';
        outputTextarea.style.fontFamily = 'monospace';
        outputTextarea.style.fontSize = '13px';
        outputTextarea.style.resize = 'vertical';
        outputTextarea.style.backgroundColor = '#2a2a2a';
        outputTextarea.style.color = '#fff';
        outputTextarea.style.border = '1px solid #444';
        outputTextarea.style.borderRadius = '4px';
        outputTextarea.style.padding = '8px';
        outputTextarea.readOnly = true;
        container.appendChild(outputTextarea);

        // Auto-select text when focused
        outputTextarea.addEventListener('focus', () => {
            outputTextarea.select();
        });

        // Instructions
        const instructions = document.createElement('p');
        instructions.innerHTML = '<strong>Instructions:</strong> Click the textarea above to select all text, then Ctrl+C to copy.';
        instructions.style.fontSize = '0.85em';
        instructions.style.color = '#999';
        instructions.style.marginTop = '10px';
        instructions.style.marginBottom = '0';
        container.appendChild(instructions);

        // Auto-focus and select the textarea
        setTimeout(() => {
            outputTextarea.focus();
            outputTextarea.select();
        }, 100);
    }

    // Help function for the popup
    function outputHelpFunction() {
        showMiltyHelp();
    }

    // Copy to clipboard action
    const copyAction = {
        text: 'Copy to Clipboard',
        handler: () => {
            if (totalSlices > 0) {
                navigator.clipboard.writeText(outputString).then(() => {
                    console.log('Output copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        }
    };

    // Show the popup using PopupUI
    const popup = showPopup({
        content: container,
        actions: totalSlices > 0 ? [copyAction] : [],
        title: 'Draft Output Copy',
        id: 'milty-output-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: outputHelpFunction,
        style: {
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh'
        }
    });
}

// Show draft values analysis popup
export function showDraftValuesPopup(forceRefresh = false) {
    window.showDraftValuesPopup = showDraftValuesPopup;

    // If popup already exists and not forceRefresh, just bring to front
    let popup = document.getElementById('milty-draft-values-popup');
    if (popup && !forceRefresh) {
        popup.style.zIndex = 10001;
        return popup;
    }
    // Remove old popup if forceRefresh
    if (popup && forceRefresh) {
        popup.remove();
    }

    // Create a container for the analysis
    const container = document.createElement('div');
    renderDraftValuesAnalysis(container);

    // Help function for the popup
    function draftValuesHelpFunction() {
        showMiltyHelp();
    }

    // Show the popup using PopupUI
    const popupObj = showPopup({
        content: container,
        actions: [],
        title: 'Calculate Draft Values',
        id: 'milty-draft-values-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: draftValuesHelpFunction,
        style: {
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh'
        }
    });
    return popupObj;
}

// Function to render draft values analysis
function renderDraftValuesAnalysis(container) {
    container.innerHTML = '';

    // Draft slot target positions (same as in showMiltyBuilderUI)
    const slotPositions = {
        1: [836, 941, 837, 732, 942, 838],
        2: [624, 625, 521, 520, 626, 522],
        3: [724, 725, 621, 620, 622, 518],
        4: [617, 515, 514, 616, 412, 411],
        5: [510, 408, 509, 611, 407, 508],
        6: [813, 711, 812, 914, 710, 811],
        7: [936, 937, 833, 832, 938, 834],
        8: [1036, 1037, 933, 932, 934, 830],
        9: [1032, 1033, 929, 928, 930, 826],
        10: [1028, 926, 925, 1027, 823, 822],
        11: [1025, 923, 922, 1024, 820, 819],
        12: [817, 715, 826, 918, 714, 815]
    };

    // Check if we have any draft slices with systems
    let hasData = false;
    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;

        // Check positions 1-5 (skip homesystem at position 0)
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex && (hex.realId || hex.planets?.length > 0)) {
                hasData = true;
                break;
            }
        }
        if (hasData) break;
    }

    if (!hasData) {
        const p = document.createElement('p');
        p.textContent = "No draft slices with systems found. Load MiltyBuilder.json and populate some draft slots first.";
        p.style.color = '#888';
        p.style.fontStyle = 'italic';
        container.appendChild(p);
        return;
    }

    // Table structure
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.98em';
    table.style.borderCollapse = 'collapse';
    table.style.border = '1px solid #444';
    table.style.borderRadius = '4px';
    table.innerHTML = `
        <thead>
            <tr style="background: #2196F3; color: white;">
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">Draft Slot</th>
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">Planets</th>
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">Techs</th>
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">R/I<br><span style="font-weight:400;">Ideal</span></th>
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">Wormholes</th>
                <th style="padding: 8px; border: 1px solid #444; text-align: left;">Status</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    // Analyze each draft slot
    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;

        // Analyze slice hexes (positions 1-5, skip homesystem at 0)
        const sliceHexes = [];
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex) {
                sliceHexes.push({ ...hex, label: hexId });
            }
        }

        let planetCount = 0, res = 0, inf = 0;
        let typeCounts = { INDUSTRIAL: 0, CULTURAL: 0, HAZARDOUS: 0 };
        let techs = new Set();
        let wormholes = new Set();
        let a = 0, b = 0, c = 0;
        let realIdCount = 0;

        sliceHexes.forEach(hex => {
            if (hex.realId) realIdCount++;
            if (!hex.planets || !Array.isArray(hex.planets)) return;

            planetCount += hex.planets.length;
            hex.planets.forEach(p => {
                res += p.resources || 0;
                inf += p.influence || 0;
                let pt = (p.planetType || (Array.isArray(p.planetTypes) && p.planetTypes[0]) || '').toUpperCase();
                if (pt && typeCounts[pt] !== undefined) typeCounts[pt]++;
                if (p.techSpecialty) techs.add(p.techSpecialty);
                if (Array.isArray(p.techSpecialties)) p.techSpecialties.forEach(t => techs.add(t));
                if (p.resources === p.influence) c += p.resources;
                else if (p.resources > p.influence) a += p.resources;
                else if (p.influence > p.resources) b += p.influence;
            });

            // Collect wormholes (no hopping between draft slices)
            if (hex.wormholes && hex.wormholes.size > 0) {
                hex.wormholes.forEach(w => wormholes.add(w));
            }
        });

        // Build color-coded breakdowns (same as calcSlice)
        const typeHtml = Object.entries(typeCounts)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) =>
                `<span style="color:${planetTypeColors[type] || 'inherit'};margin-right:2px;">${count}${type[0]}</span>`
            ).join('');

        const techHtml = Array.from(techs)
            .filter(Boolean)
            .map(t =>
                `<span style="color:${techSpecialtyColors[t.toUpperCase()] || 'inherit'};font-weight:600;margin-right:2px;">${capitalizeTech(t)[0]}</span>`
            ).join('');

        const wormholeHtml = Array.from(wormholes)
            .map(w => {
                const key = w.toLowerCase();
                const whType = wormholeTypes[key];
                const color = whType?.color || 'gray';
                const label = whType?.label ? whType.label[0] : key[0].toUpperCase();
                return `<span style="background:${color};color:white;font-weight:600;padding:1px 6px;border-radius:7px;margin-right:2px;display:inline-block;">${label}</span>`;
            }).join(' ');

        // Status indicator
        let statusHtml = '';
        let statusColor = '';
        if (realIdCount === 5) {
            statusHtml = 'Complete';
            statusColor = '#28a745';
        } else if (realIdCount > 0) {
            statusHtml = `${realIdCount}/5`;
            statusColor = '#fd7e14';
        } else {
            statusHtml = 'Empty';
            statusColor = '#6c757d';
        }

        const sliceHexLabels = sliceHexes.filter(h => h.realId).map(h => h.realId || h.label);

        // Compact tile labels display
        const tilesPerRow = Math.ceil(sliceHexLabels.length / 2);
        const tileRow1 = sliceHexLabels.slice(0, tilesPerRow).join(', ');
        const tileRow2 = sliceHexLabels.slice(tilesPerRow).join(', ');
        const tilesBlock = sliceHexLabels.length > 0 ? `
            <div style="font-size:0.85em;color:#888;line-height:1.1;margin-top:3px;">
                ${tileRow1 || ''}<br>${tileRow2 || ''}
            </div>
        ` : '';

        const slotHeader = `<b>Slot ${slotNum}</b>`;
        const idealRI = c > 0 ? `${a}/${b}+${c}` : `${a}/${b}`;

        // Only show rows for slots that have some content
        if (realIdCount > 0 || planetCount > 0) {
            // Add main row
            const row = document.createElement('tr');
            row.style.background = slotNum % 2 === 0 ? '#2a2a2a' : '#333';
            row.innerHTML = `
                <td style="padding: 6px 8px; border: 1px solid #444; color: #4CAF50; font-weight: bold;">${slotHeader}</td>
                <td style="padding: 6px 8px; border: 1px solid #444;">${planetCount} ${typeHtml}</td>
                <td style="padding: 6px 8px; border: 1px solid #444;">${techHtml || '-'}</td>
                <td style="padding: 6px 8px; border: 1px solid #444;">${res}/${inf}<br><span style="font-size:0.88em;color:#aaa;">${idealRI}</span></td>
                <td style="padding: 6px 8px; border: 1px solid #444; min-width:80px;">${wormholeHtml || '-'}</td>
                <td style="padding: 6px 8px; border: 1px solid #444;"><span style="color:${statusColor};font-weight:600;">${statusHtml}</span></td>
            `;
            tbody.appendChild(row);

            // Add tile labels row if we have systems
            if (tilesBlock) {
                const tileRow = document.createElement('tr');
                tileRow.style.background = slotNum % 2 === 0 ? '#2a2a2a' : '#333';
                tileRow.innerHTML = `
                    <td colspan="6" style="padding: 2px 8px 7px 8px; border: 1px solid #444; font-size: 0.85em; color: #888;">
                        ${tilesBlock}
                    </td>
                `;
                tbody.appendChild(tileRow);
            }
        }
    }

    container.appendChild(table);
}

// Help popup function - shows comprehensive help for Milty Slice Designer
export function showMiltyHelp() {
    const helpContent = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 15px; line-height: 1.5;">
            <h2 style="color: #ffe066; margin-top: 0;">Milty Slice Designer Help</h2>
            
            <h3 style="color: #4CAF50;">Overview</h3>
            <p>The Milty Slice Designer is a tool for creating, managing, and analyzing slices for Twilight Imperium 4th Edition draft formats. Work with both the standard map layout (slices A-F) and draft slots (1-12) for competitive play.</p>
            
            <h3 style="color: #4CAF50;">Getting Started</h3>
            <ol>
                <li><strong>Load MiltyBuilder.json Map</strong> - Loads the standard 6-player map layout</li>
                <li><strong>Show Slice Borders</strong> - Visual overlay showing slice boundaries (A-F)</li>
                <li><strong>Show Slice Numbers</strong> - Visual overlay showing draft slot positions (1-12)</li>
            </ol>
            
            <h3 style="color: #4CAF50;">Color Coding System</h3>
            <ul>
                <li><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px;">Green ✓</span> Complete slice (all 5 non-home systems filled with async tiles)</li>
                <li><span style="background: #fd7e14; color: white; padding: 2px 6px; border-radius: 3px;">Orange ◐</span> Mixed content (filled but not all async tiles)</li>
                <li><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px;">Red ◑</span> Partially filled</li>
                <li><span style="background: #f8f9fa; color: #212529; padding: 2px 6px; border-radius: 3px; border: 1px solid #ccc;">White/Gray</span> Empty</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Basic Workflow</h3>
            <ol>
                <li><strong>Select Source:</strong> Click any slice button (A-F or 1-12)
                    <ul><li>Button highlights with orange border</li></ul>
                </li>
                <li><strong>Select Destination:</strong> Click target slice button
                    <ul><li>Systems move from source to destination</li>
                    <li>Source is cleared (except home system for A-F slices)</li></ul>
                </li>
                <li><strong>Selection clears automatically</strong> after each move</li>
            </ol>
            
            <h3 style="color: #4CAF50;">Standard Map Slices (A-F)</h3>
            <ul>
                <li>Pre-loaded with default competitive slice layouts</li>
                <li>Home systems (position 0) never move or clear</li>
                <li>Only positions 1-5 (regular systems) are affected by moves</li>
                <li>Perfect for modifying the base competitive map</li>
            </ul>
            
            <h3 style="color: #2196F3;">Draft Slots (1-12)</h3>
            <ul>
                <li>Start empty and can be populated from A-F slices or other slots</li>
                <li>All 6 positions can be filled (including home system)</li>
                <li>Perfect for creating tournament draft pools</li>
                <li>Can store variations and alternatives</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Control Buttons</h3>
            <ul>
                <li><strong>Load MiltyBuilder.json Map:</strong> Loads standard 6-player layout</li>
                <li><strong>Show Slice Borders:</strong> Toggles colored slice boundary overlays</li>
                <li><strong>Show Slice Numbers:</strong> Toggles numbered draft position overlays</li>
                <li><strong>Refresh Occupancy:</strong> Updates color coding of all slice buttons</li>
                <li><strong>Calculate Draft Values:</strong> Opens detailed analysis of all draft slices</li>
                <li><strong>Output Copy:</strong> Generates formatted output for completed draft slices</li>
                <li><strong>Clear Selection:</strong> Cancels current selection</li>
            </ul>
            
            <h3 style="color: #2196F3;">Analysis Tools</h3>
            <p><strong>Calculate Draft Values</strong> provides detailed analysis:</p>
            <ul>
                <li>Planet counts and resource/influence totals</li>
                <li>Tech specialties (color-coded)</li>
                <li>Planet types (Industrial/Cultural/Hazardous)</li>
                <li>Wormhole types present</li>
                <li>Completion status indicators</li>
            </ul>
            
            <h3 style="color: #2196F3;">Output Generation</h3>
            <p><strong>Output Copy</strong> creates tournament-ready strings:</p>
            <ul>
                <li>Only includes completed slices (5 async tiles each)</li>
                <li>Format: realId,realId,realId,realId,realId;nextSlice...</li>
                <li>Copy-to-clipboard functionality</li>
                <li>Detailed breakdown of included slices</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Tips & Best Practices</h3>
            <ul>
                <li><strong>Use Color Coding:</strong> Let the color system guide your decisions</li>
                <li><strong>Check Values Frequently:</strong> Use "Calculate Draft Values" often</li>
                <li><strong>Work Incrementally:</strong> Make small changes and test</li>
                <li><strong>Save Variations:</strong> Use draft slots to store alternatives</li>
                <li><strong>Verify Completion:</strong> All draft slices should be green with ✓</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Troubleshooting</h3>
            <ul>
                <li><strong>Colors seem wrong:</strong> Use "Refresh Occupancy" button</li>
                <li><strong>Unsure of selection:</strong> Use "Clear Selection" button</li>
                <li><strong>Need to reset:</strong> Use "Load MiltyBuilder.json Map" to restore defaults</li>
                <li><strong>Performance issues:</strong> Disable visual overlays temporarily</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Quick Reference</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr style="background: #3a3a3a;">
                    <th style="border: 1px solid #666; padding: 8px; text-align: left;">Action</th>
                    <th style="border: 1px solid #666; padding: 8px; text-align: left;">Steps</th>
                </tr>
                <tr>
                    <td style="border: 1px solid #666; padding: 6px;">Move Slice</td>
                    <td style="border: 1px solid #666; padding: 6px;">1. Click source → 2. Click destination</td>
                </tr>
                <tr style="background: #2a2a2a;">
                    <td style="border: 1px solid #666; padding: 6px;">Check Status</td>
                    <td style="border: 1px solid #666; padding: 6px;">Use color coding or "Calculate Draft Values"</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #666; padding: 6px;">Reset Selection</td>
                    <td style="border: 1px solid #666; padding: 6px;">Click "Clear Selection"</td>
                </tr>
                <tr style="background: #2a2a2a;">
                    <td style="border: 1px solid #666; padding: 6px;">Generate Output</td>
                    <td style="border: 1px solid #666; padding: 6px;">Click "Output Copy" → Copy string</td>
                </tr>
            </table>
        </div>
    `;

    // Show the help popup
    showPopup({
        content: helpContent,
        actions: [],
        title: 'Milty Slice Designer Help',
        id: 'milty-help-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: false, // No help button on the help popup itself
        style: {
            width: '700px',
            maxWidth: '95vw',
            maxHeight: '85vh'
        }
    });
}
