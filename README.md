# AL DB Schema

Generate database schema diagrams from Business Central AL projects in VS Code.

## Features

- Scans `table` and `tableextension` objects from `.al` files.
- Uses captions when available; falls back to object names.
- Robust parsing: supports both quoted and unquoted AL identifiers for objects, fields and keys.
- Project-specific prefix stripping: the scanner reads `CRS.ObjectNamePrefix` from the `.vscode/settings.json` file.
- Auto-detects relationships via `TableRelation` properties and resolves relation targets.
- Excludes Cue tables and ignores `FlowField` / `FlowFilter` fields.
- Interactive diagram with pan, zoom, fit-to-view and auto-layout (operates on the currently visible/selected set).
- Search box (case-insensitive) that highlights matching table titles and field names and marks drawer items.
- Per-card action: "Show linked tables" (chain icon) reveals direct neighbours only (show-only behaviour; it does not hide other tables).
- Card view shows Primary Key/Foreign Key badges and Business Central field types.

## Usage

1. From an AL project folder,
2. Open Command Palette: `Ctrl+Shift+P`.
3. Run the following command: 
```bash
AL DB Schema: Generate Database Schema
```
4. Use the drawer to toggle tables visibility.
5. Use `Auto` to re-layout the selected tables to the view.
6. Use the search box to highlight tables/fields.
7. Click the top-right chain icon on a card to expand its direct linked tables.