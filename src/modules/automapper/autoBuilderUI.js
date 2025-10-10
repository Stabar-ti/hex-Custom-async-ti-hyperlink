/**
 * AutoMapper UI - User interface management for AutoMapper
 * Handles UI components, interactions, and visual feedback
 */

/**
 * UI Theme Configuration
 */
const UI_THEME = {
    colors: {
        primary: '#00d4ff',
        secondary: '#6c5ce7',
        success: '#00b894',
        warning: '#fdcb6e',
        error: '#ff6b6b',
        background: '#1a1a2e',
        surface: '#16213e',
        text: '#ffffff',
        textSecondary: '#b8c6db'
    },
    gradients: {
        primary: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
        secondary: 'linear-gradient(135deg, #6c5ce7 0%, #5a4fcf 100%)',
        success: 'linear-gradient(135deg, #00b894 0%, #00a085 100%)',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    },
    shadows: {
        small: '0 2px 8px rgba(0,0,0,0.3)',
        medium: '0 4px 12px rgba(0,0,0,0.4)',
        large: '0 8px 24px rgba(0,0,0,0.5)'
    }
};

/**
 * Create styled button
 * @param {string} text - Button text
 * @param {string} type - Button type (primary, secondary, success, etc.)
 * @param {Function} onClick - Click handler
 * @param {Object} options - Additional options
 * @returns {HTMLElement} Styled button element
 */
export function createStyledButton(text, type = 'primary', onClick, options = {}) {
    const button = document.createElement('button');

    const baseStyle = `
        padding: ${options.size === 'large' ? '12px 24px' : options.size === 'small' ? '6px 12px' : '8px 16px'};
        border: none;
        border-radius: ${options.rounded ? '20px' : '4px'};
        font-size: ${options.size === 'large' ? '16px' : options.size === 'small' ? '12px' : '14px'};
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        ${options.width ? `width: ${options.width};` : ''}
        ${options.disabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}
    `;

    const typeStyles = {
        primary: `
            background: ${UI_THEME.gradients.primary};
            color: ${UI_THEME.colors.text};
            box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
        `,
        secondary: `
            background: ${UI_THEME.gradients.secondary};
            color: ${UI_THEME.colors.text};
            box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
        `,
        success: `
            background: ${UI_THEME.gradients.success};
            color: ${UI_THEME.colors.text};
            box-shadow: 0 4px 12px rgba(0, 184, 148, 0.3);
        `,
        outline: `
            background: transparent;
            color: ${UI_THEME.colors.primary};
            border: 2px solid ${UI_THEME.colors.primary};
            box-shadow: none;
        `,
        ghost: `
            background: transparent;
            color: ${UI_THEME.colors.textSecondary};
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: none;
        `
    };

    button.style.cssText = baseStyle + (typeStyles[type] || typeStyles.primary);
    button.innerHTML = text;

    if (onClick && !options.disabled) {
        button.addEventListener('click', onClick);
    }

    // Hover effects
    if (!options.disabled) {
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            if (type === 'primary') {
                button.style.boxShadow = '0 6px 16px rgba(0, 212, 255, 0.4)';
            } else if (type === 'secondary') {
                button.style.boxShadow = '0 6px 16px rgba(108, 92, 231, 0.4)';
            } else if (type === 'success') {
                button.style.boxShadow = '0 6px 16px rgba(0, 184, 148, 0.4)';
            }
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            if (type === 'primary') {
                button.style.boxShadow = '0 4px 12px rgba(0, 212, 255, 0.3)';
            } else if (type === 'secondary') {
                button.style.boxShadow = '0 4px 12px rgba(108, 92, 231, 0.3)';
            } else if (type === 'success') {
                button.style.boxShadow = '0 4px 12px rgba(0, 184, 148, 0.3)';
            }
        });
    }

    return button;
}

/**
 * Create styled input/select element
 * @param {string} type - Input type ('select', 'text', 'number', etc.)
 * @param {Object} options - Input options
 * @returns {HTMLElement} Styled input element
 */
export function createStyledInput(type, options = {}) {
    const element = document.createElement(type === 'select' ? 'select' : 'input');

    if (type !== 'select') {
        element.type = type;
    }

    const baseStyle = `
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #444;
        border-radius: 4px;
        background: #2a2a3e;
        color: #fff;
        font-size: 14px;
        transition: border-color 0.3s ease;
    `;

    element.style.cssText = baseStyle;

    // Add focus effects
    element.addEventListener('focus', () => {
        element.style.borderColor = UI_THEME.colors.primary;
        element.style.boxShadow = `0 0 0 2px rgba(0, 212, 255, 0.2)`;
    });

    element.addEventListener('blur', () => {
        element.style.borderColor = '#444';
        element.style.boxShadow = 'none';
    });

    if (options.placeholder) {
        element.placeholder = options.placeholder;
    }

    if (options.value) {
        element.value = options.value;
    }

    if (options.options && type === 'select') {
        options.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (opt.selected) option.selected = true;
            element.appendChild(option);
        });
    }

    return element;
}

/**
 * Create progress bar
 * @param {number} progress - Progress percentage (0-100)
 * @param {Object} options - Progress bar options
 * @returns {HTMLElement} Progress bar element
 */
export function createProgressBar(progress = 0, options = {}) {
    const container = document.createElement('div');
    container.style.cssText = `
        width: 100%;
        height: ${options.height || '4px'};
        background: rgba(255,255,255,0.1);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
    `;

    const bar = document.createElement('div');
    bar.style.cssText = `
        height: 100%;
        background: ${options.color || UI_THEME.gradients.primary};
        border-radius: 2px;
        transition: width 0.3s ease;
        width: ${Math.max(0, Math.min(100, progress))}%;
    `;

    container.appendChild(bar);

    // Add animated effect if indeterminate
    if (options.indeterminate) {
        bar.style.animation = 'progress-indeterminate 2s linear infinite';
        const style = document.createElement('style');
        style.textContent = `
            @keyframes progress-indeterminate {
                0% { width: 0%; margin-left: 0%; }
                50% { width: 75%; margin-left: 12.5%; }
                100% { width: 0%; margin-left: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    return container;
}

/**
 * Create card container
 * @param {Object} options - Card options
 * @returns {HTMLElement} Card element
 */
export function createCard(options = {}) {
    const card = document.createElement('div');

    card.style.cssText = `
        background: ${options.background || 'rgba(255,255,255,0.05)'};
        border: ${options.border || '1px solid rgba(255,255,255,0.1)'};
        border-radius: ${options.borderRadius || '8px'};
        padding: ${options.padding || '16px'};
        margin: ${options.margin || '0'};
        box-shadow: ${options.shadow || UI_THEME.shadows.small};
        transition: all 0.3s ease;
        ${options.hover ? `
            cursor: pointer;
        ` : ''}
    `;

    if (options.hover) {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = UI_THEME.shadows.medium;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = options.shadow || UI_THEME.shadows.small;
        });
    }

    return card;
}

/**
 * Create loading spinner
 * @param {Object} options - Spinner options
 * @returns {HTMLElement} Spinner element
 */
export function createLoadingSpinner(options = {}) {
    const spinner = document.createElement('div');
    const size = options.size || '24px';
    const color = options.color || UI_THEME.colors.primary;

    spinner.style.cssText = `
        width: ${size};
        height: ${size};
        border: 2px solid rgba(255,255,255,0.1);
        border-top: 2px solid ${color};
        border-radius: 50%;
        animation: spin 1s linear infinite;
        ${options.center ? `
            margin: 0 auto;
            display: block;
        ` : ''}
    `;

    // Add keyframes if not already added
    if (!document.getElementById('spinner-keyframes')) {
        const style = document.createElement('style');
        style.id = 'spinner-keyframes';
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    return spinner;
}

/**
 * Create alert/notification
 * @param {string} message - Alert message
 * @param {string} type - Alert type (success, warning, error, info)
 * @param {Object} options - Alert options
 * @returns {HTMLElement} Alert element
 */
export function createAlert(message, type = 'info', options = {}) {
    const alert = document.createElement('div');

    const typeConfig = {
        success: { color: UI_THEME.colors.success, icon: '✅' },
        warning: { color: UI_THEME.colors.warning, icon: '⚠️' },
        error: { color: UI_THEME.colors.error, icon: '❌' },
        info: { color: UI_THEME.colors.primary, icon: 'ℹ️' }
    };

    const config = typeConfig[type] || typeConfig.info;

    alert.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(${hexToRgb(config.color)}, 0.1);
        border: 1px solid rgba(${hexToRgb(config.color)}, 0.3);
        border-radius: 6px;
        color: ${UI_THEME.colors.text};
        font-size: 14px;
        margin: ${options.margin || '8px 0'};
    `;

    alert.innerHTML = `
        <span style="font-size: 16px;">${config.icon}</span>
        <span style="flex: 1;">${message}</span>
        ${options.dismissible ? `
            <button style="
                background: none; 
                border: none; 
                color: ${UI_THEME.colors.textSecondary}; 
                cursor: pointer; 
                font-size: 16px;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">×</button>
        ` : ''}
    `;

    if (options.dismissible) {
        const dismissBtn = alert.querySelector('button');
        dismissBtn.addEventListener('click', () => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 300);
        });
    }

    if (options.autoHide) {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 300);
        }, options.autoHide);
    }

    return alert;
}

/**
 * Create statistics grid
 * @param {Array} stats - Array of stat objects
 * @returns {HTMLElement} Statistics grid element
 */
export function createStatsGrid(stats) {
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        margin: 16px 0;
    `;

    stats.forEach(stat => {
        const statCard = createCard({
            padding: '16px',
            background: 'rgba(0,212,255,0.05)',
            border: '1px solid rgba(0,212,255,0.2)',
            hover: false
        });

        statCard.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: ${UI_THEME.colors.primary}; margin-bottom: 4px;">
                    ${stat.value}
                </div>
                <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary}; font-weight: 500;">
                    ${stat.label}
                </div>
                ${stat.description ? `
                    <div style="font-size: 10px; color: ${UI_THEME.colors.textSecondary}; margin-top: 4px;">
                        ${stat.description}
                    </div>
                ` : ''}
            </div>
        `;

        grid.appendChild(statCard);
    });

    return grid;
}

/**
 * Create toggle switch
 * @param {string} label - Toggle label
 * @param {boolean} checked - Initial state
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Toggle element
 */
export function createToggle(label, checked = false, onChange) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        user-select: none;
    `;

    const toggle = document.createElement('div');
    toggle.style.cssText = `
        width: 44px;
        height: 24px;
        background: ${checked ? UI_THEME.colors.primary : '#444'};
        border-radius: 12px;
        position: relative;
        transition: background 0.3s ease;
    `;

    const slider = document.createElement('div');
    slider.style.cssText = `
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: ${checked ? '22px' : '2px'};
        transition: left 0.3s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;

    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.color = UI_THEME.colors.text;

    toggle.appendChild(slider);
    container.appendChild(toggle);
    container.appendChild(labelElement);

    container.addEventListener('click', () => {
        checked = !checked;
        toggle.style.background = checked ? UI_THEME.colors.primary : '#444';
        slider.style.left = checked ? '22px' : '2px';
        if (onChange) onChange(checked);
    });

    return container;
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
    const toast = createAlert(message, type, { dismissible: true });

    toast.style.cssText += `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        min-width: 300px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

/**
 * Utility function to convert hex to RGB values
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ?
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
        '255, 255, 255';
}

// Export theme for use in other modules
export { UI_THEME };