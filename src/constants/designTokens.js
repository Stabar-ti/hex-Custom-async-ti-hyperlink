/**
 * Design tokens — single source of truth for colours used in JavaScript.
 *
 * DOM/CSS contexts (element.style.*) can use CSS variables directly:
 *   element.style.color = 'var(--color-accent)'
 *
 * SVG presentation attributes (setAttribute) do NOT support CSS variables,
 * so those callers import COLORS and use the hex values directly:
 *   el.setAttribute('fill', COLORS.planetCultural)
 *
 * Keep values in sync with the :root block in styles.css.
 */

export const COLORS = {
  // Brand
  accent:               '#ffe066',
  accentBg:             '#ffe464',
  accentOutline:        '#ffb800',
  accentActive:         '#cc8c00',
  accentOutlineDark:    '#ffd47f',
  primary:              '#1fa3ff',
  success:              '#27ae60',
  danger:               '#e74c3c',
  warning:              '#f39c12',
  info:                 '#3498db',

  // Surfaces
  surface1:             '#121212',
  surface2:             '#1e1e1e',
  surface3:             '#2a2a2a',
  surface4:             '#444444',
  surface5:             '#666666',
  surfaceHeader:        'rgba(48, 48, 48, 0.85)',

  // Text utility
  textMuted:            '#888888',

  // AutoMapper-specific (blue-tinted dark panel palette)
  autoPanelBg:          '#1a2535',
  autoBtnBlue:          '#0099cc',
  autoBtnGrey:          '#3a4a5a',
  autoBtnLink:          '#00aaff',
  autoWarnText:         '#ff9900',
  autoInputBg:          '#2a3a4a',
  autoInputBorder:      '#445566',
  autoBtnUndo:          '#7f4f00',
  autoSectionBorder:    '#334455',
  autoRowBorder:        '#223344',

  // AutoMapper preview rows. The three states have to be told apart at a glance in a
  // dense two-column grid, so each pairs a tinted background with its own text colour:
  // green = placed as painted, amber = a fallback the user should look at, grey = opted out.
  autoRowOkBg:          '#0d1d0d',
  autoRowOkText:        '#cccccc',
  autoRowWarnBg:        '#3a1a00',
  autoRowWarnText:      '#ffb347',
  autoRowOffBg:         '#1a1a1a',
  autoRowOffText:       '#777777',

  // Value-bias toggles. Same three hues as the Draw Helpers R/I/T buttons
  // (uisectorControls.js) — the panel is reading back what was painted there.
  autoValueR:           '#f5a623',
  autoValueI:           '#7ecfff',
  autoValueT:           '#b07cff',

  // SVG overlays — used with setAttribute, must be plain hex/named values
  linkLine:             '#1fa3ff',
  distanceNumber:       '#ffd700',
  distanceStroke:       '#222222',
  planetCultural:       '#4488ff',
  planetHazardous:      '#dd4444',
  planetIndustrial:     '#44aa44',
  planetUnknown:        '#888888',
  overrideLine:         '#0044ff',
  overrideLabel:        '#e049c9',

  // Lore relationship arcs. These cross tile artwork of every colour, so each is drawn
  // over a dark casing stroke — the casing is what makes them readable, not the hue.
  loreArcAffects:       '#1976d2',  // placements — a deeper blue than the marker fill
  loreArcRemoves:       '#e74c3c',
  loreArcSwap:          '#ffc107',
  loreArcCasing:        '#0a0a12',

  // Popup border identities
  popupDefault:         '#2196f3',
  popupLayout:          '#ffe066',
  popupSector:          '#4a9eff',
  popupAutomapper:      '#00d4ff',
  popupLore:            '#9b59b6',
  popupToken:           '#3498db',
  popupSpecial:         '#2ecc40',
  popupSpin:            '#e67e22',
  popupWarning:         '#ff9800',
  popupDanger:          '#e32b2b',
};

export const FONTS = {
  ui:   '"Segoe UI", Arial, sans-serif',
  mono: '"Courier New", monospace',
  icon: '"Segoe UI Symbol", "Noto Emoji"',
};
