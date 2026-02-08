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
            --drawer-bg: #1e1e1e;
            --drawer-border: #3c3c3c;
            --drawer-item-hover: #2a2d2e;
            --dot-color: rgba(255, 255, 255, 0.15);
        }
        body.vscode-dark {
            --table-bg: #2d3748;
            --table-border: #4a5568;
            --field-text: #e2e8f0;
            --type-text: #a0aec0;
            --row-alt: #1a202c;
            --dot-color: rgba(255, 255, 255, 0.1);
        }
        body.vscode-light {
            --drawer-bg: #f3f3f3;
            --drawer-border: #d4d4d4;
            --drawer-item-hover: #e8e8e8;
            --dot-color: rgba(0, 0, 0, 0.1);
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
            z-index: 100;
        }
        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 12px;
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
        .toolbar-controls button, .btn {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        .toolbar-controls button:hover, .btn:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        .btn-icon {
            padding: 5px 8px;
            font-size: 14px;
        }
        .zoom-label {
            font-size: 11px;
            min-width: 45px;
            text-align: center;
        }
        .main-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        .drawer {
            width: 250px;
            background: var(--drawer-bg);
            border-right: 1px solid var(--drawer-border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            transition: margin-left 0.2s ease;
        }
        .drawer.collapsed {
            margin-left: -250px;
        }
        .drawer-header {
            padding: 12px;
            border-bottom: 1px solid var(--drawer-border);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .drawer-header input[type="checkbox"] {
            cursor: pointer;
        }
        .drawer-header h2 {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.8;
            flex: 1;
        }
        .drawer-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }
        .drawer-item {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            cursor: pointer;
            gap: 8px;
        }
        .drawer-item:hover {
            background: var(--drawer-item-hover);
        }
        .drawer-item input[type="checkbox"] {
            cursor: pointer;
        }
        .drawer-item-label {
            font-size: 12px;
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .drawer-item.hidden-table .drawer-item-label {
            opacity: 0.5;
            text-decoration: line-through;
        }
        .canvas-container {
            flex: 1;
            position: relative;
            overflow: hidden;
            cursor: grab;
            background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
            background-size: 20px 20px;
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
            cursor: move;
            user-select: none;
        }
        .table-box.dragging-card {
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            z-index: 1000;
        }
        .table-box.hidden {
            display: none;
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
            pointer-events: stroke;
        }
        .relation-line:hover {
            opacity: 1;
            stroke-width: 3;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-left">
            <button class="btn btn-icon" id="btn-toggle-drawer" title="Toggle table list">☰</button>
            <div class="toolbar-title">
                <h1>${title}</h1>
                <span class="subtitle">${subtitle}</span>
            </div>
        </div>
        <div class="toolbar-controls">
            <button id="btn-reset" title="Reset layout">↻</button>
            <button id="btn-fit">Fit</button>
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
            </div>
            <div class="drawer-list" id="drawer-list"></div>
        </div>
        <div class="canvas-container" id="canvas-container">
            <div class="viewport" id="viewport"></div>
        </div>
    </div>
    <script>
        const data = ${dataJson};
        const container = document.getElementById('canvas-container');
        const viewport = document.getElementById('viewport');
        const zoomLabel = document.getElementById('zoom-label');
        const drawer = document.getElementById('drawer');
        const drawerList = document.getElementById('drawer-list');
        const toggleAllCheckbox = document.getElementById('toggle-all-checkbox');

        let scale = 1;
        let panX = 0;
        let panY = 0;
        let isPanning = false;
        let lastX = 0;
        let lastY = 0;

        let draggingCard = null;
        let cardOffsetX = 0;
        let cardOffsetY = 0;

        const GRID_SIZE = 20;
        const PADDING = 60;

        const positions = new Map();
        const dimensions = new Map();
        const visibility = new Map();
        const boxElements = new Map();
        const adjacency = new Map();
        let svgLayer = null;

        function snapToGrid(value) {
            return Math.round(value / GRID_SIZE) * GRID_SIZE;
        }

        function init() {
            buildAdjacency();
            buildDrawer();
            createTableBoxes();
            layoutTablesForceDirected();
            drawRelations();
            fitToView();
            setupEventListeners();
        }

        function buildAdjacency() {
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
        }

        function buildDrawer() {
            const sorted = [...data.entities].sort((a, b) => 
                a.displayName.localeCompare(b.displayName)
            );
            
            for (const entity of sorted) {
                visibility.set(entity.name.toLowerCase(), true);
                
                const item = document.createElement('div');
                item.className = 'drawer-item';
                item.dataset.entity = entity.name.toLowerCase();
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                checkbox.addEventListener('change', () => {
                    toggleTableVisibility(entity.name.toLowerCase(), checkbox.checked);
                    item.classList.toggle('hidden-table', !checkbox.checked);
                    updateToggleAllCheckbox();
                });
                
                const label = document.createElement('span');
                label.className = 'drawer-item-label';
                label.textContent = entity.displayName;
                label.title = entity.displayName;
                
                item.appendChild(checkbox);
                item.appendChild(label);
                drawerList.appendChild(item);
            }
        }

        function updateToggleAllCheckbox() {
            const allVisible = Array.from(visibility.values()).every(v => v);
            toggleAllCheckbox.checked = allVisible;
        }

        function createTableBoxes() {
            for (const entity of data.entities) {
                const box = document.createElement('div');
                box.className = 'table-box';
                box.dataset.entity = entity.name.toLowerCase();
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
                
                box.addEventListener('mousedown', (e) => startCardDrag(e, entity.name.toLowerCase()));
                
                viewport.appendChild(box);
                boxElements.set(entity.name.toLowerCase(), box);
                dimensions.set(entity.name.toLowerCase(), {
                    w: box.offsetWidth,
                    h: box.offsetHeight,
                    entity
                });
            }
        }

        function layoutTablesForceDirected() {
            const entities = data.entities;
            const count = entities.length;
            if (count === 0) return;

            const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.5)));
            const avgWidth = 260;
            const avgHeight = 180;
            const spacingX = avgWidth + 100;
            const spacingY = avgHeight + 80;

            const sorted = [...entities].sort((a, b) => {
                const aConns = adjacency.get(a.name.toLowerCase())?.size || 0;
                const bConns = adjacency.get(b.name.toLowerCase())?.size || 0;
                return bConns - aConns;
            });

            const placed = new Map();
            const visited = new Set();

            function placeEntity(entity, targetX, targetY) {
                const key = entity.name.toLowerCase();
                const dim = dimensions.get(key);
                if (!dim) return;

                let x = snapToGrid(targetX);
                let y = snapToGrid(targetY);

                let attempts = 0;
                while (hasOverlap(key, x, y, dim.w, dim.h) && attempts < 50) {
                    const angle = (attempts * 137.5) * Math.PI / 180;
                    const radius = 40 + attempts * 20;
                    x = snapToGrid(targetX + Math.cos(angle) * radius);
                    y = snapToGrid(targetY + Math.sin(angle) * radius);
                    attempts++;
                }

                x = Math.max(PADDING, x);
                y = Math.max(PADDING, y);

                positions.set(key, { x, y, w: dim.w, h: dim.h });
                placed.set(key, { x, y, w: dim.w, h: dim.h });
            }

            function hasOverlap(key, x, y, w, h) {
                const margin = 40;
                for (const [k, pos] of placed.entries()) {
                    if (k === key) continue;
                    if (x < pos.x + pos.w + margin && x + w + margin > pos.x &&
                        y < pos.y + pos.h + margin && y + h + margin > pos.y) {
                        return true;
                    }
                }
                return false;
            }

            function bfsPlace(startEntity, startX, startY) {
                const queue = [{ entity: startEntity, x: startX, y: startY }];
                
                while (queue.length > 0) {
                    const { entity, x, y } = queue.shift();
                    const key = entity.name.toLowerCase();
                    
                    if (visited.has(key)) continue;
                    visited.add(key);
                    
                    placeEntity(entity, x, y);
                    
                    const neighbors = Array.from(adjacency.get(key) || []);
                    neighbors.sort((a, b) => {
                        const aConns = adjacency.get(a)?.size || 0;
                        const bConns = adjacency.get(b)?.size || 0;
                        return bConns - aConns;
                    });

                    const pos = positions.get(key);
                    const directions = [
                        { dx: spacingX, dy: 0 },
                        { dx: -spacingX, dy: 0 },
                        { dx: 0, dy: spacingY },
                        { dx: 0, dy: -spacingY },
                        { dx: spacingX, dy: spacingY },
                        { dx: -spacingX, dy: spacingY },
                        { dx: spacingX, dy: -spacingY },
                        { dx: -spacingX, dy: -spacingY },
                    ];

                    let dirIndex = 0;
                    for (const nKey of neighbors) {
                        if (visited.has(nKey)) continue;
                        const neighbor = entities.find(e => e.name.toLowerCase() === nKey);
                        if (!neighbor) continue;

                        const dir = directions[dirIndex % directions.length];
                        queue.push({
                            entity: neighbor,
                            x: pos.x + dir.dx,
                            y: pos.y + dir.dy
                        });
                        dirIndex++;
                    }
                }
            }

            let clusterX = PADDING;
            let clusterY = PADDING;

            for (const entity of sorted) {
                const key = entity.name.toLowerCase();
                if (visited.has(key)) continue;

                bfsPlace(entity, clusterX, clusterY);

                let maxX = 0;
                for (const pos of placed.values()) {
                    maxX = Math.max(maxX, pos.x + pos.w);
                }
                clusterX = maxX + spacingX;

                if (clusterX > spacingX * 4) {
                    clusterX = PADDING;
                    let maxY = 0;
                    for (const pos of placed.values()) {
                        maxY = Math.max(maxY, pos.y + pos.h);
                    }
                    clusterY = maxY + spacingY;
                }
            }

            for (let i = 0; i < 30; i++) {
                optimizeLayout();
            }

            for (const [key, pos] of positions.entries()) {
                const box = boxElements.get(key);
                if (box) {
                    box.style.left = pos.x + 'px';
                    box.style.top = pos.y + 'px';
                }
            }
        }

        function optimizeLayout() {
            const keys = Array.from(positions.keys());
            
            for (const key of keys) {
                const pos = positions.get(key);
                const neighbors = adjacency.get(key) || new Set();
                
                if (neighbors.size === 0) continue;

                let targetX = 0;
                let targetY = 0;
                let count = 0;

                for (const nKey of neighbors) {
                    const nPos = positions.get(nKey);
                    if (nPos) {
                        targetX += nPos.x;
                        targetY += nPos.y;
                        count++;
                    }
                }

                if (count > 0) {
                    targetX /= count;
                    targetY /= count;

                    const moveX = (targetX - pos.x) * 0.1;
                    const moveY = (targetY - pos.y) * 0.1;

                    const newX = snapToGrid(pos.x + moveX);
                    const newY = snapToGrid(pos.y + moveY);

                    if (!hasOverlapAt(key, newX, newY, pos.w, pos.h)) {
                        pos.x = Math.max(PADDING, newX);
                        pos.y = Math.max(PADDING, newY);
                    }
                }
            }

            for (const key1 of keys) {
                const pos1 = positions.get(key1);
                for (const key2 of keys) {
                    if (key1 >= key2) continue;
                    const pos2 = positions.get(key2);

                    const margin = 40;
                    const overlapX = (pos1.x + pos1.w + margin) - pos2.x;
                    const overlapY = (pos1.y + pos1.h + margin) - pos2.y;

                    if (overlapX > 0 && pos2.x < pos1.x + pos1.w + margin && 
                        pos1.y < pos2.y + pos2.h && pos2.y < pos1.y + pos1.h) {
                        const push = overlapX / 2 + 10;
                        pos1.x = snapToGrid(pos1.x - push);
                        pos2.x = snapToGrid(pos2.x + push);
                    }
                    if (overlapY > 0 && pos2.y < pos1.y + pos1.h + margin &&
                        pos1.x < pos2.x + pos2.w && pos2.x < pos1.x + pos1.w) {
                        const push = overlapY / 2 + 10;
                        pos1.y = snapToGrid(pos1.y - push);
                        pos2.y = snapToGrid(pos2.y + push);
                    }

                    pos1.x = Math.max(PADDING, pos1.x);
                    pos1.y = Math.max(PADDING, pos1.y);
                    pos2.x = Math.max(PADDING, pos2.x);
                    pos2.y = Math.max(PADDING, pos2.y);
                }
            }
        }

        function hasOverlapAt(key, x, y, w, h) {
            const margin = 40;
            for (const [k, pos] of positions.entries()) {
                if (k === key) continue;
                if (x < pos.x + pos.w + margin && x + w + margin > pos.x &&
                    y < pos.y + pos.h + margin && y + h + margin > pos.y) {
                    return true;
                }
            }
            return false;
        }

        function resetLayout() {
            positions.clear();
            layoutTablesForceDirected();
            drawRelations();
            fitToView();
        }

        function drawRelations() {
            if (svgLayer) {
                svgLayer.remove();
            }

            let maxX = 0, maxY = 0;
            for (const [key, pos] of positions.entries()) {
                if (visibility.get(key)) {
                    maxX = Math.max(maxX, pos.x + pos.w);
                    maxY = Math.max(maxY, pos.y + pos.h);
                }
            }

            svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgLayer.setAttribute('class', 'svg-layer');
            svgLayer.setAttribute('width', maxX + PADDING * 2);
            svgLayer.setAttribute('height', maxY + PADDING * 2);

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.innerHTML = \`
                <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#4299e1" />
                </marker>
            \`;
            svgLayer.appendChild(defs);

            const drawn = new Set();
            for (const rel of data.relations) {
                const fromKey = rel.from.toLowerCase();
                const toKey = rel.to.toLowerCase();
                
                if (!visibility.get(fromKey) || !visibility.get(toKey)) continue;
                
                const key = \`\${fromKey}|\${toKey}\`;
                if (drawn.has(key)) continue;
                drawn.add(key);

                const fromPos = positions.get(fromKey);
                const toPos = positions.get(toKey);
                if (!fromPos || !toPos) continue;

                const path = calculatePath(fromPos, toPos);
                
                const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.setAttribute('d', path);
                pathEl.setAttribute('class', 'relation-line');
                pathEl.setAttribute('marker-end', 'url(#arrow)');
                svgLayer.appendChild(pathEl);
            }

            viewport.insertBefore(svgLayer, viewport.firstChild);
        }

        function calculatePath(fromPos, toPos) {
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

            if (Math.abs(dx) > Math.abs(dy)) {
                const cx = (x1 + x2) / 2;
                return \`M \${x1} \${y1} C \${cx} \${y1}, \${cx} \${y2}, \${x2} \${y2}\`;
            } else {
                const cy = (y1 + y2) / 2;
                return \`M \${x1} \${y1} C \${x1} \${cy}, \${x2} \${cy}, \${x2} \${y2}\`;
            }
        }

        function toggleTableVisibility(entityKey, visible) {
            visibility.set(entityKey, visible);
            const box = boxElements.get(entityKey);
            if (box) {
                box.classList.toggle('hidden', !visible);
            }
            drawRelations();
        }

        function toggleAll() {
            const allVisible = Array.from(visibility.values()).every(v => v);
            const newState = !allVisible;
            
            for (const key of visibility.keys()) {
                visibility.set(key, newState);
                const box = boxElements.get(key);
                if (box) box.classList.toggle('hidden', !newState);
            }
            
            drawerList.querySelectorAll('.drawer-item').forEach(item => {
                item.classList.toggle('hidden-table', !newState);
                item.querySelector('input').checked = newState;
            });
            
            toggleAllCheckbox.checked = newState;
            drawRelations();
        }

        function startCardDrag(e, entityKey) {
            if (e.button !== 0) return;
            e.stopPropagation();
            
            draggingCard = entityKey;
            const box = boxElements.get(entityKey);
            const pos = positions.get(entityKey);
            
            cardOffsetX = (e.clientX - container.getBoundingClientRect().left - panX) / scale - pos.x;
            cardOffsetY = (e.clientY - container.getBoundingClientRect().top - panY) / scale - pos.y;
            
            box.classList.add('dragging-card');
            container.style.cursor = 'grabbing';
        }

        function handleCardDrag(e) {
            if (!draggingCard) return;
            
            const rect = container.getBoundingClientRect();
            const x = (e.clientX - rect.left - panX) / scale - cardOffsetX;
            const y = (e.clientY - rect.top - panY) / scale - cardOffsetY;
            
            const pos = positions.get(draggingCard);
            pos.x = Math.max(PADDING, snapToGrid(x));
            pos.y = Math.max(PADDING, snapToGrid(y));
            
            const box = boxElements.get(draggingCard);
            box.style.left = pos.x + 'px';
            box.style.top = pos.y + 'px';
            
            drawRelations();
        }

        function endCardDrag() {
            if (draggingCard) {
                const box = boxElements.get(draggingCard);
                box.classList.remove('dragging-card');
                draggingCard = null;
                container.style.cursor = 'grab';
            }
        }

        function updateTransform() {
            viewport.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
            zoomLabel.textContent = Math.round(scale * 100) + '%';
        }

        function fitToView() {
            let maxX = 0, maxY = 0;
            for (const [key, pos] of positions.entries()) {
                if (visibility.get(key)) {
                    maxX = Math.max(maxX, pos.x + pos.w + PADDING);
                    maxY = Math.max(maxY, pos.y + pos.h + PADDING);
                }
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

        function setupEventListeners() {
            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                zoom(delta, e.clientX, e.clientY);
            });

            container.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || draggingCard) return;
                isPanning = true;
                lastX = e.clientX;
                lastY = e.clientY;
                container.classList.add('dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (draggingCard) {
                    handleCardDrag(e);
                    return;
                }
                if (!isPanning) return;
                panX += e.clientX - lastX;
                panY += e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                updateTransform();
            });

            document.addEventListener('mouseup', () => {
                if (draggingCard) {
                    endCardDrag();
                }
                isPanning = false;
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
            document.getElementById('btn-reset').addEventListener('click', resetLayout);

            document.getElementById('btn-toggle-drawer').addEventListener('click', () => {
                drawer.classList.toggle('collapsed');
            });

            toggleAllCheckbox.addEventListener('change', toggleAll);
        }

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
