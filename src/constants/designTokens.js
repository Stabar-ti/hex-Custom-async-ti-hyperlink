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
