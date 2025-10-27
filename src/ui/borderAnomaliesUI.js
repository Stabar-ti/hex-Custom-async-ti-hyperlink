import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { toggleBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { showPopup, hidePopup } from './popupUI.js';
import { loadBorderAnomalyTypes, getEnabledBorderAnomalyTypes, updateBorderAnomalyStyle, updateBorderAnomalyBidirectional } from '../constants/borderAnomalies.js';

export function installBorderAnomaliesUI(editor) {
    async function showBorderAnomaliesPopup() {
        if (document.getElementById('borderAnomaliesPopup')) return;

        // Load border anomaly types
        await loadBorderAnomalyTypes();
        const allBorderTypes = await import('../constants/borderAnomalies.js').then(m => m.getBorderAnomalyTypes());
        const borderTypes = getEnabledBorderAnomalyTypes();
        
        console.log('All border types:', Object.keys(allBorderTypes));
        console.log('Enabled border types:', Object.keys(borderTypes));
        console.log('Disabled border types:', Object.keys(allBorderTypes).filter(id => !borderTypes[id]));

        // Build content
        const content = document.createElement('div');
        
        // Tool label
        const label = document.createElement('div');
        label.textContent = "Border Anomaly Tools:";
        label.classList.add('popup-tool-label');
        content.appendChild(label);

        // Instructions
        const instructions = document.createElement('div');
        instructions.textContent = "1. Select a border anomaly type below  2. Click two adjacent hexes to place";
        instructions.style.fontSize = '0.85em';
        instructions.style.color = '#666';
        instructions.style.marginTop = '4px';
        instructions.style.fontStyle = 'italic';
        content.appendChild(instructions);

        // Tool buttons for enabled anomaly types
        const btnRow = document.createElement('div');
        btnRow.style.margin = '8px 0 0 0';
        btnRow.style.display = 'flex';
        btnRow.style.flexWrap = 'wrap';
        btnRow.style.gap = '4px';

        function toolBtn(text, anomalyId, title, bidirectional, drawStyle, isScripted = false) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'mode-button border-anomaly-tool-btn';
            btn.title = title;
            btn.style.margin = '0';
            btn.style.minWidth = '90px';
            btn.style.position = 'relative';
            btn.style.padding = '10px 12px 16px 12px';
            btn.style.borderRadius = '6px';
            btn.style.fontSize = '0.85em';
            btn.style.transition = 'all 0.2s ease';
            btn.style.cursor = 'pointer';
            
            // Add scripted indicator
            if (isScripted) {
                btn.style.border = '2px solid #4CAF50';
                btn.style.boxShadow = '0 0 4px rgba(76, 175, 80, 0.3)';
            } else {
                btn.style.border = '2px solid #FF9800';
                btn.style.boxShadow = '0 0 4px rgba(255, 152, 0, 0.3)';
            }
            
            // Add visual style indicator
            if (drawStyle) {
                // Create a visual border line sample
                const styleLine = document.createElement('div');
                styleLine.style.position = 'absolute';
                styleLine.style.bottom = '2px';
                styleLine.style.left = '50%';
                styleLine.style.transform = 'translateX(-50%)';
                styleLine.style.width = '60%';
                styleLine.style.height = `${Math.min(drawStyle.width, 4)}px`;
                styleLine.style.backgroundColor = drawStyle.color;
                styleLine.style.borderRadius = '1px';
                
                // Apply pattern styles
                if (drawStyle.pattern === 'dashed') {
                    styleLine.style.background = `repeating-linear-gradient(to right, ${drawStyle.color} 0px, ${drawStyle.color} 4px, transparent 4px, transparent 8px)`;
                } else if (drawStyle.pattern === 'dotted') {
                    styleLine.style.background = `repeating-linear-gradient(to right, ${drawStyle.color} 0px, ${drawStyle.color} 2px, transparent 2px, transparent 5px)`;
                }
                
                btn.appendChild(styleLine);
                
                // Add subtle border color hint and background tint
                btn.style.borderLeft = `4px solid ${drawStyle.color}`;
                btn.style.backgroundColor = `${drawStyle.color}15`; // 15 = ~8% opacity
                
                // Add hover effects
                btn.addEventListener('mouseenter', () => {
                    btn.style.backgroundColor = `${drawStyle.color}25`; // 25 = ~15% opacity
                    btn.style.transform = 'translateY(-1px)';
                    btn.style.boxShadow = `0 4px 8px ${drawStyle.color}40`;
                });
                
                btn.addEventListener('mouseleave', () => {
                    if (!btn.classList.contains('active')) {
                        btn.style.backgroundColor = `${drawStyle.color}15`;
                        btn.style.transform = 'translateY(0)';
                        btn.style.boxShadow = 'none';
                    }
                });
                
                // Add bidirectional indicator
                if (bidirectional) {
                    const bidirIcon = document.createElement('span');
                    bidirIcon.textContent = '↔';
                    bidirIcon.style.fontSize = '0.8em';
                    bidirIcon.style.color = drawStyle.color;
                    bidirIcon.style.marginLeft = '4px';
                    bidirIcon.title = 'Bidirectional (both sides)';
                    btn.appendChild(bidirIcon);
                } else {
                    const unidirIcon = document.createElement('span');
                    unidirIcon.textContent = '→';
                    unidirIcon.style.fontSize = '0.8em';
                    unidirIcon.style.color = drawStyle.color;
                    unidirIcon.style.marginLeft = '4px';
                    unidirIcon.title = 'Unidirectional (one side only)';
                    btn.appendChild(unidirIcon);
                }
            }
            
            btn.onclick = () => {
                // Clear active state from all border anomaly buttons (in both sections)
                Array.from(content.querySelectorAll('.border-anomaly-tool-btn')).forEach(b => {
                    b.classList.remove('active');
                    if (b.style.borderLeft) {
                        const color = b.style.borderLeft.match(/rgb\([^)]+\)|#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/)?.[0] || '#ccc';
                        b.style.backgroundColor = `${color}15`;
                        b.style.transform = 'translateY(0)';
                        b.style.boxShadow = 'none';
                    }
                });
                btn.classList.add('active');
                if (drawStyle) {
                    btn.style.backgroundColor = `${drawStyle.color}40`; // More opaque when active
                    btn.style.transform = 'translateY(-1px)';
                    btn.style.boxShadow = `0 4px 12px ${drawStyle.color}60`;
                }
                editor.setMode(bidirectional ? 'border-anomaly-double' : 'border-anomaly-single');
                editor._selectedAnomalyType = anomalyId;
                if (editor._pendingBorderAnomaly) {
                    editor.hexes[editor._pendingBorderAnomaly]?.polygon?.classList.remove('selected');
                }
                editor._pendingBorderAnomaly = null;
            };
            return btn;
        }
        
        // Legend (moved above scripted section)
        const legend = document.createElement('div');
        legend.style.marginTop = '8px';
        legend.style.marginBottom = '8px';
        legend.style.fontSize = '0.8em';
        legend.style.color = '#888';
        legend.innerHTML = `
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                <span>↔ Bidirectional</span>
                <span>→ Unidirectional</span>
            </div>
        `;
        content.appendChild(legend);

        // Create enhanced remove button (moved here so it can be added to scripted section)
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '🗑️ Remove All';
        removeBtn.className = 'mode-button border-anomaly-tool-btn remove-btn';
        removeBtn.title = 'Remove all border anomalies from selected hex';
        removeBtn.style.margin = '0';
        removeBtn.style.minWidth = '110px';
        removeBtn.style.backgroundColor = '#ff4444';
        removeBtn.style.color = 'white';
        removeBtn.style.border = '2px solid #cc0000';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.style.padding = '10px 12px';
        removeBtn.style.borderRadius = '6px';
        removeBtn.style.fontSize = '0.85em';
        removeBtn.style.transition = 'all 0.2s ease';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        
        // Add hover effects for remove button
        removeBtn.addEventListener('mouseenter', () => {
            removeBtn.style.backgroundColor = '#ff2222';
            removeBtn.style.transform = 'translateY(-1px)';
            removeBtn.style.boxShadow = '0 4px 8px rgba(255, 68, 68, 0.4)';
        });
        
        removeBtn.addEventListener('mouseleave', () => {
            if (!removeBtn.classList.contains('active')) {
                removeBtn.style.backgroundColor = '#ff4444';
                removeBtn.style.transform = 'translateY(0)';
                removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            }
        });
        removeBtn.onclick = () => {
            // Clear active state from all border anomaly buttons (in both sections)
            Array.from(content.querySelectorAll('.border-anomaly-tool-btn')).forEach(b => {
                b.classList.remove('active');
                // Reset other buttons
                if (b !== removeBtn && b.style.borderLeft) {
                    const color = b.style.borderLeft.match(/rgb\([^)]+\)|#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/)?.[0] || '#ccc';
                    b.style.backgroundColor = `${color}15`;
                    b.style.transform = 'translateY(0)';
                    b.style.boxShadow = 'none';
                }
            });
            removeBtn.classList.add('active');
            removeBtn.style.backgroundColor = '#cc0000';
            removeBtn.style.transform = 'translateY(-1px)';
            removeBtn.style.boxShadow = '0 4px 12px rgba(255, 68, 68, 0.6)';
            
            editor.setMode('border-anomaly-remove');
            editor._selectedAnomalyType = 'REMOVE';
            if (editor._pendingBorderAnomaly) {
                editor.hexes[editor._pendingBorderAnomaly]?.polygon?.classList.remove('selected');
            }
            editor._pendingBorderAnomaly = null;
        };

        // Scripted border anomalies section
        const scriptedLabel = document.createElement('div');
        scriptedLabel.textContent = "Scripted:";
        scriptedLabel.style.fontWeight = 'bold';
        scriptedLabel.style.marginTop = '4px';
        scriptedLabel.style.marginBottom = '4px';
        scriptedLabel.style.color = '#4CAF50';
        scriptedLabel.style.fontSize = '0.9em';
        content.appendChild(scriptedLabel);

        const scriptedRow = document.createElement('div');
        // Use a two-part flex row: left = scripted buttons (wrap), right = remove button
        scriptedRow.style.display = 'flex';
        scriptedRow.style.flexWrap = 'nowrap';
        scriptedRow.style.gap = '8px';
        scriptedRow.style.marginBottom = '12px';
        scriptedRow.style.alignItems = 'center';

        // Container for scripted buttons (allows wrapping inside the left area)
        const scriptedBtnContainer = document.createElement('div');
        scriptedBtnContainer.style.display = 'flex';
        scriptedBtnContainer.style.flexWrap = 'wrap';
        scriptedBtnContainer.style.gap = '4px';
        scriptedBtnContainer.style.flex = '1 1 auto';

        // Add scripted border anomaly types (Gravity Wave and Spatial Tear)
        const scriptedTypes = ['GRAVITYWAVE', 'SPATIALTEAR'];
        Object.values(borderTypes).forEach(type => {
            if (scriptedTypes.includes(type.id)) {
                console.log(`Creating scripted button for ${type.name} (enabled: ${type.enabled})`);
                scriptedBtnContainer.appendChild(toolBtn(
                    type.name,
                    type.id,
                    `${type.name} ${type.bidirectional ? '(both ways)' : '(one way)'}\nColor: ${type.drawStyle.color} | Width: ${type.drawStyle.width}px | Pattern: ${type.drawStyle.pattern}\n[SCRIPTED - Has game mechanics]`,
                    type.bidirectional,
                    type.drawStyle,
                    true
                ));
            }
        });

        // Ensure remove button sits on the right side of the scripted row
        removeBtn.style.marginLeft = '12px';
        removeBtn.style.marginRight = '0';
        removeBtn.style.flex = '0 0 auto';

        scriptedRow.appendChild(scriptedBtnContainer);
        scriptedRow.appendChild(removeBtn);

        content.appendChild(scriptedRow);

        // Not scripted border anomalies section
        const notScriptedLabel = document.createElement('div');
        notScriptedLabel.textContent = "Not Scripted:";
        notScriptedLabel.style.fontWeight = 'bold';
        notScriptedLabel.style.marginBottom = '4px';
        notScriptedLabel.style.color = '#FF9800';
        notScriptedLabel.style.fontSize = '0.9em';
        content.appendChild(notScriptedLabel);

        // Add buttons for non-scripted border anomaly types
        Object.values(borderTypes).forEach(type => {
            if (!scriptedTypes.includes(type.id)) {
                console.log(`Creating non-scripted button for ${type.name} (enabled: ${type.enabled})`);
                btnRow.appendChild(toolBtn(
                    type.name, 
                    type.id, 
                    `${type.name} ${type.bidirectional ? '(both ways)' : '(one way)'}\nColor: ${type.drawStyle.color} | Width: ${type.drawStyle.width}px | Pattern: ${type.drawStyle.pattern}\n[NOT SCRIPTED - Visual only]`,
                    type.bidirectional,
                    type.drawStyle,
                    false
                ));
            }
        });
        
        // Remove button is now created above and added to scripted section
        
        content.appendChild(btnRow);
        
        // Add border anomaly settings button at the bottom
        const settingsSection = document.createElement('div');
        settingsSection.style.marginTop = '16px';
        settingsSection.style.paddingTop = '12px';
        settingsSection.style.borderTop = '1px solid #444';
        
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'mode-button';
        settingsBtn.textContent = '⚙️ Border Settings';
        settingsBtn.title = 'Configure Border Anomaly Types - Enable/disable types, customize colors and patterns';
        settingsBtn.style.width = '100%';
        settingsBtn.style.height = '36px';
        settingsBtn.style.fontSize = '0.9em';
        settingsBtn.style.padding = '8px 12px';
        settingsBtn.style.backgroundColor = '#2c3e50';
        settingsBtn.style.color = '#ecf0f1';
        settingsBtn.style.border = '1px solid #34495e';
        settingsBtn.style.borderRadius = '4px';
        settingsBtn.style.cursor = 'pointer';
        settingsBtn.style.transition = 'all 0.2s ease';
        
        settingsBtn.addEventListener('mouseenter', () => {
            settingsBtn.style.backgroundColor = '#34495e';
            settingsBtn.style.transform = 'translateY(-1px)';
            settingsBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        });
        
        settingsBtn.addEventListener('mouseleave', () => {
            settingsBtn.style.backgroundColor = '#2c3e50';
            settingsBtn.style.transform = 'translateY(0)';
            settingsBtn.style.boxShadow = 'none';
        });
        
        settingsBtn.onclick = () => {
            // Open the border anomaly settings popup
            if (typeof window.showBorderAnomalySettings === 'function') {
                window.showBorderAnomalySettings();
            } else {
                // Fallback: import and call the function
                import('./borderAnomaliesUI.js').then(module => {
                    if (module && typeof window.showBorderAnomalySettings === 'function') {
                        window.showBorderAnomalySettings();
                    }
                }).catch(err => {
                    console.warn('Could not load border anomaly settings:', err);
                    alert('Border anomaly settings are not available yet. Feature coming soon!');
                });
            }
        };
        
        settingsSection.appendChild(settingsBtn);
        content.appendChild(settingsSection);
        


        showPopup({
            id: 'borderAnomaliesPopup',
            className: 'popup-ui border-anomalies-popup', // Add popup-ui for transparency
            title: 'Border Anomalies',
            content,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                left: '520px',
                top: '80px',
                minWidth: '340px',
                maxWidth: '800px',
                minHeight: '200px',
                maxHeight: '800px',
                // background intentionally omitted to allow .popup-ui CSS to apply transparency
                // color intentionally omitted to allow .popup-ui CSS to apply
                border: '2px solid #ffe066',
                boxShadow: '0 8px 40px #000a',
                padding: '18px 0 18px 0'
            },
            showHelp: true,
            onHelp: () => {
                showPopup({
                    id: 'borderAnomaliesHelpPopup',
                    className: 'popup-ui popup-ui-info',
                    title: 'Border Anomaly Tools Help',
                    content:
                        "<b>How to place border anomalies</b>:<br>" +
                        "1. Click a primary hex, then click a neighboring hex to select the edge.<br>" +
                        "2. Choose a type from the lists below. Icons indicate direction: ↔ Bidirectional (both sides), → Unidirectional (one side).<br>" +
                        "3. <b>Scripted</b> types (Gravity Wave, Spatial Tear) apply game mechanics; <b>Not Scripted</b> types are visual only.<br>" +
                        "4. To remove anomalies: click the <b>🗑️ Remove All</b> button (to the right of Scripted) then click the hex to clear anomalies.<br>" +
                        "5. Use <b>⚙️ Border Settings</b> (at bottom) to enable/disable anomaly types and customize their appearance.<br>" +
                        "<i>Tip:</i> The active type is highlighted. Switch modes using the buttons; cancel selection by choosing Remove All or another tool.",
                    draggable: true,
                    dragHandleSelector: '.popup-ui-titlebar',
                    scalable: true,
                    rememberPosition: true,
                    style: {
                        // background intentionally omitted
                        // color intentionally omitted
                        border: '2px solid #2ecc40',
                        borderRadius: '10px',
                        boxShadow: '0 8px 40px #000a',
                        minWidth: '340px',
                        maxWidth: '800px',
                        minHeight: '200px',
                        maxHeight: '800px',
                        padding: '24px'
                    }
                });
            }
        });
    }

    // --- Error popup utility using popupUI ---
    function showErrorPopup(message) {
        showPopup({
            id: 'borderAnomaliesErrorPopup',
            title: 'Error',
            content: `<div style="margin-bottom:14px;font-size:1.1em;color:#ff9800;">${message}</div>`,
            actions: [
                {
                    label: 'OK',
                    action: (btn) => hidePopup('borderAnomaliesErrorPopup')
                }
            ],
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                //    background: '#222',
                color: '#fff',
                border: '2px solid #ff9800',
                borderRadius: '12px',
                boxShadow: '0 8px 40px #000a',
                minWidth: '320px',
                maxWidth: '600px',
                minHeight: '120px',
                maxHeight: '400px',
                padding: '24px'
            }
        });
    }

    // Setup UI after DOM is ready - removed old button launcher
    // The Border Anomalies button is now in the sector controls popup

    // --- CLICK LOGIC MIRRORING CUSTOM LINKS ---
    const oldClickHandler = editor._onHexClick;

    editor._onHexClick = function (e, label) {
        // Add border anomaly (bidirectional)
        if (this.mode === 'border-anomaly-double') {
            if (!this._pendingBorderAnomaly) {
                this._pendingBorderAnomaly = label;
                this.hexes[label].polygon.classList.add('selected');
            } else if (this._pendingBorderAnomaly && this._pendingBorderAnomaly !== label) {
                const primary = this._pendingBorderAnomaly, secondary = label;
                const anomalyTypeId = this._selectedAnomalyType || 'SPATIALTEAR';
                
                editor.beginUndoGroup();
                editor.saveState(primary);
                editor.saveState(secondary);
                const side = getSideBetween(this.hexes, primary, secondary);
                if (side === undefined) {
                    hidePopup('borderAnomaliesErrorPopup');
                    showErrorPopup('Tiles are not neighbors!');
                    this.hexes[primary].polygon.classList.remove('selected');
                    this._pendingBorderAnomaly = null;
                    return;
                }
                
                // Get anomaly name from type ID
                const borderTypes = getEnabledBorderAnomalyTypes();
                const anomalyName = borderTypes[anomalyTypeId]?.name || anomalyTypeId;
                
                if (!this.hexes[primary].borderAnomalies) this.hexes[primary].borderAnomalies = {};
                if (!this.hexes[secondary].borderAnomalies) this.hexes[secondary].borderAnomalies = {};
                this.hexes[primary].borderAnomalies[side] = { type: anomalyName };
                this.hexes[secondary].borderAnomalies[getOppositeSide(side)] = { type: anomalyName };
                editor.commitUndoGroup();
                this.hexes[primary].polygon.classList.remove('selected');
                this._pendingBorderAnomaly = null;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Add border anomaly (unidirectional)
        if (this.mode === 'border-anomaly-single') {
            if (!this._pendingBorderAnomaly) {
                this._pendingBorderAnomaly = label;
                this.hexes[label].polygon.classList.add('selected');
            } else if (this._pendingBorderAnomaly && this._pendingBorderAnomaly !== label) {
                const primary = this._pendingBorderAnomaly, secondary = label;
                const anomalyTypeId = this._selectedAnomalyType || 'GRAVITYWAVE';
                
                editor.saveState(primary);
                const side = getSideBetween(this.hexes, primary, secondary);
                if (side === undefined) {
                    hidePopup('borderAnomaliesErrorPopup');
                    showErrorPopup('Tiles are not neighbors!');
                    this.hexes[primary].polygon.classList.remove('selected');
                    this._pendingBorderAnomaly = null;
                    return;
                }
                
                // Get anomaly name from type ID
                const borderTypes = getEnabledBorderAnomalyTypes();
                const anomalyName = borderTypes[anomalyTypeId]?.name || anomalyTypeId;
                
                if (!this.hexes[primary].borderAnomalies) this.hexes[primary].borderAnomalies = {};
                this.hexes[primary].borderAnomalies[side] = { type: anomalyName };
                this.hexes[primary].polygon.classList.remove('selected');
                this._pendingBorderAnomaly = null;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Remove all border anomalies from a tile
        if (this.mode === 'border-anomaly-remove') {
            const hex = this.hexes[label];
            if (hex.borderAnomalies) {
                editor.saveState(label);
                for (const [side, anomaly] of Object.entries(hex.borderAnomalies)) {
                    // Check if this anomaly type is bidirectional
                    const borderTypes = getEnabledBorderAnomalyTypes();
                    const anomalyTypeId = anomaly.type.toUpperCase().replace(/\s+/g, '');
                    const anomalyConfig = borderTypes[anomalyTypeId];
                    
                    if (anomalyConfig && anomalyConfig.bidirectional) {
                        const neighbor = getNeighborHex(this.hexes, label, side);
                        if (neighbor && neighbor.borderAnomalies) {
                            delete neighbor.borderAnomalies[getOppositeSide(side)];
                            if (Object.keys(neighbor.borderAnomalies).length === 0)
                                delete neighbor.borderAnomalies;
                        }
                    }
                }
                delete hex.borderAnomalies;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Fallback
        if (typeof oldClickHandler === "function") oldClickHandler.call(this, e, label);
    };

    function getSideBetween(hexes, a, b) {
        const dq = hexes[b].q - hexes[a].q;
        const dr = hexes[b].r - hexes[a].r;
        for (let i = 0; i < 6; ++i) {
            const dir = [
                { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
            ][i];
            if (dir.q === dq && dir.r === dr) return i;
        }
        return undefined;
    }
    function getNeighborHex(hexes, label, side) {
        const hex = hexes[label];
        if (!hex) return null;
        const { q, r } = hex;
        const dirs = [
            { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
            { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
        ];
        const nq = q + dirs[side].q, nr = r + dirs[side].r;
        for (const h of Object.values(hexes)) if (h.q === nq && h.r === nr) return h;
        return null;
    }
    function getOppositeSide(side) { return (parseInt(side, 10) + 3) % 6; }

    // Redraw after map (re)generation
    const oldGenerateMap = editor.generateMap;
    editor.generateMap = function () {
        oldGenerateMap.call(this);
        drawBorderAnomaliesLayer(this);
        let layer = this.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', this.showBorderAnomalies ? 'visible' : 'hidden');
        const btn = document.getElementById('toggleBorderAnomalies');
        if (btn) btn.classList.toggle('active', this.showBorderAnomalies);
    };

    editor.redrawBorderAnomaliesOverlay = () => {
        drawBorderAnomaliesLayer(editor);
        let layer = editor.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', editor.showBorderAnomalies ? 'visible' : 'hidden');
        const btn = document.getElementById('toggleBorderAnomalies');
        if (btn) btn.classList.toggle('active', editor.showBorderAnomalies);
    };

    // Border anomaly settings popup
    async function showBorderAnomalySettings() {
        // Load all border anomaly types
        await loadBorderAnomalyTypes();
        const allTypes = await import('../constants/borderAnomalies.js').then(m => m.getBorderAnomalyTypes());
        
        const content = document.createElement('div');
        
        const intro = document.createElement('p');
        intro.textContent = 'Configure visual appearance of border anomaly types. To enable/disable types, edit borderAnomalySettings in toggleSettings.js:';
        intro.style.margin = '0 0 16px 0';
        content.appendChild(intro);
        
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        // Table header
        const headerRow = document.createElement('tr');
        ['Type', 'Color', 'Width', 'Pattern', 'Bidirectional', 'Actions'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.padding = '8px';
            th.style.borderBottom = '1px solid #ccc';
            th.style.textAlign = 'left';
            th.style.fontSize = '0.9em';
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
        
        // Type rows - only show enabled types
        Object.values(allTypes).filter(type => type.enabled).forEach(type => {
            const row = document.createElement('tr');
            
            // Type name
            const nameCell = document.createElement('td');
            nameCell.style.padding = '4px 8px';
            nameCell.style.fontSize = '0.9em';
            nameCell.textContent = type.name;
            
            // Color picker
            const colorCell = document.createElement('td');
            colorCell.style.padding = '4px 8px';
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = type.drawStyle.color;
            colorInput.style.width = '30px';
            colorInput.style.height = '25px';
            colorInput.onchange = () => {
                updateBorderAnomalyStyle(type.id, { color: colorInput.value });
                type.drawStyle.color = colorInput.value; // Update local copy
            };
            colorCell.appendChild(colorInput);
            
            // Width selector
            const widthCell = document.createElement('td');
            widthCell.style.padding = '4px 8px';
            const widthSelect = document.createElement('select');
            widthSelect.style.width = '50px';
            [1,2,3,4,5,6,7,8].forEach(w => {
                const option = document.createElement('option');
                option.value = w;
                option.textContent = w + 'px';
                option.selected = w === type.drawStyle.width;
                widthSelect.appendChild(option);
            });
            widthSelect.onchange = () => {
                updateBorderAnomalyStyle(type.id, { width: parseInt(widthSelect.value) });
                type.drawStyle.width = parseInt(widthSelect.value);
            };
            widthCell.appendChild(widthSelect);
            
            // Pattern selector
            const patternCell = document.createElement('td');
            patternCell.style.padding = '4px 8px';
            const patternSelect = document.createElement('select');
            patternSelect.style.width = '70px';
            ['solid', 'dashed', 'dotted'].forEach(p => {
                const option = document.createElement('option');
                option.value = p;
                option.textContent = p;
                option.selected = p === type.drawStyle.pattern;
                patternSelect.appendChild(option);
            });
            patternSelect.onchange = () => {
                updateBorderAnomalyStyle(type.id, { pattern: patternSelect.value });
                type.drawStyle.pattern = patternSelect.value;
            };
            patternCell.appendChild(patternSelect);
            
            // Bidirectional toggle
            const bidirCell = document.createElement('td');
            bidirCell.style.padding = '4px 8px';
            const bidirCheckbox = document.createElement('input');
            bidirCheckbox.type = 'checkbox';
            bidirCheckbox.checked = type.bidirectional;
            bidirCheckbox.onchange = () => {
                updateBorderAnomalyBidirectional(type.id, bidirCheckbox.checked);
                type.bidirectional = bidirCheckbox.checked;
            };
            bidirCell.appendChild(bidirCheckbox);
            
            // Actions
            const actionsCell = document.createElement('td');
            actionsCell.style.padding = '4px 8px';
            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset';
            resetBtn.style.fontSize = '0.8em';
            resetBtn.style.padding = '2px 6px';
            resetBtn.title = 'Reset to default values';
            resetBtn.onclick = async () => {
                // Reset to defaults and refresh popup
                localStorage.removeItem('borderAnomalySettings');
                // Force reload from JSON by clearing cache
                const borderModule = await import('../constants/borderAnomalies.js');
                if (borderModule.clearCache) borderModule.clearCache();
                hidePopup('borderAnomalySettingsPopup');
                setTimeout(() => showBorderAnomalySettings(), 100);
            };
            actionsCell.appendChild(resetBtn);
            
            row.appendChild(nameCell);
            row.appendChild(colorCell);
            row.appendChild(widthCell);
            row.appendChild(patternCell);
            row.appendChild(bidirCell);
            row.appendChild(actionsCell);
            
            table.appendChild(row);
        });
        
        content.appendChild(table);
        
        showPopup({
            id: 'borderAnomalySettingsPopup',
            className: 'popup-ui',
            title: 'Border Anomaly Settings',
            content,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                left: '300px',
                top: '100px',
                minWidth: '500px',
                maxWidth: '800px',
                minHeight: '300px',
                maxHeight: '600px',
                border: '2px solid #4CAF50',
                boxShadow: '0 8px 40px #000a',
                padding: '20px'
            },
            actions: [
                {
                    label: 'Close',
                    action: () => hidePopup('borderAnomalySettingsPopup')
                }
            ]
        });
    }

    // Expose popup functions globally for sector controls
    window.showBorderAnomaliesPopup = showBorderAnomaliesPopup;
    window.showBorderAnomalySettings = showBorderAnomalySettings;
}
