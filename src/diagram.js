(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const container = $("canvas-container");
    const viewport = $("viewport");
    const zoomLabel = $("zoom-label");
    const drawer = $("drawer");
    const drawerList = $("drawer-list");
    const toggleAllCb = $("toggle-all-checkbox");
    const copyJsonBtn = $("btn-copy-json");

    const data = window.__DIAGRAM_DATA__;
    const elk = new ELK();
    const positions = new Map();
    const dims = new Map();
    const vis = new Map();
    const boxes = new Map();
    const adj = new Map();

    let svg = null;
    let search = "";
    let scale = 1, panX = 0, panY = 0;
    let panning = false, lastX = 0, lastY = 0;
    let dragKey = null, dragOX = 0, dragOY = 0;

    const GRID = 20, PAD = 60;
    const snap = (v) => Math.round(v / GRID) * GRID;

    const esc = (s) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    function hl(text, term) {
        if (!term) return esc(text);
        const re = new RegExp("(" + term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + ")", "gi");
        return esc(text).replace(re, '<span class="highlight">$1</span>');
    }

    function buildAdj() {
        for (const e of data.entities) adj.set(e.name.toLowerCase(), new Set());
        for (const r of data.relations) {
            const f = r.from.toLowerCase(), t = r.to.toLowerCase();
            if (adj.has(f) && adj.has(t)) { adj.get(f).add(t); adj.get(t).add(f); }
        }
    }

    function buildDrawer() {
        const sorted = [...data.entities].sort((a, b) => a.caption.localeCompare(b.caption));
        for (const e of sorted) {
            const key = e.name.toLowerCase();
            vis.set(key, true);
            const item = document.createElement("div");
            item.className = "drawer-item";
            item.dataset.entity = key;
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = true;
            cb.addEventListener("change", () => {
                setVis(key, cb.checked);
                item.classList.toggle("hidden-table", !cb.checked);
                syncAll();
            });
            const lbl = document.createElement("span");
            lbl.className = "drawer-item-label";
            lbl.textContent = lbl.title = e.caption;
            item.append(cb, lbl);
            drawerList.appendChild(item);
        }
    }

    function syncAll() {
        toggleAllCb.checked = Array.from(vis.values()).every(Boolean);
    }

    function renderBox(box, e) {
        const rows = e.fields.map((f) =>
            `<div class="field-row"><div class="field-badges">${f.isPK ? '<span class="badge badge-pk">PK</span>' : ""}${f.isFK ? '<span class="badge badge-fk">FK</span>' : ""}</div><span class="field-name">${hl(f.caption, search)}</span><span class="field-type">${hl(f.type, search)}</span></div>`
        ).join("");
        box.innerHTML = `<button class="table-action" title="Show linked tables"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1664 1664" class="icon-chain" fill="currentColor"><path d="M1456 1216q0-40-28-68l-208-208q-28-28-68-28q-42 0-72 32q3 3 19 18.5t21.5 21.5t15 19t13 25.5t3.5 27.5q0 40-28 68t-68 28q-15 0-27.5-3.5t-25.5-13t-19-15t-21.5-21.5t-18.5-19q-33 31-33 73q0 40 28 68l206 207q27 27 68 27q40 0 68-26l147-146q28-28 28-67M753 511q0-40-28-68L519 236q-28-28-68-28q-39 0-68 27L236 381q-28 28-28 67q0 40 28 68l208 208q27 27 68 27q42 0 72-31q-3-3-19-18.5T543.5 680t-15-19t-13-25.5T512 608q0-40 28-68t68-28q15 0 27.5 3.5t25.5 13t19 15t21.5 21.5t18.5 19q33-31 33-73m895 705q0 120-85 203l-147 146q-83 83-203 83q-121 0-204-85l-206-207q-83-83-83-203q0-123 88-209l-88-88q-86 88-208 88q-120 0-204-84L100 652q-84-84-84-204t85-203L248 99q83-83 203-83q121 0 204 85l206 207q83 83 83 203q0 123-88 209l88 88q86-88 208-88q120 0 204 84l208 208q84 84 84 204"/></svg></button><div class="table-header">${hl(e.caption, search)}</div><div class="table-body">${rows}</div>`;
    }

    function createBoxes() {
        for (const e of data.entities) {
            const key = e.name.toLowerCase();
            const box = document.createElement("div");
            box.className = "table-box";
            box.dataset.entity = key;
            renderBox(box, e);
            box.addEventListener("mousedown", (ev) => {
                if (!ev.target.closest(".table-action")) startDrag(ev, key);
            });
            box.addEventListener("click", (ev) => {
                if (ev.target.closest(".table-action")) { ev.preventDefault(); ev.stopPropagation(); showLinked(key); }
            });
            viewport.appendChild(box);
            boxes.set(key, box);
            dims.set(key, { w: box.offsetWidth, h: box.offsetHeight, entity: e });
        }
    }

    function matches(e, t) {
        if (!t) return false;
        if (e.caption.toLowerCase().includes(t) || e.name.toLowerCase().includes(t)) return true;
        return e.fields.some((f) =>
            f.caption.toLowerCase().includes(t) || f.name.toLowerCase().includes(t) || f.type.toLowerCase().includes(t)
        );
    }

    function updateSearch(term) {
        search = term.trim();
        const lower = search.toLowerCase();
        for (const e of data.entities) {
            const key = e.name.toLowerCase();
            const hit = matches(e, lower);
            const box = boxes.get(key);
            if (box) { renderBox(box, e); box.classList.toggle("search-hit", hit && lower.length > 0); }
            const di = drawerList.querySelector(`.drawer-item[data-entity="${key}"]`);
            if (di) {
                di.classList.toggle("search-hit", hit && lower.length > 0);
                const lbl = di.querySelector(".drawer-item-label");
                if (lbl) lbl.innerHTML = hl(e.caption, search);
            }
        }
    }

    function setVis(key, show) {
        vis.set(key, show);
        const box = boxes.get(key);
        if (box) box.classList.toggle("hidden", !show);
        drawLinks();
    }

    function toggleAll() {
        const next = !Array.from(vis.values()).every(Boolean);
        for (const key of vis.keys()) {
            vis.set(key, next);
            const b = boxes.get(key);
            if (b) b.classList.toggle("hidden", !next);
        }
        drawerList.querySelectorAll(".drawer-item").forEach((i) => {
            i.classList.toggle("hidden-table", !next);
            i.querySelector("input").checked = next;
        });
        toggleAllCb.checked = next;
        drawLinks();
    }

    function showLinked(key) {
        const linked = new Set([key]);
        for (const n of adj.get(key) || []) linked.add(n);
        for (const k of linked) {
            vis.set(k, true);
            const b = boxes.get(k);
            if (b) b.classList.remove("hidden");
            const di = drawerList.querySelector(`.drawer-item[data-entity="${k}"]`);
            if (di) { di.classList.remove("hidden-table"); const cb = di.querySelector("input"); if (cb) cb.checked = true; }
        }
        syncAll();
        autoLayout();
    }

    function buildElkGraph(allowedKeys) {
        const set = allowedKeys ? new Set(allowedKeys) : null;
        const ents = set ? data.entities.filter((e) => set.has(e.name.toLowerCase())) : data.entities;
        const entSet = new Set(ents.map((e) => e.name.toLowerCase()));

        const children = ents.map((e) => {
            const key = e.name.toLowerCase();
            const d = dims.get(key);
            return { id: key, width: d ? d.w : 220, height: d ? d.h : 100 };
        });

        const seen = new Set();
        const edges = [];
        for (const r of data.relations) {
            const fk = r.from.toLowerCase(), tk = r.to.toLowerCase();
            if (!entSet.has(fk) || !entSet.has(tk)) continue;
            const dk = `${fk}|${tk}`;
            if (seen.has(dk)) continue;
            seen.add(dk);
            edges.push({ id: dk, sources: [fk], targets: [tk] });
        }

        return {
            id: "root",
            layoutOptions: {
                "elk.algorithm": "layered",
                "elk.direction": "RIGHT",
                "elk.spacing.nodeNode": "40",
                "elk.layered.spacing.nodeNodeBetweenLayers": "60",
                "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
                "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
                "elk.padding": "[top=60,left=60,bottom=60,right=60]",
                "elk.layered.mergeEdges": "true",
            },
            children,
            edges,
        };
    }

    async function layout(allowedKeys) {
        const graph = buildElkGraph(allowedKeys);
        if (!graph.children.length) return;

        const result = await elk.layout(graph);

        for (const node of result.children || []) {
            const x = snap((node.x || 0) + PAD);
            const y = snap((node.y || 0) + PAD);
            const d = dims.get(node.id);
            positions.set(node.id, { x, y, w: d ? d.w : node.width, h: d ? d.h : node.height });
            const box = boxes.get(node.id);
            if (box) { box.style.left = x + "px"; box.style.top = y + "px"; }
        }
    }

    async function autoLayout() {
        const visibleKeys = Array.from(vis.entries()).filter(([, v]) => v).map(([k]) => k);
        await layout(visibleKeys);
        drawLinks();
        fitView();
    }

    function drawLinks() {
        if (svg) svg.remove();
        let mx = 0, my = 0;
        for (const [k, p] of positions.entries())
            if (vis.get(k)) { mx = Math.max(mx, p.x + p.w); my = Math.max(my, p.y + p.h); }

        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "svg-layer");
        svg.setAttribute("width", String(mx + PAD * 2));
        svg.setAttribute("height", String(my + PAD * 2));
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = '<marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#4299e1" /></marker>';
        svg.appendChild(defs);

        const drawn = new Set();
        for (const r of data.relations) {
            const fk = r.from.toLowerCase(), tk = r.to.toLowerCase();
            if (!vis.get(fk) || !vis.get(tk)) continue;
            const dk = `${fk}|${tk}`;
            if (drawn.has(dk)) continue;
            drawn.add(dk);
            const fp = positions.get(fk), tp = positions.get(tk);
            if (!fp || !tp) continue;
            const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
            el.setAttribute("d", linkPath(fp, tp));
            el.setAttribute("class", "relation-line");
            el.setAttribute("marker-end", "url(#arrow)");
            svg.appendChild(el);
        }
        viewport.insertBefore(svg, viewport.firstChild);
    }

    function linkPath(fp, tp) {
        const fc = { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 };
        const tc = { x: tp.x + tp.w / 2, y: tp.y + tp.h / 2 };
        const dx = tc.x - fc.x, dy = tc.y - fc.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            const x1 = dx > 0 ? fp.x + fp.w : fp.x, x2 = dx > 0 ? tp.x : tp.x + tp.w;
            const cx = (x1 + x2) / 2;
            return `M ${x1} ${fc.y} C ${cx} ${fc.y}, ${cx} ${tc.y}, ${x2} ${tc.y}`;
        }
        const y1 = dy > 0 ? fp.y + fp.h : fp.y, y2 = dy > 0 ? tp.y : tp.y + tp.h;
        const cy = (y1 + y2) / 2;
        return `M ${fc.x} ${y1} C ${fc.x} ${cy}, ${tc.x} ${cy}, ${tc.x} ${y2}`;
    }

    function startDrag(e, key) {
        if (e.button !== 0) return;
        e.stopPropagation();
        dragKey = key;
        const pos = positions.get(key), rect = container.getBoundingClientRect();
        dragOX = (e.clientX - rect.left - panX) / scale - pos.x;
        dragOY = (e.clientY - rect.top - panY) / scale - pos.y;
        boxes.get(key).classList.add("dragging-card");
        container.style.cursor = "grabbing";
    }

    function onDrag(e) {
        if (!dragKey) return;
        const rect = container.getBoundingClientRect(), pos = positions.get(dragKey);
        pos.x = Math.max(PAD, snap((e.clientX - rect.left - panX) / scale - dragOX));
        pos.y = Math.max(PAD, snap((e.clientY - rect.top - panY) / scale - dragOY));
        const box = boxes.get(dragKey);
        box.style.left = pos.x + "px";
        box.style.top = pos.y + "px";
        drawLinks();
    }

    function endDrag() {
        if (!dragKey) return;
        boxes.get(dragKey).classList.remove("dragging-card");
        dragKey = null;
        container.style.cursor = "grab";
    }

    function updateXform() {
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        zoomLabel.textContent = Math.round(scale * 100) + "%";
    }

    function fitView() {
        let mx = 0, my = 0;
        for (const [k, p] of positions.entries())
            if (vis.get(k)) { mx = Math.max(mx, p.x + p.w + PAD); my = Math.max(my, p.y + p.h + PAD); }
        if (!mx || !my) return;
        const cw = container.clientWidth, ch = container.clientHeight;
        scale = Math.min(cw / mx, ch / my, 1) * 0.95;
        panX = (cw - mx * scale) / 2;
        panY = (ch - my * scale) / 2;
        updateXform();
    }

    function zoom(d, cx, cy) {
        const old = scale;
        scale = Math.min(4, Math.max(0.1, scale * (1 + d)));
        const rect = container.getBoundingClientRect();
        const mx = cx - rect.left, my = cy - rect.top;
        panX = mx - (mx - panX) * (scale / old);
        panY = my - (my - panY) * (scale / old);
        updateXform();
    }

    function copyJson() {
        const ve = data.entities.filter((e) => vis.get(e.name.toLowerCase()));
        const vs = new Set(ve.map((e) => e.name.toLowerCase()));
        const vr = data.relations.filter((r) => vs.has(r.from.toLowerCase()) && vs.has(r.to.toLowerCase()));
        const json = JSON.stringify({ entities: ve, relations: vr });
        const orig = copyJsonBtn.innerHTML;
        const done = () => {
            copyJsonBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="12" height="12"><path fill="currentColor" d="M173.9 439.4L7.4 272.9c-9.9-9.9-9.9-26 0-35.9l35.9-35.9c9.9-9.9 26-9.9 35.9 0l94.7 94.7 259.2-259.2c9.9-9.9 26-9.9 35.9 0l35.9 35.9c9.9 9.9 9.9 26 0 35.9L209.8 439.4c-9.9 9.9-26 9.9-35.9 0z"/></svg>';
            setTimeout(() => { copyJsonBtn.innerHTML = orig; }, 1200);
        };
        navigator.clipboard.writeText(json).then(done).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = json; ta.style.cssText = "position:fixed;opacity:0";
            document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
            done();
        });
    }

    function setupEvents() {
        container.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY); }, { passive: false });
        container.addEventListener("mousedown", (e) => { if (e.button || dragKey) return; panning = true; lastX = e.clientX; lastY = e.clientY; container.classList.add("dragging"); });
        document.addEventListener("mousemove", (e) => {
            if (dragKey) { onDrag(e); return; }
            if (!panning) return;
            panX += e.clientX - lastX; panY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
            updateXform();
        });
        document.addEventListener("mouseup", () => { endDrag(); panning = false; container.classList.remove("dragging"); });
        $("btn-zoom-in").addEventListener("click", () => { const r = container.getBoundingClientRect(); zoom(0.2, r.left + r.width / 2, r.top + r.height / 2); });
        $("btn-zoom-out").addEventListener("click", () => { const r = container.getBoundingClientRect(); zoom(-0.2, r.left + r.width / 2, r.top + r.height / 2); });
        $("btn-auto").addEventListener("click", autoLayout);
        $("btn-toggle-drawer").addEventListener("click", () => drawer.classList.toggle("collapsed"));
        toggleAllCb.addEventListener("change", toggleAll);
        $("search-input").addEventListener("input", (e) => updateSearch(e.target.value));
        copyJsonBtn.addEventListener("click", copyJson);
    }

    async function init() {
        buildAdj();
        buildDrawer();
        createBoxes();
        await layout();
        drawLinks();
        fitView();
        setupEvents();
    }

    init();
})();
