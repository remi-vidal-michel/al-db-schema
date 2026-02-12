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
    const positions = new Map();
    const dims = new Map();
    const vis = new Map();
    const boxes = new Map();
    const adj = new Map();

    let svg = null;
    let search = "";
    let scale = 1,
        panX = 0,
        panY = 0;
    let panning = false,
        lastX = 0,
        lastY = 0;
    let dragKey = null,
        dragOX = 0,
        dragOY = 0;

    const GRID = 20,
        PAD = 60;
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
            const f = r.from.toLowerCase(),
                t = r.to.toLowerCase();
            if (adj.has(f) && adj.has(t)) {
                adj.get(f).add(t);
                adj.get(t).add(f);
            }
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
        const rows = e.fields
            .map(
                (f) =>
                    `<div class="field-row"><div class="field-badges">${f.isPK ? '<span class="badge badge-pk">PK</span>' : ""}${f.isFK ? '<span class="badge badge-fk">FK</span>' : ""}</div><span class="field-name">${hl(f.caption, search)}</span><span class="field-type">${hl(f.type, search)}</span></div>`,
            )
            .join("");
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
                if (ev.target.closest(".table-action")) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    showLinked(key);
                }
            });
            viewport.appendChild(box);
            boxes.set(key, box);
            dims.set(key, { w: box.offsetWidth, h: box.offsetHeight, entity: e });
        }
    }

    function matches(e, t) {
        if (!t) return false;
        if (e.caption.toLowerCase().includes(t) || e.name.toLowerCase().includes(t)) return true;
        return e.fields.some(
            (f) =>
                f.caption.toLowerCase().includes(t) ||
                f.name.toLowerCase().includes(t) ||
                f.type.toLowerCase().includes(t),
        );
    }

    function updateSearch(term) {
        search = term.trim();
        const lower = search.toLowerCase();
        for (const e of data.entities) {
            const key = e.name.toLowerCase();
            const hit = matches(e, lower);
            const box = boxes.get(key);
            if (box) {
                renderBox(box, e);
                box.classList.toggle("search-hit", hit && lower.length > 0);
            }
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
            if (di) {
                di.classList.remove("hidden-table");
                const cb = di.querySelector("input");
                if (cb) cb.checked = true;
            }
        }
        syncAll();
        autoLayout();
    }

    function layout(allowed) {
        const set = allowed ? new Set(allowed) : null;
        const ents = set ? data.entities.filter((e) => set.has(e.name.toLowerCase())) : data.entities;
        if (!ents.length) return;

        const ROW_GAP = 40,
            COL_GAP = 40,
            MAX_PER_COL = 3;
        const parents = new Map(),
            children = new Map();
        for (const e of ents) {
            const k = e.name.toLowerCase();
            parents.set(k, new Set());
            children.set(k, new Set());
        }
        for (const r of data.relations) {
            const c = r.from.toLowerCase(),
                p = r.to.toLowerCase();
            if (set && (!set.has(c) || !set.has(p))) continue;
            if (parents.has(c) && children.has(p)) {
                parents.get(c).add(p);
                children.get(p).add(c);
            }
        }

        const ranks = new Map();
        for (const e of ents) ranks.set(e.name.toLowerCase(), Infinity);
        const roots = [],
            queue = [];
        for (const [k, ps] of parents.entries()) if (ps.size === 0) roots.push(k);

        if (!roots.length && ents.length) {
            const s = ents[0].name.toLowerCase();
            ranks.set(s, 0);
            queue.push(s);
        } else
            roots.forEach((k, i) => {
                ranks.set(k, Math.floor(i / MAX_PER_COL));
                queue.push(k);
            });

        while (queue.length) {
            const cur = queue.shift(),
                cr = ranks.get(cur) || 0;
            for (const ch of children.get(cur) || [])
                if ((ranks.get(ch) || Infinity) > cr + 1) {
                    ranks.set(ch, cr + 1);
                    queue.push(ch);
                }
        }

        for (const [k, r] of ranks.entries()) if (!isFinite(r)) ranks.set(k, 0);
        const uniq = [...new Set(ranks.values())].sort((a, b) => a - b);
        const rmap = new Map();
        uniq.forEach((r, i) => rmap.set(r, i));
        for (const [k, r] of ranks.entries()) ranks.set(k, rmap.get(r));

        const layers = new Map();
        let maxR = 0;
        for (const [k, r] of ranks.entries()) {
            maxR = Math.max(maxR, r);
            if (!layers.has(r)) layers.set(r, []);
            layers.get(r).push(k);
        }

        const colW = new Map();
        for (let r = 0; r <= maxR; r++) {
            let mw = 0;
            for (const k of layers.get(r) || []) {
                const d = dims.get(k);
                if (d) mw = Math.max(mw, d.w);
            }
            colW.set(r, mw || 220);
        }
        const colX = new Map();
        let cx = PAD;
        for (let r = 0; r <= maxR; r++) {
            colX.set(r, cx);
            cx += (colW.get(r) || 220) + COL_GAP;
        }

        const li = (k) => {
            const l = layers.get(ranks.get(k));
            return l ? l.indexOf(k) : 0;
        };
        const order = (rank) => {
            const l = layers.get(rank) || [];
            l.sort((a, b) => {
                const avg = (k) => {
                    let s = 0,
                        c = 0;
                    for (const p of parents.get(k) || []) {
                        s += li(p);
                        c++;
                    }
                    for (const ch of children.get(k) || []) {
                        s += li(ch);
                        c++;
                    }
                    return c ? s / c : 0;
                };
                return avg(a) - avg(b);
            });
        };

        for (let i = 0; i < 4; i++) {
            for (let r = 0; r <= maxR; r++) order(r);
            for (let r = maxR; r >= 0; r--) order(r);
        }

        for (let r = 0; r <= maxR; r++) {
            let y = PAD;
            const x = colX.get(r) || PAD;
            for (const k of layers.get(r) || []) {
                const d = dims.get(k);
                if (!d) continue;
                positions.set(k, { x: snap(x), y: snap(y), w: d.w, h: d.h });
                y += d.h + ROW_GAP;
            }
        }

        for (let iter = 0; iter < 3; iter++) {
            for (let r = 0; r <= maxR; r++) {
                const layer = layers.get(r) || [];
                const tgt = new Map();
                for (const k of layer) {
                    const pos = positions.get(k);
                    if (!pos) continue;
                    const nbrs = [...(parents.get(k) || []), ...(children.get(k) || [])];
                    if (!nbrs.length) {
                        tgt.set(k, pos.y);
                        continue;
                    }
                    let s = 0,
                        c = 0;
                    for (const n of nbrs) {
                        const np = positions.get(n);
                        if (np) {
                            s += np.y + np.h / 2;
                            c++;
                        }
                    }
                    tgt.set(k, c ? s / c - pos.h / 2 : pos.y);
                }
                layer.sort((a, b) => (tgt.get(a) || 0) - (tgt.get(b) || 0));
                let y = PAD;
                const x = colX.get(r) || PAD;
                for (const k of layer) {
                    const d = dims.get(k);
                    if (!d) continue;
                    positions.set(k, { x: snap(x), y: snap(y), w: d.w, h: d.h });
                    y += d.h + ROW_GAP;
                }
            }
        }

        for (const [k, pos] of positions.entries()) {
            const b = boxes.get(k);
            if (b) {
                b.style.left = pos.x + "px";
                b.style.top = pos.y + "px";
            }
        }
    }

    function autoLayout() {
        layout(
            Array.from(vis.entries())
                .filter(([, v]) => v)
                .map(([k]) => k),
        );
        drawLinks();
        fitView();
    }

    function drawLinks() {
        if (svg) svg.remove();
        let mx = 0,
            my = 0;
        for (const [k, p] of positions.entries())
            if (vis.get(k)) {
                mx = Math.max(mx, p.x + p.w);
                my = Math.max(my, p.y + p.h);
            }

        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "svg-layer");
        svg.setAttribute("width", String(mx + PAD * 2));
        svg.setAttribute("height", String(my + PAD * 2));
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML =
            '<marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#4299e1" /></marker>';
        svg.appendChild(defs);

        const drawn = new Set();
        for (const r of data.relations) {
            const fk = r.from.toLowerCase(),
                tk = r.to.toLowerCase();
            if (!vis.get(fk) || !vis.get(tk)) continue;
            const dk = `${fk}|${tk}`;
            if (drawn.has(dk)) continue;
            drawn.add(dk);
            const fp = positions.get(fk),
                tp = positions.get(tk);
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
        const dx = tc.x - fc.x,
            dy = tc.y - fc.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            const x1 = dx > 0 ? fp.x + fp.w : fp.x,
                x2 = dx > 0 ? tp.x : tp.x + tp.w;
            const cx = (x1 + x2) / 2;
            return `M ${x1} ${fc.y} C ${cx} ${fc.y}, ${cx} ${tc.y}, ${x2} ${tc.y}`;
        }
        const y1 = dy > 0 ? fp.y + fp.h : fp.y,
            y2 = dy > 0 ? tp.y : tp.y + tp.h;
        const cy = (y1 + y2) / 2;
        return `M ${fc.x} ${y1} C ${fc.x} ${cy}, ${tc.x} ${cy}, ${tc.x} ${y2}`;
    }

    function startDrag(e, key) {
        if (e.button !== 0) return;
        e.stopPropagation();
        dragKey = key;
        const pos = positions.get(key),
            rect = container.getBoundingClientRect();
        dragOX = (e.clientX - rect.left - panX) / scale - pos.x;
        dragOY = (e.clientY - rect.top - panY) / scale - pos.y;
        boxes.get(key).classList.add("dragging-card");
        container.style.cursor = "grabbing";
    }

    function onDrag(e) {
        if (!dragKey) return;
        const rect = container.getBoundingClientRect(),
            pos = positions.get(dragKey);
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
        let mx = 0,
            my = 0;
        for (const [k, p] of positions.entries())
            if (vis.get(k)) {
                mx = Math.max(mx, p.x + p.w + PAD);
                my = Math.max(my, p.y + p.h + PAD);
            }
        if (!mx || !my) return;
        const cw = container.clientWidth,
            ch = container.clientHeight;
        scale = Math.min(cw / mx, ch / my, 1) * 0.95;
        panX = (cw - mx * scale) / 2;
        panY = (ch - my * scale) / 2;
        updateXform();
    }

    function zoom(d, cx, cy) {
        const old = scale;
        scale = Math.min(4, Math.max(0.1, scale * (1 + d)));
        const rect = container.getBoundingClientRect();
        const mx = cx - rect.left,
            my = cy - rect.top;
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
            copyJsonBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="12" height="12"><path fill="currentColor" d="M173.9 439.4L7.4 272.9c-9.9-9.9-9.9-26 0-35.9l35.9-35.9c9.9-9.9 26-9.9 35.9 0l94.7 94.7 259.2-259.2c9.9-9.9 26-9.9 35.9 0l35.9 35.9c9.9 9.9 9.9 26 0 35.9L209.8 439.4c-9.9 9.9-26 9.9-35.9 0z"/></svg>';
            setTimeout(() => {
                copyJsonBtn.innerHTML = orig;
            }, 1200);
        };
        navigator.clipboard
            .writeText(json)
            .then(done)
            .catch(() => {
                const ta = document.createElement("textarea");
                ta.value = json;
                ta.style.cssText = "position:fixed;opacity:0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                done();
            });
    }

    function setupEvents() {
        container.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                zoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY);
            },
            { passive: false },
        );
        container.addEventListener("mousedown", (e) => {
            if (e.button || dragKey) return;
            panning = true;
            lastX = e.clientX;
            lastY = e.clientY;
            container.classList.add("dragging");
        });
        document.addEventListener("mousemove", (e) => {
            if (dragKey) {
                onDrag(e);
                return;
            }
            if (!panning) return;
            panX += e.clientX - lastX;
            panY += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            updateXform();
        });
        document.addEventListener("mouseup", () => {
            endDrag();
            panning = false;
            container.classList.remove("dragging");
        });
        $("btn-zoom-in").addEventListener("click", () => {
            const r = container.getBoundingClientRect();
            zoom(0.2, r.left + r.width / 2, r.top + r.height / 2);
        });
        $("btn-zoom-out").addEventListener("click", () => {
            const r = container.getBoundingClientRect();
            zoom(-0.2, r.left + r.width / 2, r.top + r.height / 2);
        });
        $("btn-auto").addEventListener("click", autoLayout);
        $("btn-toggle-drawer").addEventListener("click", () => drawer.classList.toggle("collapsed"));
        toggleAllCb.addEventListener("change", toggleAll);
        $("search-input").addEventListener("input", (e) => updateSearch(e.target.value));
        copyJsonBtn.addEventListener("click", copyJson);
    }

    buildAdj();
    buildDrawer();
    createBoxes();
    layout();
    drawLinks();
    fitView();
    setupEvents();
})();
