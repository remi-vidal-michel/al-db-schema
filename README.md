# AL DB Schema

Generate database schema diagrams from Business Central AL projects in VS Code.

## Features

- Scans `table` and `tableextension` objects from `.al` files
- Displays interactive ERD with zoom and pan
- Shows field types (Code[20], Text[30], etc.), PK/FK indicators
- Auto-detects relationships via `TableRelation` properties

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

## License

MIT