import { AlProjectScanResult } from "./types";

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
    const tables = scanResult.tables.filter((t) => t.objectType === "table");
    const localTableNames = new Set(tables.map((t) => t.name.toLowerCase()));
    const externalExtensions = scanResult.tables.filter(
        (t) => t.objectType === "tableextension" && !localTableNames.has((t.extendsTable || "").toLowerCase()),
    );

    const allEntities = [...tables, ...externalExtensions];
    const entityMap = new Map<string, DiagramEntity>();

    for (const table of allEntities) {
        const entityName = table.objectType === "tableextension" ? table.extendsTable || table.name : table.name;
        if (entityMap.has(entityName.toLowerCase())) {
            continue;
        }

        const displayName = table.caption || entityName;
        const fields: DiagramField[] = table.fields.map((f) => ({
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
            toField: rel.toField || "",
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
            --drawer-width: 250px;
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
        #search-input {
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #cccccc);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            width: 200px;
            outline: none;
        }
        #search-input:focus {
            border-color: var(--vscode-focusBorder, #007acc);
        }
        #search-input::placeholder {
            color: var(--vscode-input-placeholderForeground, #888);
        }
        .highlight {
            background-color: #ffd700;
            color: #000;
            font-weight: 600;
            padding: 1px 2px;
            border-radius: 2px;
        }
        .drawer-item.search-hit {
            background: var(--drawer-item-hover);
        }
        .drawer-item.search-hit .drawer-item-label {
            font-weight: 600;
        }
        .table-box.search-hit {
            box-shadow: 0 0 0 2px #ffd700, 0 2px 8px rgba(0,0,0,0.15);
        }
        .main-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        .drawer {
            width: var(--drawer-width);
            min-width: 200px;
            max-width: 500px;
            background: var(--drawer-bg);
            border-right: 1px solid var(--drawer-border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            transition: margin-left 0.2s ease;
            position: relative;
        }
        .drawer.collapsed {
            margin-left: calc(-1 * var(--drawer-width));
        }
        .drawer-resizer {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            cursor: col-resize;
            background: transparent;
            z-index: 10;
        }
        .drawer-resizer:hover {
            background: var(--vscode-focusBorder, #007acc);
        }
        .drawer.resizing .drawer-resizer {
            background: var(--vscode-focusBorder, #007acc);
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
        .table-action {
            position: absolute;
            top: 5px;
            right: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #3c3c3c;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            padding: 0;
            font-size: 14px;
            cursor: pointer;
            z-index: 5;
        }
        .table-action i,
        .table-action .icon-chain {
            pointer-events: none;
            width: 16px;
            height: 16px;
        }
        .table-action:hover {
            background: rgba(0,0,0,0.55);
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
            <input type="text" id="search-input" placeholder="Search tables & fields..." />
            <button id="btn-auto" title="Auto layout">Auto</button>
            <button id="btn-zoom-out">−</button>
            <span class="zoom-label" id="zoom-label">100%</span>
            <button id="btn-zoom-in">+</button>
        </div>
    </div>
    <div class="main-container">
        <div class="drawer" id="drawer">
            <div class="drawer-resizer" id="drawer-resizer"></div>
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
        const drawerResizer = document.getElementById('drawer-resizer');

        let scale = 1;
        let panX = 0;
        let panY = 0;
        let isPanning = false;
        let lastX = 0;
        let lastY = 0;

        let draggingCard = null;
        let cardOffsetX = 0;
        let cardOffsetY = 0;

        let isResizingDrawer = false;
        let drawerWidth = 250;

        const GRID_SIZE = 20;
        const PADDING = 60;
        const MIN_DRAWER_WIDTH = 200;
        const MAX_DRAWER_WIDTH = 500;

        const positions = new Map();
        const dimensions = new Map();
        const visibility = new Map();
        const boxElements = new Map();
        const adjacency = new Map();
        let svgLayer = null;
        let searchTerm = '';

        function snapToGrid(value) {
            return Math.round(value / GRID_SIZE) * GRID_SIZE;
        }

        function setDrawerWidth(width) {
            drawerWidth = Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, width));
            document.documentElement.style.setProperty('--drawer-width', drawerWidth + 'px');
        }

        function init() {
            buildAdjacency();
            buildDrawer();
            createTableBoxes();
            layoutTablesHierarchical();
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
                
                renderTableBox(box, entity);

                box.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.table-action')) {
                        return;
                    }
                    startCardDrag(e, entity.name.toLowerCase());
                });

                box.addEventListener('click', (e) => {
                    const action = e.target.closest('.table-action');
                    if (!action) {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    toggleConnectedTablesAndLayout(entity.name.toLowerCase());
                });
                
                viewport.appendChild(box);
                boxElements.set(entity.name.toLowerCase(), box);
                dimensions.set(entity.name.toLowerCase(), {
                    w: box.offsetWidth,
                    h: box.offsetHeight,
                    entity
                });
            }
        }

        function renderTableBox(box, entity) {
            const displayName = highlightText(entity.displayName, searchTerm);
            const fieldsHtml = entity.fields.map(f => {
                const fieldName = highlightText(f.displayName, searchTerm);
                const fieldType = highlightText(f.type, searchTerm);
                return \`
                    <div class="field-row">
                        <div class="field-badges">
                            \${f.isPK ? '<span class="badge badge-pk">PK</span>' : ''}
                            \${f.isFK ? '<span class="badge badge-fk">FK</span>' : ''}
                        </div>
                        <span class="field-name">\${fieldName}</span>
                        <span class="field-type">\${fieldType}</span>
                    </div>
                \`;
            }).join('');

            box.innerHTML = \`
                <button class="table-action" title="Show linked tables"> 
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1664 1664" class="icon-chain" fill="currentColor"><path d="M1456 1216q0-40-28-68l-208-208q-28-28-68-28q-42 0-72 32q3 3 19 18.5t21.5 21.5t15 19t13 25.5t3.5 27.5q0 40-28 68t-68 28q-15 0-27.5-3.5t-25.5-13t-19-15t-21.5-21.5t-18.5-19q-33 31-33 73q0 40 28 68l206 207q27 27 68 27q40 0 68-26l147-146q28-28 28-67M753 511q0-40-28-68L519 236q-28-28-68-28q-39 0-68 27L236 381q-28 28-28 67q0 40 28 68l208 208q27 27 68 27q42 0 72-31q-3-3-19-18.5T543.5 680t-15-19t-13-25.5T512 608q0-40 28-68t68-28q15 0 27.5 3.5t25.5 13t19 15t21.5 21.5t18.5 19q33-31 33-73m895 705q0 120-85 203l-147 146q-83 83-203 83q-121 0-204-85l-206-207q-83-83-83-203q0-123 88-209l-88-88q-86 88-208 88q-120 0-204-84L100 652q-84-84-84-204t85-203L248 99q83-83 203-83q121 0 204 85l206 207q83 83 83 203q0 123-88 209l88 88q86-88 208-88q120 0 204 84l208 208q84 84 84 204"/></svg>
                </button>
                <div class="table-header">\${displayName}</div>
                <div class="table-body">
                    \${fieldsHtml}
                </div>
            \`;
        }

        function highlightText(text, search) {
            if (!search) {
                return escapeHtml(text);
            }

            const escapedText = escapeHtml(text);
            const escapedSearch = search.replace(/[-/\\\\^$*+?.()|[\\\\]{}]/g, '\\$&');
            const regex = new RegExp('(' + escapedSearch + ')', 'gi');
            return escapedText.replace(regex, '<span class="highlight">$1</span>');
        }

        function escapeRegex(str) {
            return str.replace(/[-/\\\\^$*+?.()|[\\\\]{}]/g, '\\$&');
        }

        function entityMatchesSearch(entity, termLower) {
            if (!termLower) {
                return false;
            }
            if (entity.displayName.toLowerCase().includes(termLower)) {
                return true;
            }
            if (entity.name.toLowerCase().includes(termLower)) {
                return true;
            }
            for (const field of entity.fields) {
                if (field.displayName.toLowerCase().includes(termLower)) {
                    return true;
                }
                if (field.name.toLowerCase().includes(termLower)) {
                    return true;
                }
                if (field.type.toLowerCase().includes(termLower)) {
                    return true;
                }
            }
            return false;
        }

        function updateSearch(term) {
            searchTerm = term.trim();
            const termLower = searchTerm.toLowerCase();

            for (const entity of data.entities) {
                const key = entity.name.toLowerCase();
                const box = boxElements.get(key);
                const isMatch = entityMatchesSearch(entity, termLower);
                if (box) {
                    renderTableBox(box, entity);
                    box.classList.toggle('search-hit', isMatch && termLower.length > 0);
                }

                const drawerItem = drawerList.querySelector('.drawer-item[data-entity="' + key + '"]');
                if (drawerItem) {
                    drawerItem.classList.toggle('search-hit', isMatch && termLower.length > 0);
                    const label = drawerItem.querySelector('.drawer-item-label');
                    if (label) {
                        label.innerHTML = highlightText(entity.displayName, searchTerm);
                    }
                }
            }
        }

        function toggleConnectedTablesAndLayout(entityKey) {
            const connected = new Set([entityKey]);
            const neighbors = adjacency.get(entityKey) || new Set();
            for (const n of neighbors) {
                connected.add(n);
            }

            for (const key of connected) {
                visibility.set(key, true);
                const box = boxElements.get(key);
                if (box) {
                    box.classList.remove('hidden');
                }
                const drawerItem = drawerList.querySelector('.drawer-item[data-entity="' + key + '"]');
                if (drawerItem) {
                    drawerItem.classList.remove('hidden-table');
                    const checkbox = drawerItem.querySelector('input');
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                }
            }

            updateToggleAllCheckbox();
            autoLayout();
        }

        function layoutTablesHierarchical(allowedKeys) {
            const allowedSet = allowedKeys ? new Set(allowedKeys) : null;
            const entities = allowedSet
                ? data.entities.filter(e => allowedSet.has(e.name.toLowerCase()))
                : data.entities;
            const count = entities.length;
            if (count === 0) return;

            const ROW_SPACING = 40;
            const COLUMN_GAP = 40;
            const MAX_TABLES_PER_COLUMN = 3;

            const parents = new Map();
            const children = new Map();

            for (const e of entities) {
                const key = e.name.toLowerCase();
                parents.set(key, new Set());
                children.set(key, new Set());
            }

            for (const r of data.relations) {
                const child = r.from.toLowerCase();
                const parent = r.to.toLowerCase();
                if (allowedSet && (!allowedSet.has(child) || !allowedSet.has(parent))) {
                    continue;
                }
                if (parents.has(child) && children.has(parent)) {
                    parents.get(child).add(parent);
                    children.get(parent).add(child);
                }
            }

            const ranks = new Map();
            for (const e of entities) {
                ranks.set(e.name.toLowerCase(), Number.POSITIVE_INFINITY);
            }

            const queue = [];
            const rootNodes = [];
            for (const [key, parentSet] of parents.entries()) {
                if (parentSet.size === 0) {
                    rootNodes.push(key);
                }
            }

            if (rootNodes.length === 0 && entities.length > 0) {
                const seed = entities[0].name.toLowerCase();
                ranks.set(seed, 0);
                queue.push(seed);
            } else {
                rootNodes.forEach((key, index) => {
                    const initialRank = Math.floor(index / MAX_TABLES_PER_COLUMN);
                    ranks.set(key, initialRank);
                    queue.push(key);
                });
            }

            while (queue.length > 0) {
                const current = queue.shift();
                const currentRank = ranks.get(current) || 0;
                for (const child of children.get(current) || []) {
                    if ((ranks.get(child) || Number.POSITIVE_INFINITY) > currentRank + 1) {
                        ranks.set(child, currentRank + 1);
                        queue.push(child);
                    }
                }
            }

            for (const [key, rank] of ranks.entries()) {
                if (!Number.isFinite(rank)) {
                    ranks.set(key, 0);
                }
            }

            const uniqueRanks = Array.from(new Set(ranks.values())).sort((a, b) => a - b);
            const rankMap = new Map();
            uniqueRanks.forEach((rank, index) => rankMap.set(rank, index));
            for (const [key, rank] of ranks.entries()) {
                ranks.set(key, rankMap.get(rank));
            }

            const layers = new Map();
            let maxRank = 0;
            for (const [key, rank] of ranks.entries()) {
                maxRank = Math.max(maxRank, rank);
                if (!layers.has(rank)) {
                    layers.set(rank, []);
                }
                layers.get(rank).push(key);
            }

            const columnWidths = new Map();
            for (let rank = 0; rank <= maxRank; rank++) {
                const layer = layers.get(rank) || [];
                let maxWidth = 0;
                for (const key of layer) {
                    const dim = dimensions.get(key);
                    if (dim) {
                        maxWidth = Math.max(maxWidth, dim.w);
                    }
                }
                columnWidths.set(rank, maxWidth || 220);
            }

            const columnX = new Map();
            let xCursor = PADDING;
            for (let rank = 0; rank <= maxRank; rank++) {
                columnX.set(rank, xCursor);
                xCursor += (columnWidths.get(rank) || 220) + COLUMN_GAP;
            }

            const getLayerIndex = (key) => {
                const r = ranks.get(key);
                const layer = layers.get(r);
                return layer ? layer.indexOf(key) : 0;
            };

            const orderLayer = (rank) => {
                const layer = layers.get(rank) || [];
                layer.sort((a, b) => {
                    let aScore = 0, bScore = 0, aCount = 0, bCount = 0;

                    for (const p of parents.get(a) || []) {
                        aScore += getLayerIndex(p);
                        aCount++;
                    }
                    for (const c of children.get(a) || []) {
                        aScore += getLayerIndex(c);
                        aCount++;
                    }

                    for (const p of parents.get(b) || []) {
                        bScore += getLayerIndex(p);
                        bCount++;
                    }
                    for (const c of children.get(b) || []) {
                        bScore += getLayerIndex(c);
                        bCount++;
                    }

                    const aAvg = aCount > 0 ? aScore / aCount : 0;
                    const bAvg = bCount > 0 ? bScore / bCount : 0;
                    return aAvg - bAvg;
                });
            };

            for (let iter = 0; iter < 4; iter++) {
                for (let rank = 0; rank <= maxRank; rank++) {
                    orderLayer(rank);
                }
                for (let rank = maxRank; rank >= 0; rank--) {
                    orderLayer(rank);
                }
            }

            for (let rank = 0; rank <= maxRank; rank++) {
                const layer = layers.get(rank) || [];
                let y = PADDING;
                const x = columnX.get(rank) || PADDING;

                for (const key of layer) {
                    const dim = dimensions.get(key);
                    if (!dim) continue;

                    const snappedX = snapToGrid(x);
                    const snappedY = snapToGrid(y);

                    positions.set(key, {
                        x: snappedX,
                        y: snappedY,
                        w: dim.w,
                        h: dim.h
                    });

                    y += dim.h + ROW_SPACING;
                }
            }

            for (let iter = 0; iter < 3; iter++) {
                for (let rank = 0; rank <= maxRank; rank++) {
                    const layer = layers.get(rank) || [];
                    const targetY = new Map();

                    for (const key of layer) {
                        const pos = positions.get(key);
                        if (!pos) continue;

                        const neighbors = [...(parents.get(key) || []), ...(children.get(key) || [])];
                        if (neighbors.length === 0) {
                            targetY.set(key, pos.y);
                            continue;
                        }

                        let sum = 0;
                        let count = 0;
                        for (const n of neighbors) {
                            const nPos = positions.get(n);
                            if (nPos) {
                                sum += nPos.y + nPos.h / 2;
                                count++;
                            }
                        }

                        const avg = count > 0 ? (sum / count - pos.h / 2) : pos.y;
                        targetY.set(key, avg);
                    }

                    layer.sort((a, b) => (targetY.get(a) || 0) - (targetY.get(b) || 0));

                    let y = PADDING;
                    const x = columnX.get(rank) || PADDING;
                    for (const key of layer) {
                        const dim = dimensions.get(key);
                        if (!dim) continue;

                        positions.set(key, {
                            x: snapToGrid(x),
                            y: snapToGrid(y),
                            w: dim.w,
                            h: dim.h
                        });
                        y += dim.h + ROW_SPACING;
                    }
                }
            }

            for (const [key, pos] of positions.entries()) {
                const box = boxElements.get(key);
                if (box) {
                    box.style.left = pos.x + 'px';
                    box.style.top = pos.y + 'px';
                }
            }
        }

        function autoLayout() {
            const visibleKeys = Array.from(visibility.entries())
                .filter(([, visible]) => visible)
                .map(([key]) => key);
            layoutTablesHierarchical(visibleKeys);
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
                if (isResizingDrawer) {
                    const newWidth = e.clientX;
                    setDrawerWidth(newWidth);
                    return;
                }

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
                if (isResizingDrawer) {
                    isResizingDrawer = false;
                    drawer.classList.remove('resizing');
                }
                if (draggingCard) {
                    endCardDrag();
                }
                isPanning = false;
                container.classList.remove('dragging');
            });

            drawerResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizingDrawer = true;
                drawer.classList.add('resizing');
            });

            document.getElementById('btn-zoom-in').addEventListener('click', () => {
                const rect = container.getBoundingClientRect();
                zoom(0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
            });

            document.getElementById('btn-zoom-out').addEventListener('click', () => {
                const rect = container.getBoundingClientRect();
                zoom(-0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
            });

            document.getElementById('btn-auto').addEventListener('click', autoLayout);

            document.getElementById('btn-toggle-drawer').addEventListener('click', () => {
                drawer.classList.toggle('collapsed');
            });

            toggleAllCheckbox.addEventListener('change', toggleAll);

            document.getElementById('search-input').addEventListener('input', (e) => {
                updateSearch(e.target.value);
            });
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
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
