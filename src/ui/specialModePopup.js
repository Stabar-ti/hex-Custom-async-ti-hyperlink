// src/ui/specialModePopup.js
// Popup for special setup modes using PopupUI mechanics
import { showPopup, hidePopup } from './popupUI.js';
import { showAnchoredPanel, bindAnchoredPanel } from './dropdownMenu.js';

/**
 * Open the Milty Slice Designer.
 *
 * Exported because there are two ways in now: the Tools menu, and File ▸ New map ▸ New
 * Milty Map, which loads the draft layout and then opens this onto it.
 *
 * @param {any} editor
 */
export function openMiltySliceDesigner(editor) {
    hidePopup('special-mode-popup');
    hidePopup('milty-slice-designer-popup');
    const designerContent = document.createElement('div');
    designerContent.className = 'milty-slice-designer-content';
    designerContent.style.width = '100%';
    designerContent.style.height = '100%';
    designerContent.style.display = 'flex';
    designerContent.style.flexDirection = 'column';
    designerContent.style.padding = '16px';
    designerContent.style.boxSizing = 'border-box';
    import('../modules/Milty/miltyBuilder.js').then(mod => {
        console.log('Milty Builder module loaded:', mod); // Debug: See the loaded module
        const showUI = mod.showMiltyBuilderUI || (mod.default && mod.default.showMiltyBuilderUI);

        if (typeof showUI === 'function') {
            showUI(designerContent, editor);
        } else {
            console.error('showMiltyBuilderUI is not a function in the loaded module.');
            designerContent.innerHTML = '<p style="color: red;">Error: Could not initialize Milty Slice Designer UI.</p>';
        }

        showPopup({
            id: 'milty-slice-designer-popup',
            title: '🎲 Milty Slice Designer',
            content: designerContent,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            modal: false,
            showHelp: true,
            onHelp: () => {
                // Import and call the help function
                import('../modules/Milty/miltyBuilder.js').then(helpMod => {
                    const showHelp = helpMod.showMiltyHelp || (helpMod.default && helpMod.default.showMiltyHelp);
                    if (typeof showHelp === 'function') {
                        showHelp();
                    } else {
                        console.warn('Could not find showMiltyHelp function.');
                        alert('Help system temporarily unavailable.');
                    }
                }).catch(err => {
                    console.warn('Could not load help function:', err);
                    alert('Help system temporarily unavailable.');
                });
            },
            actions: [
                {
                    label: 'Close',
                    onClick: () => hidePopup('milty-slice-designer-popup'),
                    style: { borderRadius: '0', border: '1px solid #888', padding: '6px 18px', background: '#222', color: '#eee' }
                }
            ],
            style: {
                minWidth: '340px',
                maxWidth: '700px',
                minHeight: '200px',
                maxHeight: '800px',
                border: '2px solid var(--popup-border-special)',
                borderRadius: '10px',
                boxShadow: '0 8px 40px #000a',
                padding: '24px'
            }
        });
    }).catch(err => {
        console.error('Failed to load miltyBuilder.js module:', err);
        designerContent.innerHTML = `<p style="color: red;">Failed to load module. See console for details.</p>`;
        showPopup({
            id: 'milty-slice-designer-popup',
            title: '🎲 Milty Slice Designer - Error',
            content: designerContent,
            actions: [{ label: 'Close', onClick: () => hidePopup('milty-slice-designer-popup') }]
        });
    });

}

export function showSpecialModePopup(editor) {
    hidePopup('special-mode-popup');
    const content = document.createElement('div');
    content.className = 'special-mode-content';
    content.style.width = '100%';
    content.style.height = '100%';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.padding = '12px';
    content.style.boxSizing = 'border-box';

    // Special setup: Milty Slice Designer button
    // No heading of its own: showAnchoredPanel puts the menu's name at the top, and this
    // block used to add a second one under it. The stray full stop the panel showed was
    // the <hr> between that and a closing sentence that said nothing the buttons did not.
    content.innerHTML = `
        <p class="tb-menu__note">Bulk tools that take over the map while you use them.</p>
        <div class="tb-menu__stack">
            <button id="miltySliceDesignerBtn" class="tb-menu__item">🎲 Milty Slice Designer</button>
            <button id="spinToWinBtn" class="tb-menu__item">⚙️ Spin-To-Win</button>
        </div>
    `;

    showAnchoredPanel({
        id: 'special-mode-popup',
        anchorId: 'specialModesBtn',
        title: 'Tools',
        content,
    });

    // Add click handlers for buttons
    setTimeout(() => {
        const miltyBtn = document.getElementById('miltySliceDesignerBtn');
        const spinBtn = document.getElementById('spinToWinBtn');

        if (miltyBtn) {
            miltyBtn.onclick = () => openMiltySliceDesigner(editor);
        }

        // Spin-To-Win button handler
        if (spinBtn) {
            spinBtn.onclick = () => {
                hidePopup('special-mode-popup');
                const spinContent = document.createElement('div');
                spinContent.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;';
                import('../modules/SpinToWin/spinToWin.js').then(mod => {
                    mod.showSpinToWinUI(spinContent, editor);
                    showPopup({
                        id: 'spin-to-win-popup',
                        title: '⚙️ Spin-To-Win',
                        content: spinContent,
                        draggable: true,
                        dragHandleSelector: '.popup-ui-titlebar',
                        scalable: true,
                        rememberPosition: true,
                        showHelp: true,
                        onHelp: () => import('../modules/SpinToWin/spinToWin.js').then(m => m.showSpinToWinHelp?.()),
                        style: {
                            minWidth: '420px', maxWidth: '700px',
                            border: '2px solid var(--popup-border-spin)',
                            borderRadius: '10px',
                            boxShadow: '0 8px 40px #000a',
                            padding: '16px'
                        }
                    });
                }).catch(err => {
                    console.error('Failed to load SpinToWin module:', err);
                });
            };
        }
    }, 0);
}

/**
 * Wire the Tools button in the top bar.
 *
 * This used to run as a side effect of importing the file, waiting for DOMContentLoaded
 * on its own, which is why it had no editor to hand the tools it opens. main.js calls it
 * like the other install functions now.
 *
 * @param {any} editor
 */
export function installToolsMenu(editor) {
    // Pressing Tools again puts the panel away, the same as every other menu.
    bindAnchoredPanel('specialModesBtn', 'special-mode-popup', () => showSpecialModePopup(editor));
}