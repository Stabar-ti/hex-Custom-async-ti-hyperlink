# TI4 Mapping Tool

A web-based editor for **Twilight Imperium 4** maps, with full support for hyperlanes, sector types, wormholes, and async bot integration.  
**No installation required — use in your browser or publish with GitHub Pages!**

---

## 🚀 Features

- **Intuitive Hex Grid Editor** — Click, assign, and visualize sector types, planets, and effects
- **Hyperlane Drawing** — Draw, delete, and loop curved hyperlane links with mouse gestures
- **Wormhole Tools** — Toggle wormholes and visualize their links
- **Full Export & Import** — Save and load your entire map, or export for async league tools and Discord bots
- **Undo / Redo** — Never lose your work, even after big changes or imports
- **Flexible Map Layouts** — Rectangular or round maps, up to 15 rings
- **Keyboard Shortcuts** for  editing
- **Responsive Dark/Light Modes**
- **Open Source** — Fork, extend, or contribute on GitHub!

---

## 🧭 Getting Started

### Online

Just open https://stabar-ti.github.io/hex-Custom-async-ti-hyperlink/ and start building maps!

### Local

1. **Clone the repo:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
    cd YOUR_REPO
    ```
2. **Open `index.html` in your browser**

That’s it!  
_No build or install steps needed for the main app._

---

## 🖱️ How to Use

- **Click** a hex to assign a sector type, wormhole, or effect
- **Shift+Click** to remove all hyperlane links from a hex
- **Ctrl/Cmd+Z** to undo, **Ctrl/Cmd+Shift+Z** to redo
- **Middle mouse drag** to pan; **scroll wheel** to zoom
- Use the top bar to switch between sector types, wormholes, and special effects
- See **Help** in the app for full keyboard shortcuts and features

### Import/Export

- **Export HL / Map String / Positions / Wormholes:**  
  Use for Discord async leagues or as backups
- **Save Map:**  
  Full JSON backup (useful for sharing or restoring maps)
- **Load Map:**  
  Paste JSON or upload file to restore a saved map
- See **Import/Export How-To** in-app for step-by-step examples

---

## 💡 For Async Discord Bot Users

- Export the **Map String** for async league map import
- Export **Hyperlane Positions** and **Wormholes** for `/map` and `/add_token` Discord bot commands

---

## 🛠️ Developer Info

- All source code is plain JS, no build tools required
- Modular architecture:  
  - `core/` — main logic and state
  - `features/` — hyperlanes, wormholes, overlays, undo/redo, etc
  - `ui/` — DOM and SVG bindings
  - `data/` — import/export helpers
  - `draw/` — rendering utilities
  - `public/data/` — sample sector metadata

### Contributing

- Open issues or PRs on GitHub
- Feedback and feature suggestions welcome!
- For major contributions, please contact <strong>@Stabar</strong> on the Discord async server

---

## 📬 Feedback & Contact

- For bugs, requests, or questions:  
  - Or reach out on the Discord async (ping <strong>@Stabar</strong>)

---

## License

[MIT](LICENSE) 

With exception of everything in /public/data/ This is borrowed from async Ti Bot and same rules should apply.

---

**Twilight Imperium™ and all related marks and logos are trademarks of Fantasy Flight Games. This is a personal project, and made it public on request and for community use, is unaffiliated.**


