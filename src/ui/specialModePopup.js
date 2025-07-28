// src/ui/specialModePopup.js
// Popup for special setup modes using PopupUI mechanics
import { showPopup, hidePopup } from './popupUI.js';

export function showSpecialModePopup() {
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
    content.innerHTML = `
        <h2>Special Setup Modes</h2>
        <p>Configure advanced or experimental features for map setup.</p>
        <div style="margin: 18px 0;">
            <button id="miltySliceDesignerBtn" class="mode-button" style="font-size:16px;padding:10px 28px;">🎲 Milty Slice Designer</button>
        </div>
        <hr>
        <p>More features coming soon!</p>
    `;

    showPopup({
        id: 'special-mode-popup',
        title: '🛠️ Special Setup Modes',
        content,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        showHelp: true,
        actions: [
            {
                label: 'Close',
                onClick: () => hidePopup('special-mode-popup'),
                style: { borderRadius: '0', border: '1px solid #888', padding: '6px 18px', background: '#222', color: '#eee' }
            }
        ],
        style: {
            minWidth: '340px',
            maxWidth: '600px',
            minHeight: '200px',
            maxHeight: '800px',
            border: '2px solid #2ecc40',
            borderRadius: '10px',
            boxShadow: '0 8px 40px #000a',
            padding: '24px',
            zIndex: 10010
        }
    });

    // Add click handlers for buttons
    setTimeout(() => {
        const miltyBtn = document.getElementById('miltySliceDesignerBtn');
        const generatorBtn = document.getElementById('miltyRandomGeneratorBtn');
        
        if (miltyBtn) {
            miltyBtn.onclick = () => {
                hidePopup('milty-slice-designer-popup');
                const designerContent = document.createElement('div');
                designerContent.className = 'milty-slice-designer-content';
                designerContent.style.width = '100%';
                designerContent.style.height = '100%';
                designerContent.style.display = 'flex';
                designerContent.style.flexDirection = 'column';
                designerContent.style.padding = '16px';
                designerContent.style.boxSizing = 'border-box';
                // Use miltyBuilder.js for the UI, with added debugging and error handling
                import('../modules/Milty/miltyBuilder.js').then(mod => {
                    console.log('Milty Builder module loaded:', mod); // Debug: See the loaded module
                    const showUI = mod.showMiltyBuilderUI || (mod.default && mod.default.showMiltyBuilderUI);

                    if (typeof showUI === 'function') {
                        showUI(designerContent);
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
                            border: '2px solid #2ecc40',
                            borderRadius: '10px',
                            boxShadow: '0 8px 40px #000a',
                            padding: '24px',
                            zIndex: 10011
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
            };
        }
        
        // Add click handler for Milty Random Generator button
        if (generatorBtn) {
            generatorBtn.onclick = () => {
                import('../modules/Milty/miltyBuilderRandomTool.js').then(mod => {
                    const showGenerator = mod.showMiltyDraftGeneratorPopup;
                    if (typeof showGenerator === 'function') {
                        showGenerator();
                    } else {
                        console.error('showMiltyDraftGeneratorPopup is not a function in the loaded module.');
                        alert('Error: Could not initialize Milty Draft Generator.');
                    }
                }).catch(err => {
                    console.error('Failed to load miltyBuilderRandomTool.js module:', err);
                    alert('Failed to load generator. See console for details.');
                });
            };
        }
    }, 0);
}

// Attach to button if loaded directly
if (typeof window !== 'undefined') {
    window.showSpecialModePopup = showSpecialModePopup;
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('specialModesBtn');
        if (btn) btn.addEventListener('click', showSpecialModePopup);
    });
}