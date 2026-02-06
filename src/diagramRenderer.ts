import { AlProjectScanResult } from './types';

interface DiagramField {
    name: string;
    displayName: string;
    type: string;
    isPK: boolean;
    isFK: boolean;
}

interface DiagramEntity {
    name: string;
    displayName: string;
    fields: DiagramField[];
}

interface DiagramRelation {
    from: string;
    fromField: string;
    to: string;
    toField: string;
}

export function generateDiagramHtml(scanResult: AlProjectScanResult, title: string, subtitle: string): string {
    const tables = scanResult.tables.filter(t => t.objectType === 'table');
    const localTableNames = new Set(tables.map(t => t.name.toLowerCase()));
    const externalExtensions = scanResult.tables.filter(
        t => t.objectType === 'tableextension' && !localTableNames.has((t.extendsTable || '').toLowerCase())
    );

    const allEntities = [...tables, ...externalExtensions];
    const entityMap = new Map<string, DiagramEntity>();

    for (const table of allEntities) {
        const entityName = table.objectType === 'tableextension' ? table.extendsTable || table.name : table.name;
        if (entityMap.has(entityName.toLowerCase())) {
            continue;
        }

        const displayName = table.caption || entityName;
        const fields: DiagramField[] = table.fields.map(f => ({
            name: f.name,
            displayName: f.caption || f.name,
            type: f.type,
            isPK: f.isPrimaryKey,
            isFK: f.isForeignKey,
        }));

        entityMap.set(entityName.toLowerCase(), {
            name: entityName,
            displayName,
            fields,
        });
    }

    const entities = Array.from(entityMap.values());

    const seenRelations = new Set<string>();
    const relations: DiagramRelation[] = [];

    for (const rel of scanResult.relations) {
        const key = `${rel.fromTable.toLowerCase()}|${rel.toTable.toLowerCase()}|${rel.fromField}`;
        if (seenRelations.has(key)) {
            continue;
        }
        if (!entityMap.has(rel.fromTable.toLowerCase()) || !entityMap.has(rel.toTable.toLowerCase())) {
            continue;
        }
        seenRelations.add(key);
        relations.push({
            from: rel.fromTable,
            fromField: rel.fromField,
            to: rel.toTable,
            toField: rel.toField || '',
        });
    }

    const data = { entities, relations };
    const dataJson = JSON.stringify(data);

    return buildHtml(dataJson, escapeHtml(title), escapeHtml(subtitle));
}

function buildHtml(dataJson: string, title: string, subtitle: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
        :root {
            --header-bg: linear-gradient(135deg, #2c5282 0%, #1a365d 100%);
            --header-text: #ffffff;
            --table-bg: #ffffff;
            --table-border: #cbd5e0;
            --field-text: #2d3748;
            --type-text: #718096;
            --row-alt: #f7fafc;
            --pk-bg: #48bb78;
            --pk-text: #ffffff;
            --fk-bg: #4299e1;
            --fk-text: #ffffff;
        }
        body.vscode-dark {
            --table-bg: #2d3748;
            --table-border: #4a5568;
            --field-text: #e2e8f0;
            --type-text: #a0aec0;
            --row-alt: #1a202c;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background, #1a202c);
            color: var(--vscode-editor-foreground, #e2e8f0);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 16px;
            background: var(--vscode-sideBar-background, #252526);
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
            flex-shrink: 0;
        }
        .toolbar-title {
            display: flex;
            flex-direction: column;
        }
        .toolbar-title h1 {
            font-size: 14px;
            font-weight: 600;
            margin: 0;
        }
        .toolbar-title .subtitle {
            font-size: 11px;
            opacity: 0.7;
        }
        .toolbar-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .toolbar-controls button {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        .toolbar-controls button:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        .zoom-label {
            font-size: 11px;
            min-width: 45px;
            text-align: center;
        }
        .canvas-container {
            flex: 1;
            position: relative;
            overflow: hidden;
            cursor: grab;
        }
        .canvas-container.dragging {
            cursor: grabbing;
        }
        .viewport {
            position: absolute;
            transform-origin: 0 0;
        }
        .svg-layer {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            overflow: visible;
        }
        .table-box {
            position: absolute;
            background: var(--table-bg);
            border: 1px solid var(--table-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            min-width: 200px;
            max-width: 320px;
            overflow: hidden;
            pointer-events: auto;
        }
        .table-header {
            background: var(--header-bg);
            color: var(--header-text);
            padding: 8px 12px;
            font-weight: 600;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .table-body {
            max-height: 300px;
            overflow-y: auto;
        }
        .field-row {
            display: flex;
            align-items: center;
            padding: 5px 10px;
            border-bottom: 1px solid var(--table-border);
            min-height: 28px;
            gap: 6px;
        }
        .field-row:last-child {
            border-bottom: none;
        }
        .field-row:nth-child(even) {
            background: var(--row-alt);
        }
        .field-badges {
            display: flex;
            gap: 3px;
            flex-shrink: 0;
        }
        .badge {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 4px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .badge-pk {
            background: var(--pk-bg);
            color: var(--pk-text);
        }
        .badge-fk {
            background: var(--fk-bg);
            color: var(--fk-text);
        }
        .field-name {
            flex: 1;
            font-size: 12px;
            color: var(--field-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .field-type {
            font-size: 11px;
            color: var(--type-text);
            white-space: nowrap;
            flex-shrink: 0;
        }
        .relation-line {
            fill: none;
            stroke: #4299e1;
            stroke-width: 2;
            opacity: 0.7;
        }
        .relation-line:hover {
            opacity: 1;
            stroke-width: 3;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-title">
            <h1>${title}</h1>
            <span class="subtitle">${subtitle}</span>
        </div>
        <div class="toolbar-controls">
            <button id="btn-fit">Fit</button>
            <button id="btn-zoom-out">-</button>
            <span class="zoom-label" id="zoom-label">100%</span>
            <button id="btn-zoom-in">+</button>
        </div>
    </div>
    <div class="canvas-container" id="canvas-container">
        <div class="viewport" id="viewport"></div>
    </div>
    <script>
        const data = ${dataJson};
        const container = document.getElementById('canvas-container');
        const viewport = document.getElementById('viewport');
        const zoomLabel = document.getElementById('zoom-label');

        let scale = 1;
        let panX = 0;
        let panY = 0;
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        const PADDING = 40;
        const GAP_X = 60;
        const GAP_Y = 50;
        const HEADER_HEIGHT = 34;
        const ROW_HEIGHT = 28;

        const positions = new Map();
        const dimensions = new Map();

        function init() {
            const adjacency = new Map();
            for (const e of data.entities) {
                adjacency.set(e.name.toLowerCase(), new Set());
            }
            for (const r of data.relations) {
                const fromKey = r.from.toLowerCase();
                const toKey = r.to.toLowerCase();
                if (adjacency.has(fromKey) && adjacency.has(toKey)) {
                    adjacency.get(fromKey).add(toKey);
                    adjacency.get(toKey).add(fromKey);
                }
            }

            const sorted = [...data.entities].sort((a, b) => {
                const aConns = adjacency.get(a.name.toLowerCase())?.size || 0;
                const bConns = adjacency.get(b.name.toLowerCase())?.size || 0;
                return bConns - aConns;
            });

            const visited = new Set();
            const ordered = [];
            const queue = [];

            for (const e of sorted) {
                if (visited.has(e.name.toLowerCase())) continue;
                queue.push(e);
                while (queue.length > 0) {
                    const curr = queue.shift();
                    const key = curr.name.toLowerCase();
                    if (visited.has(key)) continue;
                    visited.add(key);
                    ordered.push(curr);
                    const neighbors = adjacency.get(key) || new Set();
                    for (const nKey of neighbors) {
                        if (!visited.has(nKey)) {
                            const neighbor = data.entities.find(e => e.name.toLowerCase() === nKey);
                            if (neighbor) queue.push(neighbor);
                        }
                    }
                }
            }

            for (const e of data.entities) {
                if (!visited.has(e.name.toLowerCase())) {
                    ordered.push(e);
                }
            }

            for (const entity of ordered) {
                const box = document.createElement('div');
                box.className = 'table-box';
                box.innerHTML = \`
                    <div class="table-header">\${escapeHtml(entity.displayName)}</div>
                    <div class="table-body">
                        \${entity.fields.map(f => \`
                            <div class="field-row">
                                <div class="field-badges">
                                    \${f.isPK ? '<span class="badge badge-pk">PK</span>' : ''}
                                    \${f.isFK ? '<span class="badge badge-fk">FK</span>' : ''}
                                </div>
                                <span class="field-name">\${escapeHtml(f.displayName)}</span>
                                <span class="field-type">\${escapeHtml(f.type)}</span>
                            </div>
                        \`).join('')}
                    </div>
                \`;
                viewport.appendChild(box);
                dimensions.set(entity.name.toLowerCase(), {
                    w: box.offsetWidth,
                    h: box.offsetHeight,
                    entity
                });
            }

            layoutGrid(ordered);
            drawRelations();
            fitToView();
        }

        function layoutGrid(ordered) {
            const count = ordered.length;
            if (count === 0) return;

            const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.5)));
            const colWidths = [];
            const rowHeights = [];

            for (let i = 0; i < ordered.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const dim = dimensions.get(ordered[i].name.toLowerCase());
                if (!dim) continue;
                colWidths[col] = Math.max(colWidths[col] || 0, dim.w);
                rowHeights[row] = Math.max(rowHeights[row] || 0, dim.h);
            }

            for (let i = 0; i < ordered.length; i++) {
                const entity = ordered[i];
                const col = i % cols;
                const row = Math.floor(i / cols);
                const dim = dimensions.get(entity.name.toLowerCase());
                if (!dim) continue;

                let x = PADDING;
                for (let c = 0; c < col; c++) {
                    x += (colWidths[c] || 0) + GAP_X;
                }
                x += ((colWidths[col] || 0) - dim.w) / 2;

                let y = PADDING;
                for (let r = 0; r < row; r++) {
                    y += (rowHeights[r] || 0) + GAP_Y;
                }

                positions.set(entity.name.toLowerCase(), { x, y, w: dim.w, h: dim.h });

                const boxes = viewport.querySelectorAll('.table-box');
                const idx = ordered.indexOf(entity);
                if (boxes[idx]) {
                    boxes[idx].style.left = x + 'px';
                    boxes[idx].style.top = y + 'px';
                }
            }
        }

        function drawRelations() {
            let maxX = 0, maxY = 0;
            for (const pos of positions.values()) {
                maxX = Math.max(maxX, pos.x + pos.w);
                maxY = Math.max(maxY, pos.y + pos.h);
            }

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'svg-layer');
            svg.setAttribute('width', maxX + PADDING);
            svg.setAttribute('height', maxY + PADDING);

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.innerHTML = \`
                <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#4299e1" />
                </marker>
            \`;
            svg.appendChild(defs);

            const drawn = new Set();
            for (const rel of data.relations) {
                const key = \`\${rel.from.toLowerCase()}|\${rel.to.toLowerCase()}\`;
                if (drawn.has(key)) continue;
                drawn.add(key);

                const fromPos = positions.get(rel.from.toLowerCase());
                const toPos = positions.get(rel.to.toLowerCase());
                if (!fromPos || !toPos) continue;

                const fromCenter = { x: fromPos.x + fromPos.w / 2, y: fromPos.y + fromPos.h / 2 };
                const toCenter = { x: toPos.x + toPos.w / 2, y: toPos.y + toPos.h / 2 };

                const dx = toCenter.x - fromCenter.x;
                const dy = toCenter.y - fromCenter.y;

                let x1, y1, x2, y2;

                if (Math.abs(dx) > Math.abs(dy)) {
                    if (dx > 0) {
                        x1 = fromPos.x + fromPos.w;
                        x2 = toPos.x;
                    } else {
                        x1 = fromPos.x;
                        x2 = toPos.x + toPos.w;
                    }
                    y1 = fromCenter.y;
                    y2 = toCenter.y;
                } else {
                    if (dy > 0) {
                        y1 = fromPos.y + fromPos.h;
                        y2 = toPos.y;
                    } else {
                        y1 = fromPos.y;
                        y2 = toPos.y + toPos.h;
                    }
                    x1 = fromCenter.x;
                    x2 = toCenter.x;
                }

                const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.4 + 30;
                let path;
                if (Math.abs(dx) > Math.abs(dy)) {
                    const cx = (x1 + x2) / 2;
                    path = \`M \${x1} \${y1} C \${cx} \${y1}, \${cx} \${y2}, \${x2} \${y2}\`;
                } else {
                    const cy = (y1 + y2) / 2;
                    path = \`M \${x1} \${y1} C \${x1} \${cy}, \${x2} \${cy}, \${x2} \${y2}\`;
                }

                const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.setAttribute('d', path);
                pathEl.setAttribute('class', 'relation-line');
                pathEl.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(pathEl);
            }

            viewport.insertBefore(svg, viewport.firstChild);
        }

        function updateTransform() {
            viewport.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
            zoomLabel.textContent = Math.round(scale * 100) + '%';
        }

        function fitToView() {
            let maxX = 0, maxY = 0;
            for (const pos of positions.values()) {
                maxX = Math.max(maxX, pos.x + pos.w + PADDING);
                maxY = Math.max(maxY, pos.y + pos.h + PADDING);
            }

            if (maxX === 0 || maxY === 0) return;

            const containerW = container.clientWidth;
            const containerH = container.clientHeight;

            const scaleX = containerW / maxX;
            const scaleY = containerH / maxY;
            scale = Math.min(scaleX, scaleY, 1) * 0.95;

            const scaledW = maxX * scale;
            const scaledH = maxY * scale;
            panX = (containerW - scaledW) / 2;
            panY = (containerH - scaledH) / 2;

            updateTransform();
        }

        function zoom(delta, centerX, centerY) {
            const oldScale = scale;
            scale = Math.min(4, Math.max(0.1, scale * (1 + delta)));

            const rect = container.getBoundingClientRect();
            const mouseX = centerX - rect.left;
            const mouseY = centerY - rect.top;

            panX = mouseX - (mouseX - panX) * (scale / oldScale);
            panY = mouseY - (mouseY - panY) * (scale / oldScale);

            updateTransform();
        }

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            zoom(delta, e.clientX, e.clientY);
        });

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            container.classList.add('dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panX += e.clientX - lastX;
            panY += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            updateTransform();
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            container.classList.remove('dragging');
        });

        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            const rect = container.getBoundingClientRect();
            zoom(0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            const rect = container.getBoundingClientRect();
            zoom(-0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
        });

        document.getElementById('btn-fit').addEventListener('click', fitToView);

        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        init();
    </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
