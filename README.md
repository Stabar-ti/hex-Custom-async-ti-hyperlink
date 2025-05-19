Hex Hyperlane Editor
A web-based visual editor for building and customizing hex-based maps with hyperlane connections and sector types — ideal for games like Twilight Imperium 4 and custom mods.

🧭 Features
Click-based hex selection

Draw and manage hyperlane connections

Assign sector types: 1/2/3 planet, legendary, empty, special, homesystem, void

Overlay effects: Nebula, Supernova, Rift, Asteroid Fields

Import/export data: Hyperlane structures and sector type strings

CSV-based lookup for accurate sector metadata

Keyboard support: Hover + Shift+R to reset a hex

Offline use: No server required — runs in browser

Undo support (per hex)

Autoscales and pans the map

Setup
You can open the hex-now2e.html file directly in your browser or deploy it via GitHub Pages.

Alternatively, clone and possibly open:

bash
Copy
Edit
git clone https://github.com/yourusername/hex-hyperlane-editor.git
cd hex-hyperlane-editor
open hex-now2e.html
🗂 Sector Data Integration
The editor uses a CSV file to identify sector tile information (faction, legendary, special, etc).

Format Example
csv
Copy
Edit
ID,Name,Planets,Faction,Legend,Special,Nebula,Asteroid,Nova,Gravity,# Planets
S17,Belsung IX,[belsungix],,,1,,,,,1
01,Jord,[jord],1,,,,,,4
ID: Tile code

# Planets: Used to determine 1/2/3 planet

Faction: If set to 1, marks tile as a homesystem

Legend: If non-empty, marks as legendary

Special: Marks as special tile

Loading the CSV
Click "Load ID Reference CSV" and select your tile list. This will enable automatic recognition on import.

Hyperlane Drawing
Click 3 connected tiles to define a path: A → B → C

Hold ALT+Click to remove a connection

Hold SHIFT+Click to delete all connections from a hex

Right-click to cancel selection

Sector Types Import
Paste a tile-type string (from export) and click Import Sector Types.

Only overwrites tiles not manually modified.

Reset / Clear
Shift+R while hovering a tile will:

Remove all links

Remove effects

Reset base type

 Deployment
This app is fully static. You can deploy it on GitHub Pages or Netlify with no backend.

License
MIT License. Free to use and adapt.

