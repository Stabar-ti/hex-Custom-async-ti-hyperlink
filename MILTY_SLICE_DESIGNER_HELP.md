# Milty Slice Designer Help

## Overview

The Milty Slice Designer is a powerful tool for creating, managing, and analyzing slices for Twilight Imperium 4th Edition draft formats. It allows you to work with both the standard map layout (slices A-F) and draft slots (1-12) for tournament and competitive play.

## Getting Started

### Opening the Designer
1. Click the **"Special Setup Modes"** button in the main interface
2. Select **"Milty Slice Designer"** from the popup
3. The designer interface will open with all available tools

### Initial Setup
Before using the designer effectively, you should:
1. **Load MiltyBuilder.json Map** - This loads the standard 6-player map layout
2. **Show Slice Borders** - Visual overlay showing slice boundaries (A-F)
3. **Show Slice Numbers** - Visual overlay showing draft slot positions (1-12)

## Main Interface

### Control Buttons
- **Load MiltyBuilder.json Map**: Loads the standard 6-player competitive map layout
- **Show Slice Borders**: Toggles colored overlays showing slice A-F boundaries
- **Show Slice Numbers**: Toggles numbered overlays (1-12) showing draft slot positions
- **Refresh Occupancy**: Updates the color coding of all slice buttons
- **Calculate Draft Values**: Opens detailed analysis of all draft slices
- **Output Copy**: Generates formatted output for completed draft slices

### Slice Selection Areas

#### Standard Map Slices (A-F)
- Six buttons representing the standard map slices
- Used for the base 6-player competitive layout
- Each slice contains 6 hexes (1 home system + 5 regular systems)

#### Draft Slice Slots (1-12)
- Twelve buttons representing draft slots for tournament play
- Arranged in two rows (1-6, 7-12)
- Used for creating and storing slice variations

## Color Coding System

All slice buttons use a color-coding system to show occupancy status:

### Standard Map Slices (A-F)
- **Green**: Complete slice (all 5 non-home systems filled with async tiles)
- **Orange**: Mixed content (filled but not all async tiles)
- **Red**: Partially filled
- **White/Gray**: Empty

### Draft Slots (1-12)
- **Green + ✓**: Complete slice (5 async tiles)
- **Orange + ◐**: Mixed content
- **Red + ◑**: Partially filled
- **White/Gray**: Empty

## Core Workflow

### 1. Basic Slice Movement
1. **Select Source**: Click on any slice button (A-F or 1-12)
   - Button will be highlighted with orange border
   - Status message shows selection
2. **Select Destination**: Click on target slice button
   - Systems will be moved from source to destination
   - Source will be cleared (except home system for A-F slices)
   - Selection will be automatically cleared

### 2. Working with Standard Map (A-F)
- Pre-loaded with default competitive slice layouts
- Home systems (position 0) are never moved or cleared
- Only positions 1-5 (regular systems) are affected by moves
- Ideal for modifying the base competitive map

### 3. Working with Draft Slots (1-12)
- Start empty and can be populated from A-F slices or other slots
- All 6 positions can be filled (including home system)
- Perfect for creating tournament draft pools
- Can store variations and alternatives

### 4. Advanced Operations
- **Cross-Type Movement**: Move from A-F to 1-12 or vice versa
- **Slot-to-Slot**: Move between draft slots for organization
- **Slice-to-Slice**: Reorganize standard map slices

## Key Features

### Visual Overlays
- **Slice Borders**: Colored boundaries showing each slice area
- **Slice Numbers**: Red numbers (1-12) showing draft positions
- **Slice Letters**: Green letters (A-F) showing standard slice positions

### System Analysis
The **Calculate Draft Values** popup provides detailed analysis:
- **Planet Counts**: Total planets per slice
- **Resource/Influence**: Total and ideal distributions
- **Tech Specialties**: Color-coded specialty planets
- **Planet Types**: Industrial/Cultural/Hazardous breakdown
- **Wormholes**: All wormhole types present
- **Completion Status**: Progress indicators

### Output Generation
The **Output Copy** popup creates:
- Formatted strings for tournament software
- Only includes completed slices (5 async tiles each)
- Copy-to-clipboard functionality
- Detailed breakdown of included slices

## Detailed Workflows

### Creating a Tournament Draft Pool

1. **Load the Base Map**
   ```
   Click "Load MiltyBuilder.json Map"
   Enable "Show Slice Borders" and "Show Slice Numbers"
   ```

2. **Analyze Standard Slices**
   ```
   Click "Calculate Draft Values" to see current slice values
   Review which slices need modification
   ```

3. **Create Variations**
   ```
   Select slice A → Select draft slot 1 (creates variation)
   Select slice A → Select draft slot 2 (creates another variation)
   Modify draft slots by moving systems between them
   ```

4. **Fill Draft Pool**
   ```
   Continue creating variations until slots 1-12 are populated
   Use "Refresh Occupancy" to check completion status
   ```

5. **Generate Output**
   ```
   Click "Output Copy" when ready
   Copy the generated string for tournament software
   ```

### Modifying Standard Map Balance

1. **Load Base Layout**
   ```
   Click "Load MiltyBuilder.json Map"
   ```

2. **Identify Issues**
   ```
   Use "Calculate Draft Values" to find imbalanced slices
   Enable visual overlays to see slice boundaries
   ```

3. **Rebalance**
   ```
   Move systems between A-F slices
   Test different combinations
   Check balance with "Calculate Draft Values"
   ```

4. **Save Changes**
   ```
   Modified map remains in editor
   Export using standard map export functions
   ```

### System Movement Details

#### What Gets Moved
- **System Tiles**: All async tiles with realId
- **Planets**: Complete planet data including specialties
- **Wormholes**: Both inherent and custom wormholes
- **Anomalies**: Nebulae, gravity rifts, supernovas, asteroid fields
- **Effects**: Any applied system effects

#### What Stays Behind
- **Home Systems**: Position 0 in A-F slices never moves
- **Special Hexes**: Non-system tiles may behave differently
- **Custom Modifications**: Some custom edits may not transfer

## Tips and Best Practices

### Efficient Slice Design
1. **Use Color Coding**: Let the color system guide your decisions
2. **Check Values Frequently**: Use "Calculate Draft Values" often
3. **Work Incrementally**: Make small changes and test
4. **Save Variations**: Use draft slots to store alternatives

### Tournament Preparation
1. **Verify Completion**: All draft slices should be green with ✓
2. **Check Balance**: Review total resources and planet types
3. **Test Output**: Generate output string before the event
4. **Document Changes**: Keep notes on modifications made

### Troubleshooting
- **Refresh Occupancy**: If colors seem wrong, use refresh button
- **Clear Selection**: Use "Clear Selection" if unsure of current state
- **Reload Map**: Use "Load MiltyBuilder.json Map" to reset to defaults
- **Check Errors**: Monitor browser console for any error messages

## Keyboard Shortcuts

Currently all interactions are mouse-based. Future versions may include:
- Keyboard selection of slices
- Quick copy/paste operations
- Hotkeys for common functions

## Integration with Other Tools

### System Filters
- Changes made in Milty Designer update system availability
- Used systems are marked in the main system list
- Filter states are automatically updated

### Export Functions
- Standard map export works with modified slices
- Draft slices can be exported individually
- Output strings work with external tournament tools

### Wormhole Management
- Wormhole connections are preserved during moves
- Custom wormholes are transferred with systems
- Visual wormhole overlays update automatically

## Technical Notes

### Data Persistence
- Changes are stored in browser session
- No automatic saving to disk
- Use export functions to preserve work

### Performance
- Large numbers of systems may slow operations
- Refresh browser if performance degrades
- Visual overlays can be disabled to improve speed

### Compatibility
- Works with all standard TI4 system tiles
- Compatible with custom systems and modifications
- Supports all wormhole types and anomalies

---

## Quick Reference

| Action | Steps |
|--------|--------|
| Move Slice | 1. Click source → 2. Click destination |
| Check Status | Use color coding or "Calculate Draft Values" |
| Reset Selection | Click "Clear Selection" |
| Update Colors | Click "Refresh Occupancy" |
| Generate Output | Click "Output Copy" → Copy string |
| Load Standard Map | Click "Load MiltyBuilder.json Map" |
| Show Boundaries | Click "Show Slice Borders" |
| Show Positions | Click "Show Slice Numbers" |

---

*For additional help or bug reports, please refer to the main project documentation.*
