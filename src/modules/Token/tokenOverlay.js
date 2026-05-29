/**
 * Token Overlay - Visual display of placed tokens on hexes
 * Shows token indicators for system and planet tokens
 */

import { enforceSvgLayerOrder } from '../../draw/enforceSvgLayerOrder.js';

// Planet positions mirror drawPlanetTypeLayer in realIDsOverlays.js:
// angles [-90, 0, 180] (top, right, left), distance (r-17) from center, circle r=10
const PLANET_ANGLES_DEG = [-90, 0, 180];
const PLANET_DIST_OFFSET = 17;
const PLANET_CIRCLE_R = 10;

export class TokenOverlay {
    constructor(editor) {
        this.editor = editor;
        this.overlayGroup = null;
        this.tokenManager = window.tokenManager;
        this.visible = true;
        this.useImages = true;
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
        // If the overlay group was detached (e.g. generateMap wiped the SVG), recreate it
        if (this.overlayGroup && !this.overlayGroup.isConnected) {
            this.overlayGroup = null;
        }
        if (!this.overlayGroup) {
            this.initialize();
        }
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
        for (const hex of Object.values(this.editor.hexes)) {
            this.renderHexTokens(hex);
        }

        // Ensure token layer stays above planet/realID layers
        enforceSvgLayerOrder(this.editor.svg);
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
     * Render system-level tokens.
     * Single token → image indicator at bottom-center.
     * Multiple tokens → count badge at bottom-center; click opens token popup.
     */
    renderSystemTokens(hex) {
        const tokens = hex.systemTokens;
        if (!tokens || tokens.length === 0) return;

        const { x: cx, y: cy } = hex.center;
        const r = this.editor.hexRadius;
        // Bottom-center: planets are at top/right/left, so this area is always clear
        const x = cx;
        const y = cy + r * 0.35;

        if (tokens.length === 1) {
            const info = this.tokenManager?.getTokenInfo(tokens[0]);
            this.overlayGroup.appendChild(
                this.createTokenIndicator(tokens[0], info, x, y, 'system', hex.label)
            );
        } else {
            this.overlayGroup.appendChild(
                this.createStackBadge(tokens, 'system', x, y, hex.label)
            );
        }
    }

    /**
     * Render planet tokens grouped per planet.
     * Each planet's tokens are anchored just below that planet's circle.
     * Single token → image. Multiple → count badge.
     */
    renderPlanetTokens(hex) {
        if (!hex.planets || hex.planets.length === 0 || !hex.planetTokens) return;

        const { x: cx, y: cy } = hex.center;
        const r = this.editor.hexRadius;
        const PLANET_R = PLANET_CIRCLE_R;

        Object.entries(hex.planetTokens).forEach(([idxStr, tokens]) => {
            if (!tokens || tokens.length === 0) return;
            const planetIndex = parseInt(idxStr);
            const planet = hex.planets[planetIndex];
            if (!planet) return;

            // Replicate planet circle position from realIDsOverlays.js
            const θ = PLANET_ANGLES_DEG[planetIndex % 3] * Math.PI / 180;
            const px = cx + (r - PLANET_DIST_OFFSET) * Math.cos(θ);
            const py = cy + (r - PLANET_DIST_OFFSET) * Math.sin(θ);

            // Anchor token at the bottom of each planet circle regardless of planet angle.
            // tx = px keeps horizontal alignment; ty = py + PLANET_R + TOKEN_HALF places
            // the token's top edge flush with the planet circle's bottom edge.
            // This stays inside the hex for all three planet positions (top/right/left).
            const tx = px;
            const ty = py + PLANET_R;

            const planetName = planet.name || `Planet ${planetIndex + 1}`;

            if (tokens.length === 1) {
                const info = this.tokenManager?.getTokenInfo(tokens[0]);
                this.overlayGroup.appendChild(
                    this.createTokenIndicator(tokens[0], info, tx, ty, 'planet', hex.label, planetName)
                );
            } else {
                this.overlayGroup.appendChild(
                    this.createStackBadge(tokens, 'planet', tx, ty, hex.label, planetName)
                );
            }
        });
    }

    /**
     * Create a count badge for a stack of tokens.
     * Shows a filled circle with the token count.
     * Tooltip lists all token names. Click opens the token popup.
     */
    createStackBadge(tokens, type, x, y, hexLabel, planetName = null) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('token-indicator', 'token-stack');
        group.setAttribute('data-hex', hexLabel);
        group.setAttribute('data-type', type);

        const R = 8;
        const bgColor = type === 'system' ? '#2980b9' : '#d4870a';

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', R);
        circle.setAttribute('fill', bgColor);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('opacity', '0.95');
        group.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 3);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '8');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#fff');
        text.textContent = tokens.length;
        group.appendChild(text);

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const names = tokens.map(id => this.tokenManager?.getTokenInfo(id)?.name || id);
        title.textContent = (planetName ? `${planetName}:\n` : 'System tokens:\n') + names.join('\n');
        group.appendChild(title);

        group.style.cursor = 'pointer';
        group.style.pointerEvents = 'auto';

        // Fan-out elements, created on hover and destroyed on leave
        let fanItems = null;

        const showFan = () => {
            if (fanItems) return;
            fanItems = [];
            const FAN_R = 30;
            const IMG_SIZE = 20;
            // Spread tokens in an arc centred upward (-π/2), capped at 120° total
            const totalSpreadRad = Math.min((tokens.length - 1) * 0.55, Math.PI * 2 / 3);
            const centerAngle = -Math.PI / 2;

            tokens.forEach((tokenId, i) => {
                const info = this.tokenManager?.getTokenInfo(tokenId);
                const angle = tokens.length === 1
                    ? centerAngle
                    : centerAngle - totalSpreadRad / 2 + (totalSpreadRad / (tokens.length - 1)) * i;

                const fx = x + FAN_R * Math.cos(angle);
                const fy = y + FAN_R * Math.sin(angle);

                const fanGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                fanGroup.style.pointerEvents = 'none';

                if (this.useImages && info?.imagePath) {
                    const src = info.isAttachment
                        ? `./public/attachment_token/${info.imagePath}`
                        : `./public/tokens/${info.imagePath}`;
                    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                    img.setAttribute('href', src);
                    img.setAttribute('x', fx - IMG_SIZE / 2);
                    img.setAttribute('y', fy - IMG_SIZE / 2);
                    img.setAttribute('width', IMG_SIZE);
                    img.setAttribute('height', IMG_SIZE);
                    fanGroup.appendChild(img);
                } else {
                    const fc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    fc.setAttribute('cx', fx);
                    fc.setAttribute('cy', fy);
                    fc.setAttribute('r', '9');
                    fc.setAttribute('fill', type === 'system' ? '#2980b9' : '#d4870a');
                    fc.setAttribute('stroke', '#fff');
                    fc.setAttribute('stroke-width', '1.5');
                    fanGroup.appendChild(fc);
                }

                const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                t.textContent = info?.name || tokenId;
                fanGroup.appendChild(t);

                group.appendChild(fanGroup);
                fanItems.push(fanGroup);
            });
        };

        const hideFan = () => {
            if (!fanItems) return;
            fanItems.forEach(el => el.remove());
            fanItems = null;
        };

        group.addEventListener('mouseenter', () => {
            circle.setAttribute('r', R + 2);
            circle.setAttribute('opacity', '1');
            showFan();
        });
        group.addEventListener('mouseleave', () => {
            circle.setAttribute('r', R);
            circle.setAttribute('opacity', '0.95');
            hideFan();
        });

        // Click: open token popup so user can manage individual tokens
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.showTokenPopup === 'function') {
                window.showTokenPopup(hexLabel);
            }
        });

        return group;
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

        const SIZE = 20;

        if (this.useImages && tokenInfo?.imagePath) {
            // Render token image
            const src = tokenInfo.isAttachment
                ? `./public/attachment_token/${tokenInfo.imagePath}`
                : `./public/tokens/${tokenInfo.imagePath}`;

            const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.setAttribute('href', src);
            img.setAttribute('x', x - SIZE / 2);
            img.setAttribute('y', y - SIZE / 2);
            img.setAttribute('width', SIZE);
            img.setAttribute('height', SIZE);
            img.setAttribute('opacity', '0.9');
            group.appendChild(img);

            group.addEventListener('mouseenter', () => {
                img.setAttribute('opacity', '1');
                img.setAttribute('x', x - SIZE / 2 - 2);
                img.setAttribute('y', y - SIZE / 2 - 2);
                img.setAttribute('width', SIZE + 4);
                img.setAttribute('height', SIZE + 4);
            });
            group.addEventListener('mouseleave', () => {
                img.setAttribute('opacity', '0.9');
                img.setAttribute('x', x - SIZE / 2);
                img.setAttribute('y', y - SIZE / 2);
                img.setAttribute('width', SIZE);
                img.setAttribute('height', SIZE);
            });
        } else {
            // Fallback: colored circle with type-based color
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', '8');

            let fillColor = type === 'system' ? '#3498db' : '#f39c12';
            const strokeColor = '#fff';
            let strokeWidth = '1.5';
            if (tokenInfo?.isAttachment) {
                if (tokenInfo.isLegendary) { fillColor = '#f1c40f'; strokeWidth = '2'; }
                else if (tokenInfo.addsTechSpeciality) fillColor = '#3498db';
                else if (tokenInfo.modifiesResources || tokenInfo.modifiesInfluence) fillColor = '#27ae60';
                else fillColor = '#9b59b6';
            }
            circle.setAttribute('fill', fillColor);
            circle.setAttribute('stroke', strokeColor);
            circle.setAttribute('stroke-width', strokeWidth);
            circle.setAttribute('opacity', '0.9');
            group.appendChild(circle);

            group.addEventListener('mouseenter', () => {
                circle.setAttribute('opacity', '1');
                circle.setAttribute('r', '10');
            });
            group.addEventListener('mouseleave', () => {
                circle.setAttribute('opacity', '0.9');
                circle.setAttribute('r', '8');
            });
        }

        // Tooltip
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        let tooltipText = tokenInfo?.name || tokenId;
        tooltipText += ` (${type})`;
        if (planetName) tooltipText += ` - ${planetName}`;
        if (tokenInfo) {
            tooltipText += `\nSource: ${tokenInfo.source || 'unknown'}`;
            if (tokenInfo.isAttachment) {
                tooltipText += '\n---';
                if (tokenInfo.isLegendary) tooltipText += '\n⭐ LEGENDARY';
                if (tokenInfo.addsTechSpeciality) tooltipText += `\n🔬 Tech: ${tokenInfo.techSpeciality.join(', ')}`;
                if (tokenInfo.modifiesResources) tooltipText += `\n⚙️ Resources: ${tokenInfo.resourcesModifier > 0 ? '+' : ''}${tokenInfo.resourcesModifier}`;
                if (tokenInfo.modifiesInfluence) tooltipText += `\n🏛️ Influence: ${tokenInfo.influenceModifier > 0 ? '+' : ''}${tokenInfo.influenceModifier}`;
            }
        }
        title.textContent = tooltipText;
        group.appendChild(title);

        group.style.cursor = 'pointer';
        group.style.pointerEvents = 'auto';

        // Click to remove (with confirmation)
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Remove token "${tokenId}" from ${planetName || 'system'}?`)) {
                if (type === 'system') {
                    this.tokenManager.removeSystemToken(hexLabel, tokenId);
                } else {
                    const planetIndex = Object.entries(this.editor.hexes[hexLabel].planetTokens)
                        .find(([, tokens]) => tokens.includes(tokenId))?.[0];
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
     * Toggle between image and circle rendering, then refresh
     */
    setUseImages(enabled) {
        this.useImages = enabled;
        this.refresh();
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
