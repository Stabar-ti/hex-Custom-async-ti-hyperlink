# TI4 Mapping Tool

A web-based editor for **Twilight Imperium 4** maps, with full support for hyperlanes, sector types, wormholes, custom adjacency, lore, tokens, and async bot integration.  
**No installation required — use in your browser or publish with GitHub Pages!**

> **Current version: v2.3.1.0**

---

## 🚀 Features

### Map Editing
- **Intuitive Hex Grid Editor** — Click to assign sector types, planets, effects, and wormholes
- **System Tiles** — Search and assign real TI4 systems from Base, PoK, Discordant Stars, Thunders Edge, and more
- **Hyperlane Drawing** — Curved arcs, self-loops, and multi-hop chains with mouse gestures
- **Wormhole Tools** — Place and visualise all wormhole types with link lines between pairs
- **Border Anomalies** — Spatial Tears, Gravity Waves, and custom edge effects
- **Custom Adjacency** — Single/double custom links and adjacency overrides
- **Effect Overlays** — Nebula, Rift, Asteroid Field, Supernova, Entropic Scar
- **Copy/Cut Swap** — Select, move, and rotate regions of tiles with full undo support

### Overlays & Analysis
- **Tile Images** — Display real system artwork on the hex grid
- **Planet Type, R/I, Ideal R/I, RealID** — Independently toggleable info layers
- **Value Tier Overlay (T1–T5)** — Milty-style per-group percentile scoring
- **Value Hints** — Paint V1–V5 targets and R/I/T skew preferences per hex
- **Distance Calculator** — BFS pathfinding with anomaly, hyperlane, and rift rules
- **Slice Analysis** — Resources, influence, tech skips and wormholes per home system
- **Sanity Check** — Detect duplicate planet systems before uploading to the bot

### Special Setup Modes
- **Milty Slice Designer** — Drag A–F slices to draft slots 1–12
- **Milty Draft Generator** — Auto-generate balanced slices with weighted scoring
- **AutoMapper** — Intelligent fill of Draw-Helper-painted tiles with real systems
- **Spin-To-Win** — Configure, visualise, and export AsyncTI4 ring-spin commands

### Tokens & Lore
- **Token Placement** — System and planet-level tokens, attachments, and frontier tokens
- **Lore Module** — Attach narrative text and bot commands to systems and planets; fires via AsyncTI4 triggers

### Import / Export
- **Save / Load full map JSON** locally
- **Import map from AsyncTI4** — Paste the bot's map string to load a live game
- **Upload final map to AsyncTI4** — Format and push directly to the bot
- **Fragmented exports** — Map String, Hyperlanes, Wormholes, Custom Adjacency, Border Anomalies, Adjacency Overrides
- **Full undo/redo** — Never lose work, even through imports

### Quality of Life
- **Responsive dark/light mode** — Forced dark by default, toggleable
- **Draggable, resizable popups** — Positions remembered across sessions
- **Keyboard shortcuts** — Undo/Redo, Distance mode, Copy/Cut, Escape cancel
- **No build step required** — Open in any modern browser

---

## 🧭 Getting Started

### Online

Open **https://stabar-ti.github.io/hex-Custom-async-ti-hyperlink/** and start building!

### Local

1. **Clone the repo:**
    ```bash
    git clone https://github.com/Stabar-ti/hex-Custom-async-ti-hyperlink.git
    cd hex-Custom-async-ti-hyperlink
    ```
2. **Serve with a local web server:**
    ```bash
    # Python 3
    python -m http.server 8000

    # Or Node.js
    npx http-server -p 8000
    ```
3. **Open `http://localhost:8000` in your browser**

_No build or install steps needed._

### Testing Cloud Export Locally (Optional)

1. Install dependencies: `npm install express cors`
2. Start the local worker: `node local-worker.js`
3. Update `src/data/cloudflare.js` line 6: `const API_ORIGIN = "http://localhost:3000";`

For production deployment see [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md).

---

## 🖱️ Quick Reference

| Action | How |
|---|---|
| Assign sector type | Click a hex while a mode is active in Sector Controls |
| Remove hex content | Hover hex + `Shift+R` |
| Pan map | Middle mouse drag |
| Zoom | Scroll wheel |
| Distance overlay | `Shift+D` → right-click a hex |
| Copy/Cut region | `Shift+click` to add hexes → release Shift → click to paste |
| Rotate paste selection | `Alt+scroll` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Cancel mode | `Esc` |

Full shortcut reference: **Help** button in the top bar.

---

## 💡 AsyncTI4 Bot Integration

| Task | Button |
|---|---|
| Load a running game | **Import map from AsyncTI** |
| Submit a completed map | **Upload final map to AsyncTI** |
| Add hyperlanes to live game | Export HL → `/map custom_hyperlanes` |
| Add custom adjacency | Export Custom Adjacency → `/map add_custom_adjacent_tiles` |
| Add border anomalies | Export Border Anomalies → `/map add_border_anomaly` |

Always run **Sanity Check** before uploading — duplicate systems will cause the bot to reject the map.

---

## 🛠️ Developer Info

Plain ES6 modules, no build tools, no framework.

```
src/
  core/        — HexEditor engine and state
  features/    — hyperlanes, wormholes, overlays, undo/redo, lore, tokens, value tiers
  ui/          — DOM and popup bindings
  draw/        — SVG rendering utilities
  modules/     — Milty, AutoMapper, SpinToWin, Token, Lore
  constants/   — sectorColors, wormholeTypes, designTokens
  data/        — import/export, cloudflare integration
public/data/   — system info, tokens, attachments (sourced from AsyncTI4 bot)
```

### Checks (optional)

```bash
npm install   # one time; requires Node 18+
npm run check # lint + tests
npm test      # lore footer round-trip tests only
```

`npm test` exercises the lore footer model against the real modules: an entry's `footerText`
is the only thing the AsyncTI4 bot ever reads, and the editor parses it into objects and
writes it back, so a defect there silently corrupts a GM's lore. The suite asserts the
round-trip is safe over the lore export shipped in `public/data/tempo/` plus constructed
cases covering gates, roll bins, multi-effect lines, and negated conditions.

### Linting

The app itself still has **no build step** — `index.html` loads `src/` as native ES modules and
opens directly, exactly as before. But because nothing compiles the code, a mistyped import path
or a named import that doesn't exist shows up only as a blank page at runtime. ESLint is set up
to catch that class of mistake:

```bash
npm install        # one time; requires Node 18+
npm run lint       # whole codebase
npm run lint:lore  # just the Lore module
```

`node_modules/` is gitignored and no build output is produced — linting is a check you run, not
a step anyone needs in order to use the tool.

A clean tree exits 0. Errors are reserved for things that genuinely break the app (an import
that doesn't resolve, an undefined variable); the remaining pre-existing style issues are
warnings, so any **error** you see is worth acting on.

**Windows / PowerShell:** if `npm` fails with *"npm.ps1 cannot be loaded because running
scripts is disabled"*, PowerShell is blocking npm's script wrapper. Either use `npm.cmd`
instead of `npm`, or allow local scripts once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Contributing

- Open issues or PRs on GitHub
- For major contributions please contact **@Stabar** on the AsyncTI Discord

---

## 📋 Changelog

### v2.3.1.0
- CSS design token system — all colours and popup identities centralised in `:root` and `designTokens.js`
- Visual modernisation — custom scrollbars, button hover states, depth shadows, glass borders, unified transitions
- Dark-themed input fields with primary-colour focus ring
- Sector Controls: renamed "System Tiles", section labels ("Draw your design" / "Advanced map tools"), "Add Lore..."
- Modern system font chain (Segoe UI Variable / system-ui)

### v2.3.0.x
- Spinning mechanic testing and Spin-To-Win commands
- AutoMapper opened directly from Sector Controls
- Value overlay dots for R/I/T skew on tier badges
- Copy/paste output for spin commands

---

## 📬 Feedback & Contact

Bugs, requests, or questions — ping **@Stabar** on the AsyncTI Discord server.

---

## License

[MIT](LICENSE)

_Exception: everything in `/public/data/` is sourced from the AsyncTI4 bot and the same usage rules apply._

---

**Twilight Imperium™ and all related marks and logos are trademarks of Fantasy Flight Games. This is an independent community project, unaffiliated with Fantasy Flight Games.**
