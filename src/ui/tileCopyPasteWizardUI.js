// src/ui/tileCopyPasteWizardUI.js
// UI logic for the multi-tile copy/cut/paste wizard
// Handles popup, button, toggles, keyboard shortcuts, and visual feedback

import { startCopyPasteWizard } from '../features/tileCopyPasteWizard.js';
import { showPopup, hidePopup } from './popupUI.js';

// --- Main wizard popup ---
let wizardPopup = null;
export function showWizardPopup(message, actions = []) {
    if (wizardPopup) hidePopup(wizardPopup);
    // Build wizard content (message, actions, toggles)
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="wizard-main-message"></div>
      <div class="wizard-actions"></div>
      <div class="wizard-toggles" style="margin-top:18px; display: flex; flex-direction: column; gap: 8px;">
        <label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="toggleWormholes" checked> <span>Include Wormholes</span></label>
        <label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="toggleCustomAdj" checked> <span>Include Custom Links</span></label>
        <label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="toggleBorderAnomalies" checked> <span>Include Border Anomalies</span></label>
      </div>
    `;
    wizardPopup = showPopup({
        content: wrapper,
        actions,
        id: 'wizard-popup',
        className: 'wizard-main-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar', // Use generic popup title bar
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: 'Copy/Cut Wizard', // Pass title to generic popup system
        style: {
            borderRadius: '16px'
        },
        showHelp: true, // Show Help button in title bar
        onHelp: showWizardHelpPopup // Callback for Help button
    });
    // Add the title text to the generic popup title bar
    setTimeout(() => {
        const titleBar = wizardPopup.querySelector('.popup-ui-titlebar');
        if (titleBar) {
            // Remove any previous title text
            Array.from(titleBar.childNodes).forEach(node => {
                if (node.nodeType === 3 || (node.tagName === 'SPAN' && node.className !== 'popup-ui-close')) node.remove();
            });
            // Insert the title text before the close button
            const titleText = document.createElement('span');
            titleText.textContent = 'Copy/Cut Wizard';
            titleText.style.fontSize = '1.1rem';
            titleText.style.fontWeight = 'bold';
            titleText.style.flex = '1';
            titleText.style.alignSelf = 'center';
            const closeBtn = titleBar.querySelector('.popup-ui-close');
            titleBar.insertBefore(titleText, closeBtn);
        }
    }, 0);
    // Set the message in the dedicated message area
    const msgDiv = wrapper.querySelector('.wizard-main-message');
    if (msgDiv) msgDiv.innerHTML = message;
    // Move the actions above the toggles
    setTimeout(() => {
        const actionsDiv = wrapper.querySelector('.wizard-actions');
        if (actionsDiv && wizardPopup.actions && Array.isArray(wizardPopup.actions)) {
            actionsDiv.innerHTML = '';
            wizardPopup.actions.forEach(action => {
                const btn = document.createElement('button');
                btn.textContent = action.label;
                btn.className = 'wizard-action-btn';
                if (action.toggled) btn.classList.add('toggled');
                btn.onclick = () => action.action(btn);
                actionsDiv.appendChild(btn);
            });
        }
    }, 0);
    // Setup toggles to update global options
    setTimeout(() => {
        const opts = window.tileCopyOptions = window.tileCopyOptions || { wormholes: true, customAdjacents: true, borderAnomalies: true };
        const w = document.getElementById('toggleWormholes');
        const c = document.getElementById('toggleCustomAdj');
        const b = document.getElementById('toggleBorderAnomalies');
        if (w) w.checked = opts.wormholes;
        if (c) c.checked = opts.customAdjacents;
        if (b) b.checked = opts.borderAnomalies;
        if (w) w.onchange = () => { opts.wormholes = w.checked; };
        if (c) c.onchange = () => { opts.customAdjacents = c.checked; };
        if (b) b.onchange = () => { opts.borderAnomalies = b.checked; };
    }, 0);
}

export function hideWizardPopup() {
    if (wizardPopup) hidePopup(wizardPopup);
    wizardPopup = null;
    // Also hide info popup if present
    hidePopup('wizard-info-popup');
}

// --- Info/warning popup at top of SVG ---
let infoPopup = null;
export function showWizardInfoPopup(message, actions = []) {
    if (infoPopup) hidePopup(infoPopup);
    // Use the new popup system for a visually and functionally separate info/warning popup
    // Always show as a separate popup, not inside the main wizard popup
    let svg = document.querySelector('svg');
    let parent = svg ? svg.parentNode : document.body;
    // Build a styled info/warning content wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'wizard-info-content';
    wrapper.innerHTML = `
      <div class="wizard-info-message" style="padding: 18px 22px 16px 22px; font-size: 1.08rem; color: #e3f2fd; background: rgba(32,32,32,0.85); border-radius: 14px; min-height: 48px; letter-spacing: 0.01em;">${message}</div>
    `;
    infoPopup = showPopup({
        content: wrapper,
        actions: actions, // Show any actions passed in (e.g. Continue)
        id: 'wizard-info-popup',
        className: 'popup-ui-info',
        parent,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar', // Use generic popup title bar
        scalable: false,
        rememberPosition: true,
        modal: false, // Always allow user to close manually
        style: {
            position: 'absolute',
            left: svg ? (svg.offsetLeft + svg.clientWidth / 2 - 200) + 'px' : '50%',
            top: svg ? (svg.offsetTop + 12) + 'px' : '24px',
            minWidth: '320px',
            maxWidth: '480px',
            zIndex: 2000,
            transform: svg ? '' : 'translateX(-50%)',
            borderRadius: '16px',
            border: '2.5px solid #2196f3',
            boxShadow: '0 0 0 3px #2196f355, 0 4px 24px rgba(0,0,0,0.18)'
        },
        title: '⚠️ Info / Warning',
        showClose: false // Hide close button
    });
    // Style the title bar to match the wizard popup
    setTimeout(() => {
        const titleBar = infoPopup.querySelector('.popup-ui-titlebar');
        if (titleBar) {
            titleBar.style.background = '#444';
            titleBar.style.color = '#fff';
            titleBar.style.fontWeight = 'bold';
            titleBar.style.fontSize = '1.1rem';
            titleBar.style.borderRadius = '14px 14px 0 0';
            // Remove the close button if present
            const closeBtn = titleBar.querySelector('.popup-ui-close');
            if (closeBtn) {
                closeBtn.remove();
            }
        }
        // Style info popup action buttons to match wizard popup
        const actionBtns = infoPopup.querySelectorAll('.wizard-action-btn');
        actionBtns.forEach(btn => {
            btn.style.background = '#444';
            btn.style.color = '#fff';
            btn.style.borderRadius = '8px';
            btn.style.border = '1.5px solid #2196f3';
            btn.style.fontSize = '1rem';
            btn.style.fontWeight = '500';
            btn.style.padding = '6px 18px';
            btn.style.boxShadow = '0 2px 8px #2196f355';
            btn.style.cursor = 'pointer';
        });
    }, 0);
}

export function hideWizardInfoPopup() {
    if (infoPopup) hidePopup(infoPopup);
    infoPopup = null;
}

// --- Setup the wizard button and popup logic ---
export function setupTileCopySingleButtonAndPopup() {
    // Find the static Copy/Cut Wizard button in the top bar
    const btn = document.getElementById('tileCopySingleBtn');
    if (!btn) return;
    let selectedAction = null;
    btn.onclick = () => {
        // Show the base wizard popup with Copy and Cut buttons
        function getActions(selected) {
            return [
                {
                    label: 'Copy',
                    toggled: selected === 'Copy',
                    action: (button) => {
                        selectedAction = 'Copy';
                        // Update toggled state
                        if (button && button.parentNode) {
                            Array.from(button.parentNode.children).forEach(b => {
                                b.classList.remove('toggled');
                            });
                            button.classList.add('toggled');
                        }
                        // Trigger the wizard logic for Copy
                        startCopyPasteWizard(window.editor, false);
                    }
                },
                {
                    label: 'Cut',
                    toggled: selected === 'Cut',
                    action: (button) => {
                        selectedAction = 'Cut';
                        if (button && button.parentNode) {
                            Array.from(button.parentNode.children).forEach(b => {
                                b.classList.remove('toggled');
                            });
                            button.classList.add('toggled');
                        }
                        // Trigger the wizard logic for Cut
                        startCopyPasteWizard(window.editor, true);
                    }
                },
                {
                    label: 'Cancel',
                    action: () => hideWizardPopup()
                }
            ];
        }
        showWizardPopup('Select an operation:', getActions(selectedAction));
    };
}

// --- Help Popup Logic ---
let helpPopup = null;
export function showWizardHelpPopup() {
    if (helpPopup) hidePopup(helpPopup);
    helpPopup = showPopup({
        id: 'wizard-help-popup',
        className: 'wizard-help-popup',
        content: `<h2>Copy/Cut/Paste Help</h2>
            <ul style="text-align:left;max-width:500px;padding-left:2em;">
                <li><b>Copy:</b> Select tiles with <b>Shift+Click</b> (connected only), release Shift to finish, then <b>Left Click</b> to paste. You can paste repeatedly.</li>
                <li><b>Cut:</b> Same as copy, but original tiles are cleared after pasting. Paste mode is released after one paste.</li>
                <li><b>Rotate:</b> During paste preview, hold <b>Alt</b> and use the <b>Mouse Wheel</b> to rotate the selection by 60°.</li>
                <li><b>Cancel:</b> Use the <b>Cancel</b> button or <b>Right Click</b> to release paste mode (right click does not close the wizard popup).</li>
                <li><b>Warnings:</b> Info/warning popups appear for special cases (e.g., copying systems with planets). These close automatically after paste.</li>
                <li><b>Dark Mode:</b> All popups and overlays support dark mode.</li>
            </ul>`,
        actions: [
            { label: 'Close', action: () => hidePopup('wizard-help-popup') }
        ],
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: 'Copy/Cut Wizard Help',
        showHelp: false // Don't show help button in help popup
    });
}

// --- Patch main wizard popup to use Help button from popupUI ---
if (!window._wizardPopupHelpPatched) {
    window._wizardPopupHelpPatched = true;
    const origShowWizardPopup = showWizardPopup;
    window._origShowWizardPopup = origShowWizardPopup;
    window.showWizardPopup = function (message, actions) {
        if (!actions.some(a => a.label === 'Help')) {
            actions.push({ label: 'Help', action: showWizardHelpPopup });
        }
        origShowWizardPopup(message, actions);
    };
}

// Expose wizard popup functions for debugging/manual use
// window.showWizardPopup = showWizardPopup;
// window.hideWizardPopup = hideWizardPopup;
// window.showWizardInfoPopup = showWizardInfoPopup;
// window.hideWizardInfoPopup = hideWizardInfoPopup;

// --- END OF FILE ---
