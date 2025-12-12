/**
 * Token Overlay - Visual display of placed tokens on hexes
 * Shows token indicators for system and planet tokens
 */

export class TokenOverlay {
    constructor(editor) {
        this.editor = editor;
        this.overlayGroup = null;
        this.tokenManager = window.tokenManager;
        this.visible = true;
    }

    /**
     * Initialize the overlay
     */
    initialize() {
        console.log('Initializing TokenOverlay...');
        
        // Check if overlay group already exists
        if (!this.overlayGroup) {
            this.overlayGroup = this.editor.svg.querySelector('#token-overlay-group');
            if (!this.overlayGroup) {
                // Create SVG group for token overlays
                this.overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                this.overlayGroup.id = 'token-overlay-group';
                this.overlayGroup.style.pointerEvents = 'none'; // Don't block hex clicks
                this.overlayGroup.style.display = 'block';
                this.overlayGroup.style.opacity = '1';
                this.editor.svg.appendChild(this.overlayGroup);
                console.log('TokenOverlay: Created overlay group', this.overlayGroup);
            }
        }

        console.log('TokenOverlay initialized');
        return true;
    }

    /**
     * Refresh the entire overlay
     */
    refresh() {
        if (!this.overlayGroup) {
            console.warn('TokenOverlay not initialized');
            return;
        }

        console.log('Refreshing token overlay...');
        
        // Clear existing overlays
        this.overlayGroup.innerHTML = '';

        if (!this.visible) {
            console.log('Token overlay is hidden');
            return;
        }

        // Render tokens for all hexes
        for (const [label, hex] of Object.entries(this.editor.hexes)) {
            this.renderHexTokens(hex);
        }

        console.log('Token overlay refreshed');
    }

    /**
     * Render tokens for a specific hex
     */
    renderHexTokens(hex) {
        if (!hex || !this.visible) return;

        const hasSystemTokens = hex.systemTokens && hex.systemTokens.length > 0;
        const hasPlanetTokens = hex.planetTokens && Object.keys(hex.planetTokens).length > 0;

        if (!hasSystemTokens && !hasPlanetTokens) return;

        // Render system tokens
        if (hasSystemTokens) {
            this.renderSystemTokens(hex);
        }

        // Render planet tokens
        if (hasPlanetTokens) {
            this.renderPlanetTokens(hex);
        }
    }

    /**
     * Render system-level tokens
     */
    renderSystemTokens(hex) {
        const tokenCount = hex.systemTokens.length;
        const center = hex.center;
        const radius = this.editor.hexRadius;

        // Position tokens in top-right area of hex
        const baseX = center.x + radius * 0.5;
        const baseY = center.y - radius * 0.5;

        hex.systemTokens.forEach((tokenId, index) => {
            const tokenInfo = this.tokenManager?.getTokenInfo(tokenId);
            
            // Calculate position for multiple tokens (stack them)
            const offsetY = index * 20;
            const x = baseX;
            const y = baseY + offsetY;

            // Create token indicator
            const indicator = this.createTokenIndicator(
                tokenId,
                tokenInfo,
                x,
                y,
                'system',
                hex.label
            );

            this.overlayGroup.appendChild(indicator);
        });
    }

    /**
     * Render planet tokens
     */
    renderPlanetTokens(hex) {
        if (!hex.planets || hex.planets.length === 0) return;

        const center = hex.center;
        const radius = this.editor.hexRadius;

        // Position planet tokens in bottom-left area
        const baseX = center.x - radius * 0.5;
        const baseY = center.y + radius * 0.4;

        Object.entries(hex.planetTokens).forEach(([planetIndex, tokens]) => {
            const planet = hex.planets[parseInt(planetIndex)];
            if (!planet) return;

            tokens.forEach((tokenId, tokenIndex) => {
                const tokenInfo = this.tokenManager?.getTokenInfo(tokenId);
                
                // Stack tokens for the same planet
                const offsetX = parseInt(planetIndex) * 25;
                const offsetY = tokenIndex * 20;
                const x = baseX + offsetX;
                const y = baseY + offsetY;

                // Create token indicator
                const indicator = this.createTokenIndicator(
                    tokenId,
                    tokenInfo,
                    x,
                    y,
                    'planet',
                    hex.label,
                    planet.name || `Planet ${parseInt(planetIndex) + 1}`
                );

                this.overlayGroup.appendChild(indicator);
            });
        });
    }

    /**
     * Create a visual token indicator
     */
    createTokenIndicator(tokenId, tokenInfo, x, y, type, hexLabel, planetName = null) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('token-indicator');
        group.setAttribute('data-token-id', tokenId);
        group.setAttribute('data-hex', hexLabel);
        group.setAttribute('data-type', type);

        // Background circle with color based on type and properties
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '12');
        
        // Determine fill color
        let fillColor = type === 'system' ? '#3498db' : '#f39c12';
        let strokeColor = '#fff';
        let strokeWidth = '1.5';
        
        if (tokenInfo && tokenInfo.isAttachment) {
            if (tokenInfo.isLegendary) {
                fillColor = '#f1c40f'; // Gold for legendary
                strokeColor = '#fff';
                strokeWidth = '2';
            } else if (tokenInfo.addsTechSpeciality) {
                fillColor = '#3498db'; // Blue for tech
            } else if (tokenInfo.modifiesResources || tokenInfo.modifiesInfluence) {
                fillColor = '#27ae60'; // Green for stat modifiers
            } else {
                fillColor = '#9b59b6'; // Purple for other attachments
            }
        }
        
        circle.setAttribute('fill', fillColor);
        circle.setAttribute('stroke', strokeColor);
        circle.setAttribute('stroke-width', strokeWidth);
        circle.setAttribute('opacity', '0.9');
        group.appendChild(circle);

        // Icon/emoji indicator
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '14');
        text.setAttribute('fill', '#fff');
        text.setAttribute('font-weight', 'bold');
        
        // Choose icon based on type and properties
        let icon = '🎲';
        if (tokenInfo) {
            if (tokenInfo.isAttachment) {
                // Special icons for attachments based on properties
                if (tokenInfo.isLegendary) icon = '⭐';
                else if (tokenInfo.addsTechSpeciality) icon = '🔬';
                else if (tokenInfo.modifiesResources && tokenInfo.modifiesInfluence) icon = '💰';
                else if (tokenInfo.modifiesResources) icon = '⚙️';
                else if (tokenInfo.modifiesInfluence) icon = '🏛️';
                else icon = '📎';
            } else if (tokenInfo.id.includes('custodian')) icon = '👑';
            else if (tokenInfo.id.includes('frontier')) icon = '🚀';
            else if (tokenInfo.id.includes('relic')) icon = '💎';
            else if (tokenInfo.isAnomaly) icon = '⚠️';
            else if (tokenInfo.isPlanet) icon = '🪐';
        }
        text.textContent = icon;
        group.appendChild(text);

        // Tooltip with enhanced attachment info
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        let tooltipText = tokenInfo?.name || tokenId;
        tooltipText += ` (${type})`;
        if (planetName) {
            tooltipText += ` - ${planetName}`;
        }
        if (tokenInfo) {
            tooltipText += `\nSource: ${tokenInfo.source || 'unknown'}`;
            
            // Add attachment properties to tooltip
            if (tokenInfo.isAttachment) {
                tooltipText += '\n---';
                if (tokenInfo.isLegendary) tooltipText += '\n⭐ LEGENDARY';
                if (tokenInfo.addsTechSpeciality) {
                    tooltipText += `\n🔬 Tech: ${tokenInfo.techSpeciality.join(', ')}`;
                }
                if (tokenInfo.modifiesResources) {
                    tooltipText += `\n⚙️ Resources: ${tokenInfo.resourcesModifier > 0 ? '+' : ''}${tokenInfo.resourcesModifier}`;
                }
                if (tokenInfo.modifiesInfluence) {
                    tooltipText += `\n🏛️ Influence: ${tokenInfo.influenceModifier > 0 ? '+' : ''}${tokenInfo.influenceModifier}`;
                }
            }
        }
        title.textContent = tooltipText;
        group.appendChild(title);

        // Hover effects
        group.style.cursor = 'pointer';
        group.style.pointerEvents = 'auto';
        
        group.addEventListener('mouseenter', () => {
            circle.setAttribute('opacity', '1');
            circle.setAttribute('r', '14');
        });
        
        group.addEventListener('mouseleave', () => {
            circle.setAttribute('opacity', '0.9');
            circle.setAttribute('r', '12');
        });

        // Click to remove (with confirmation)
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Remove token "${tokenId}" from ${planetName || 'system'}?`)) {
                if (type === 'system') {
                    this.tokenManager.removeSystemToken(hexLabel, tokenId);
                } else {
                    const planetIndex = Object.entries(this.editor.hexes[hexLabel].planetTokens)
                        .find(([idx, tokens]) => tokens.includes(tokenId))?.[0];
                    if (planetIndex !== undefined) {
                        this.tokenManager.removePlanetToken(hexLabel, planetIndex, tokenId);
                    }
                }
                this.refresh();
            }
        });

        return group;
    }

    /**
     * Show the overlay
     */
    show() {
        console.log('TokenOverlay: show() called');
        if (!this.overlayGroup) {
            this.initialize();
        }
        this.visible = true;
        this.refresh();
        if (this.overlayGroup) {
            this.overlayGroup.style.display = 'block';
        }
        
        // Ensure proper layer ordering
        if (typeof window !== 'undefined' && window.enforceSvgLayerOrder) {
            window.enforceSvgLayerOrder(this.editor.svg);
        }
        
        console.log('TokenOverlay: overlay shown', this.overlayGroup);
    }

    /**
     * Hide the overlay
     */
    hide() {
        this.visible = false;
        if (this.overlayGroup) {
            this.overlayGroup.style.display = 'none';
        }
        console.log('TokenOverlay: overlay hidden');
    }

    /**
     * Toggle overlay visibility
     */
    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if overlay is visible
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Update tokens for a specific hex
     */
    updateHex(hexLabel) {
        const hex = this.editor.hexes[hexLabel];
        if (!hex) return;

        // Remove existing indicators for this hex
        const existingIndicators = this.overlayGroup.querySelectorAll(`[data-hex="${hexLabel}"]`);
        existingIndicators.forEach(indicator => indicator.remove());

        // Re-render this hex's tokens
        this.renderHexTokens(hex);
    }

    /**
     * Clear all token overlays
     */
    clear() {
        if (this.overlayGroup) {
            this.overlayGroup.innerHTML = '';
        }
    }

    /**
     * Destroy the overlay
     */
    destroy() {
        if (this.overlayGroup) {
            this.overlayGroup.remove();
            this.overlayGroup = null;
        }
        console.log('TokenOverlay destroyed');
    }
}

// Export convenience function
export function createTokenOverlay(editor) {
    return new TokenOverlay(editor);
}
