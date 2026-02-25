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
    let scale = 1, panX = 0, panY = 0;
    let panning = false, lastX = 0, lastY = 0;
    let dragKey = null, dragOX = 0, dragOY = 0;

    const GRID = 20, PAD = 60;
    const COL_W = 380;
    const STEP_Y = 20;
    const PAD_Y = 40;
    const TABLE_W = 280;
    
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

    function highlightContext(tableName) {
        if (panning || dragKey) return;
        const connectedTables = new Set([tableName]);
        
        for (const n of adj.get(tableName) || []) connectedTables.add(n);

        for (const [key, box] of boxes.entries()) {
            if (connectedTables.has(key)) {
                box.classList.add('highlighted');
                box.classList.remove('dimmed');
            } else {
                box.classList.add('dimmed');
                box.classList.remove('highlighted');
            }
        }

        if (svg) {
            const lines = svg.querySelectorAll('.relation-line');
            lines.forEach(line => {
                if (line.dataset.from === tableName || line.dataset.to === tableName) {
                    line.classList.add('highlighted');
                    line.classList.remove('dimmed');
                    line.setAttribute('marker-end', 'url(#arrow-highlighted)');
                    line.parentNode.appendChild(line);
                } else {
                    line.classList.add('dimmed');
                    line.classList.remove('highlighted');
                    line.setAttribute('marker-end', 'url(#arrow)');
                }
            });
        }
    }

    function highlightRelation(fromName, toName) {
        if (panning || dragKey) return;
        const connectedTables = new Set([fromName, toName]);

        for (const [key, box] of boxes.entries()) {
            if (connectedTables.has(key)) {
                box.classList.add('highlighted');
                box.classList.remove('dimmed');
            } else {
                box.classList.add('dimmed');
                box.classList.remove('highlighted');
            }
        }

        if (svg) {
            const lines = svg.querySelectorAll('.relation-line');
            lines.forEach(line => {
                if (line.dataset.from === fromName && line.dataset.to === toName) {
                    line.classList.add('highlighted');
                    line.classList.remove('dimmed');
                    line.setAttribute('marker-end', 'url(#arrow-highlighted)');
                    line.parentNode.appendChild(line);
                } else {
                    line.classList.add('dimmed');
                    line.classList.remove('highlighted');
                    line.setAttribute('marker-end', 'url(#arrow)');
                }
            });
        }
    }

    function resetHighlight() {
        for (const box of boxes.values()) {
            box.classList.remove('highlighted', 'dimmed');
        }
        if (svg) {
            const lines = svg.querySelectorAll('.relation-line');
            lines.forEach(line => {
                line.classList.remove('highlighted', 'dimmed');
                line.setAttribute('marker-end', 'url(#arrow)');
            });
        }
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
            box.addEventListener("mouseenter", () => highlightContext(key));
            box.addEventListener("mouseleave", resetHighlight);
            viewport.appendChild(box);
            boxes.set(key, box);
            dims.set(key, { w: box.offsetWidth, h: box.offsetHeight, entity: e });
        }
    }

    function placeBoxes() {
        for (const [key, pos] of positions.entries()) {
            const box = boxes.get(key);
            if (box) {
                box.style.left = pos.x + "px";
                box.style.top = pos.y + "px";
            }
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
        if (box) {
            box.classList.toggle("hidden", !show);
            // FIX : Mettre à jour la hauteur réelle quand on affiche la table pour centrer le lien
            if (show && box.offsetHeight > 0) {
                const d = dims.get(key);
                if (d) d.h = box.offsetHeight;
            }
        }
        drawLinks();
    }

    function toggleAll() {
        const next = !Array.from(vis.values()).every(Boolean);
        for (const key of vis.keys()) {
            vis.set(key, next);
            const b = boxes.get(key);
            if (b) {
                b.classList.toggle("hidden", !next);
                if (next && b.offsetHeight > 0) {
                    const d = dims.get(key);
                    if (d) d.h = b.offsetHeight;
                }
            }
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
            if (b) {
                b.classList.remove("hidden");
                const d = dims.get(k);
                if (d && b.offsetHeight > 0) d.h = b.offsetHeight;
            }
            const di = drawerList.querySelector(`.drawer-item[data-entity="${k}"]`);
            if (di) { di.classList.remove("hidden-table"); const cb = di.querySelector("input"); if (cb) cb.checked = true; }
        }
        syncAll();
        // FIX : On force le recalcul complet pour que les nouvelles tables trouvent leur place sans chevauchement
        recalculateLayout();
    }

    // --- MOTEUR PHYSIQUE & GRILLE ---
    function runPhysicsSimulation(grid) {
        for (let i = 0; i < 250; i++) {
            for (const e1 of data.entities) {
                for (const e2 of data.entities) {
                    if (e1 === e2) continue;
                    const p1 = grid[e1.name], p2 = grid[e2.name];
                    const dx = p1.fx - p2.fx, dy = p1.fy - p2.fy;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    if (dist < 1500) {
                        const force = 600000 / (dist * dist);
                        p1.vx += (dx / dist) * force;
                        p1.vy += (dy / dist) * force;
                    }
                }
            }
            for (const r of data.relations) {
                if (r.from === r.to) continue;
                const p1 = grid[r.from], p2 = grid[r.to];
                if (!p1 || !p2) continue;
                const dx = p2.fx - p1.fx, dy = p2.fy - p1.fy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - 350) * 0.05;
                p1.vx += (dx / dist) * force;
                p1.vy += (dy / dist) * force;
                p2.vx -= (dx / dist) * force;
                p2.vy -= (dy / dist) * force;
            }
            for (const e of data.entities) {
                const p = grid[e.name];
                const d = Math.sqrt(p.fx * p.fx + p.fy * p.fy) || 1;
                p.vx -= (p.fx / d) * 0.3;
                p.vy -= (p.fy / d) * 0.3;
                p.fx += p.vx;
                p.fy += p.vy;
                p.vx *= 0.5;
                p.vy *= 0.5;
            }
        }
    }

    function ccw(A, B, C) { return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x); }
    function segmentsIntersect(A, B, C, D) { return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D); }

    function lineIntersectsBox(x1, y1, x2, y2, bx, by, bw, bh) {
        const A = { x: x1, y: y1 }, B = { x: x2, y: y2 };
        const p = 15;
        const r = [
            { x: bx - p, y: by - p }, { x: bx + bw + p, y: by - p },
            { x: bx + bw + p, y: by + bh + p }, { x: bx - p, y: by + bh + p }
        ];
        if (segmentsIntersect(A, B, r[0], r[1])) return true;
        if (segmentsIntersect(A, B, r[1], r[2])) return true;
        if (segmentsIntersect(A, B, r[2], r[3])) return true;
        if (segmentsIntersect(A, B, r[3], r[0])) return true;
        return x1 >= r[0].x && x1 <= r[1].x && y1 >= r[0].y && y1 <= r[2].y;
    }

    function checkCollision(x, y, w, h, name, grid, placed) {
        const box = { x: x - 20, y: y - PAD_Y / 2, w: w + 40, h: h + PAD_Y };
        for (const pn of placed) {
            if (pn === name) continue;
            const pb = grid[pn].box;
            if (box.x < pb.x + pb.w && box.x + box.w > pb.x && box.y < pb.y + pb.h && box.y + box.h > pb.y) return true;
        }
        const cx = x + w / 2, cy = y + h / 2;
        for (const r of data.relations) {
            if (r.from === r.to) continue;
            const p1 = grid[r.from], p2 = grid[r.to];
            if (p1?.isPlaced && p2?.isPlaced && r.from !== name && r.to !== name) {
                if (lineIntersectsBox(p1.x + p1.estW / 2, p1.y + p1.estH / 2, p2.x + p2.estW / 2, p2.y + p2.estH / 2, x, y, w, h)) return true;
            }
            if ((r.from === name && p2?.isPlaced) || (r.to === name && p1?.isPlaced)) {
                const other = r.from === name ? p2 : p1;
                for (const pn of placed) {
                    if (pn !== r.from && pn !== r.to && pn !== name) {
                        const pp = grid[pn];
                        if (lineIntersectsBox(cx, cy, other.x + other.estW / 2, other.y + other.estH / 2, pp.x, pp.y, pp.estW, pp.estH)) return true;
                    }
                }
            }
        }
        return false;
    }

    function placeOnGrid(grid) {
        const placed = new Set();
        
        const degreeMap = {};
        data.entities.forEach(e => {
            degreeMap[e.name] = data.relations.filter(r => r.from === e.name || r.to === e.name).length;
        });

        const sorted = [...data.entities].sort((a, b) => {
            const degDiff = degreeMap[b.name] - degreeMap[a.name];
            if (degDiff !== 0) return degDiff;

            const pa = grid[a.name], pb = grid[b.name];
            return (pa.fx * pa.fx + pa.fy * pa.fy) - (pb.fx * pb.fx + pb.fy * pb.fy);
        });
        for (const entity of sorted) {
            const p = grid[entity.name];
            const col = Math.round(p.fx / COL_W);
            const ty = Math.round(p.fy / STEP_Y) * STEP_Y;
            let done = false;
            for (let r = 0; !done && r < 200; r++) {
                for (let dc = -r; !done && dc <= r; dc++) {
                    for (let dy = -r; dy <= r; dy++) {
                        if (Math.abs(dc) !== r && Math.abs(dy) !== r) continue;
                        const x = (col + dc) * COL_W;
                        const y = ty + dy * STEP_Y;
                        if (!checkCollision(x, y, p.estW, p.estH, entity.name, grid, placed)) {
                            p.x = x; p.y = y;
                            p.box = { x: x - 20, y: y - PAD_Y / 2, w: p.estW + 40, h: p.estH + PAD_Y };
                            p.isPlaced = true;
                            placed.add(entity.name);
                            done = true;
                        }
                    }
                }
            }
        }
        return placed;
    }

    function compact(grid, placed) {
        let moved = true, iter = 0;
        while (moved && iter < 150) {
            moved = false;
            iter++;
            const ordered = [...data.entities].sort((a, b) => {
                const pa = grid[a.name], pb = grid[b.name];
                return (pb.x * pb.x + pb.y * pb.y) - (pa.x * pa.x + pa.y * pa.y);
            });
            for (const entity of ordered) {
                const p = grid[entity.name];
                placed.delete(entity.name);
                let tx = 0, ty = 0, cnt = 0;
                for (const r of data.relations) {
                    if (r.from === entity.name && grid[r.to]?.isPlaced) { tx += grid[r.to].x; ty += grid[r.to].y; cnt++; }
                    if (r.to === entity.name && grid[r.from]?.isPlaced) { tx += grid[r.from].x; ty += grid[r.from].y; cnt++; }
                }
                if (cnt > 0) { tx /= cnt; ty /= cnt; }
                let dc = 0, dy = 0;
                if (Math.abs(tx - p.x) >= COL_W) dc = Math.sign(tx - p.x) * COL_W;
                if (Math.abs(ty - p.y) >= STEP_Y) dy = Math.sign(ty - p.y) * STEP_Y;
                let localMoved = false;
                if (dc !== 0 && dy !== 0 && !checkCollision(p.x + dc, p.y + dy, p.estW, p.estH, entity.name, grid, placed)) {
                    p.x += dc; p.y += dy; localMoved = true;
                } else if (dc !== 0 && !checkCollision(p.x + dc, p.y, p.estW, p.estH, entity.name, grid, placed)) {
                    p.x += dc; localMoved = true;
                } else if (dy !== 0 && !checkCollision(p.x, p.y + dy, p.estW, p.estH, entity.name, grid, placed)) {
                    p.y += dy; localMoved = true;
                }
                p.box = { x: p.x - 20, y: p.y - PAD_Y / 2, w: p.estW + 40, h: p.estH + PAD_Y };
                placed.add(entity.name);
                if (localMoved) moved = true;
            }
        }
    }

    function calculateLayout() {
        const grid = {};
        const n = data.entities.length;
        
        // Sécurité : On s'assure que les dims sont à jour (ex: si une table vient d'être affichée)
        for (const [key, box] of boxes.entries()) {
            if (!box.classList.contains("hidden") && box.offsetHeight > 0) {
                const d = dims.get(key);
                if (d) { d.w = box.offsetWidth; d.h = box.offsetHeight; }
            }
        }

        data.entities.forEach((e, i) => {
            const a = (i / n) * Math.PI * 2;
            const key = e.name.toLowerCase();
            const d = dims.get(key);
            grid[e.name] = {
                fx: Math.cos(a) * 400, fy: Math.sin(a) * 400,
                vx: 0, vy: 0,
                estW: d ? d.w : TABLE_W, 
                estH: d ? d.h : 45 + (e.fields ? e.fields.length : 0) * 29,
                isPlaced: false, x: 0, y: 0, box: null,
            };
        });

        runPhysicsSimulation(grid);
        const placed = placeOnGrid(grid);
        compact(grid, placed);

        let minX = Infinity, minY = Infinity;
        for (const e of data.entities) { minX = Math.min(minX, grid[e.name].x); minY = Math.min(minY, grid[e.name].y); }
        const offX = PAD - minX, offY = PAD - minY;

        data.entities.forEach((e) => {
            const key = e.name.toLowerCase();
            const p = grid[e.name];
            const nx = p.x + offX, ny = p.y + offY;
            const d = dims.get(key);
            positions.set(key, { x: nx, y: ny, w: d ? d.w : p.estW, h: d ? d.h : p.estH });
        });
    }

    // --- MISE À JOUR : Fusion de recalculateLayout et autoLayout ---
    // C'est cette fonction qui gère tout le flux de rafraîchissement
    function recalculateLayout() {
        positions.clear();
        calculateLayout();
        placeBoxes(); // L'appel crucial qui manquait à autoLayout pour déplacer le HTML !
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
        defs.innerHTML = '<marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#4299e1" /></marker><marker id="arrow-highlighted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#ffd700" /></marker>';
        svg.appendChild(defs);

        const drawn = new Set();
        for (const r of data.relations) {
            const fk = r.from.toLowerCase(), tk = r.to.toLowerCase();
            if (fk === tk) continue; // Hide self-referencing relations
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
            el.dataset.from = fk;
            el.dataset.to = tk;
            el.addEventListener('mouseenter', () => highlightRelation(fk, tk));
            el.addEventListener('mouseleave', resetHighlight);
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
        pos.x = Math.max(0, snap((e.clientX - rect.left - panX) / scale - dragOX));
        pos.y = Math.max(0, snap((e.clientY - rect.top - panY) / scale - dragOY));
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
        container.style.backgroundPosition = `${panX}px ${panY}px`;
        container.style.backgroundSize = `20px 20px`;
        zoomLabel.textContent = Math.round(scale * 100) + "%";
    }

    function fitView() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasVisible = false;
        for (const [k, p] of positions.entries()) {
            if (!vis.get(k)) continue;
            hasVisible = true;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + p.w);
            maxY = Math.max(maxY, p.y + p.h);
        }
        if (!hasVisible) return;
        const boxW = maxX - minX + PAD * 2;
        const boxH = maxY - minY + PAD * 2;
        const cw = container.clientWidth, ch = container.clientHeight;
        scale = Math.min(cw / boxW, ch / boxH, 1) * 0.95;
        panX = (cw - boxW * scale) / 2 - (minX - PAD) * scale;
        panY = (ch - boxH * scale) / 2 - (minY - PAD) * scale;
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
        $("btn-fit-view").addEventListener("click", fitView);
        
        // Remplacement de autoLayout par recalculateLayout
        $("btn-auto").addEventListener("click", recalculateLayout);
        
        $("btn-toggle-drawer").addEventListener("click", () => drawer.classList.toggle("collapsed"));
        toggleAllCb.addEventListener("change", toggleAll);
        $("search-input").addEventListener("input", (e) => updateSearch(e.target.value));
        copyJsonBtn.addEventListener("click", copyJson);
    }

    function init() {
        buildAdj();
        buildDrawer();
        createBoxes();
        recalculateLayout(); // Appelle Calculate + PlaceBoxes
        setupEvents();
    }

    init();
})();