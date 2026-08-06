/**
 * The picker's help popup.
 *
 * Its own file because the lore rework learned that help text buried inside a UI module
 * goes stale silently — nobody edits a 200-line string literal in the middle of a panel
 * factory when they change a behaviour. Keeping it here makes "does this still describe
 * what happens?" a question you can answer by reading one short file.
 */

import { showPopup } from '../../ui/popupUI.js';

export function showPickerHelp() {
    showPopup({
        id: 'system-picker-help',
        className: 'popup-ui popup-ui-info',
        title: 'System tiles — help',
        content: `
<div class="sp-help">
  <h3>Placing a tile</h3>
  <p>Click a tile to arm it, then click a hex on the map to place it. While a tile is
     armed the map shows a crosshair and a banner appears at the bottom of the screen.
     <b>Escape</b> cancels.</p>
  <ul>
    <li><b>Once</b> — place one tile, then disarm. This is the default.</li>
    <li><b>Keep</b> — stay armed and keep placing until you press Escape. Useful for
        filling a ring with the same anomaly, or laying a run of hyperlanes.</li>
    <li><b>×N</b> — place a set number of copies, counting down.</li>
  </ul>
  <p>Each placement is one undo step. A bar at the bottom of the screen offers
     <b>Undo</b> for a few seconds afterwards, and <b>Ctrl+Z</b> works as usual.</p>

  <h3>Searching</h3>
  <p>Type anything: id, tile name, planet name, tech, wormhole, or an alias. Terms
     separated by spaces all have to match.</p>
  <ul>
    <li><b>Prefixes</b> — <code>id:</code> <code>name:</code> <code>planet:</code>
        <code>tech:</code> <code>worm:</code> <code>src:</code> <code>alias:</code>.
        <code>src:somno</code> is the only way to reach a specific source inside
        the "Others" group.</li>
    <li><b>Quotes</b> group words: <code>name:"new terra"</code>.</li>
    <li><b>Minus</b> excludes: <code>-fow</code>.</li>
  </ul>
  <p>Results are ranked by how well they match, so searching <code>18</code> puts tile 18
     first even though 26 tile ids contain "18". Clicking a column header in the table
     view pins that sort instead; click it a third time to go back to ranking.</p>

  <h3>Filters</h3>
  <ul>
    <li><b>Sources</b> are always visible and combine with OR — a tile shows if it comes
        from any source you have on.</li>
    <li><b>+ Add filter</b> adds everything else. Active filters appear as chips; click
        the × on a chip to remove it.</li>
    <li><b>Planet counts</b> combine with OR: "1 Planet" plus "2 Planets" means one
        <i>or</i> two.</li>
    <li><b>Faction homeworlds</b>, <b>hyperlanes</b> and <b>weird tiles</b> have three
        positions — hide (the default), only, or allow.</li>
    <li><b>AND / NAND</b> appears once you have two or more requirements. AND wants tiles
        matching all of them; NAND wants tiles that fail at least one.</li>
  </ul>
  <p>The line under the filters always says how many tiles you are looking at and how
     many are hidden, so an empty list never goes unexplained.</p>

  <h3>Tiles already on the map</h3>
  <p>They stay in the list, dimmed and marked <i>on map</i>, because you often want to
     place a second copy or just see what you have used. Add the <b>Unplaced only</b>
     filter to hide them.</p>

  <h3>Views</h3>
  <p><b>▦</b> is the tile gallery, <b>☰</b> is the detailed table with sortable columns.
     Arrow keys move through results from either the search box or the results
     themselves; <b>Enter</b> arms the highlighted tile.</p>

  <p class="sp-help-note">Filters, search, sort and view are remembered when you close
     the picker. The armed tile is not.</p>
</div>`,
        actions: [],
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            minWidth: '380px',
            maxWidth: '720px',
            minHeight: '240px',
            maxHeight: '80vh',
            border: '2px solid var(--popup-border-picker)',
            borderRadius: '10px',
            boxShadow: '0 8px 40px #000a',
            padding: '20px'
        }
    });
}
