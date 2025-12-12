/**
 * Token Module UI - User interface for token placement
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { getCategories } from './tokenCategories.js';

let tokenManager = null;
let currentHexLabel = null;
let currentCategory = 'anomalies';
let currentSubcategory = null;

export function installTokenUI(editor) {
    console.log('installTokenUI called with editor:', editor);
    tokenManager = window.tokenManager;
    
    if (!tokenManager) {
        console.error('TokenManager not found! Make sure it is initialized before installing Token UI');
        return;
    }
    
    // Add to global window for console access
    window.showTokenPopup = showTokenPopup;
    console.log('Token UI installed successfully');
}

/**
 * Show the token placement popup for a specific hex
 */
export function showTokenPopup(hexLabel) {
    console.log('showTokenPopup called for hex:', hexLabel);
    
    if (!tokenManager || !tokenManager.initialized) {
        alert('Token system not initialized. Please wait...');
        return;
    }
    
    const hex = tokenManager.editor.hexes[hexLabel];
    if (!hex) {
        alert(`Hex ${hexLabel} not found`);
        return;
    }
    
    if (document.getElementById('tokenPopup')) {
        console.log('Token popup already exists, closing and reopening');
        hidePopup('tokenPopup');
    }
    
    currentHexLabel = hexLabel;
    currentCategory = 'anomalies';
    
    const content = createTokenPopupContent(hex);
    
    showPopup({
        id: 'tokenPopup',
        className: 'popup-ui token-popup',
        title: `Token Placement - Hex: ${hexLabel}`,
        content,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            left: '350px',
            top: '100px',
            minWidth: '600px',
            maxWidth: '800px',
            minHeight: '400px',
            maxHeight: '700px',
            border: '2px solid #3498db',
            boxShadow: '0 8px 40px #000a',
            padding: '20px'
        },
        showHelp: true,
        onHelp: () => showTokenHelp()
    });
}

function createTokenPopupContent(hex) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '16px';
    
    // Hex selector section (for manual input)
    const hexSelector = createHexSelectorSection();
    container.appendChild(hexSelector);
    
    // Header with hex info
    const header = createHeaderSection(hex);
    container.appendChild(header);
    
    // Category tabs
    const tabs = createCategoryTabs();
    container.appendChild(tabs);
    
    // Token display area
    const tokenDisplay = createTokenDisplayArea();
    container.appendChild(tokenDisplay);
    
    // Currently placed tokens
    const placedTokens = createPlacedTokensSection(hex);
    container.appendChild(placedTokens);
    
    // Action buttons
    const actions = createActionButtons();
    container.appendChild(actions);
    
    return container;
}

function createHexSelectorSection() {
    const section = document.createElement('div');
    section.id = 'tokenHexSelectorSection';
    section.style.marginBottom = '0px';
    section.style.padding = '12px';
    section.style.border = '1px solid #555';
    section.style.borderRadius = '6px';
    section.style.backgroundColor = '#2c3e50';
    
    const label = document.createElement('label');
    label.innerHTML = '<strong>Change Hex:</strong>';
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.color = '#fff';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'tokenHexLabelInput';
    input.placeholder = 'Enter hex label (e.g., 001, 201)';
    input.style.width = '200px';
    input.style.padding = '6px';
    input.style.border = '1px solid #666';
    input.style.borderRadius = '4px';
    input.style.backgroundColor = '#34495e';
    input.style.color = '#fff';
    
    const selectBtn = document.createElement('button');
    selectBtn.id = 'tokenSelectHexBtn';
    selectBtn.textContent = 'Select';
    selectBtn.style.marginLeft = '8px';
    selectBtn.style.padding = '6px 12px';
    selectBtn.style.border = '1px solid #3498db';
    selectBtn.style.borderRadius = '4px';
    selectBtn.style.backgroundColor = '#3498db';
    selectBtn.style.color = '#fff';
    selectBtn.style.cursor = 'pointer';
    selectBtn.onclick = () => changeHexInTokenPopup(input.value.trim());
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'tokenHexStatus';
    statusDiv.style.marginTop = '8px';
    statusDiv.style.fontSize = '0.9em';
    statusDiv.style.color = '#ccc';
    
    section.appendChild(label);
    section.appendChild(input);
    section.appendChild(selectBtn);
    section.appendChild(statusDiv);
    
    return section;
}

function createHeaderSection(hex) {
    const header = document.createElement('div');
    header.style.padding = '12px';
    header.style.backgroundColor = '#2c3e50';
    header.style.borderRadius = '6px';
    header.style.border = '1px solid #555';
    header.id = 'tokenHeaderSection';
    
    const hasRealId = hex.realId && hex.realId.trim() !== '';
    const systemInfo = hex.realId || hex.systemName || '<span style="color: #e74c3c; font-weight: bold;">⚠️ No RealID - Token Placement Disabled</span>';
    const planetInfo = hex.planets ? `${hex.planets.length} planets` : 'No planets';
    
    // If no realID, show warning border
    if (!hasRealId) {
        header.style.border = '2px solid #e74c3c';
        header.style.backgroundColor = '#3d2020';
    }
    
    header.innerHTML = `
        <div style="color: #fff; font-size: 1.1em;">
            <strong>Hex: ${hex.label}</strong> - ${systemInfo}
        </div>
        <div style="color: ${hasRealId ? '#ccc' : '#e74c3c'}; font-size: 0.9em; margin-top: 4px;">
            ${planetInfo}
            ${!hasRealId ? '<div style="margin-top: 8px; font-weight: bold;">⚠️ Tokens can only be placed on tiles with a RealID assigned.</div>' : ''}
        </div>
    `;
    
    return header;
}

function createCategoryTabs() {
    const tabContainer = document.createElement('div');
    tabContainer.id = 'tokenCategoryTabs';
    tabContainer.style.display = 'flex';
    tabContainer.style.gap = '4px';
    tabContainer.style.borderBottom = '2px solid #555';
    tabContainer.style.paddingBottom = '8px';
    
    const categories = getCategories();
    
    // Check if current hex has realID
    const hex = tokenManager.editor.hexes[currentHexLabel];
    const hasRealId = hex && hex.realId && hex.realId.trim() !== '';
    
    categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'token-category-tab';
        tab.dataset.category = category.key;
        tab.innerHTML = `${category.icon} ${category.label}`;
        tab.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #666;
            border-radius: 4px 4px 0 0;
            background: ${category.key === currentCategory ? '#3498db' : '#34495e'};
            color: ${hasRealId ? '#fff' : '#888'};
            cursor: ${hasRealId ? 'pointer' : 'not-allowed'};
            font-size: 0.9em;
            transition: background-color 0.2s;
            opacity: ${hasRealId ? '1' : '0.5'};
        `;
        
        if (hasRealId) {
            tab.onmouseover = () => {
                if (category.key !== currentCategory) {
                    tab.style.backgroundColor = '#4a5f7f';
                }
            };
            tab.onmouseout = () => {
                if (category.key !== currentCategory) {
                    tab.style.backgroundColor = '#34495e';
                }
            };
            
            tab.onclick = () => switchCategory(category.key);
        } else {
            tab.onclick = () => {
                alert('⚠️ Cannot browse tokens - This tile does not have a RealID assigned.');
            };
        }
        
        tabContainer.appendChild(tab);
    });
    
    return tabContainer;
}

function createTokenDisplayArea() {
    const displayArea = document.createElement('div');
    displayArea.id = 'tokenDisplayArea';
    displayArea.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        background: #2c3e50;
        border: 1px solid #555;
        border-radius: 6px;
        min-height: 200px;
        max-height: 300px;
    `;
    
    // Initial content
    updateTokenDisplay();
    
    return displayArea;
}

function createPlacedTokensSection(hex) {
    const section = document.createElement('div');
    section.id = 'placedTokensSection';
    section.style.cssText = `
        padding: 12px;
        background: #34495e;
        border: 1px solid #555;
        border-radius: 6px;
        max-height: 150px;
        overflow-y: auto;
    `;
    
    section.innerHTML = '<h4 style="margin: 0 0 8px 0; color: #fff;">Placed Tokens</h4>';
    
    const tokensList = document.createElement('div');
    tokensList.id = 'placedTokensList';
    updatePlacedTokensList(hex, tokensList);
    
    section.appendChild(tokensList);
    
    return section;
}

function createActionButtons() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid #555;
    `;
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All Tokens';
    clearBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #e74c3c;
        border-radius: 4px;
        background: #e74c3c;
        color: #fff;
        cursor: pointer;
    `;
    clearBtn.onclick = () => clearAllTokensFromHex();
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #95a5a6;
        border-radius: 4px;
        background: #95a5a6;
        color: #fff;
        cursor: pointer;
        margin-left: auto;
    `;
    closeBtn.onclick = () => {
        hidePopup('tokenPopup');
        // Refresh overlay
        if (tokenManager.editor.tokenOverlay) {
            tokenManager.editor.tokenOverlay.refresh();
        }
    };
    
    section.appendChild(clearBtn);
    section.appendChild(closeBtn);
    
    return section;
}

function switchCategory(categoryKey) {
    currentCategory = categoryKey;
    currentSubcategory = null;
    
    // Update tab styles
    const tabs = document.querySelectorAll('.token-category-tab');
    tabs.forEach(tab => {
        if (tab.dataset.category === categoryKey) {
            tab.style.backgroundColor = '#3498db';
        } else {
            tab.style.backgroundColor = '#34495e';
        }
    });
    
    // Update token display
    updateTokenDisplay();
}

function updateTokenDisplay() {
    const displayArea = document.getElementById('tokenDisplayArea');
    if (!displayArea) return;
    
    displayArea.innerHTML = '';
    
    // Check if current hex has a realID
    const hex = tokenManager.editor.hexes[currentHexLabel];
    const hasRealId = hex && hex.realId && hex.realId.trim() !== '';
    
    if (!hasRealId) {
        displayArea.innerHTML = `
            <div style="color: #e74c3c; text-align: center; padding: 40px 20px;">
                <div style="font-size: 3em; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 8px;">Token Placement Disabled</div>
                <div style="font-size: 0.9em; line-height: 1.5;">
                    This tile does not have a RealID assigned.<br>
                    Assign a system to this tile before placing tokens.
                </div>
            </div>
        `;
        return;
    }
    
    const categorizedTokens = tokenManager.getCategorizedTokens();
    const category = categorizedTokens[currentCategory];
    
    if (!category || category.tokens.length === 0) {
        displayArea.innerHTML = '<p style="color: #999; text-align: center;">No tokens available in this category</p>';
        return;
    }
    
    // Create subcategory filters if available
    if (category.subcategories && Object.keys(category.subcategories).length > 1) {
        const subTabs = createSubcategoryTabs(category.subcategories);
        displayArea.appendChild(subTabs);
    }
    
    // Display tokens
    const tokensToShow = currentSubcategory && category.subcategories[currentSubcategory]
        ? category.subcategories[currentSubcategory].tokens
        : category.tokens;
    
    const tokenGrid = createTokenGrid(tokensToShow);
    displayArea.appendChild(tokenGrid);
}

function createSubcategoryTabs(subcategories) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
        flex-wrap: wrap;
    `;
    
    // Add "All" option
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.style.cssText = `
        padding: 4px 12px;
        border: 1px solid #666;
        border-radius: 3px;
        background: ${!currentSubcategory ? '#27ae60' : '#4a5f7f'};
        color: #fff;
        cursor: pointer;
        font-size: 0.85em;
    `;
    allBtn.onclick = () => {
        currentSubcategory = null;
        updateTokenDisplay();
    };
    container.appendChild(allBtn);
    
    // Add subcategory buttons
    Object.entries(subcategories).forEach(([key, subcat]) => {
        if (subcat.tokens.length === 0) return;
        
        const btn = document.createElement('button');
        btn.textContent = `${subcat.label} (${subcat.tokens.length})`;
        btn.style.cssText = `
            padding: 4px 12px;
            border: 1px solid #666;
            border-radius: 3px;
            background: ${currentSubcategory === key ? '#27ae60' : '#4a5f7f'};
            color: #fff;
            cursor: pointer;
            font-size: 0.85em;
        `;
        btn.onclick = () => {
            currentSubcategory = key;
            updateTokenDisplay();
        };
        container.appendChild(btn);
    });
    
    return container;
}

function createTokenGrid(tokens) {
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 8px;
    `;
    
    tokens.forEach(token => {
        const tokenCard = createTokenCard(token);
        grid.appendChild(tokenCard);
    });
    
    return grid;
}

function createTokenCard(token) {
    const card = document.createElement('div');
    card.style.cssText = `
        padding: 8px;
        border: 1px solid #666;
        border-radius: 4px;
        background: #34495e;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
    `;
    
    // Token image
    const img = document.createElement('img');
    // Use correct folder based on whether it's an attachment or token
    if (token.isAttachment) {
        img.src = `./public/attachment_token/${token.imagePath}`;
    } else {
        img.src = `./public/tokens/${token.imagePath}`;
    }
    img.alt = token.id;
    img.style.cssText = `
        width: 60px;
        height: 60px;
        object-fit: contain;
        margin-bottom: 4px;
    `;
    img.onerror = () => {
        img.style.display = 'none';
        card.innerHTML += '🎲';
    };
    
    // Token ID
    const label = document.createElement('div');
    label.textContent = token.name || token.id;
    label.style.cssText = `
        color: #fff;
        font-size: 0.75em;
        word-break: break-word;
    `;
    
    // Placement type indicator with attachment info
    const typeIndicator = document.createElement('div');
    typeIndicator.style.cssText = `
        color: #95a5a6;
        font-size: 0.7em;
        margin-top: 2px;
    `;
    
    if (token.isAttachment) {
        typeIndicator.textContent = '📎 Attachment';
        // Add special styling based on attachment properties
        if (token.isLegendary) {
            card.style.borderColor = '#f1c40f';
            card.style.boxShadow = '0 0 8px rgba(241, 196, 15, 0.5)';
        } else if (token.addsTechSpeciality) {
            card.style.borderColor = '#3498db';
            card.style.borderWidth = '2px';
        } else if (token.modifiesResources || token.modifiesInfluence) {
            card.style.borderColor = '#27ae60';
            card.style.borderWidth = '2px';
        }
    } else if (token.spaceOrPlanet === 'planet' || token.isPlanet) {
        typeIndicator.textContent = '🪐 Planet';
    } else if (token.spaceOrPlanet === 'space') {
        typeIndicator.textContent = '🚀 Space';
    }
    
    card.appendChild(img);
    card.appendChild(label);
    card.appendChild(typeIndicator);
    
    // Hover effects
    card.onmouseover = () => {
        card.style.backgroundColor = '#4a6fa5';
        card.style.transform = 'scale(1.05)';
    };
    card.onmouseout = () => {
        card.style.backgroundColor = '#34495e';
        card.style.transform = 'scale(1)';
    };
    
    // Click to place token
    card.onclick = () => placeToken(token);
    
    return card;
}

function placeToken(token) {
    const hex = tokenManager.editor.hexes[currentHexLabel];
    if (!hex) return;
    
    // Check if hex has a realID
    const hasRealId = hex.realId && hex.realId.trim() !== '';
    if (!hasRealId) {
        alert('⚠️ Cannot place tokens on tiles without a RealID.\n\nPlease assign a system to this tile first.');
        return;
    }
    
    // Determine if this is a planet or system token
    const isPlanetToken = token.spaceOrPlanet === 'planet' || token.isPlanet === true;
    
    if (isPlanetToken) {
        // Show planet selector if there are planets
        if (!hex.planets || hex.planets.length === 0) {
            alert('This hex has no planets. Planet tokens can only be placed on planets.');
            return;
        }
        
        if (hex.planets.length === 1) {
            // Auto-select the only planet
            placePlanetToken(token.id, 0);
        } else {
            // Show planet selector dialog
            showPlanetSelector(token);
        }
    } else {
        // Place as system token
        const success = tokenManager.addSystemToken(currentHexLabel, token.id);
        if (success) {
            updatePlacedTokensDisplay();
            showNotification(`Added ${token.id} to system`);
        } else {
            alert(`Failed to add token. It may already be placed.`);
        }
    }
}

function showPlanetSelector(token) {
    const hex = tokenManager.editor.hexes[currentHexLabel];
    if (!hex || !hex.planets) return;
    
    const selector = document.createElement('div');
    selector.style.cssText = `
        margin-top: 12px;
        padding: 12px;
        background: #2c3e50;
        border: 1px solid #3498db;
        border-radius: 6px;
    `;
    
    selector.innerHTML = `<strong style="color: #fff;">Select Planet for ${token.id}:</strong>`;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-top: 8px;
        flex-wrap: wrap;
    `;
    
    hex.planets.forEach((planet, index) => {
        const planetName = planet.name || planet.planetID || planet.id || `Planet ${index + 1}`;
        const btn = document.createElement('button');
        btn.textContent = planetName;
        btn.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #27ae60;
            border-radius: 4px;
            background: #27ae60;
            color: #fff;
            cursor: pointer;
        `;
        btn.onclick = () => {
            placePlanetToken(token.id, index);
            selector.remove();
        };
        buttonContainer.appendChild(btn);
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid #95a5a6;
        border-radius: 4px;
        background: #95a5a6;
        color: #fff;
        cursor: pointer;
    `;
    cancelBtn.onclick = () => selector.remove();
    buttonContainer.appendChild(cancelBtn);
    
    selector.appendChild(buttonContainer);
    
    const displayArea = document.getElementById('tokenDisplayArea');
    if (displayArea) {
        displayArea.insertBefore(selector, displayArea.firstChild);
    }
}

function placePlanetToken(tokenId, planetIndex) {
    const success = tokenManager.addPlanetToken(currentHexLabel, planetIndex, tokenId);
    if (success) {
        updatePlacedTokensDisplay();
        const hex = tokenManager.editor.hexes[currentHexLabel];
        const planetName = hex.planets[planetIndex]?.name || `Planet ${planetIndex + 1}`;
        showNotification(`Added ${tokenId} to ${planetName}`);
    } else {
        alert(`Failed to add token. It may already be placed.`);
    }
}

function updatePlacedTokensDisplay() {
    const hex = tokenManager.editor.hexes[currentHexLabel];
    const listElement = document.getElementById('placedTokensList');
    if (hex && listElement) {
        updatePlacedTokensList(hex, listElement);
    }
    
    // Refresh the token overlay to show changes immediately
    if (tokenManager.editor.tokenOverlay) {
        tokenManager.editor.tokenOverlay.refresh();
    }
}

function updatePlacedTokensList(hex, listElement) {
    listElement.innerHTML = '';
    
    let hasTokens = false;
    
    // System tokens
    if (hex.systemTokens && hex.systemTokens.length > 0) {
        hasTokens = true;
        const systemSection = document.createElement('div');
        systemSection.style.marginBottom = '8px';
        systemSection.innerHTML = '<div style="color: #e74c3c; font-weight: bold; margin-bottom: 4px;">System Tokens:</div>';
        
        hex.systemTokens.forEach(tokenId => {
            const tokenItem = createPlacedTokenItem(tokenId, 'system', null);
            systemSection.appendChild(tokenItem);
        });
        
        listElement.appendChild(systemSection);
    }
    
    // Planet tokens
    if (hex.planetTokens && Object.keys(hex.planetTokens).length > 0) {
        hasTokens = true;
        const planetSection = document.createElement('div');
        planetSection.innerHTML = '<div style="color: #f39c12; font-weight: bold; margin-bottom: 4px;">Planet Tokens:</div>';
        
        Object.entries(hex.planetTokens).forEach(([planetIndex, tokens]) => {
            const planetName = hex.planets[planetIndex]?.name || `Planet ${parseInt(planetIndex) + 1}`;
            tokens.forEach(tokenId => {
                const tokenItem = createPlacedTokenItem(tokenId, 'planet', planetIndex, planetName);
                planetSection.appendChild(tokenItem);
            });
        });
        
        listElement.appendChild(planetSection);
    }
    
    if (!hasTokens) {
        listElement.innerHTML = '<p style="color: #999; font-style: italic;">No tokens placed</p>';
    }
}

function createPlacedTokenItem(tokenId, type, planetIndex, planetName) {
    const item = document.createElement('div');
    item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        margin-bottom: 4px;
        background: #2c3e50;
        border-radius: 3px;
    `;
    
    const label = document.createElement('span');
    label.style.color = '#fff';
    if (type === 'planet') {
        label.textContent = `${tokenId} (${planetName})`;
    } else {
        label.textContent = tokenId;
    }
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.style.cssText = `
        padding: 2px 8px;
        border: 1px solid #e74c3c;
        border-radius: 3px;
        background: #e74c3c;
        color: #fff;
        cursor: pointer;
        font-size: 0.8em;
    `;
    removeBtn.onclick = () => {
        if (type === 'system') {
            tokenManager.removeSystemToken(currentHexLabel, tokenId);
        } else {
            tokenManager.removePlanetToken(currentHexLabel, planetIndex, tokenId);
        }
        updatePlacedTokensDisplay();
        showNotification(`Removed ${tokenId}`);
    };
    
    item.appendChild(label);
    item.appendChild(removeBtn);
    
    return item;
}

function clearAllTokensFromHex() {
    if (confirm(`Clear all tokens from hex ${currentHexLabel}?`)) {
        tokenManager.clearHexTokens(currentHexLabel);
        updatePlacedTokensDisplay();
        showNotification('All tokens cleared');
    }
}

function showNotification(message) {
    // Simple notification - could be enhanced
    console.log('Token action:', message);
}

function showTokenHelp() {
    showPopup({
        id: 'tokenHelpPopup',
        className: 'popup-ui popup-ui-info',
        title: 'Token Placement Help',
        content: `
            <div style="line-height: 1.6; color: #fff;">
                <h4>Overview</h4>
                <p>The Token Placement system allows you to place various tokens on systems and planets.</p>
                
                <h4>Token Types</h4>
                <ul>
                    <li><strong>System Tokens:</strong> Placed on the hex itself (anomalies, frontier tokens, etc.)</li>
                    <li><strong>Planet Tokens:</strong> Placed on specific planets (custodians, relics, attachments, etc.)</li>
                </ul>
                
                <h4>Usage</h4>
                <ol>
                    <li>Select a category tab to browse available tokens</li>
                    <li>Click on a token to place it</li>
                    <li>For planet tokens, you'll be asked to select which planet</li>
                    <li>View and remove placed tokens in the "Placed Tokens" section</li>
                </ol>
                
                <h4>Note</h4>
                <p>Wormhole tokens are managed separately through the Wormholes feature.</p>
            </div>
        `,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        style: {
            minWidth: '400px',
            maxWidth: '600px',
            border: '2px solid #3498db'
        }
    });
}

/**
 * Change the hex being edited in the token popup
 */
function changeHexInTokenPopup(hexLabel) {
    if (!hexLabel) {
        updateTokenHexStatus('Please enter a hex label');
        return;
    }
    
    const hex = tokenManager.editor.hexes[hexLabel];
    if (!hex) {
        updateTokenHexStatus(`Hex ${hexLabel} not found`);
        return;
    }
    
    // Update current hex
    currentHexLabel = hexLabel;
    
    // Update header info
    const header = document.querySelector('.token-popup #tokenPopup h3, #tokenPopup .popup-ui-titlebar');
    if (header) {
        const titleBar = document.querySelector('#tokenPopup .popup-ui-titlebar');
        if (titleBar) {
            titleBar.textContent = `Token Placement - Hex: ${hexLabel}`;
        }
    }
    
    // Update hex info in header section
    const headerDiv = document.querySelector('#tokenHeaderSection');
    if (headerDiv) {
        const hasRealId = hex.realId && hex.realId.trim() !== '';
        const systemInfo = hex.realId || hex.systemName || '<span style="color: #e74c3c; font-weight: bold;">⚠️ No RealID - Token Placement Disabled</span>';
        const planetInfo = hex.planets ? `${hex.planets.length} planets` : 'No planets';
        
        // Update styling based on realID presence
        if (!hasRealId) {
            headerDiv.style.border = '2px solid #e74c3c';
            headerDiv.style.backgroundColor = '#3d2020';
        } else {
            headerDiv.style.border = '1px solid #555';
            headerDiv.style.backgroundColor = '#2c3e50';
        }
        
        headerDiv.innerHTML = `
            <div style="color: #fff; font-size: 1.1em;">
                <strong>Hex: ${hex.label}</strong> - ${systemInfo}
            </div>
            <div style="color: ${hasRealId ? '#ccc' : '#e74c3c'}; font-size: 0.9em; margin-top: 4px;">
                ${planetInfo}
                ${!hasRealId ? '<div style="margin-top: 8px; font-weight: bold;">⚠️ Tokens can only be placed on tiles with a RealID assigned.</div>' : ''}
            </div>
        `;
    }
    
    // Update token display area (will show warning if no realID)
    updateTokenDisplay();
    
    // Update placed tokens display
    updatePlacedTokensDisplay();
    
    const hasRealId = hex.realId && hex.realId.trim() !== '';
    updateTokenHexStatus(`Selected hex ${hexLabel} - ${hex.planets?.length || 0} planets${!hasRealId ? ' ⚠️ NO REALID' : ''}`);
}

function updateTokenHexStatus(message) {
    const statusDiv = document.getElementById('tokenHexStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
    }
}
