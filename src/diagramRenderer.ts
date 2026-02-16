import * as vscode from "vscode";
import { AlProjectScanResult } from "./types";

interface DiagramField {
    name: string;
    caption: string;
    type: string;
    isPK: boolean;
    isFK: boolean;
}
interface DiagramEntity {
    name: string;
    caption: string;
    fields: DiagramField[];
}
interface DiagramRelation {
    from: string;
    fromField: string;
    to: string;
    toField: string;
}
interface DiagramData {
    entities: DiagramEntity[];
    relations: DiagramRelation[];
}

export function generateDiagramHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    scanResult: AlProjectScanResult,
    title: string,
    subtitle: string,
): string {
    const data = prepareDiagramData(scanResult);
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "src", "styles.css"));
    const elkUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "node_modules", "elkjs", "lib", "elk.bundled.js"));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "src", "diagram.js"));
    const nonce = getNonce();
    const t = escapeHtml(title);
    const s = escapeHtml(subtitle);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${cssUri}" />
    <title>${t}</title>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-left">
            <button class="btn btn-icon" id="btn-toggle-drawer" title="Toggle table list">☰</button>
            <div class="toolbar-title"><h1>${t}</h1><span class="subtitle">${s}</span></div>
        </div>
        <div class="toolbar-controls">
            <button id="btn-auto" title="Auto layout">Auto</button>
            <button id="btn-zoom-out">−</button>
            <span class="zoom-label" id="zoom-label">100%</span>
            <button id="btn-zoom-in">+</button>
        </div>
    </div>
    <div class="main-container">
        <div class="drawer" id="drawer">
            <div class="drawer-header">
                <input type="checkbox" id="toggle-all-checkbox" checked />
                <h2>Tables</h2>
                <input type="text" id="search-input" placeholder="Search tables &amp; fields…" />
                <button class="btn" id="btn-copy-json" title="Copy data JSON" aria-label="Copy data JSON">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M352 528L128 528C119.2 528 112 520.8 112 512L112 288C112 279.2 119.2 272 128 272L176 272L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L368 464L368 512C368 520.8 360.8 528 352 528zM288 368C279.2 368 272 360.8 272 352L272 128C272 119.2 279.2 112 288 112L512 112C520.8 112 528 119.2 528 128L528 352C528 360.8 520.8 368 512 368L288 368zM224 352C224 387.3 252.7 416 288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352z"/>
                    </svg>
                </button>
            </div>
            <div class="drawer-list" id="drawer-list"></div>
        </div>
        <div class="canvas-container" id="canvas-container">
            <div class="viewport" id="viewport"></div>
        </div>
    </div>
    <script nonce="${nonce}">window.__DIAGRAM_DATA__ = ${JSON.stringify(data)};</script>
    <script nonce="${nonce}" src="${elkUri}"></script>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function prepareDiagramData(scanResult: AlProjectScanResult): DiagramData {
    const tables = scanResult.tables.filter((t) => t.objectType === "table");
    const localNames = new Set(tables.map((t) => t.name.toLowerCase()));
    const externalExts = scanResult.tables.filter(
        (t) => t.objectType === "tableextension" && !localNames.has((t.extendsTable || "").toLowerCase()),
    );
    const entityMap = new Map<string, DiagramEntity>();

    for (const table of [...tables, ...externalExts]) {
        const name = table.objectType === "tableextension" ? table.extendsTable || table.name : table.name;
        if (entityMap.has(name.toLowerCase())) continue;
        entityMap.set(name.toLowerCase(), {
            name,
            caption: table.caption || name,
            fields: table.fields.map((f) => ({
                name: f.name,
                caption: f.caption || f.name,
                type: f.type,
                isPK: f.isPrimaryKey,
                isFK: f.isForeignKey,
            })),
        });
    }

    const seen = new Set<string>();
    const relations: DiagramRelation[] = [];
    for (const rel of scanResult.relations) {
        const key = `${rel.fromTable.toLowerCase()}|${rel.toTable.toLowerCase()}|${rel.fromField}`;
        if (seen.has(key) || !entityMap.has(rel.fromTable.toLowerCase()) || !entityMap.has(rel.toTable.toLowerCase()))
            continue;
        seen.add(key);
        relations.push({ from: rel.fromTable, fromField: rel.fromField, to: rel.toTable, toField: rel.toField || "" });
    }

    return { entities: Array.from(entityMap.values()), relations };
}

function getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    return nonce;
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
