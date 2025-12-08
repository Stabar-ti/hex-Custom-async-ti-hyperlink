// loreOverlay.js - Visual indicators for systems and planets with lore
class LoreOverlay {
    constructor(editor) {
        this.editor = editor;
        this.isActive = false;
        this.overlayGroup = null;
    }

    initialize() {
        // Create overlay group if it doesn't exist
        if (!this.overlayGroup) {
            this.overlayGroup = this.editor.svg.querySelector('#lore-overlay');
            if (!this.overlayGroup) {
                this.overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                this.overlayGroup.setAttribute('id', 'lore-overlay');
                this.overlayGroup.style.pointerEvents = 'none';
                this.overlayGroup.style.display = 'block';
                this.overlayGroup.style.opacity = '1';
                this.editor.svg.appendChild(this.overlayGroup);
                console.log('LoreOverlay: Created overlay group', this.overlayGroup);
            }
        }
    }

    toggle() {
        this.isActive = !this.isActive;
        if (this.isActive) {
            this.show();
        } else {
            this.hide();
        }
        return this.isActive;
    }

    show() {
        console.log('LoreOverlay: show() called');
        this.initialize();
        this.isActive = true;
        this.render();
        this.overlayGroup.style.display = 'block';
        
        // Ensure proper layer ordering
        if (typeof window !== 'undefined' && window.enforceSvgLayerOrder) {
            window.enforceSvgLayerOrder(this.editor.svg);
        }
        
        console.log('LoreOverlay: overlay group created and displayed', this.overlayGroup);
    }

    hide() {
        this.isActive = false;
        if (this.overlayGroup) {
            this.overlayGroup.style.display = 'none';
        }
    }

    render() {
        if (!this.overlayGroup || !this.isActive) return;

        // Clear existing indicators
        this.overlayGroup.innerHTML = '';

        console.log('LoreOverlay: render() called, checking hexes:', Object.keys(this.editor.hexes).length);

        // Check each hex for lore data
        let indicatorCount = 0;
        Object.keys(this.editor.hexes).forEach(hexLabel => {
            const hex = this.editor.hexes[hexLabel];
            if (!hex || !hex.center) {
                if (hexLabel === '101') {
                    console.log(`LoreOverlay: Hex 101 MISSING center! hex:`, hex);
                }
                return;
            }

            const loreData = this.getLoreData(hexLabel);
            
            // Special logging for hex 101
            if (hexLabel === '101') {
                console.log(`LoreOverlay: SPECIAL CHECK - Hex 101 lore data:`, loreData);
                console.log(`LoreOverlay: Hex 101 center:`, hex.center);
            }
            
            if (loreData.hasSystemLore || loreData.hasPlanetLore) {
                console.log(`LoreOverlay: Creating indicator for hex ${hexLabel}`, loreData);
                this.createLoreIndicator(hex, loreData);
                indicatorCount++;
            }
        });

        console.log(`LoreOverlay: Created ${indicatorCount} indicators`);
    }

    getLoreData(hexLabel) {
        const result = {
            hasSystemLore: false,
            hasPlanetLore: false,
            planetCount: 0
        };

        // Get the hex object directly from the editor
        const hex = this.editor.hexes[hexLabel];
        if (!hex) {
            console.log(`LoreOverlay: Hex ${hexLabel} not found in editor.hexes`);
            return result;
        }

        console.log(`LoreOverlay: Checking hex ${hexLabel} for lore:`, {
            systemLore: hex.systemLore,
            planetLore: hex.planetLore
        });

        // Check for system lore
        if (hex.systemLore && this.hasNonEmptyLore(hex.systemLore)) {
            result.hasSystemLore = true;
            console.log(`LoreOverlay: Found system lore for hex ${hexLabel}`);
        }

        // Check for planet lore
        if (hex.planetLore) {
            Object.keys(hex.planetLore).forEach(planetIndex => {
                if (this.hasNonEmptyLore(hex.planetLore[planetIndex])) {
                    result.hasPlanetLore = true;
                    result.planetCount++;
                    console.log(`LoreOverlay: Found planet lore for hex ${hexLabel}, planet ${planetIndex}`);
                }
            });
        }

        return result;
    }

    hasNonEmptyLore(loreObj) {
        if (!loreObj) {
            console.log('LoreOverlay: loreObj is null/undefined');
            return false;
        }
        
        const hasContent = (loreObj.loreText && loreObj.loreText.trim()) ||
               (loreObj.footerText && loreObj.footerText.trim()) ||
               (loreObj.receiver && loreObj.receiver.trim()) ||
               (loreObj.trigger && loreObj.trigger.trim()) ||
               (loreObj.ping && loreObj.ping.trim()) ||
               (loreObj.persistance && loreObj.persistance.trim());
        
        console.log('LoreOverlay: hasNonEmptyLore check:', loreObj, 'result:', hasContent);
        return hasContent;
    }

    createLoreIndicator(hex, loreData) {
        const x = hex.center.x;
        const y = hex.center.y;
        const hexRadius = this.editor.hexRadius;

        // Create container group for this hex's indicators
        const hexGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hexGroup.setAttribute('class', 'lore-hex-indicator');
        this.overlayGroup.appendChild(hexGroup);

        // Show only one indicator per hex with priority: Combined > System > Planet
        if (loreData.hasSystemLore && loreData.hasPlanetLore) {
            // Combined indicator (star icon) - bigger and slightly above center
            this.createStarIcon(hexGroup, x, y - hexRadius * 0.3, '#9C27B0', `System & Planet Lore (${loreData.planetCount} planets)`);
        } else if (loreData.hasSystemLore) {
            // System lore indicator (book icon) - slightly above center
            this.createBookIcon(hexGroup, x, y - hexRadius * 0.3, '#4CAF50', 'System Lore');
        } else if (loreData.hasPlanetLore) {
            // Planet lore indicator (scroll icon) - slightly above center
            this.createScrollIcon(hexGroup, x, y - hexRadius * 0.3, '#FF9800', `Planet Lore (${loreData.planetCount} planets)`);
        }
    }

    createBookIcon(group, x, y, color, title) {
        // Bigger book icon using rectangles
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        // Book cover (bigger)
        const bookCover = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bookCover.setAttribute('x', '-12');
        bookCover.setAttribute('y', '-9');
        bookCover.setAttribute('width', '24');
        bookCover.setAttribute('height', '18');
        bookCover.setAttribute('fill', color);
        bookCover.setAttribute('stroke', '#fff');
        bookCover.setAttribute('stroke-width', '2');
        bookCover.setAttribute('rx', '3');
        iconGroup.appendChild(bookCover);

        // Book spine (bigger)
        const bookSpine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        bookSpine.setAttribute('x1', '-6');
        bookSpine.setAttribute('y1', '-9');
        bookSpine.setAttribute('x2', '-6');
        bookSpine.setAttribute('y2', '9');
        bookSpine.setAttribute('stroke', '#fff');
        bookSpine.setAttribute('stroke-width', '2');
        iconGroup.appendChild(bookSpine);

        // Add title for tooltip
        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createScrollIcon(group, x, y, color, title) {
        // Bigger scroll icon using path
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        // Scroll background (bigger)
        const scrollBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        scrollBg.setAttribute('x', '-12');
        scrollBg.setAttribute('y', '-9');
        scrollBg.setAttribute('width', '24');
        scrollBg.setAttribute('height', '18');
        scrollBg.setAttribute('fill', color);
        scrollBg.setAttribute('stroke', '#fff');
        scrollBg.setAttribute('stroke-width', '2');
        scrollBg.setAttribute('rx', '3');
        iconGroup.appendChild(scrollBg);

        // Scroll lines (bigger spacing)
        [-4, 0, 4].forEach(offset => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '-9');
            line.setAttribute('y1', offset);
            line.setAttribute('x2', '9');
            line.setAttribute('y2', offset);
            line.setAttribute('stroke', '#fff');
            line.setAttribute('stroke-width', '2');
            iconGroup.appendChild(line);
        });

        // Add title for tooltip
        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createStarIcon(group, x, y, color, title) {
        // Bigger star icon
        const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        iconGroup.setAttribute('transform', `translate(${x}, ${y})`);
        group.appendChild(iconGroup);

        // Star shape using polygon (bigger)
        const starPath = this.createStarPath(10);
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        star.setAttribute('d', starPath);
        star.setAttribute('fill', color);
        star.setAttribute('stroke', '#fff');
        star.setAttribute('stroke-width', '2');
        iconGroup.appendChild(star);

        // Add title for tooltip
        const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleElement.textContent = title;
        iconGroup.appendChild(titleElement);
    }

    createStarPath(radius) {
        const points = [];
        const numPoints = 5;
        const innerRadius = radius * 0.4;
        
        for (let i = 0; i < numPoints * 2; i++) {
            const r = (i % 2 === 0) ? radius : innerRadius;
            const angle = (i * Math.PI) / numPoints - Math.PI / 2;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            points.push(`${x},${y}`);
        }
        
        return `M${points.join('L')}Z`;
    }

    // Update overlay when lore data changes
    refresh() {
        if (this.isActive) {
            this.render();
        }
    }

    // Clean up
    destroy() {
        if (this.overlayGroup) {
            this.overlayGroup.remove();
        }
        this.isActive = false;
    }
}

// Export for module usage
export default LoreOverlay;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoreOverlay;
}