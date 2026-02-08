# AL DB Schema

Generate database schema diagrams from Business Central AL projects in VS Code.

## Features

- Scans `table` and `tableextension` objects from `.al` files
- Uses captions when available; falls back to object names
- Supports quoted and unquoted AL identifiers
- Removes prefixes from names and captions when `CRS.ObjectNamePrefix` is set in the scanned project
- Excludes Cue tables automatically
- Ignores FlowField and FlowFilter fields
- Auto-detects relationships via `TableRelation` properties
- Interactive diagram with pan, zoom and auto layout
- Drawer list to show or hide tables; diagram reflows from the visible set
- Card view with PK/FK badges and Business Central field types

## Installation

```bash
npm install
npm run compile
```

To install the extension locally:

```bash
npm run vscode:prepublish
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Usage

1. Open an AL project folder (must contain `app.json`)
2. Open Command Palette: `Ctrl+Shift+P`
3. Run: `AL DB Schema: Generate Database Schema`
4. Use the drawer to show/hide tables
5. Use `Auto` to re-layout the selected set and center the diagram

## Layout Algorithm

The renderer builds a directed graph from `TableRelation` where each edge goes from child to parent.

1. **Layering (shortest path)**: tables are assigned a column rank using a breadth-first pass from root tables. This keeps connected tables close horizontally.
2. **Layer ordering**: within each column, tables are ordered using a barycenter heuristic based on neighbors in adjacent columns.
3. **Column sizing**: each column width is set from its widest card to avoid excessive gaps.
4. **Vertical placement**: tables are stacked with a fixed row spacing, then refined by neighbor alignment passes.
5. **Grid snapping**: final positions are snapped to a grid for consistent alignment.

This layout minimizes line length and overlap while keeping a clear left-to-right flow.

## License

MIT