// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Converted to popup-based system that auto-opens and is minimizable only
// ───────────────────────────────────────────────────────────────

import { wormholeTypes } from '../constants/constants.js';
import { showPopup, togglePopup } from './popupUI.js';
import { railButton, railGroupLabel, setRailLabel } from './kit/index.js';
import { createToolPanel, armExclusively } from './toolPanel.js';
import { HEX_SELECTED, selectedHexes } from '../features/hexSelection.js';
import {
  CLIPBOARD_CHANGED, COPY_OPTIONS_CHANGED, activeClip, copyOptions, setCopyOption,
} from '../features/tileClipboard.js';
import { copySelectionToClipboard, beginPaste } from '../features/clipboardShortcuts.js';
import { swapHexes } from '../features/tileSwap.js';
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
const MODE_WORMHOLES = 'wormholes';
const MODE_VALUE_HINTS = 'valueHints';

/**
 * Puts down whatever value hint the open Balance panel has armed; null while it is shut.
 * The registry calls it, so right-click, Escape and arming any other tool reach it.
 * @type {(() => void) | null}
 */
let disarmValueHints = null;

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

/** Remembers which paint groups are folded open. */
const PAINT_GROUP_KEY = 'ti4-rail-paint-groups';

/** @returns {Record<string, boolean>} */
function readPaintGroups() {
  try {
    return JSON.parse(localStorage.getItem(PAINT_GROUP_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** @param {string} key @param {boolean} open */
function writePaintGroup(key, open) {
  try {
    const all = readPaintGroups();
    all[key] = open;
    localStorage.setItem(PAINT_GROUP_KEY, JSON.stringify(all));
  } catch { /* private mode — the rail just forgets between sessions */ }
}

/**
 * A foldable set of paint modes in the rail.
 *
 * Every item is one call to editor.setMode, and only one can be armed, so clicking a
 * second clears the first. Clicking the armed one turns it off — the same contract every
 * other tool in this panel uses.
 *
 * @param {HTMLElement} container
 * @param {any} editor
 * @param {{key: string, icon: string, label: string, title: string, headerClass?: string,
 *          options?: {label: string, watch?: string[], items: Array<{
 *            label: string, title?: string, get: () => boolean, set: (on: boolean) => void}>},
 *          items: Array<{mode: string, label: string, cls: string, icon: string}>}} group
 */
function addPaintGroup(container, editor, { key, icon, label, title, headerClass = '', items }) {
  const header = railButton({
    icon, text: label, title,
    className: ('ui-rail-btn--group ' + headerClass).trim(),
  });
  const caret = document.createElement('span');
  caret.className = 'ui-rail-btn__caret';
  header.appendChild(caret);
  container.appendChild(header);

  const sub = document.createElement('div');
  sub.className = 'ui-rail-sub';
  container.appendChild(sub);

  const setOpen = (open) => {
    sub.classList.toggle('is-open', open);
    header.classList.toggle('is-expanded', open);
    caret.textContent = open ? '▾' : '▸';
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  setOpen(!!readPaintGroups()[key]);

  header.addEventListener('click', () => {
    const open = !sub.classList.contains('is-open');
    setOpen(open);
    writePaintGroup(key, open);
  });

  for (const item of items) {
    const btn = railButton({
      icon: item.icon,
      text: item.label,
      title: item.label,
      className: 'ui-rail-btn--sub ' + item.cls,
    });
    btn.dataset.mode = item.mode;
    btn.addEventListener('click', () => {
      const turningOff = btn.classList.contains('active');

      // One paint mode at a time, and nothing else armed alongside it.
      container.querySelectorAll('.mode-button').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
        b.style.fontWeight = '';
      });
      deactivateModes();

      if (turningOff) {
        editor.setMode('none');
        return;
      }
      btn.classList.add('active');
      editor.setMode(item.mode);
    });
    sub.appendChild(btn);
  }
}

/**
 * A foldable set of one-shot actions in the rail.
 *
 * The sibling of addPaintGroup, for things that happen rather than things you arm. Each
 * item says when it is available and why it is not, because the alternative — a button
 * that looks the same whether or not it will work — is how the wizard this replaces
 * managed to need a status line of its own.
 *
 * @param {HTMLElement} container
 * @param {{key: string, icon: string, label: string, title: string, help?: string,
 *          note?: string,
 *          items: Array<{
 *            id?: string, icon: string, label: string, hint?: string,
 *            onClick: () => void,
 *            available?: () => {ok: boolean, why?: string},
 *          }>,
 *          watch?: string[]}} group
 * @returns {() => void} a sync function, in case the caller wants to refresh it too
 */
function addActionGroup(container, { key, icon, label, title, help, note, items, options, watch = [] }) {
  const header = railButton({ icon, text: label, title, className: 'ui-rail-btn--group' });

  // The help sits in the header rather than as an item, so the list below is only things
  // you can do. Its explanation is a title: every other affordance in the rail explains
  // itself the same way, and a bespoke hover card here would be the only one.
  if (help) {
    const q = document.createElement('span');
    q.className = 'ui-rail-btn__help';
    q.textContent = '?';
    q.title = help;
    // The header is a fold toggle; reading the help should not also open or close it.
    q.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(q);
  }

  const caret = document.createElement('span');
  caret.className = 'ui-rail-btn__caret';
  header.appendChild(caret);
  container.appendChild(header);

  const sub = document.createElement('div');
  sub.className = 'ui-rail-sub';
  container.appendChild(sub);

  const setOpen = (open) => {
    sub.classList.toggle('is-open', open);
    header.classList.toggle('is-expanded', open);
    caret.textContent = open ? '▾' : '▸';
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  setOpen(!!readPaintGroups()[key]);

  header.addEventListener('click', () => {
    const open = !sub.classList.contains('is-open');
    setOpen(open);
    writePaintGroup(key, open);
  });

  if (note) {
    const n = document.createElement('div');
    n.className = 'ui-rail-note';
    n.textContent = note;
    sub.appendChild(n);
  }

  /** @type {Array<{btn: HTMLElement, spec: any}>} */
  const built = [];

  for (const item of items) {
    const btn = railButton({
      id: item.id,
      icon: item.icon,
      text: item.label,
      title: item.hint || item.label,
      className: 'ui-rail-btn--sub',
    });
    btn.addEventListener('click', () => {
      // A disabled item is inert rather than hidden: the list is a description of what
      // this tool can do, and hiding half of it depending on the selection would make it
      // a worse description.
      if (btn.classList.contains('is-unavailable')) return;
      item.onClick();
    });
    sub.appendChild(btn);
    built.push({ btn, spec: item });
  }

  // Switches that belong to the group rather than to any one item. They sit under the
  // actions because they change what those actions do, and reading them first would be
  // reading the footnote before the sentence.
  if (options?.items?.length) {
    const optWrap = document.createElement('div');
    optWrap.className = 'ui-rail-opts';

    const optLabel = document.createElement('div');
    optLabel.className = 'ui-rail-note ui-rail-note--opts';
    optLabel.textContent = options.label;
    optWrap.appendChild(optLabel);

    for (const opt of options.items) {
      const row = document.createElement('label');
      row.className = 'ui-rail-opt';
      row.title = opt.title || opt.label;

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'ui-rail-opt__box';
      box.checked = !!opt.get();
      box.addEventListener('change', () => opt.set(box.checked));
      // The row is inside a fold whose header toggles on click; a click on the checkbox
      // must not also close the thing it lives in.
      row.addEventListener('click', (e) => e.stopPropagation());

      const text = document.createElement('span');
      text.textContent = opt.label;

      row.append(box, text);
      optWrap.appendChild(row);

      if (options.watch) {
        for (const ev of options.watch) {
          document.addEventListener(ev, () => { box.checked = !!opt.get(); });
        }
      }
    }
    sub.appendChild(optWrap);
  }

  const sync = () => {
    for (const { btn, spec } of built) {
      const state = spec.available ? spec.available() : { ok: true };
      btn.classList.toggle('is-unavailable', !state.ok);
      btn.setAttribute('aria-disabled', state.ok ? 'false' : 'true');
      btn.title = state.ok ? (spec.hint || spec.label) : (state.why || spec.hint || spec.label);
    }
  };
  sync();
  for (const ev of watch) document.addEventListener(ev, sync);

  return sync;
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

    invoke(COMMANDS.toggleSystemPicker);
  });
  container.appendChild(realIdBtn);


  // ───────────── Paint modes, inline ─────────────
  // Tile types and effects used to live in a Draw Helpers popup: a draggable window over
  // the map holding twelve paint modes. They are what you reach for constantly, so they
  // belong in the rail with everything else you paint with. Each group folds, so the rail
  // stays scannable rather than becoming a list of twenty-five.
  addPaintGroup(container, editor, {
    key: 'planets',
    icon: '◍',
    label: 'Planets',
    title: 'Paint tile types',
    headerClass: 'is-planets',
    items: [
      { mode: '1 planet', label: '1 Planet', cls: 'btn-1', icon: '1' },
      { mode: '2 planet', label: '2 Planet', cls: 'btn-2', icon: '2' },
      { mode: '3 planet', label: '3 Planet', cls: 'btn-3', icon: '3' },
      { mode: 'legendary planet', label: 'Legendary', cls: 'btn-legendary', icon: '★' },
      { mode: 'empty', label: 'Empty', cls: 'btn-empty', icon: '○' },
      { mode: 'void', label: 'Void', cls: 'btn-void', icon: '◯' },
      { mode: 'special', label: 'Special', cls: 'btn-special', icon: '◆' },
      { mode: 'fracture', label: 'Fracture', cls: 'btn-fracture', icon: '✧' },
    ],
  });

  addPaintGroup(container, editor, {
    key: 'anomalies',
    icon: '✦',
    label: 'Anomalies',
    title: 'Paint anomalies',
    headerClass: 'is-anomalies',
    items: [
      { mode: 'nebula', label: 'Nebula', cls: 'btn-nebula', icon: '☁' },
      { mode: 'rift', label: 'Rift', cls: 'btn-rift', icon: '◉' },
      { mode: 'asteroid', label: 'Asteroid', cls: 'btn-asteroid', icon: '⁘' },
      { mode: 'supernova', label: 'Supernova', cls: 'btn-supernova', icon: '✷' },
      { mode: 'scar', label: 'Scar', cls: 'btn-scar', icon: '☄' },
    ],
  });

  // Homesystem is the one tile type that is not really a "type" you paint over a region,
  // so it stays at the top level. Void joined the Planets group; Hyperlanes moved to
  // Connect, where a link between two tiles belongs.
  const essentialSystemTypes = [
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

      e.currentTarget.classList.add('active');
      editor.setMode(mode);
    });
    container.appendChild(btn);
  });

  return finishSectorControlsContent(editor, container);
}

// openDrawHelpersPopup lived here. Its twelve paint modes — tile types and effects —
// are rail groups now (addPaintGroup above), so there is no popup to open.

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
      const wasActive = vtPaintActive;
      vtPaintActive = parts.length > 0;
      if (vtPaintActive) {
        if (!wasActive) armExclusively(MODE_VALUE_HINTS);
        editor._valuePaintConfig = { tier: vt_tier, r: vt_R, i: vt_I, t: vt_T };
        editor.setMode('value-target-apply');
        setLauncherActive(true);
      } else {
        editor._valuePaintConfig = null;
        if (editor.mode === 'value-target-apply') editor.setMode('');
        if (editor.mode !== 'value-target-clear') setLauncherActive(false);
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
    const skewBtns = [];
    SKEW_CFG.forEach(({ label, color, get, set }) => {
      const btn = document.createElement('button');
      skewBtns.push({ btn, color });
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
      // A second press puts it down. It used to arm clear mode again, and right-click,
      // which disarms by pressing what is lit, armed it instead of disarming it.
      if (vtClearBtn.classList.contains('active')) { disarmValueHints?.(); return; }
      armExclusively(MODE_VALUE_HINTS);
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

    // Every way out comes here. The tier and skew buttons show their state in inline
    // colours rather than .active, so right-click found nothing lit to press, and the rail
    // button it did find closed the panel and left the paint mode armed behind it.
    disarmValueHints = () => {
      vt_tier = null; vt_R = false; vt_I = false; vt_T = false;
      tierBtns.forEach((b, i) => { b.style.background = ''; b.style.color = TIER_COLORS[i]; });
      skewBtns.forEach(({ btn, color }) => { btn.style.background = ''; btn.style.color = color; });
      vtClearBtn.classList.remove('active');
      vtClearBtn.style.background = '';
      if (editor.mode === 'value-target-clear') editor.setMode('none');
      updateVtPreview();
      setLauncherActive(false);
    };

    const amBtn = document.createElement('button');
    amBtn.textContent = '🤖 Open AutoMapper';
    amBtn.className = 'mode-button';
    amBtn.style.cssText = 'width:100%;padding:8px 12px;font-size:0.9em;font-weight:bold;border:2px solid var(--popup-border-special);border-radius:4px;cursor:pointer;color:var(--popup-border-special);background:#0a1a0a;';
    amBtn.onclick = () => {
      import('../modules/automapper/autoBuilder.js').then(mod => {
        mod.openAutoMapperPopup(editor);
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
    onClose: () => { disarmValueHints?.(); disarmValueHints = null; },
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

  const hyperlanesBtn = railButton({
    id: 'toolHyperlanes',
    className: 'btn-hyperlane',
    icon: '∿',
    text: 'Hyperlanes',
    title: 'Draw hyperlane arcs between tiles',
  });
  hyperlanesBtn.addEventListener('click', () => {
    const turningOff = hyperlanesBtn.classList.contains('active');
    container.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
    deactivateModes();
    if (turningOff) { editor.setMode('none'); return; }
    hyperlanesBtn.classList.add('active');
    editor.setMode('hyperlane');
  });
  // The editor boots in 'hyperlane' mode, so on a fresh load the status bar and the
  // inspector both say hyperlane while nothing in the rail is lit — and a click on the map
  // really does start drawing one. Light the button that owns the mode instead.
  hyperlanesBtn.classList.toggle('active', editor.mode === 'hyperlane');
  container.appendChild(hyperlanesBtn);

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = railButton({
    id: 'launchWormholesPopup',
    className: 'btn-wormhole-all',
    icon: '◎',
    text: 'Wormholes…',
    title: 'Place a wormhole',
  });
  wormholesBtn.dataset.launcher = '';

  // Fourteen wormhole types: pick one, then click hexes.
  const wormholesPanel = createToolPanel({
    id: 'wormholesPopup',
    title: '◎ Wormholes',
    mode: MODE_WORMHOLES,
    launcherId: 'launchWormholesPopup',
    width: '280px',
    build: () => {
      const grid = document.createElement('div');
      grid.className = 'tool-panel__grid';

      Object.entries(wormholeTypes).forEach(([type, { label, color }]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.className = 'mode-button btn-wormhole';
        btn.dataset.tool = '';
        btn.style.backgroundColor = color;
        btn.addEventListener('click', () => {
          const turningOff = btn.classList.contains('active');
          grid.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
          if (turningOff) {
            editor.setMode('none');
            return;
          }
          btn.classList.add('active');
          editor.setMode(type);
        });
        grid.appendChild(btn);
      });
      return grid;
    },
  });
  wormholesBtn.onclick = () => wormholesPanel.toggle();
  container.appendChild(wormholesBtn);

  // ───────────── Custom Links Modal Launcher ─────────────
  const customLinksBtn = railButton({
    id: 'launchCustomLinksPopup',
    icon: '⇄',
    text: 'Custom Links…',
    title: 'Manage custom adjacency links',
  });
  customLinksBtn.dataset.launcher = '';
  // Opens and closes the panel. It used to disarm every mode first, which took the panel
  // down before the command could see it was showing — so pressing it again rebuilt it.
  customLinksBtn.onclick = () => invoke(COMMANDS.showCustomLinks);
  container.appendChild(customLinksBtn);

  // ───────────── Border Anomalies Modal Launcher ─────────────
  const borderAnomaliesBtn = railButton({
    id: 'launchBorderAnomaliesPopup',
    icon: '⌗',
    text: 'Border Anomalies…',
    title: 'Manage border anomalies',
  });
  borderAnomaliesBtn.dataset.launcher = '';
  // Opens and closes the panel. It used to disarm every mode first, which took the panel
  // down before the command could see it was showing — so pressing it again rebuilt it.
  borderAnomaliesBtn.onclick = () => invoke(COMMANDS.showBorderAnomalies);
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
  // Lit while a value hint is armed, like the tool-panel launchers, and skipped by
  // right-click for the same reason: pressing it closes the panel.
  balanceBtn.dataset.launcher = '';
  balanceBtn.onclick = () => togglePopup('balancePopupModal', () => {
    deactivateModes();
    openBalancePopup(editor);
  });
  container.appendChild(balanceBtn);

  // A "Value tiers" button lived here: a third switch for the one value overlay, beside
  // the one in Toggle Overlays and the one inside the Balance panel. Three controls for
  // one piece of state is two too many, and the overlay belongs with the other overlays.

  const autoMapperBtn = railButton({
    id: 'toolAutoMapper',
    icon: '⚙',
    text: 'AutoMapper…',
    title: 'Fill the painted tiles with real systems',
  });
  autoMapperBtn.onclick = () => togglePopup('automapper-popup', () => {
    deactivateModes();
    import('../modules/automapper/autoBuilder.js')
      .then(mod => mod.openAutoMapperPopup(editor))
      .catch(err => console.error('Failed to load AutoMapper:', err));
  });
  container.appendChild(autoMapperBtn);

  // ───────────── Distance ─────────────
  // The calculation had no button at all: Shift+D held, then a *right*-click, documented
  // only inside the help popup — while its settings had one of the widest buttons in the
  // top bar. Armed, a left-click on any hex paints the distances from it.
  container.appendChild(railGroupLabel('Edit'));

  // ───────────── Clipboard ─────────────
  //
  // The long way round to Ctrl+C, Ctrl+X and Ctrl+V, for the times you would rather read
  // than remember. It replaces a floating wizard that took the map away from you: a popup
  // with Copy/Cut/Swap buttons, which then opened a second popup telling you what to click
  // next, over the tiles you were choosing between.
  //
  // Every item here says when it applies and why it does not, so the list is a description
  // of the tool rather than four buttons that may or may not do something.
  addActionGroup(container, {
    key: 'clipboard',
    icon: '⧉',
    label: 'Clipboard',
    title: 'Copy, cut, paste and swap tiles',
    note: 'Click a hex to select it, shift-click for more.',
    help: [
      'Copy / cut',
      '  Select one or more hexes, then Copy (Ctrl+C) or Cut (Ctrl+X).',
      '  Cut removes them straight away — they are on the clipboard, and it is one undo.',
      '',
      'Paste',
      '  A ghost of the block follows the cursor. Click a hex to place it there.',
      '  Press R to turn the block 60°. Escape or right-click puts the ghost away;',
      '  Ctrl+V brings it back. Pasting does not use the clip up, so you can place it',
      '  as many times as you like.',
      '',
      'Swap',
      '  Select exactly two hexes and press Swap, or use the ⇄ button that appears',
      '  between them on the map. The two tiles trade places.',
    ].join('\n'),
    watch: [HEX_SELECTED, CLIPBOARD_CHANGED],
    // What a copy carries. These were four checkboxes in the wizard's popup and went with
    // it; they are a preference about how you work rather than about one copy, so they
    // persist. The tile itself and its planets are never optional — these are the things
    // that sit on top of it.
    options: {
      label: 'Copies include:',
      watch: [COPY_OPTIONS_CHANGED],
      items: [
        {
          label: 'Wormholes',
          title: 'Carry wormholes placed on the tile. Wormholes the system has by nature always come with it.',
          get: () => copyOptions().wormholes,
          set: (on) => setCopyOption('wormholes', on),
        },
        {
          label: 'Custom links',
          title: 'Carry custom adjacency links drawn from these hexes',
          get: () => copyOptions().customAdjacents,
          set: (on) => setCopyOption('customAdjacents', on),
        },
        {
          label: 'Border anomalies',
          title: 'Carry border anomalies drawn on these hexes, and their mirrored halves',
          get: () => copyOptions().borderAnomalies,
          set: (on) => setCopyOption('borderAnomalies', on),
        },
        {
          label: 'Tokens',
          title: 'Carry tokens placed on the system and on its planets',
          get: () => copyOptions().tokens,
          set: (on) => setCopyOption('tokens', on),
        },
      ],
    },
    items: [
      {
        id: 'clipCopyBtn',
        icon: '⧉',
        label: 'Copy',
        hint: 'Copy the selected hexes (Ctrl+C)',
        available: () => selectedHexes(editor).length
          ? { ok: true }
          : { ok: false, why: 'Select one or more hexes first, then Copy.' },
        onClick: () => copySelectionToClipboard(editor, { cut: false }),
      },
      {
        id: 'clipCutBtn',
        icon: '✂',
        label: 'Cut',
        hint: 'Cut the selected hexes (Ctrl+X) — they are cleared straight away',
        available: () => selectedHexes(editor).length
          ? { ok: true }
          : { ok: false, why: 'Select one or more hexes first, then Cut.' },
        onClick: () => copySelectionToClipboard(editor, { cut: true }),
      },
      {
        id: 'clipPasteBtn',
        icon: '⎘',
        label: 'Paste',
        hint: 'Show the ghost again (Ctrl+V), then click a hex to place it',
        available: () => {
          const clip = activeClip();
          return clip
            ? { ok: true, why: '' }
            : { ok: false, why: 'Nothing copied yet. Select some hexes and Copy or Cut first.' };
        },
        onClick: () => beginPaste(editor),
      },
      {
        id: 'clipSwapBtn',
        icon: '⇄',
        label: 'Swap',
        hint: 'Swap the two selected tiles',
        available: () => {
          const n = selectedHexes(editor).length;
          if (n === 2) return { ok: true };
          return {
            ok: false,
            why: n === 0
              ? 'Swap needs exactly two hexes selected. Click one, then shift-click another.'
              : `Swap needs exactly two hexes selected — ${n} ${n === 1 ? 'is' : 'are'} selected.`,
          };
        },
        onClick: () => {
          const [a, b] = selectedHexes(editor);
          if (a && b) swapHexes(editor, a, b);
        },
      },
    ],
  });

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

  // Registered here rather than at module load, so that disarming either one can hand
  // the editor over the way every other tool in this panel does.
  registerMode(MODE_VALUE_HINTS, { deactivate: () => disarmValueHints?.() });
  registerMode(MODE_LORE, { deactivate: () => deactivateLoreMode(editor) });
  registerMode(MODE_TOKEN, { deactivate: () => deactivateTokenMode(editor) });

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
      setRailLabel(tokenPlacementBtn, 'Click a Hex…');
      enableTokenHexSelection(editor);
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
    setRailLabel(selectHexForLoreBtn, 'Click a Hex…');

    // The lore module owns the picking mode and the editor entry point; this button only
    // turns it on. Previously this file drove the popup by filling #hexLabelInput and
    // clicking #selectHexBtn behind a setTimeout, which coupled it to the editor's DOM.
    import('../modules/Lore/loreMapPick.js').then(({ armLoreMapPick }) => {
      armLoreMapPick(editor, {
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

function deactivateLoreMode(editor) {
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
    .then(({ disarmLoreMapPick }) => disarmLoreMapPick(editor))
    .catch(() => { /* module never loaded, so nothing is armed */ });
}

// ───────────── Token Hex Selection Helper Functions ─────────────
let tokenHexSelectorActive = false;
let tokenHexClickHandler = null;

function deactivateTokenMode(editor) {
  tokenHexSelectorActive = false;
  const btn = document.getElementById('launchTokenPlacementPopup');
  if (btn) {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
    setRailLabel(btn, 'Token Placement…');
  }
  disableTokenHexSelection(editor);
}

function enableTokenHexSelection(editor) {
  console.log('enableTokenHexSelection called');
  // Remove any existing handler first
  disableTokenHexSelection(editor);

  // Take over map clicks. Whatever was armed before is deliberately dropped rather than
  // remembered — see disableTokenHexSelection.
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

function disableTokenHexSelection(editor) {
  // Leaving token mode disarms the map, it does not restore whatever was armed before.
  //
  // This used to stash editor.mode on the way in and put it back on the way out. Arming
  // Token Placement while a paint mode was active therefore re-armed that paint mode when
  // you switched tokens off, and the next map click painted a nebula the user had selected
  // several minutes earlier. Every other tool in this panel ends on setMode('none'); so
  // does this one now.
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
