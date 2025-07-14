/*// ui/hexHoverInfo.js
export function initHexHoverInfo(editor) {
  let hoverInfoEnabled = false;
  const infoDiv = document.getElementById('hexHoverInfo');
  const toggleBtn = document.getElementById('toggleHoverInfoBtn');

  // Toggle the hover info window
  toggleBtn.addEventListener('click', () => {
    hoverInfoEnabled = !hoverInfoEnabled;
    toggleBtn.classList.toggle('active', hoverInfoEnabled);
    if (!hoverInfoEnabled) infoDiv.style.display = 'none';
  });

  // Attach handlers to all hex polygons
  function attachHexHoverHandlers() {
    Object.values(editor.hexes).forEach(hex => {
      if (!hex.polygon) return;

      hex.polygon.onmouseenter = (e) => {
        if (!hoverInfoEnabled) return;
        showHexHoverInfo(hex, e);
      };
      hex.polygon.onmousemove = (e) => {
        if (!hoverInfoEnabled) return;
        positionHoverInfo(e);
      };
      hex.polygon.onmouseleave = () => {
        infoDiv.style.display = 'none';
      };
    });
  }

  // Patch editor.generateMap to re-attach handlers after each redraw
  const origGenMap = editor.generateMap.bind(editor);
  editor.generateMap = function (...args) {
    origGenMap(...args);
    attachHexHoverHandlers();
  };

  // Utility functions
  function showHexHoverInfo(hex, evt) {
    infoDiv.innerHTML = formatHexInfo(hex);
    positionHoverInfo(evt);
    infoDiv.style.display = 'block';
  }
  function positionHoverInfo(evt) {
    const pad = 18;
    infoDiv.style.left = `${evt.clientX + pad}px`;
    infoDiv.style.top = `${evt.clientY + pad}px`;
  }


  function formatHexInfo(hex) {
    if (!hex) return "<i>No data</i>";
    const { realId, baseType, effects, wormholes, planets, matrix, customAdjacents, borderAnomalies, adjacencyOverrides } = hex;
    let html = `<b>Tile Info</b><hr>`;

    html += `<b>Real ID:</b> ${realId ?? '-'}<br>`;
    html += `<b>Base Type:</b> ${baseType ?? '-'}<br>`;
    html += `<b>Effects:</b> ${(effects && effects.size) ? Array.from(effects).join(', ') : '-'}<br>`;
    html += `<b>Wormholes:</b> ${(wormholes && wormholes.size) ? Array.from(wormholes).join(', ') : '-'}<br>`;

    // --- Custom Adjacency / Links ---
    if (customAdjacents && Object.keys(customAdjacents).length) {
      html += `<b>Custom Links:</b><ul>`;
      Object.entries(customAdjacents).forEach(([target, adj]) => {
        html += `<li>${target} ${adj.twoWay ? '(2-way)' : '(1-way)'}</li>`;
      });
      html += `</ul>`;
    } else {
      html += `<b>Custom Links:</b> -<br>`;
    }

    // --- Adjacency Overrides ---
    if (adjacencyOverrides && Object.keys(adjacencyOverrides).length) {
      html += `<b>Adjacency Overrides:</b><ul>`;
      Object.entries(adjacencyOverrides).forEach(([side, target]) => {
        html += `<li>Side ${side}: ${target}</li>`;
      });
      html += `</ul>`;
    } else {
      html += `<b>Adjacency Overrides:</b> -<br>`;
    }

    // --- Border Anomalies ---
    if (borderAnomalies && Object.keys(borderAnomalies).length) {
      html += `<b>Border Anomalies:</b><ul>`;
      Object.entries(borderAnomalies).forEach(([side, anomaly]) => {
        html += `<li>Side ${side}: <b>${anomaly.type}</b></li>`;
      });
      html += `</ul>`;
    } else {
      html += `<b>Border Anomalies:</b> -<br>`;
    }

    // --- Planets ---
    if (planets && planets.length) {
      html += `<b>Planets:</b><ul>`;
      planets.forEach((p, i) => {
        html += `<li><b>${p.name || 'Planet ' + (i + 1)}</b>: 
        <i>${p.planetType || (p.planetTypes ? p.planetTypes.join(', ') : '')}</i>, 
        <span>R/I ${p.resources}/${p.influence}</span>
        ${p.legendaryAbilityName ? `<span>, <b>Legendary:</b> ${p.legendaryAbilityName}</span>` : ''}
        ${p.techSpecialty || (p.techSpecialties?.length ? ', Tech: ' + p.techSpecialties.join(', ') : '')}
      </li>`;
      });
      html += `</ul>`;
    } else {
      html += `<b>Planets:</b> -<br>`;
    }

    if (matrix && matrix.length) {
      html += `<b>Hyperlane Matrix:</b><pre>${matrix.map(row => row.join(' ')).join('\n')
        }</pre>`;
    }
    return html;
  }



  // Expose for testing if you want
  editor.attachHexHoverHandlers = attachHexHoverHandlers;

  // Attach initially (after first map draw)
  setTimeout(attachHexHoverHandlers, 200);
}
*/