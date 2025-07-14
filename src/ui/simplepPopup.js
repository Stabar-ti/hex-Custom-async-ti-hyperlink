import { showPopup, hidePopup } from './popupUI.js';

export function showOptionsPopup(editor) {
    // Build content dynamically, reflecting current editor options
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div>
        <h3>Turn off or on special tile effects</h3>
        <label>
          <input type="checkbox" id="toggleSupernova" ${editor.options.useSupernova ? 'checked' : ''}>
          Block Supernova
        </label><br>
        <label>
          <input type="checkbox" id="toggleAsteroid" ${editor.options.useAsteroid ? 'checked' : ''}>
          Block Asteroid
        </label><br>
        <label>
          <input type="checkbox" id="toggleNebula" ${editor.options.useNebula ? 'checked' : ''}>
          Block Nebula
        </label><br>
        <label>
          <input type="checkbox" id="toggleRift" ${editor.options.useRift ? 'checked' : ''}>
          Enable Rift chaining
        </label><br>
        <label>
          <input type="checkbox" id="toggleCustomLinks" ${editor.options.useCustomLinks ? 'checked' : ''}>
          Use Custom Links
        </label><br>
        <label>
          <input type="checkbox" id="toggleBorderAnomalies" ${editor.options.useBorderAnomalies ? 'checked' : ''}>
          Use Border Anomalies
        </label><br>
        <br>
        <label>
          Max Distance:
          <input type="number" id="maxDistanceInput" value="${editor.maxDistance}" min="1" max="10">
        </label><br>
      </div>
    `;

    showPopup({
        id: 'options-popup',
        className: 'options-popup',
        content: wrapper,
        actions: [
            {
                label: 'Save',
                action: () => {
                    // Save logic
                    const supernovaCB = wrapper.querySelector('#toggleSupernova');
                    const asteroidCB = wrapper.querySelector('#toggleAsteroid');
                    const nebulaCB = wrapper.querySelector('#toggleNebula');
                    const riftCB = wrapper.querySelector('#toggleRift');
                    const customLinksCB = wrapper.querySelector('#toggleCustomLinks');
                    const borderAnomaliesCB = wrapper.querySelector('#toggleBorderAnomalies');
                    const maxDistInp = wrapper.querySelector('#maxDistanceInput');

                    editor.options.useSupernova = !!supernovaCB.checked;
                    editor.options.useAsteroid = !!asteroidCB.checked;
                    editor.options.useNebula = !!nebulaCB.checked;
                    editor.options.useRift = !!riftCB.checked;
                    editor.options.useCustomLinks = !!customLinksCB.checked;
                    editor.options.useBorderAnomalies = !!borderAnomaliesCB.checked;

                    // Clamp max distance between 1 and 10
                    let md = parseInt(maxDistInp.value, 10);
                    if (isNaN(md) || md < 1) md = 1;
                    if (md > 10) md = 10;
                    editor.maxDistance = md;
                    maxDistInp.value = md;

                    hidePopup('options-popup');
                }
            },
            { label: 'Close', action: () => hidePopup('options-popup') }
        ],
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: 'Distance Calculator Options',
        style: {
            minWidth: '340px',
            borderRadius: '12px',
            zIndex: 10010
        },
        showHelp: false
    });
}