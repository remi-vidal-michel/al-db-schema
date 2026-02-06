import { AlProjectScanResult, AlTable, AlField } from './types';

/**
 * Generate a Mermaid ERD (Entity-Relationship Diagram) string
 * from the scan result.
 */
export function generateMermaidERD(scanResult: AlProjectScanResult): string {
    const lines: string[] = [];
    lines.push('erDiagram');

    // Collect only "table" objects (tableextensions are merged already)
    const tables = scanResult.tables.filter(t => t.objectType === 'table');

    // Also keep tableextensions that extend tables NOT in this project
    const localTableNames = new Set(tables.map(t => t.name.toLowerCase()));
    const externalExtensions = scanResult.tables.filter(
        t => t.objectType === 'tableextension' && !localTableNames.has((t.extendsTable || '').toLowerCase())
    );

    const allEntities = [...tables, ...externalExtensions];

    // Track which entity names we render (to avoid duplicate relation targets)
    const renderedEntities = new Set<string>();

    for (const table of allEntities) {
        const entityName = sanitizeMermaidName(
            table.objectType === 'tableextension' ? table.extendsTable || table.name : table.name
        );
        if (renderedEntities.has(entityName)) {
            continue;
        }
        renderedEntities.add(entityName);

        lines.push(`    ${entityName} {`);

        for (const field of table.fields) {
            const mermaidType = mapAlTypeToMermaid(field.type);
            const constraints = buildConstraints(field);
            const comment = field.caption ? ` "${field.caption}"` : '';
            lines.push(`        ${mermaidType} ${sanitizeMermaidName(field.name)}${constraints}${comment}`);
        }

        lines.push('    }');
    }

    // Render relationships
    const seenRelations = new Set<string>();

    for (const rel of scanResult.relations) {
        const from = sanitizeMermaidName(rel.fromTable);
        const to = sanitizeMermaidName(rel.toTable);
        const key = `${from}|${to}|${rel.fromField}`;
        if (seenRelations.has(key)) {
            continue;
        }
        seenRelations.add(key);

        // Use ||--o{ to indicate many-to-one by default (FK → PK)
        const label = sanitizeMermaidName(rel.fromField);
        lines.push(`    ${from} }o--|| ${to} : "${label}"`);
    }

    return lines.join('\n');
}

/**
 * Generate a full HTML page that renders the Mermaid diagram.
 */
export function generateMermaidHtml(mermaidCode: string, title: string): string {
    // Escape backticks and special chars inside the JS template literal
    const escaped = mermaidCode.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 8px;
        }
        .stats {
            font-size: 0.85em;
            opacity: 0.7;
            margin-bottom: 16px;
        }
        #mermaid-container {
            max-width: 100%;
            overflow: auto;
        }
        .controls {
            margin-bottom: 16px;
            display: flex;
            gap: 8px;
        }
        button {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 0.85em;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        pre.mermaid-source {
            display: none;
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            padding: 12px;
            border-radius: 4px;
            max-height: 400px;
            overflow: auto;
            font-size: 0.8em;
            white-space: pre-wrap;
            width: 90%;
        }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <div class="controls">
        <button id="btn-toggle-source">Afficher le code Mermaid</button>
        <button id="btn-copy">Copier le code Mermaid</button>
    </div>
    <pre class="mermaid-source" id="mermaid-source"></pre>
    <div id="mermaid-container">
        <pre class="mermaid" id="mermaid-diagram"></pre>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <script>
        const mermaidCode = \`${escaped}\`;

        document.getElementById('mermaid-diagram').textContent = mermaidCode;
        document.getElementById('mermaid-source').textContent = mermaidCode;

        // Detect dark/light theme
        const isDark = document.body.style.background
            ? document.body.style.background.includes('#1e1e1e')
            : true;

        mermaid.initialize({
            startOnLoad: true,
            theme: isDark ? 'dark' : 'default',
            er: { useMaxWidth: false }
        });

        document.getElementById('btn-toggle-source').addEventListener('click', () => {
            const el = document.getElementById('mermaid-source');
            const btn = document.getElementById('btn-toggle-source');
            if (el.style.display === 'block') {
                el.style.display = 'none';
                btn.textContent = 'Afficher le code Mermaid';
            } else {
                el.style.display = 'block';
                btn.textContent = 'Masquer le code Mermaid';
            }
        });

        document.getElementById('btn-copy').addEventListener('click', () => {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ command: 'copy', text: mermaidCode });
        });
    </script>
</body>
</html>`;
}

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

/**
 * Sanitize a name for use in Mermaid: remove special chars, replace spaces.
 */
function sanitizeMermaidName(name: string): string {
    return name
        .replace(/[/"']/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Map AL type names to shorter Mermaid-friendly type labels.
 */
function mapAlTypeToMermaid(alType: string): string {
    const t = alType.toLowerCase().trim();
    if (t.startsWith('code')) { return 'string'; }
    if (t.startsWith('text')) { return 'string'; }
    if (t === 'integer') { return 'int'; }
    if (t === 'biginteger') { return 'bigint'; }
    if (t === 'decimal') { return 'decimal'; }
    if (t === 'boolean') { return 'boolean'; }
    if (t === 'date') { return 'date'; }
    if (t === 'time') { return 'time'; }
    if (t === 'datetime') { return 'datetime'; }
    if (t === 'guid') { return 'guid'; }
    if (t === 'blob') { return 'blob'; }
    if (t === 'media') { return 'media'; }
    if (t === 'mediaset') { return 'mediaset'; }
    if (t === 'recordid') { return 'recordid'; }
    if (t === 'option') { return 'option'; }
    if (t.startsWith('enum')) { return 'enum'; }
    if (t === 'duration') { return 'duration'; }
    if (t === 'dateformula') { return 'dateformula'; }
    return 'string';
}

function buildConstraints(field: AlField): string {
    const parts: string[] = [];
    if (field.isPrimaryKey) { parts.push('PK'); }
    if (field.isForeignKey) { parts.push('FK'); }
    return parts.length > 0 ? ' ' + parts.join(',') : '';
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
