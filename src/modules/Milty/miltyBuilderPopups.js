// MiltyBuilder Popup Functions
// Contains help, output copy, and draft values analysis popups
// 
// UI creation and form management functions have been moved to miltyBuilderUI.js
// for better separation of concerns. This module now focuses on popup content
// and business logic while delegating UI element creation to the UI module.

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

    // Import UI helpers from the UI module
    import('./miltyBuilderUI.js').then(uiModule => {
        const { createOutputDisplayContainer, createCopyToClipboardAction } = uiModule;

        // Create container for the popup content using UI helper
        const container = createOutputDisplayContainer({ outputString, completedSlots, totalSlices });

        // Help function for the popup
        function outputHelpFunction() {
            showMiltyHelp();
        }

        // Copy to clipboard action using UI helper
        const copyAction = createCopyToClipboardAction(outputString);

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
    }).catch(error => {
        console.error('Failed to load UI helpers:', error);
        alert('Failed to load UI components for output popup.');
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
    // Import UI helpers and render using them
    import('./miltyBuilderUI.js').then(uiModule => {
        const {
            createDraftValuesAnalysisContainer,
            createStyledTableRow,
            formatTileLabelsForDisplay
        } = uiModule;

        // Create the analysis container and table structure
        const analysisData = createDraftValuesAnalysisContainer();

        // Clear and replace container content
        container.innerHTML = '';
        container.appendChild(analysisData.container);

        if (!analysisData.hasData) {
            return; // No data to analyze
        }

        const { tbody, slotPositions } = analysisData;

        // Import constants for formatting
        import('../../constants/constants.js').then(constants => {
            const { wormholeTypes, planetTypeColors, techSpecialtyColors } = constants;

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
                const tilesBlock = formatTileLabelsForDisplay(sliceHexLabels);
                const slotHeader = `<b>Slot ${slotNum}</b>`;
                const idealRI = c > 0 ? `${a}/${b}+${c}` : `${a}/${b}`;

                // Only show rows for slots that have some content
                if (realIdCount > 0 || planetCount > 0) {
                    // Add main row using UI helper
                    const mainRowCells = [
                        `<span style="color: #4CAF50; font-weight: bold;">${slotHeader}</span>`,
                        `${planetCount} ${typeHtml}`,
                        techHtml || '-',
                        `${res}/${inf}<br><span style="font-size:0.88em;color:#aaa;">${idealRI}</span>`,
                        `<div style="min-width:80px;">${wormholeHtml || '-'}</div>`,
                        `<span style="color:${statusColor};font-weight:600;">${statusHtml}</span>`
                    ];

                    const mainRow = createStyledTableRow(mainRowCells, slotNum % 2 === 0);
                    tbody.appendChild(mainRow);

                    // Add tile labels row if we have systems
                    if (tilesBlock) {
                        const tileRowCells = [tilesBlock];
                        const tileRow = createStyledTableRow(tileRowCells, slotNum % 2 === 0);

                        // Set colspan for the single cell to span all columns
                        const tileCell = tileRow.querySelector('td');
                        if (tileCell) {
                            tileCell.setAttribute('colspan', '6');
                            tileCell.style.cssText += 'padding: 2px 8px 7px 8px; font-size: 0.85em; color: #888;';
                        }

                        tbody.appendChild(tileRow);
                    }
                }
            }
        }).catch(error => {
            console.error('Failed to load constants for draft values analysis:', error);
        });
    }).catch(error => {
        console.error('Failed to load UI helpers for draft values analysis:', error);
        // Fallback: show error message
        container.innerHTML = '';
        const errorMsg = document.createElement('p');
        errorMsg.textContent = 'Failed to load analysis components. Please try again.';
        errorMsg.style.color = '#ff6b6b';
        container.appendChild(errorMsg);
    });
}

// Show import slices popup
export function showImportSlicesPopup() {
    window.showImportSlicesPopup = showImportSlicesPopup;

    // Import UI helpers from the UI module
    import('./miltyBuilderUI.js').then(uiModule => {
        const {
            createStyledTextarea,
            createStyledButton,
            createStyledCheckbox,
            createPreviewContainer,
            updateSliceImportPreview,
            handleSliceImport
        } = uiModule;

        // Create container for the popup content
        const container = document.createElement('div');
        container.style.padding = '15px';

        // Create header
        const header = document.createElement('h3');
        header.style.marginTop = '0';
        header.style.color = '#ffe066';
        header.textContent = 'Import Draft Slices';
        container.appendChild(header);

        // Create description
        const description = document.createElement('p');
        description.style.marginBottom = '15px';
        description.style.color = '#ccc';
        description.style.fontSize = '14px';
        description.innerHTML = `
            Paste slice data in either format:<br>
            • Semicolon-separated: <code>28,48,50,60,34;30,20,49,78,72;...</code><br>
            • Line-separated (one slice per line)
        `;
        container.appendChild(description);

        // Create textarea section
        const textareaSection = document.createElement('div');
        textareaSection.style.marginBottom = '15px';

        const textareaLabel = document.createElement('label');
        textareaLabel.style.display = 'block';
        textareaLabel.style.marginBottom = '5px';
        textareaLabel.style.fontWeight = 'bold';
        textareaLabel.style.color = '#ddd';
        textareaLabel.textContent = 'Slice Data:';
        textareaSection.appendChild(textareaLabel);

        const textarea = createStyledTextarea('importSlicesTextarea',
            `Paste your slice data here...

Example:
28,48,50,60,34
30,20,49,78,72
35,27,46,21,40`);
        textareaSection.appendChild(textarea);
        container.appendChild(textareaSection);

        // Create checkbox section
        const checkboxSection = document.createElement('div');
        checkboxSection.style.marginBottom = '15px';
        const { label: checkboxLabel, checkbox } = createStyledCheckbox('clearExistingSlices', 'Clear existing draft slices before import', true);
        checkboxSection.appendChild(checkboxLabel);
        container.appendChild(checkboxSection);

        // Create button section
        const buttonSection = document.createElement('div');
        buttonSection.style.textAlign = 'center';
        buttonSection.style.marginBottom = '15px';
        const importButton = createStyledButton('Import Slices');
        importButton.id = 'importSlicesButton';
        buttonSection.appendChild(importButton);
        container.appendChild(buttonSection);

        // Create preview container
        const preview = createPreviewContainer('importPreview');
        container.appendChild(preview);

        // Add real-time preview
        textarea.addEventListener('input', () => {
            updateSliceImportPreview(textarea, preview);
        });

        // Add import button event listener
        importButton.addEventListener('click', () => {
            const slicesData = textarea.value.trim();
            const clearExisting = checkbox.checked;

            // Disable button during import
            importButton.disabled = true;
            importButton.textContent = 'Importing...';
            importButton.style.background = '#6c757d';

            // Handle the import process
            handleSliceImport(slicesData, clearExisting,
                (msg) => console.log('Import status:', msg),
                (success) => {
                    if (!success) {
                        // Re-enable button on failure
                        importButton.disabled = false;
                        importButton.textContent = 'Import Slices';
                        importButton.style.background = '#28a745';
                    }
                }
            );
        });

        // Import action (kept for compatibility, but now just triggers the button)
        const importAction = {
            text: 'Import Slices',
            handler: () => {
                importButton.click();
            }
        };

        // Help function for the popup
        function importHelpFunction() {
            const helpHTML = `
                <div style="max-height: 60vh; overflow-y: auto; padding: 10px;">
                    <h2 style="color: #ffe066; margin-top: 0;">Import Draft Slices Help</h2>
                    
                    <h3 style="color: #4CAF50;">Supported Formats</h3>
                    <p><strong>Format 1 - Semicolon Separated:</strong></p>
                    <code style="background: #2a2a2a; padding: 8px; display: block; margin: 8px 0;">28,48,50,60,34;30,20,49,78,72;35,27,46,21,40</code>
                    
                    <p><strong>Format 2 - Line Separated:</strong></p>
                    <code style="background: #2a2a2a; padding: 8px; display: block; margin: 8px 0;">28,48,50,60,34<br>30,20,49,78,72<br>35,27,46,21,40</code>
                    
                    <h3 style="color: #4CAF50;">Requirements</h3>
                    <ul>
                        <li>Each slice must contain exactly 5 realID numbers</li>
                        <li>Numbers must be comma-separated</li>
                        <li>Maximum 12 slices (draft slots 1-12)</li>
                        <li>realIDs must be valid system tile numbers</li>
                    </ul>
                    
                    <h3 style="color: #4CAF50;">Import Process</h3>
                    <ul>
                        <li>Slices are imported to draft slots 1, 2, 3, etc. in order</li>
                        <li>Each slice replaces systems in positions 1-5 of the draft slot</li>
                        <li>Position 0 (home system) is not affected</li>
                        <li>Existing systems are cleared before import (if option selected)</li>
                    </ul>
                </div>
            `;

            showPopup({
                content: helpHTML,
                actions: [],
                title: 'Import Draft Slices Help',
                id: 'milty-import-help-popup',
                draggable: true,
                dragHandleSelector: '.popup-ui-titlebar',
                scalable: true,
                rememberPosition: true,
                showHelp: false,
                style: {
                    width: '600px',
                    maxWidth: '90vw',
                    maxHeight: '80vh'
                }
            });
        }

        // Show the popup using PopupUI
        const popup = showPopup({
            content: container,
            actions: [importAction],
            title: 'Import Draft Slices',
            id: 'milty-import-popup',
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            showHelp: true,
            onHelp: importHelpFunction,
            style: {
                width: '500px',
                maxWidth: '90vw',
                maxHeight: '85vh'
            }
        });

        return popup;
    }).catch(error => {
        console.error('Failed to load UI helpers:', error);
        alert('Failed to load UI components for import popup.');
    });
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
