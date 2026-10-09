import { showPopup, hidePopup } from './popupUI.js';

const MANUAL_URL = 'https://github.com/Stabar-ti/hex-Custom-async-ti-hyperlink/blob/main/src/manuals/Main%20usage%20manual.md';

/**
 * Open the full user manual on GitHub.
 *
 * This was a link at the top of the Help popup, whose body was the shortcut list. The list
 * is src/ui/shortcuts.js now, and the manual is its own item in the Help menu.
 */
export function openUserManual() {
  window.open(MANUAL_URL, '_blank', 'noopener,noreferrer');
}

export function showInfoPopup() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'line-height:1.6;font-size:13px;max-height:70vh;overflow-y:auto;padding-right:6px;';
  wrapper.innerHTML = `
    <h3 style="color:#2ecc40;margin:0 0 8px 0;">🔵 Everyday workflow</h3>
    <p>Everything below is under <strong>File</strong> in the top bar. These two handle 90% of daily use:</p>
    <ul style="margin:0 0 12px 16px;padding:0;">
      <li>
        <strong style="color:#27ae60;">Save map locally</strong> — Saves a complete JSON snapshot of your entire
        map (tiles, hyperlanes, wormholes, lore, tokens, everything). Use this to save work-in-progress.
      </li>
      <li>
        <strong style="color:#27ae60;">Load a saved map</strong> — Restores a previously saved JSON file.
      </li>
    </ul>

    <h3 style="color:#f59f00;margin:0 0 8px 0;">🟠 AsyncTI live game integration</h3>
    <ul style="margin:0 0 12px 16px;padding:0;">
      <li>
        <strong style="color:#f59f00;">Import map from AsyncTI4</strong> — Loads a map already running
        in an async Discord game. Paste the bot's map string into the box.
      </li>
      <li>
        <strong style="color:#059f00;">Upload final map to AsyncTI4</strong> — Formats and uploads your
        completed map directly to the AsyncTI bot. Use this when you are ready to start the game.
      </li>
    </ul>
    <p style="color:#aaa;font-size:12px;margin:0 0 12px 0;">
      ⚠ Always run <strong>Analyse ▸ Sanity Check</strong> before uploading — duplicate planet systems will cause the bot to reject the map.
    </p>

    <h3 style="color:#888;margin:0 0 8px 0;">⚙ Advanced fragmented export (AsyncTI commands)</h3>
    <p style="color:#aaa;font-size:12px;margin:0 0 6px 0;">
      Under <strong>File ▸ Advanced fragmented export and import</strong>. Use these when you need to
      update <em>part</em> of a live game (e.g. add hyperlanes or custom links after it has started).
    </p>
    <ul style="margin:0 0 8px 16px;padding:0;font-size:12px;color:#bbb;">
      <li>Export <strong>Map String</strong> → <code>/map add_tile_list</code></li>
      <li>Export <strong>Hyperlanes</strong> → <code>/map custom_hyperlanes</code> (MORE → Import)</li>
      <li>Export <strong>Wormholes</strong> → paste each line separately into the bot</li>
      <li>Export <strong>Custom Links</strong> → <code>/map add_custom_adjacent_tiles</code></li>
      <li>Export <strong>Adjacency Overrides</strong> → <code>/map add_adjacency_override_list</code></li>
      <li>Export <strong>Border Anomalies</strong> → <code>/map add_border_anomaly</code> (one per line)</li>
      <li>Import <strong>Map String</strong> / <strong>Hyperlanes</strong> — Paste exported text back to apply it to your current map.</li>
    </ul>

    <p style="color:#888;font-size:12px;">
      📖 See the <a href="https://github.com/Stabar-ti/hex-Custom-async-ti-hyperlink/blob/main/src/manuals/Main%20usage%20manual.md"
         target="_blank" rel="noopener noreferrer" style="color:#2ecc40;">full manual ↗</a> for complete documentation.
    </p>
  `;
  showPopup({
    id: 'info-popup',
    className: 'info-popup',
    content: wrapper,
    actions: [{ label: 'Close', action: () => hidePopup('info-popup') }],
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true,
    rememberPosition: true,
    modal: false,
    title: '📁 Import & Export — How To',
    style: { minWidth: '440px', maxWidth: '620px', borderRadius: '14px' },
    showHelp: false
  });
}

export function showFeaturesPopup() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'line-height:1.6;font-size:13px;max-height:70vh;overflow-y:auto;padding-right:6px;';
  wrapper.innerHTML = `
    <h3 style="color:#2ecc40;margin:0 0 8px 0;">✅ Current features</h3>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">🗺 Map editing</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Hex grid with configurable ring count and corner tiles</li>
      <li>Sector type assignment (1/2/3 planet, legendary, empty, special, fracture, void, homesystem)</li>
      <li>Effect overlays: nebula ☁️, rift 🕳️, asteroid 🪨, supernova ☀️, entropic scar ☄️ (Thunders Edge)</li>
      <li>Wormhole placement with visual link lines between pairs</li>
      <li>Hyperlane drawing — curved arcs, self-loops, multi-hop chains</li>
      <li>Border anomalies — Spatial Tear (blocks both ways), Gravity Wave (one-way)</li>
      <li>Custom adjacency links and adjacency overrides</li>
      <li>Token placement — system and planet level (attachments)</li>
      <li>Full undo/redo history</li>
      <li>Select hexes by clicking, shift-click for more; the Inspector shows what is on them</li>
      <li>Clipboard — copy, cut, rotate and paste regions with Ctrl+C / Ctrl+X / Ctrl+V and R,
          with a ghost preview and the last 12 copies kept</li>
      <li>Swap two tiles from the ⇄ button that appears on them</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">🔍 System search & overlays</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Search system and add to map — with source, attribute, AND/NAND filters</li>
      <li>Fracture tile support (Thunders Edge) with separate filter and draw helper</li>
      <li>Multi-type planets displayed as split-circle icons (e.g. Tinnes: I+H)</li>
      <li>Double tech skips shown as 2Y, GY, etc.</li>
      <li>Planet Types, R/I, Ideal R/I, RealID Labels, Tile Images — all independently toggleable</li>
      <li>Value Tier overlay (T1–T5) with per-type-group percentile scaling</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">📐 Analysis tools</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Slice evaluation — resources, influence, tech skips, wormholes per player</li>
      <li>Distance calculation with anomaly/hyperlane/rift/border-anomaly rules</li>
      <li>Sanity check — detects duplicate planet systems</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">🤖 AutoMapper</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Paint tile types and anomalies straight from the tool rail, then fill them with real systems</li>
      <li>Assignment solved for the whole map at once (min-cost matching), so the result does not
          depend on the order the hexes happen to be in</li>
      <li>Value hints — paint V1–V5 tier targets and R/I/T skew preferences per hex, with a table
          showing how many systems exist at each tier against how many you have asked for</li>
      <li>Fallback is a setting: take a lower tier, the nearest, or leave the hex empty</li>
      <li>Hexes that could not be matched are marked on the map, not just listed</li>
      <li>Balanced mode using milty-style scoring with milty weight settings</li>
      <li>Source filter, duplicate empty-system toggle, milty exclusion rules</li>
      <li>Token fallback for effects when no matching system is available</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">🎲 Generate</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Milty Slice Designer — drag A–F slices to draft slots 1–12</li>
      <li>Milty Draft Generator — auto-generates balanced slices with weighted scoring (incl. Thunders Edge)</li>
      <li>Spin-To-Win — configure ring spins for the AsyncTI4 bot, visualise with glow overlays and movement arrows, test per ring or per trigger phase, apply with full undo support, and export <code style="color:#2ecc40;">/spin add</code> commands</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">🧭 Layout</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Docked tool rail — every paint mode and tool in one column, foldable to icons</li>
      <li>Inspector — tile art, planets, tokens, value hints and tiers for the hex you click</li>
      <li>Status bar — armed tool, hex under the pointer, zoom level</li>
      <li>Import, export and map generation behind the File menu rather than over the map</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">💾 Import / Export</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Save / Load full map JSON locally</li>
      <li>Import map from AsyncTI; Upload final map to AsyncTI</li>
      <li>Fragmented exports: Map String, Hyperlanes, Wormholes, Custom Adjacency, Border Anomalies</li>
      <li>Cache-busted module loading — users always get the latest version</li>
    </ul>

    <h4 style="color:#ffe066;margin:6px 0 4px 0;">📖 Documentation</h4>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li>Full user manual — <a href="https://github.com/Stabar-ti/hex-Custom-async-ti-hyperlink/blob/main/src/manuals/Main%20usage%20manual.md"
         target="_blank" rel="noopener noreferrer" style="color:#2ecc40;">open on GitHub ↗</a></li>
      <li>Inline help buttons (?) on most popups</li>
    </ul>

    <hr style="border-color:#333;margin:10px 0;">
    <h4 style="color:#888;margin:0 0 6px 0;">💬 Feedback & Bugs</h4>
    <p style="margin:0;color:#aaa;">
      Contact <strong>@Stabar</strong> on the async TI4 Discord server.<br>
      We love suggestions and bug reports!
    </p>
  `;
  showPopup({
    id: 'features-popup',
    className: 'features-popup',
    content: wrapper,
    actions: [{ label: 'Close', action: () => hidePopup('features-popup') }],
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true,
    rememberPosition: true,
    modal: false,
    title: '✨ Features',
    style: { minWidth: '440px', maxWidth: '620px', borderRadius: '14px' },
    showHelp: false
  });
}
