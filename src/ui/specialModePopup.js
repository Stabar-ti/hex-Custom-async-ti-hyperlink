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
        <div style="margin: 18px 0; display: grid; gap: 12px;">
            <button id="miltySliceDesignerBtn" class="mode-button" style="font-size:16px;padding:10px 28px;">🎲 Milty Slice Designer</button>
            <button id="miltyRandomGeneratorBtn" class="mode-button" style="font-size:16px;padding:10px 28px;display:none;">🎯 Milty Random Generator</button>
            <button id="autoMapBuilderBtn" class="mode-button" style="font-size:16px;padding:10px 28px;display:none;">🤖 AutoMapper - Intelligent Map Builder</button>
        </div>
        <hr>
        <p style="font-size: 14px; color: #888; margin-top: 16px;">Advanced tools for competitive and casual play setup.</p>
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
        const autoMapperBtn = document.getElementById('autoMapBuilderBtn');

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
                    const showGenerator = mod.initializeGeneratorPopup;
                    if (typeof showGenerator === 'function') {
                        showGenerator();
                    } else {
                        console.error('initializeGeneratorPopup is not a function in the loaded module.');
                        console.log('Available exports:', Object.keys(mod));
                        alert('Error: Could not initialize Milty Draft Generator.');
                    }
                }).catch(err => {
                    console.error('Failed to load miltyBuilderRandomTool.js module:', err);
                    alert('Failed to load generator. See console for details.');
                });
            };
        }

        // Add click handler for AutoMapper button
        if (autoMapperBtn) {
            autoMapperBtn.onclick = () => {
                hidePopup('special-mode-popup');
                const autoMapperContent = document.createElement('div');
                autoMapperContent.className = 'automapper-content';
                autoMapperContent.style.width = '100%';
                autoMapperContent.style.height = '100%';
                autoMapperContent.style.display = 'flex';
                autoMapperContent.style.flexDirection = 'column';
                autoMapperContent.style.padding = '16px';
                autoMapperContent.style.boxSizing = 'border-box';

                // Use autoBuilder.js for the UI
                import('../modules/automapper/autoBuilder.js').then(mod => {
                    console.log('AutoMapper module loaded:', mod);
                    const showUI = mod.showAutoBuilderUI || (mod.default && mod.default.showAutoBuilderUI);

                    if (typeof showUI === 'function') {
                        showUI(autoMapperContent);
                    } else {
                        console.error('showAutoBuilderUI is not a function in the loaded module.');
                        autoMapperContent.innerHTML = '<p style="color: red;">Error: Could not initialize AutoMapper UI.</p>';
                    }

                    showPopup({
                        id: 'automapper-popup',
                        title: '🤖 AutoMapper - Intelligent Map Builder',
                        content: autoMapperContent,
                        draggable: true,
                        dragHandleSelector: '.popup-ui-titlebar',
                        scalable: true,
                        rememberPosition: true,
                        modal: false,
                        showHelp: true,
                        onHelp: () => {
                            // Import and call the help function
                            import('../modules/automapper/autoBuilderPopups.js').then(helpMod => {
                                const showHelp = helpMod.showAutoBuilderHelp || (helpMod.default && helpMod.default.showAutoBuilderHelp);
                                if (typeof showHelp === 'function') {
                                    showHelp();
                                } else {
                                    console.warn('Could not find showAutoBuilderHelp function.');
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
                                onClick: () => hidePopup('automapper-popup'),
                                style: { borderRadius: '0', border: '1px solid #888', padding: '6px 18px', background: '#222', color: '#eee' }
                            }
                        ],
                        style: {
                            minWidth: '400px',
                            maxWidth: '800px',
                            minHeight: '300px',
                            maxHeight: '90vh',
                            border: '2px solid #00d4ff',
                            borderRadius: '10px',
                            boxShadow: '0 8px 40px #000a',
                            padding: '24px',
                            zIndex: 10012
                        }
                    });
                }).catch(err => {
                    console.error('Failed to load autoBuilder.js module:', err);
                    autoMapperContent.innerHTML = `<p style="color: red;">Failed to load AutoMapper module. See console for details.</p>`;
                    showPopup({
                        id: 'automapper-popup',
                        title: '🤖 AutoMapper - Error',
                        content: autoMapperContent,
                        actions: [{ label: 'Close', onClick: () => hidePopup('automapper-popup') }]
                    });
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