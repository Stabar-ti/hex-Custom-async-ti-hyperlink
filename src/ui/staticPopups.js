import { showPopup, hidePopup } from './popupUI.js';

export function showHelpPopup() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
      <h3>🧭 TI4 Mapping Tool — Help</h3>
      <p>
        <strong>Welcome!</strong> This web tool lets you build, edit, and export custom
        <em>Twilight Imperium 4</em> maps with all sector types, wormholes, hyperlanes, and tile effects.<br>
        <em>No installation or account needed—just start creating!</em>
      </p>
      <hr>
      <h3>🖱 Controls & Shortcuts</h3>
      <ul>
        <h4>🖱 Hyperlane controls</h4>
        <li><strong>Left - Click</strong> start drawing hyperlane when selected.</li>
        <li><strong>Right - Click</strong> Cancel drawing current hyperlane string </li>
        <li><strong>Shift+Click</strong> on a hex: remove all links from that hex (hyperlane cleanup).</li>
        <li><strong>Alt+Click</strong> (in Hyperlane mode): remove a single link.</li>
        <h4>🖱 Base Controls</h4>
        <li><strong>Left - Click</strong> a hex to assign the selected sector, wormhole, or effect.</li>
        <li><strong>Ctrl/Cmd + Z</strong> to undo, <strong>Ctrl/Cmd + Shift + Z</strong> to redo.</li>
        <li><strong>SHIFT-R (Hoover tile) OR (Hoover tile) with Delete </strong> to remove all tile info (RESET) </li>
        <h4>🖱 Map Controls</h4>
        <li><strong>Middle mouse (drag)</strong> to pan the map; <strong>mouse wheel</strong> to zoom.</li>
        <h4>🖱 Utility Controls</h4>
        <li><strong>SHIFT-D (click a non hyperlane tile) </strong> calculates distances from that tile; "Options" for settings </li>
      </ul>
      <hr>
      <h4>🌀 Hyperlane Editing</h4>
      <ul>
        <li>Switch to <strong>Hyperlane</strong> mode to draw links between hexes.</li>
        <li>Click three connected tiles to draw a curved hyperlane on the middle tile.</li>
        <li>Make loops by clicking a sequence like A → B → A.</li>
      </ul>
      <hr>
      <h4>🌌 Sector Types & Effects</h4>
      <ul>
        <li>Async Tiles, allow you to directly search tiles available in async server to design your maps.</li>
        <li>just numbers: base + pok, d*** Discordant stars, er*** Eronous tiles, etc.</li>
        <li>Or pick a sector type (1/2/3 planet, empty, homesystem, etc) and click tiles to assign them.</li>
        <li>Add effects (<em>rift, asteroid, nebula, supernova</em>) as emoji overlays on tiles.</li>
      </ul>
      <hr>
      <h4>🕳 Wormholes</h4>
      <ul>
        <li>Pick a wormhole type, then click tiles to toggle wormholes on/off.</li>
        <li>Click <strong>Link Wormholes</strong> to show dashed lines between all wormholes of the same type.</li>
      </ul>
      <hr>
      <h4>🧠 Pro Tips</h4>
      <ul>
        <li>Use <strong>Generate Map</strong> to build or reset the grid. Use the “Max size” option for largest rectangular maps.</li>
        <li>Undo/redo should work for all changes, including imports.</li>
        <li>Keyboard shortcuts help you edit much faster!</li>
      </ul>
    `;
  showPopup({
    id: 'help-popup',
    className: 'help-popup',
    content: wrapper,
    actions: [{ label: 'Close', action: () => hidePopup('help-popup') }],
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true,
    rememberPosition: true,
    modal: false,
    title: 'Help',
    style: { minWidth: '420px', borderRadius: '14px', zIndex: 10010 },
    showHelp: false
  });
}

export function showInfoPopup() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
      <h3>📁 Import & Export — How To</h3>
      <p>
        <strong>Quick Guide:</strong> Use the <b>Export</b> buttons to save your work, and <b>Import</b> buttons to restore it.<br>
        <em>For async Discord bots, or local backup—choose the right format for your needs!</em>
      </p>
      <h4>📁 How to get your design into Async Discord Bots:</h4>
      <ul>
        <li>
          <strong>1: Export Map String</strong> — Copy this to the Discord bot using <code>/map add_tile_list</code>
        </li>
        <li>
          <strong>2: Export HL (Hyperlanes)</strong> — Copy this to the bot using <code>/map custom_hyperlanes</code>
          (under MORE → Import)
        </li>
        <li>
          <strong>3: Export Wormholes</strong> — Copy each line separately into the bot (no way to import all at once)
        </li>
        <li>
          <strong>4: Export Custom Adjacency</strong> — Copy all <code>/map add_custom_adjacent_tiles</code> commands.
          Each command can be pasted to the bot.
        </li>
        <li>
          <strong>5: Export Adjacency Overrides</strong> — Use the <code>/map add_adjacency_override_list</code> output.
          Paste the whole line in the bot.
        </li>
        <li>
          <strong>6: Export Border Anomalies</strong> — Use the <code>/map add_border_anomaly</code> output. Copy and
          paste each line (grouped by direction and anomaly type).
        </li>
      </ul>
      <h4>📁 Base Export/Import Functions:</h4>
      <ul>
        <li><strong>Export HL (Hyperlanes)</strong> — Outputs a string encoding all hyperlane links. Use for Discord bot imports or as a backup.</li>
        <li><strong>Export Map String (Sector Types)</strong> — Compact string for async Discord games. Includes only tile types and basic info.</li>
        <li><strong>Export HL Pos (Hyperlane Positions)</strong> — Outputs tile IDs with hyperlanes. Use with bot commands, e.g.:<br>
          <code>/map add_tile tile_name:hl position:203,204,205</code>
        </li>
        <li><strong>Export Wormholes</strong> — Exports a scriptable command to add user-created wormholes in async tools or bots.</li>
        <li><strong>Export Custom Adjacency</strong> — Outputs all custom adjacency relationships as
          <code>/map add_custom_adjacent_tiles</code> commands. Each command can be pasted separately.
        </li>
        <li><strong>Export Adjacency Overrides</strong> — Outputs a single
          <code>/map add_adjacency_override_list adjacency_list: ...</code> command for all overrides.
        </li>
        <li><strong>Export Border Anomalies</strong> — Outputs grouped <code>/map add_border_anomaly</code> commands, one per anomaly type and direction (max 6 per anomaly).</li>
        <li><strong>Import HL / Map String</strong> — Paste exported async data text back to instantly apply that data to your map.</li>
        <li><strong>Save Map</strong> — Exports a complete JSON file with every tile, link, effect, and planet. <b>Use for full backups or sharing custom maps.</b></li>
        <li><strong>Load Map</strong> — Restore a saved map by uploading a JSON file or pasting its text.</li>
        <li><strong>Tip:</strong> If you're unsure which format to use, <b>Save Map</b> is always a safe backup. For async league or Discord bots, use the specific Export buttons as needed.</li>
      </ul>
      <p>
        <b>Need help?</b> See <b>Help</b> for basic editing, or <b>Features</b> for roadmap & feedback.
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
    title: 'Import/Export How-To',
    style: { minWidth: '420px', borderRadius: '14px', zIndex: 10010 },
    showHelp: false
  });
}

export function showFeaturesPopup() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
      <h3>✨ Features & Feedback</h3>
      <ul>
        <li><strong>Major Features:</strong> Sector assignment, integrated async tiles, hyperlane editor, wormhole links,
          effects, undo/redo, async & bot export, map saving/loading, distance and slice Calculations, border anomalies and custom link sectors </li>
        <li><strong>Upcoming:</strong> More uniform GUI </li>
        <li>
          <strong>Feedback / Bugs:</strong>
          <br>Contact <b>@Stabar</b> on the Discord async server.
          <br>We love suggestions and bug reports!
        </li>
      </ul>
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
    title: 'Features & Feedback',
    style: { minWidth: '420px', borderRadius: '14px', zIndex: 10010 },
    showHelp: false
  });
}