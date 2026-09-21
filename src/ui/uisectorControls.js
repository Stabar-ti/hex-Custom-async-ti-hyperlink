// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Converted to popup-based system that auto-opens and is minimizable only
// ───────────────────────────────────────────────────────────────

import { wormholeTypes } from '../constants/constants.js';
import { showPopup } from './popupUI.js';
import { railButton, railGroupLabel, setRailLabel } from './kit/index.js';
import {
  toggleDistanceTool, isDistanceToolArmed, DISTANCE_TOOL_CHANGED,
} from '../features/distanceTool.js';
import {
  invoke, tryInvoke, hasCommand,
  registerMode, activateMode, deactivateMode, deactivateModes, COMMANDS
} from '../core/registry.js';

// Ids for the two map-click modes this file owns. Only one can be armed at a time; the
// registry is what enforces that, so every button that opens something else disarms them
// with one deactivateModes() instead of the block that used to be pasted at each site.
const MODE_LORE = 'lore';
const MODE_TOKEN = 'token';

// Where the rail's collapsed state is remembered between sessions.
const RAIL_COLLAPSED_KEY = 'ti4-tool-rail-collapsed';

/** @returns {boolean} */
function readRailCollapsed() {
  try {
    return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
  } catch {
    return false;   // private mode / storage disabled — start expanded
  }
}

/** @param {boolean} collapsed */
function writeRailCollapsed(collapsed) {
  try {
    localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch { /* the rail just forgets between sessions */ }
}

/**
 * Collapse or expand the rail. Collapsed, it is a strip of icons — still usable, which is
 * the point: you can keep working with it shut. The labels are hidden by CSS rather than
 * removed, so every button keeps its tooltip.
 *
 * @param {boolean} collapsed
 */
export function setToolRailCollapsed(collapsed) {
  const rail = document.getElementById('toolRail');
  if (!rail) return;
  rail.classList.toggle('is-collapsed', collapsed);
  // Mirrored onto <body> so floating panels can keep clear of the rail in CSS — they are
  // position:fixed and cannot see the rail's own class.
  document.body.classList.toggle('rail-collapsed', collapsed);
  writeRailCollapsed(collapsed);

  const btn = rail.querySelector('.rail-collapse-btn');
  if (btn) {
    btn.textContent = collapsed ? '\u00BB' : '\u00AB';
    btn.title = collapsed ? 'Expand the tool rail' : 'Collapse the tool rail to icons';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

/** Flip the rail between its expanded and icon-only states. */
export function toggleToolRail() {
  const rail = document.getElementById('toolRail');
  if (!rail) return;
  setToolRailCollapsed(!rail.classList.contains('is-collapsed'));
}

/**
 * Build the tool rail into #toolRail.
 *
 * This used to be a floating popup that auto-opened on load, could not be closed (its close
 * button was removed and replaced with a minimize), and sat on top of the map like a small
 * window. It is a docked region of the app shell now, so it reserves its own space instead
 * of covering the map, and it collapses to an icon strip rather than to a stub of window
 * chrome. Everything it contains — the modes, the registry wiring, the arm/disarm rules —
 * is unchanged.
 */
export function mountToolRail(editor) {
  const rail = document.getElementById('toolRail');
  if (!rail) {
    console.warn('[toolRail] #toolRail is missing from the page; tools have nowhere to go');
    return null;
  }

  rail.textContent = '';
  rail.appendChild(createSectorControlsContent(editor));

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'rail-collapse-btn';
  rail.appendChild(collapseBtn);
  collapseBtn.addEventListener('click', () => toggleToolRail());

  setToolRailCollapsed(readRailCollapsed());
  return rail;
}

/** The name the rest of the app already calls. The rail replaced the popup. */
export function openSectorControlsPopup(editor) {
  return mountToolRail(editor);
}

/** Older alias still imported in one or two places. */
export function populateSectorControls(editor) {
  return mountToolRail(editor);
}

function createSectorControlsContent(editor) {
  // Laid out by #toolRail in shell.css; nothing to set here.
  const container = document.createElement('div');
  container.className = 'sector-controls-content';

  container.appendChild(railGroupLabel('Draw'));

  const realIdBtn = railButton({
    id: 'jumpToSystemBtn',
    className: 'btn-lookup-id',
    icon: '▦',
    text: 'System Tiles',
    title: 'Choose a real system tile to place',
  });
  realIdBtn.addEventListener('click', () => {
    deactivateModes();

    invoke(COMMANDS.showSystemPicker);
  });
  container.appendChild(realIdBtn);

  // ───────────── Essential System Types ─────────────
  const essentialSystemTypes = [
    { mode: 'hyperlane', label: 'Hyperlanes', cls: 'btn-empty', icon: '∿' },
    { mode: 'void', label: 'Void', cls: 'btn-void', icon: '○' },
    { mode: 'homesystem', label: 'Homesystem', cls: 'btn-homesystem', icon: '⌂' }
  ];

  essentialSystemTypes.forEach(({ mode, label, cls, icon }) => {
    const btn = railButton({ className: cls, icon, text: label });
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
  const drawHelpersBtn = railButton({
    id: 'launchDrawHelpersPopup',
    icon: '✎',
    text: 'Draw Helpers…',
    title: 'Tile types, effects and value hints',
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


        return content;
      })()
    });
}

/**
 * The Balance surface: value hints, the value overlay and the AutoMapper.
 *
 * These three are one workflow — paint V1–V5 and R/I/T targets onto hexes, run the filler
 * against them, look at what it chose. They used to sit inside the Draw Helpers popup,
 * behind a collapsed toggle labelled "🤖 AutoMapper", three levels down from the panel:
 * fourteen of that popup's twenty-seven controls were hidden on first open, and the
 * painting half was filed under a heading describing the other half.
 *
 * Mees rated both value hints and the AutoMapper as used *often* — the correction that
 * made this its own surface rather than a section of someone else's.
 *
 * @param {any} editor
 */
export function openBalancePopup(editor) {
  // Lights the Balance button in the rail while a value-paint mode is armed, so it is
  // obvious the next map click will paint a hint. In Draw Helpers this lit that popup's
  // launcher; the block has its own home now, so it lights that.
  const setLauncherActive = (on) => {
    const launcher = document.getElementById('toolBalance');
    if (launcher) launcher.classList.toggle('active', !!on);
  };

  const amSection = document.createElement('div');
  amSection.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

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
      amSection.querySelectorAll('.mode-button').forEach(b => {
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

  return showPopup({
    id: 'balancePopupModal',
    className: 'layout-options-popup',
    title: 'Balance',
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true,
    rememberPosition: true,
    content: amSection,
  });
}

/**
 * The rest of the Sector Controls panel, below the Draw Helpers launcher.
 * Split out only so openDrawHelpersPopup could be lifted to module scope.
 */
function finishSectorControlsContent(editor, container) {
  container.appendChild(railGroupLabel('Connect'));

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = railButton({
    id: 'launchWormholesPopup',
    icon: '◎',
    text: 'Wormholes…',
    title: 'Place a wormhole',
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
  const customLinksBtn = railButton({
    id: 'launchCustomLinksPopup',
    icon: '⇄',
    text: 'Custom Links…',
    title: 'Manage custom adjacency links',
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
  const borderAnomaliesBtn = railButton({
    id: 'launchBorderAnomaliesPopup',
    icon: '⌗',
    text: 'Border Anomalies…',
    title: 'Manage border anomalies',
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

  // ───────────── Balance ─────────────
  // Value hints and the AutoMapper are one workflow and both are used often: paint
  // targets, run the filler against them, review. They were three levels down, behind a
  // collapsed toggle inside Draw Helpers. AutoMapper also gets its own entry — it had
  // three front doors, the nearest of which was three clicks away.
  container.appendChild(railGroupLabel('Balance'));

  const balanceBtn = railButton({
    id: 'toolBalance',
    icon: '◈',
    text: 'Value hints…',
    title: 'Paint V1–V5 and R/I/T targets, and weight the value overlay',
  });
  balanceBtn.onclick = () => {
    deactivateModes();
    openBalancePopup(editor);
  };
  container.appendChild(balanceBtn);

  const autoMapperBtn = railButton({
    id: 'toolAutoMapper',
    icon: '⚙',
    text: 'AutoMapper…',
    title: 'Fill the painted tiles with real systems',
  });
  autoMapperBtn.onclick = () => {
    deactivateModes();
    import('../modules/automapper/autoBuilder.js')
      .then(mod => mod.openAutoMapperPopup())
      .catch(err => console.error('Failed to load AutoMapper:', err));
  };
  container.appendChild(autoMapperBtn);

  // ───────────── Distance ─────────────
  // The calculation had no button at all: Shift+D held, then a *right*-click, documented
  // only inside the help popup — while its settings had one of the widest buttons in the
  // top bar. Armed, a left-click on any hex paints the distances from it.
  container.appendChild(railGroupLabel('Analyse'));

  const distanceBtn = railButton({
    id: 'toolDistance',
    icon: '↔',
    text: 'Distance',
    title: 'Click a hex to show how far everything is from it',
  });
  distanceBtn.onclick = () => toggleDistanceTool(editor);
  container.appendChild(distanceBtn);

  // Follow the tool however it was changed — arming another tool disarms this one through
  // the registry, and the button has to show that.
  const applyDistanceState = () => {
    distanceBtn.classList.toggle('active', isDistanceToolArmed(editor));
  };

  // The isConnected check belongs only in the listener. Calling it on the initial sync
  // unregistered the listener immediately: this content is built into a detached container
  // and only appended to the rail afterwards, so at this point the button is not in the
  // document yet and never would be by that test.
  const onDistanceChange = () => {
    if (!distanceBtn.isConnected) {
      document.removeEventListener(DISTANCE_TOOL_CHANGED, onDistanceChange);
      return;
    }
    applyDistanceState();
  };
  document.addEventListener(DISTANCE_TOOL_CHANGED, onDistanceChange);
  applyDistanceState();

  // ───────────── Token Placement Button ─────────────
  container.appendChild(railGroupLabel('Annotate'));

  const tokenPlacementBtn = railButton({
    id: 'launchTokenPlacementPopup',
    icon: '⬢',
    text: 'Token Placement…',
    title: 'Place tokens on hexes',
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
      setRailLabel(tokenPlacementBtn, 'Click a Hex…');
      enableTokenHexSelection();
    } else {
      deactivateMode(MODE_TOKEN);
    }
  };
  container.appendChild(tokenPlacementBtn);

  // ───────────── Select Hex for Lore Button ─────────────
  const selectHexForLoreBtn = railButton({
    id: 'selectHexForLoreBtn',
    icon: '✒',
    text: 'Add Lore…',
    title: 'Select a hex to add lore to',
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
    setRailLabel(selectHexForLoreBtn, 'Click a Hex…');

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

  container.appendChild(railGroupLabel('External'));

  const deckModBtn = railButton({
    id: 'openDeckModificationTool',
    icon: '↗',
    text: 'Deck modification…',
    title: 'Open the AsyncTI deck card tool in a new tab',
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
    setRailLabel(btn, 'Add Lore…');
  }
  import('../modules/Lore/loreMapPick.js')
    .then(({ disarmLoreMapPick }) => disarmLoreMapPick(window.editor))
    .catch(() => { /* module never loaded, so nothing is armed */ });
}

registerMode(MODE_LORE, { deactivate: deactivateLoreMode });

// ───────────── Token Hex Selection Helper Functions ─────────────
let tokenHexSelectorActive = false;
let tokenHexClickHandler = null;

function deactivateTokenMode() {
  tokenHexSelectorActive = false;
  const btn = document.getElementById('launchTokenPlacementPopup');
  if (btn) {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
    setRailLabel(btn, 'Token Placement…');
  }
  disableTokenHexSelection();
}

registerMode(MODE_TOKEN, { deactivate: deactivateTokenMode });

function enableTokenHexSelection() {
  console.log('enableTokenHexSelection called');
  // Remove any existing handler first
  disableTokenHexSelection();

  // Take over map clicks. Whatever was armed before is deliberately dropped rather than
  // remembered — see disableTokenHexSelection.
  const editor = window.editor;
  if (editor) {
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
  // Leaving token mode disarms the map, it does not restore whatever was armed before.
  //
  // This used to stash editor.mode on the way in and put it back on the way out. Arming
  // Token Placement while a paint mode was active therefore re-armed that paint mode when
  // you switched tokens off, and the next map click painted a nebula the user had selected
  // several minutes earlier. Every other tool in this panel ends on setMode('none'); so
  // does this one now.
  const editor = window.editor;
  if (editor && editor.mode === 'token-selection') {
    if (typeof editor.setMode === 'function') editor.setMode('none');
    else editor.mode = 'none';
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
