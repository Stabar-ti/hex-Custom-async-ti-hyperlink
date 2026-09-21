// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Converted to popup-based system that auto-opens and is minimizable only
// ───────────────────────────────────────────────────────────────

import { sectorModes, wormholeTypes } from '../constants/constants.js';
import { showModal } from './uiModals.js';
import { makePopupDraggable } from './uiUtils.js';
import { showPopup, hidePopup } from './popupUI.js';
import { panelButton } from './kit/index.js';
import {
  invoke, tryInvoke, hasCommand,
  registerMode, activateMode, deactivateMode, deactivateModes, COMMANDS
} from '../core/registry.js';

// Ids for the two map-click modes this file owns. Only one can be armed at a time; the
// registry is what enforces that, so every button that opens something else disarms them
// with one deactivateModes() instead of the block that used to be pasted at each site.
const MODE_LORE = 'lore';
const MODE_TOKEN = 'token';

let sectorControlsPopup = null;

export function populateSectorControls(editor) {
  // Legacy function - now just opens the popup
  openSectorControlsPopup(editor);
}

export function openSectorControlsPopup(editor) {
  // Close existing popup if any
  if (sectorControlsPopup) {
    hidePopup('sectorControlsPopupModal');
  }

  // Create the content for the popup
  const content = createSectorControlsContent(editor);

  // Show the popup
  sectorControlsPopup = showPopup({
    id: 'sectorControlsPopupModal',
    className: 'layout-options-popup sector-controls-popup',
    title: 'Sector Controls',
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true, // Allow users to resize the popup
    rememberPosition: true,
    modal: false, // Allow title bar creation, we'll manually remove close button
    style: {
      left: '20px', // Position on the left side like the original container
      top: '80px',
      minWidth: '180px',
      maxWidth: '400px',
      minHeight: '200px',
      maxHeight: '800px',
      color: '#fff',
      border: '2px solid var(--popup-border-sector)',
      boxShadow: '0 8px 40px #000a',
      padding: '0',
      zIndex: 1200,
      borderRadius: '8px'
    },
    content: content,
    onClose: () => {
      sectorControlsPopup = null;
    }
  });

  // Remove the close button and add custom minimize button
  customizeTitleBar(sectorControlsPopup);

  return sectorControlsPopup;
}

function customizeTitleBar(popup) {
  const titleBar = popup.querySelector('.popup-ui-titlebar');
  if (!titleBar) return;

  // Remove the close button
  const closeBtn = titleBar.querySelector('.popup-ui-close');
  if (closeBtn) {
    closeBtn.remove();
  }

  // Add custom minimize button
  addMinimizeButton(popup);
}

function addMinimizeButton(popup) {
  const titleBar = popup.querySelector('.popup-ui-titlebar');
  if (!titleBar) return;

  // Create minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'popup-ui-minimize wizard-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.fontSize = '1.2rem';
  minimizeBtn.style.width = '28px';
  minimizeBtn.style.height = '28px';
  minimizeBtn.style.lineHeight = '28px';
  minimizeBtn.style.position = 'relative';
  minimizeBtn.style.marginLeft = '8px';
  minimizeBtn.style.display = 'flex';
  minimizeBtn.style.alignItems = 'center';
  minimizeBtn.style.justifyContent = 'center';
  minimizeBtn.style.borderRadius = '0';
  minimizeBtn.style.border = '1px solid #666';
  minimizeBtn.style.background = '#333';
  minimizeBtn.style.color = '#fff';
  minimizeBtn.style.cursor = 'pointer';

  let isMinimized = false;
  let originalHeight = popup.style.height;

  minimizeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent popup dragging
    const content = popup.querySelector('.sector-controls-content');
    if (!content) return;

    if (isMinimized) {
      // Restore
      content.style.display = 'block';
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize';
      popup.style.height = originalHeight || 'auto';
      popup.style.resize = 'both'; // Re-enable resizing
      isMinimized = false;
    } else {
      // Minimize
      originalHeight = popup.style.height; // Store current height
      content.style.display = 'none';
      minimizeBtn.innerHTML = '□';
      minimizeBtn.title = 'Restore';
      popup.style.height = '40px';
      popup.style.resize = 'none'; // Disable resizing when minimized
      isMinimized = true;
    }
  };

  titleBar.appendChild(minimizeBtn);
}

function createSectorControlsContent(editor) {
  const container = document.createElement('div');
  container.className = 'sector-controls-content';
  container.style.padding = '15px';
  container.style.overflow = 'auto'; // Allow scrolling if content is too long
  container.style.width = '100%'; // Explicit width constraint
  container.style.maxWidth = '100%'; // Never exceed parent
  container.style.boxSizing = 'border-box';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.minWidth = '0'; // Prevent flex items from growing beyond container

  // ───────────── System Tiles Button ─────────────
  const realIdBtn = panelButton({
    id: 'jumpToSystemBtn',
    className: 'btn-lookup-id',
    text: 'System Tiles',
    title: 'Choose Async Tile',
  });
  realIdBtn.addEventListener('click', () => {
    deactivateModes();

    invoke(COMMANDS.showSystemPicker);
  });
  container.appendChild(realIdBtn);

  // ── separator + section label ──
  const sep0 = document.createElement('div');
  sep0.style.borderTop = '1px solid #555';
  sep0.style.margin = '10px 0 6px 0';
  container.appendChild(sep0);

  const drawLabel = document.createElement('div');
  drawLabel.className = 'popup-section-label';
  drawLabel.textContent = 'Draw your design';
  container.appendChild(drawLabel);

  // ───────────── Essential System Types ─────────────
  const essentialSystemTypes = [
    { mode: 'hyperlane', label: 'Hyperlanes', cls: 'btn-empty' },
    { mode: 'void', label: 'Void', cls: 'btn-void' },
    { mode: 'homesystem', label: 'Homesystem', cls: 'btn-homesystem' }
  ];

  essentialSystemTypes.forEach(({ mode, label, cls }) => {
    const btn = panelButton({ className: cls, text: label });
    btn.dataset.mode = mode;
    btn.addEventListener('click', (e) => {
      const turningOff = e.currentTarget.classList.contains('active');

      // Clear active state from all buttons in the sector controls
      container.querySelectorAll('.mode-button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      });

      deactivateModes();

      if (turningOff) {
        editor.setMode('none');
        return;
      }

      // Set active state on clicked button (like wormhole popup)
      e.currentTarget.classList.add('active');
      e.currentTarget.style.background = '#666';
      e.currentTarget.style.color = '#fff';
      e.currentTarget.style.fontWeight = 'bold';
      editor.setMode(mode);
    });
    container.appendChild(btn);
  });

  // ───────────── Draw Helpers Modal Launcher ─────────────
  const drawHelpersBtn = panelButton({
    id: 'launchDrawHelpersPopup',
    text: 'Draw Helpers…',
    title: 'Quick Drawing Tools',
  });
  drawHelpersBtn.onclick = () => openDrawHelpersPopup(editor, { launcher: drawHelpersBtn, ownerPanel: container });
  container.appendChild(drawHelpersBtn);

  return finishSectorControlsContent(editor, container);
}

/**
 * Opens the Draw Helpers popup: tile-type and effect painting, the AutoMapper section
 * with its V1–V5 / R / I / T value hints, and the value overlay controls.
 *
 * Extracted from the Sector Controls launcher so every entry point opens the same popup.
 * simplepPopup.js used to carry a second, hand-maintained copy that had fallen ~200 lines
 * behind this one — no value hints at all — and was unreachable anyway.
 *
 * @param {Object} editor
 * @param {{launcher?: HTMLElement, ownerPanel?: HTMLElement}} [opts]
 *        `launcher` is the button that opened it, lit while a paint mode is active;
 *        `ownerPanel` is the panel whose other buttons should be de-activated first.
 *        Both are optional — the popup works standalone.
 */
export function openDrawHelpersPopup(editor, { launcher = null, ownerPanel = null } = {}) {
    // Clear active state from all buttons in the owning panel first
    ownerPanel?.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });

    deactivateModes();

    // Lights the launcher while a Draw Helpers paint mode is active, so it is obvious the
    // next map click will paint. No-ops when the popup was opened without one.
    const setLauncherActive = (on) => {
      if (!launcher) return;
      launcher.classList.toggle('active', on);
      launcher.style.background = on ? '#666' : '';
      launcher.style.color = on ? '#fff' : '';
      if (on) launcher.style.fontWeight = 'bold';
    };

    return showPopup({
      id: 'drawHelpersPopupModal',
      className: 'layout-options-popup',
      title: 'Draw Helpers',
      draggable: true,
      dragHandleSelector: '.popup-ui-titlebar',
      scalable: true,
      rememberPosition: true,
      style: {
        left: '800px',
        top: '120px',
        minWidth: '240px',
        maxWidth: '600px',
        minHeight: '120px',
        maxHeight: '600px',
        color: '#fff',
        border: '2px solid var(--popup-border-special)',
        boxShadow: '0 8px 40px #000a',
        padding: '0 0 18px 0',
        zIndex: 1300
      },
      content: (() => {
        const content = document.createElement('div');
        content.className = 'modal-content popup-btn-grid draw-helpers-btn-grid';
        content.style.display = 'grid';
        content.style.gridTemplateColumns = 'repeat(3, 1fr)'; // 3 columns for compact layout
        content.style.gap = '8px';
        content.style.padding = '15px';

        // Define draw helper tools
        const drawHelpers = [
          { mode: '1 planet', label: '1 Planet', cls: 'btn-1' },
          { mode: '2 planet', label: '2 Planet', cls: 'btn-2' },
          { mode: '3 planet', label: '3 Planet', cls: 'btn-3' },
          { mode: 'legendary planet', label: 'Legendary', cls: 'btn-legendary' },
          { mode: 'empty', label: 'Empty', cls: 'btn-empty' },
          { mode: 'special', label: 'Special', cls: 'btn-special' },
          { mode: 'fracture', label: 'Fracture', cls: 'btn-fracture', color: '#ffb3b3' }
        ];

        drawHelpers.forEach(({ mode, label, cls, color }) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = `mode-button ${cls}`;
          btn.style.border = '1px solid #666';
          btn.style.borderRadius = '4px';
          btn.style.padding = '8px 12px';
          btn.style.fontSize = '0.9em';
          btn.style.fontWeight = 'bold';
          btn.style.maxWidth = '120px';
          btn.style.height = '35px';
          btn.style.overflow = 'hidden';
          btn.style.textOverflow = 'ellipsis';
          btn.style.whiteSpace = 'nowrap';
          if (color) { btn.style.background = color; btn.style.color = '#333'; }
          btn.addEventListener('click', (e) => {
            const turningOff = e.currentTarget.classList.contains('active');
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = b._baseColor || '';
              b.style.color = b._baseColor ? '#333' : '';
              b.style.fontWeight = 'bold';
            });
            if (turningOff) {
              setLauncherActive(false);
              editor.setMode('none');
              return;
            }
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            setLauncherActive(true);
            editor.setMode(mode);
          });
          btn._baseColor = color || '';
          content.appendChild(btn);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.gridColumn = '1 / -1'; // Span all columns
        separator.style.borderTop = '1px solid #666';
        separator.style.margin = '10px 0';
        content.appendChild(separator);

        // Add Effects section
        const effectsLabel = document.createElement('div');
        effectsLabel.textContent = 'Effects:';
        effectsLabel.style.gridColumn = '1 / -1'; // Span all columns
        effectsLabel.style.fontWeight = 'bold';
        effectsLabel.style.color = '#ffe066';
        effectsLabel.style.marginBottom = '8px';
        content.appendChild(effectsLabel);

        const effects = [
          { mode: 'nebula',    label: 'Nebula',    cls: 'btn-nebula' },
          { mode: 'rift',      label: 'Rift',      cls: 'btn-rift' },
          { mode: 'asteroid',  label: 'Asteroid',  cls: 'btn-asteroid' },
          { mode: 'supernova', label: 'Supernova', cls: 'btn-supernova' },
          { mode: 'scar',      label: 'Scar ☄️',   cls: 'btn-scar' }
        ];

        effects.forEach(({ mode, label, cls }) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = `mode-button ${cls}`;
          btn.style.border = '1px solid #666';
          btn.style.borderRadius = '4px';
          btn.style.padding = '8px 12px';
          btn.style.fontSize = '0.9em';
          btn.style.fontWeight = 'bold';
          btn.style.maxWidth = '120px'; // Fixed max size for compact grid
          btn.style.height = '35px'; // Fixed height
          btn.style.overflow = 'hidden';
          btn.style.textOverflow = 'ellipsis';
          btn.style.whiteSpace = 'nowrap';
          btn.addEventListener('click', (e) => {
            const turningOff = e.currentTarget.classList.contains('active');
            // Clear active from all buttons in the popup
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = '';
              b.style.color = '';
              b.style.fontWeight = 'bold';
            });
            if (turningOff) {
              setLauncherActive(false);
              editor.setMode('none');
              return;
            }
            // Set active state on clicked button
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            // Also show draw helpers button as active in sector controls
            setLauncherActive(true);
            editor.setMode(mode);
          });
          content.appendChild(btn);
        });

        // ── Value target drawing ────────────────────────────────────────
        // Configure tier (V1–V5) + skew (R/I/T) FIRST, then click hexes to paint.
        // All flags are independent — any combination is valid.
        // ── AutoMapper collapsible section ───────────────────────────────
        const amTopSep0 = document.createElement('div');
        amTopSep0.style.cssText = 'grid-column:1/-1;border-top:1px solid #444;margin:10px 0;';
        content.appendChild(amTopSep0);

        const amToggle = document.createElement('button');
        amToggle.className = 'mode-button';
        amToggle.style.cssText = 'grid-column:1/-1;width:100%;padding:7px 12px;font-size:0.9em;font-weight:bold;border:1px solid #555;border-radius:4px;cursor:pointer;text-align:left;';
        amToggle.textContent = '🤖 AutoMapper ▾';
        amToggle._open = false;
        content.appendChild(amToggle);

        const amSection = document.createElement('div');
        amSection.style.cssText = 'grid-column:1/-1;display:none;';
        content.appendChild(amSection);

        amToggle.onclick = () => {
          amToggle._open = !amToggle._open;
          amSection.style.display = amToggle._open ? 'block' : 'none';
          amToggle.textContent = amToggle._open ? '🤖 AutoMapper ▴' : '🤖 AutoMapper ▾';
        };

        // Value hint section — inside the collapsible
        const vtSep = document.createElement('div');
        vtSep.style.cssText = 'border-top:1px solid #555;margin:8px 0;';
        amSection.appendChild(vtSep);

        const vtLabel = document.createElement('div');
        vtLabel.style.cssText = 'font-size:0.8em;color:#aaa;margin-bottom:5px;';
        vtLabel.textContent   = 'Value hints — configure then click hexes:';
        amSection.appendChild(vtLabel);

        // State held in closure — not editor mode toggles
        let vt_tier = null, vt_R = false, vt_I = false, vt_T = false;
        let vtPaintActive = false;

        function updateVtPreview() {
          const parts = [];
          if (vt_tier) parts.push(`V${vt_tier}`);
          if (vt_R) parts.push('R');
          if (vt_I) parts.push('I');
          if (vt_T) parts.push('T');
          vtPreview.textContent = parts.length ? `Painting: ${parts.join('+')}` : 'Nothing selected';
          vtPreview.style.color = parts.length ? '#ffe066' : '#666';
          // Activate or deactivate painting mode
          vtPaintActive = parts.length > 0;
          if (vtPaintActive) {
            editor._valuePaintConfig = { tier: vt_tier, r: vt_R, i: vt_I, t: vt_T };
            editor.setMode('value-target-apply');
            setLauncherActive(true);
          } else {
            editor._valuePaintConfig = null;
            if (editor.mode === 'value-target-apply') editor.setMode('');
          }
        }

        // Tier row V1–V5
        const tierRow = document.createElement('div');
        tierRow.style.cssText = 'grid-column:1/-1;display:flex;gap:3px;margin-bottom:4px;';
        const TIER_COLORS = ['#ff6b6b','#ffa94d','#ffe066','#a9e34b','#40c057'];
        const tierBtns = [];
        TIER_COLORS.forEach((color, idx) => {
          const tier = idx + 1;
          const btn = document.createElement('button');
          btn.textContent  = `V${tier}`;
          btn.className    = 'mode-button';
          btn.title        = `Tier ${tier} overall value (1=low, 5=high). Click again to deselect.`;
          btn.style.cssText = `flex:1;padding:5px 2px;font-size:0.85em;font-weight:bold;border:2px solid ${color};border-radius:4px;color:${color};cursor:pointer;`;
          btn.addEventListener('click', () => {
            vt_tier = (vt_tier === tier) ? null : tier; // toggle
            tierBtns.forEach((b, i) => {
              const c = TIER_COLORS[i];
              b.style.background = (vt_tier === i + 1) ? c : '';
              b.style.color      = (vt_tier === i + 1) ? '#111' : c;
            });
            updateVtPreview();
          });
          tierBtns.push(btn);
          tierRow.appendChild(btn);
        });
        amSection.appendChild(tierRow);

        // Skew checkboxes R / I / T
        const skewRow = document.createElement('div');
        skewRow.style.cssText = 'grid-column:1/-1;display:flex;gap:3px;margin-bottom:4px;';
        const SKEW_CFG = [
          { label:'R  Res', color:'#f5a623', get: ()=>vt_R, set: v=>{ vt_R=v; } },
          { label:'I  Inf', color:'#7ecfff', get: ()=>vt_I, set: v=>{ vt_I=v; } },
          { label:'T  Tech',color:'#b07cff', get: ()=>vt_T, set: v=>{ vt_T=v; } },
        ];
        SKEW_CFG.forEach(({ label, color, get, set }) => {
          const btn = document.createElement('button');
          btn.textContent  = label;
          btn.className    = 'mode-button';
          btn.title        = `Toggle preference for ${label.split(' ')[1]} — can combine with tier and other skews`;
          btn.style.cssText = `flex:1;padding:5px 4px;font-size:0.82em;font-weight:bold;border:2px solid ${color};border-radius:4px;color:${color};cursor:pointer;`;
          btn.addEventListener('click', () => {
            set(!get());
            btn.style.background = get() ? color : '';
            btn.style.color      = get() ? '#111' : color;
            updateVtPreview();
          });
          skewRow.appendChild(btn);
        });

        // Clear button
        const vtClearBtn = document.createElement('button');
        vtClearBtn.textContent   = '✕ Clear';
        vtClearBtn.className     = 'mode-button';
        vtClearBtn.title         = 'Remove all value hints from a hex (click hex after)';
        vtClearBtn.style.cssText = 'flex:0 0 54px;padding:5px 4px;font-size:0.82em;font-weight:bold;border:2px solid var(--surface-5);border-radius:4px;color:#aaa;cursor:pointer;';
        vtClearBtn.addEventListener('click', () => {
          // Activate clear mode regardless of config state
          content.querySelectorAll('.mode-button').forEach(b => {
            b.classList.remove('active');
            b.style.background = b._baseColor || '';
            b.style.color      = b._baseColor ? '#333' : '';
          });
          vtClearBtn.classList.add('active');
          vtClearBtn.style.background = '#555';
          editor.setMode('value-target-clear');
          setLauncherActive(true);
        });
        skewRow.appendChild(vtClearBtn);
        amSection.appendChild(skewRow);

        // Preview line showing current combination
        const vtPreview = document.createElement('div');
        vtPreview.style.cssText = 'font-size:0.8em;font-weight:bold;color:#666;';
        vtPreview.textContent   = 'Nothing selected';
        amSection.appendChild(vtPreview);

        const amBtn = document.createElement('button');
        amBtn.textContent = '🤖 Open AutoMapper';
        amBtn.className = 'mode-button';
        amBtn.style.cssText = 'width:100%;padding:8px 12px;font-size:0.9em;font-weight:bold;border:2px solid var(--popup-border-special);border-radius:4px;cursor:pointer;color:var(--popup-border-special);background:#0a1a0a;';
        amBtn.onclick = () => {
          import('../modules/automapper/autoBuilder.js').then(mod => {
            mod.openAutoMapperPopup();
          }).catch(err => console.error('Failed to load AutoMapper:', err));
        };
        amSection.appendChild(amBtn);

        // ── Value Overlay ─────────────────────────────────────────────
        const voSep = document.createElement('div');
        voSep.style.cssText = 'border-top:1px solid #444;margin:8px 0;';
        amSection.appendChild(voSep);

        const voLabel = document.createElement('div');
        voLabel.style.cssText  = 'font-size:0.8em;color:#aaa;margin-bottom:4px;';
        voLabel.textContent    = 'Value overlay (1–5 tier, based on ideal R/I + tech)';
        amSection.appendChild(voLabel);

        // State for the three weighting toggles
        let vo_R = false, vo_I = false, vo_T = false;

        function refreshValueOverlay() {
          import('../features/valueOverlay.js').then(({ drawValueOverlay, clearValueOverlay, isValueOverlayActive }) => {
            // The drawn layer is the state. Redrawing only makes sense while it is shown —
            // changing a weight with the overlay off must not switch it on.
            if (isValueOverlayActive(editor)) {
              drawValueOverlay(editor, vo_R, vo_I, vo_T);
            } else {
              clearValueOverlay(editor);
            }
          });
        }

        // Expose refresh on editor so assignSystem and other callers can trigger it
        editor._refreshValueOverlay = refreshValueOverlay;

        // Main on/off toggle. The same overlay has a second switch in Toggle Overlays, so
        // this button holds no state of its own: it reads the drawn layer, and re-syncs
        // whenever anything changes it.
        const voToggleBtn = document.createElement('button');
        voToggleBtn.className     = 'mode-button';
        voToggleBtn.textContent   = '📊 Show Value Overlay';
        voToggleBtn.style.cssText = 'width:100%;padding:6px 10px;font-size:0.85em;font-weight:bold;border:1px solid #888;border-radius:4px;cursor:pointer;';

        function syncVoButton(on) {
          voToggleBtn.textContent  = on ? '📊 Hide Value Overlay' : '📊 Show Value Overlay';
          voToggleBtn.style.border = on ? '1px solid #ffe066' : '1px solid #888';
        }

        voToggleBtn.onclick = () => {
          import('../features/valueOverlay.js').then(({ drawValueOverlay, clearValueOverlay, isValueOverlayActive }) => {
            if (isValueOverlayActive(editor)) clearValueOverlay(editor);
            else drawValueOverlay(editor, vo_R, vo_I, vo_T);
          }).catch(console.error);
        };
        amSection.appendChild(voToggleBtn);

        import('../features/valueOverlay.js').then(({ VALUE_OVERLAY_CHANGED, isValueOverlayActive }) => {
          syncVoButton(isValueOverlayActive(editor));
          // Self-removing: the popup is rebuilt on every open, so without this each reopen
          // would leave another listener behind holding a detached button.
          const onChange = () => {
            if (!voToggleBtn.isConnected) {
              document.removeEventListener(VALUE_OVERLAY_CHANGED, onChange);
              return;
            }
            syncVoButton(isValueOverlayActive(editor));
          };
          document.addEventListener(VALUE_OVERLAY_CHANGED, onChange);
        }).catch(console.error);

        // Weight toggle row
        const voWeightRow = document.createElement('div');
        voWeightRow.style.cssText = 'display:flex;gap:6px;margin-top:5px;';

        function makeWeightBtn(label, color, getVal, setVal, title) {
          const b = document.createElement('button');
          b.textContent   = label;
          b.className     = 'mode-button';
          b.title         = title;
          b.style.cssText = `flex:1;padding:5px;font-size:0.8em;font-weight:bold;border:1px solid #555;border-radius:4px;cursor:pointer;`;
          b.onclick = () => {
            setVal(!getVal());
            b.style.background = getVal() ? color : '';
            b.style.color      = getVal() ? '#111' : '';
            b.style.border     = getVal() ? `1px solid ${color}` : '1px solid #555';
            if (voToggleBtn._voActive) refreshValueOverlay();
          };
          return b;
        }

        voWeightRow.appendChild(makeWeightBtn(
          'R  Res', '#f5a623', () => vo_R, v => { vo_R = v; },
          'Boost resource weight (reduces influence weight)'
        ));
        voWeightRow.appendChild(makeWeightBtn(
          'I  Inf', '#7ecfff', () => vo_I, v => { vo_I = v; },
          'Boost influence weight (reduces resource weight)'
        ));
        voWeightRow.appendChild(makeWeightBtn(
          'T  Tech', '#b07cff', () => vo_T, v => { vo_T = v; },
          'Boost tech-skip weight'
        ));

        amSection.appendChild(voWeightRow);

        return content;
      })()
    });
}

/**
 * The rest of the Sector Controls panel, below the Draw Helpers launcher.
 * Split out only so openDrawHelpersPopup could be lifted to module scope.
 */
function finishSectorControlsContent(editor, container) {
  // ── separator + section label ──
  const separator1 = document.createElement('div');
  separator1.style.borderTop = '1px solid #555';
  separator1.style.margin = '10px 0 6px 0';
  container.appendChild(separator1);

  const advLabel = document.createElement('div');
  advLabel.className = 'popup-section-label';
  advLabel.textContent = 'Advanced map tools';
  container.appendChild(advLabel);

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = panelButton({
    id: 'launchWormholesPopup',
    text: 'Wormholes…',
    title: 'Pick Wormhole',
  });
  wormholesBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });

    deactivateModes();

    showPopup({
      id: 'wormholesPopupModal',
      className: 'layout-options-popup',
      title: 'Wormholes',
      draggable: true,
      dragHandleSelector: '.popup-ui-titlebar',
      scalable: true,
      rememberPosition: true,
      style: {
        left: '600px',
        top: '160px',
        minWidth: '220px',
        maxWidth: '600px',
        minHeight: '120px',
        maxHeight: '600px',
        color: '#fff',
        border: '2px solid var(--popup-border-layout)',
        boxShadow: '0 8px 40px #000a',
        padding: '0 0 18px 0',
        zIndex: 1300
      },
      content: (() => {
        const content = document.createElement('div');
        content.className = 'modal-content popup-btn-grid wormhole-btn-grid';
        Object.entries(wormholeTypes).forEach(([type, { label, color }]) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = 'mode-button btn-wormhole';
          btn.style.backgroundColor = color;
          btn.addEventListener('click', (e) => {
            const turningOff = e.currentTarget.classList.contains('active');
            // Clear active from wormhole popup buttons
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = b.style.backgroundColor; // Restore original color
              b.style.color = '';
              b.style.fontWeight = '';
            });
            if (turningOff) {
              wormholesBtn.classList.remove('active');
              wormholesBtn.style.background = '';
              wormholesBtn.style.color = '';
              editor.setMode('none');
              return;
            }
            // Set active state on clicked button (like original wormhole popup)
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            // Also show wormholes button as active in sector controls
            wormholesBtn.classList.add('active');
            wormholesBtn.style.background = '#666';
            wormholesBtn.style.color = '#fff';
            wormholesBtn.style.fontWeight = 'bold';
            editor.setMode(type);
          });
          content.appendChild(btn);
        });
        return content;
      })()
    });
  };
  container.appendChild(wormholesBtn);

  // ───────────── Custom Links Modal Launcher ─────────────
  const customLinksBtn = panelButton({
    id: 'launchCustomLinksPopup',
    text: 'Custom Links…',
    title: 'Manage Custom Links',
  });
  customLinksBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });

    deactivateModes();

    invoke(COMMANDS.showCustomLinks);
  };
  container.appendChild(customLinksBtn);

  // ───────────── Border Anomalies Modal Launcher ─────────────
  const borderAnomaliesBtn = panelButton({
    id: 'launchBorderAnomaliesPopup',
    text: 'Border Anomalies…',
    title: 'Manage Border Anomalies',
  });
  borderAnomaliesBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });

    deactivateModes();

    invoke(COMMANDS.showBorderAnomalies);
  };
  container.appendChild(borderAnomaliesBtn);

  // ───────────── Token Placement Button ─────────────
  const tokenPlacementBtn = panelButton({
    id: 'launchTokenPlacementPopup',
    text: 'Token Placement…',
    title: 'Place tokens on systems and planets',
  });
  tokenPlacementBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear active state from other mode buttons
    container.querySelectorAll('.mode-button').forEach(btn => {
      if (btn !== tokenPlacementBtn) {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      }
    });

    deactivateModes({ except: MODE_TOKEN });

    // Toggle token hex selector mode
    tokenHexSelectorActive = !tokenHexSelectorActive;

    if (tokenHexSelectorActive) {
      activateMode(MODE_TOKEN);
      tokenPlacementBtn.classList.add('active');
      tokenPlacementBtn.style.background = '#2980b9';
      tokenPlacementBtn.style.color = '#fff';
      tokenPlacementBtn.style.fontWeight = 'bold';
      tokenPlacementBtn.textContent = 'Click a Hex...';
      enableTokenHexSelection();
    } else {
      deactivateMode(MODE_TOKEN);
    }
  };
  container.appendChild(tokenPlacementBtn);

  // ───────────── Select Hex for Lore Button ─────────────
  const selectHexForLoreBtn = panelButton({
    id: 'selectHexForLoreBtn',
    text: 'Add Lore...',
    title: 'Click to activate hex selection mode for lore editing',
  });

  selectHexForLoreBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear active state from other mode buttons
    container.querySelectorAll('.mode-button').forEach(btn => {
      if (btn !== selectHexForLoreBtn) {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      }
    });

    loreHexSelectorActive = !loreHexSelectorActive;
    if (!loreHexSelectorActive) { deactivateMode(MODE_LORE); return; }
    activateMode(MODE_LORE);

    selectHexForLoreBtn.classList.add('active');
    selectHexForLoreBtn.style.background = '#27ae60';
    selectHexForLoreBtn.style.color = '#fff';
    selectHexForLoreBtn.style.fontWeight = 'bold';
    selectHexForLoreBtn.textContent = 'Click a Hex...';

    // The lore module owns the picking mode and the editor entry point; this button only
    // turns it on. Previously this file drove the popup by filling #hexLabelInput and
    // clicking #selectHexBtn behind a setTimeout, which coupled it to the editor's DOM.
    import('../modules/Lore/loreMapPick.js').then(({ armLoreMapPick }) => {
      armLoreMapPick(window.editor, {
        onPick: (ref) => tryInvoke(COMMANDS.openLoreEditor, ref)
      });
    });
  };
  container.appendChild(selectHexForLoreBtn);

  // ── separator + section label ──
  const separator2 = document.createElement('div');
  separator2.style.borderTop = '1px solid #555';
  separator2.style.margin = '10px 0 6px 0';
  container.appendChild(separator2);

  const externalLabel = document.createElement('div');
  externalLabel.className = 'popup-section-label';
  externalLabel.textContent = 'External setup links';
  container.appendChild(externalLabel);

  // ───────────── Deck Modification (external tool) ─────────────
  const deckModBtn = panelButton({
    id: 'openDeckModificationTool',
    text: 'Deck modification...',
    title: 'Open the AsyncTI4 deck card tool in a new tab',
  });
  deckModBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open('https://stabar-ti.github.io/Ti-Async-Deckcard-tool/', '_blank', 'noopener');
  };
  container.appendChild(deckModBtn);

  return container;
}

// ───────────── Lore Hex Selection ─────────────
// The picking mode itself lives in src/modules/Lore/loreMapPick.js. What stays here is the
// button's own state: whether it is lit, and whether the map click is armed.

let loreHexSelectorActive = false;

function deactivateLoreMode() {
  loreHexSelectorActive = false;
  const btn = document.getElementById('selectHexForLoreBtn');
  if (btn) {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
    btn.textContent = 'Add Lore...';
  }
  import('../modules/Lore/loreMapPick.js')
    .then(({ disarmLoreMapPick }) => disarmLoreMapPick(window.editor))
    .catch(() => { /* module never loaded, so nothing is armed */ });
}

registerMode(MODE_LORE, { deactivate: deactivateLoreMode });

// ───────────── Token Hex Selection Helper Functions ─────────────
let tokenHexSelectorActive = false;
let tokenHexClickHandler = null;
let previousTokenMode = null;

function deactivateTokenMode() {
  tokenHexSelectorActive = false;
  const btn = document.getElementById('launchTokenPlacementPopup');
  if (btn) {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
    btn.textContent = 'Token Placement…';
  }
  disableTokenHexSelection();
}

registerMode(MODE_TOKEN, { deactivate: deactivateTokenMode });

function enableTokenHexSelection() {
  console.log('enableTokenHexSelection called');
  // Remove any existing handler first
  disableTokenHexSelection();

  // Store the current editor mode and switch to a special token mode
  const editor = window.editor;
  if (editor) {
    previousTokenMode = editor.mode;
    editor.mode = 'token-selection'; // Special mode to prevent other click handlers
  }

  // Create new click handler
  tokenHexClickHandler = (event) => {
    console.log('Token hex click handler triggered', event.target);
    const hex = event.target.closest('[data-label]');
    console.log('Found hex element:', hex);
    if (hex) {
      const hexLabel = hex.getAttribute('data-label');
      console.log('Hex label:', hexLabel);
      if (hexLabel) {
        // Open token popup for this hex
        openTokenPopupForHex(hexLabel);

        // Don't deactivate - let user continue selecting hexes

        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  // Add event listener to the hex map
  const svgContainer = document.querySelector('#hexMap');
  console.log('SVG container found:', !!svgContainer);
  if (svgContainer) {
    svgContainer.addEventListener('click', tokenHexClickHandler, true);
    svgContainer.style.cursor = 'crosshair';
    console.log('Event listener added to hexMap, cursor set to crosshair');
  }
}

function disableTokenHexSelection() {
  // Restore the previous editor mode
  const editor = window.editor;
  if (editor && previousTokenMode !== null) {
    editor.mode = previousTokenMode;
    previousTokenMode = null;
  }

  // Remove event listener
  if (tokenHexClickHandler) {
    const svgContainer = document.querySelector('#hexMap');
    if (svgContainer) {
      svgContainer.removeEventListener('click', tokenHexClickHandler, true);
      svgContainer.style.cursor = '';
    }
    tokenHexClickHandler = null;
  }
}

function openTokenPopupForHex(hexLabel) {
  console.log('openTokenPopupForHex called with:', hexLabel);

  // The Token module provides this once TokenManager has initialised, which is async.
  if (hasCommand(COMMANDS.showTokenPopup)) {
    console.log('Opening token popup for hex:', hexLabel);
    invoke(COMMANDS.showTokenPopup, hexLabel);
  } else {
    console.warn('Token system not initialized yet. Please wait...');
    alert('Token system is loading. Please try again in a moment.');
  }
}
