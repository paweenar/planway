"use strict";
/* PlanWay — state, การคำนวณย้อนหลัง, การวาดหน้าจอ
   ข้อความทุกบรรทัดในไฟล์นี้ต้องผ่าน t() และชื่อสถานีทุกจุดต้องผ่าน sname()
   มิฉะนั้นการสลับภาษาจะไม่ครบ */
/* =======================================================================
   4. STATE
   ======================================================================= */
const S = {
    origin: "อารีย์", dest: "ศูนย์ประชุมสิริกิติ์", arrive: 9 * 60, when: "arrive", departAt: 8 * 60, dayType: "wd",
    /* conf ไม่มีปุ่มให้เลือกแล้ว คงไว้ที่ 90% ซึ่งเป็นค่าที่เหมาะกับนัดงานทั่วไป
       ถ้าอยากเปิดให้ผู้ใช้เลือกอีกครั้ง เพิ่มปุ่ม data-conf กลับเข้าไปใน index.html ได้เลย */
    cushion: 10, conf: 90, wxMode: "auto", wxDay: null, wxTab: "temp", wxUnit: "c", mapView: "live", mode: "transit", tab: "one",
    prep: [{ k: "shower", m: 25, on: true }, { k: "food", m: 15, on: true },
        { k: "pack", m: 8, on: true }, { k: "exit", m: 5, on: true }],
    day: [{ p: "ศูนย์ประชุมสิริกิติ์", t: 9 * 60, stay: 90 }, { p: "เซ็นทรัลเวิลด์", t: 12 * 60, stay: 60 },
        { p: "ม.เกษตรศาสตร์ บางเขน", t: 15 * 60, stay: 60 }]
};
try {
    const raw = localStorage.getItem("okd.v2");
    if (raw)
        Object.assign(S, JSON.parse(raw));
}
catch (e) { }
function save() { try {
    localStorage.setItem("okd.v2", JSON.stringify(S));
}
catch (e) { } }
/* วันที่ค้างใน localStorage จากการเปิดครั้งก่อนอาจผ่านไปแล้ว ให้กลับมาเป็นวันนี้ */
if (S.wxDay && S.wxDay < wxToday())
    S.wxDay = null;
/* รายการเตรียมตัวที่มากับโปรแกรมเก็บเป็นคีย์ (k) จึงแปลภาษาได้
   ส่วนรายการที่ผู้ใช้พิมพ์เองเก็บเป็นข้อความดิบ (n) และคงไว้ตามที่พิมพ์ */
const prepName = (p) => p.k ? t("prep." + p.k) : (p.n || "");
function resolve(q) {
    q = (q || "").trim();
    if (!q)
        return null;
    /* สถานที่ที่ผู้ใช้เลือกจากผลค้นหาออนไลน์ ต้องมาก่อนเสมอ */
    const hit = FOUND.get(q);
    if (hit)
        return { name: hit.name, lat: hit.lat, lng: hit.lng, type: "geo" };
    /* ผู้ใช้อาจพิมพ์ชื่ออังกฤษ — แปลงกลับเป็นชื่อไทยซึ่งเป็นคีย์จริงของกราฟก่อน */
    const qn = q.toLowerCase();
    let alt = NAME_TH[qn];
    if (!alt && qn.length >= 2) {
        for (const en in NAME_TH)
            if (en.startsWith(qn)) {
                alt = NAME_TH[en];
                break;
            }
        if (!alt)
            for (const en in NAME_TH)
                if (en.includes(qn)) {
                    alt = NAME_TH[en];
                    break;
                }
    }
    for (const c of (alt ? [alt, q] : [q])) {
        const pl = PLACES.find(p => p[0] === c) || PLACES.find(p => p[0].includes(c));
        if (pl)
            return { name: pl[0], lat: pl[1], lng: pl[2], type: "place" };
        for (const [k, n] of NODES)
            if (n.st === c)
                return { name: n.st, lat: n.lat, lng: n.lng, type: "station", line: n.line };
        for (const [k, n] of NODES)
            if (n.st.includes(c))
                return { name: n.st, lat: n.lat, lng: n.lng, type: "station", line: n.line };
    }
    return null;
}
/* ---- สภาพอากาศ ----
   RAIN  = สรุปแล้วว่าช่วงเดินทางนับเป็นฝนตกไหม (เอนจินรับค่านี้ไปคิดเวลาเดินและรถติด)
   WXNOW = รายละเอียดพยากรณ์ของช่วงนั้น ไว้แสดงให้ผู้ใช้เห็นว่าตัดสินจากอะไร */
let RAIN = false;
let WXNOW = null;
let lastWxAt = null;
function syncWeather() {
    if (S.wxMode === "rain") {
        RAIN = true;
        WXNOW = null;
        return;
    }
    if (S.wxMode === "dry") {
        RAIN = false;
        WXNOW = null;
        return;
    }
    /* ดูเฉพาะช่วงที่อยู่นอกบ้านจริง ใช้เวลาเดินทางจากการคำนวณรอบก่อนเป็นตัวตั้ง
       (รอบแรกยังไม่มี จึงเดา 60 นาที แล้วรอบถัดไปจะตรงเอง) */
    const target = S.arrive - S.cushion;
    const dur = planOk(LAST) ? Math.min(180, Math.max(25, LAST.travel)) : 60;
    const from = Math.max(0, target - dur);
    WXNOW = wxWindow(S.wxDay || wxToday(), from, target);
    if (WXNOW) {
        WXNOW.fromMin = from;
        WXNOW.toMin = target;
    }
    RAIN = wxIsRain(WXNOW);
}
const prepTotal = () => S.prep.filter(p => p.on).reduce((a, p) => a + (+p.m || 0), 0);
/* นาทีนับจากเที่ยงคืนของ "ตอนนี้" — หน้าเว็บเปิดค้างข้ามชั่วโมงได้ ค่านี้จึงต้องอ่านสดทุกครั้ง */
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
const mins = (n) => t("unit.min", { n: Math.round(n) });
const lc = (l) => isDark() ? LINES[l].cd : LINES[l].c;
/* =======================================================================
   5. COMPUTE
   ======================================================================= */
function compute() {
    const A = resolve(S.origin), B = resolve(S.dest);
    if (!A || !B)
        return { err: !A ? t("err.origin", { q: S.origin }) : t("err.dest", { q: S.dest }),
            errField: !A ? "origin" : "dest", errQ: !A ? S.origin : S.dest };
    if (A.name === B.name)
        return { err: t("err.same") };
    const target = S.arrive - S.cushion;
    let b = band(target, S.dayType), leave = target;
    let plans = { transit: null, drive: drivePlan(A, B, b, RAIN), mixed: null };
    for (let it = 0; it < 3; it++) {
        plans = {
            transit: transitPlan(A, B, b, RAIN),
            drive: drivePlan(A, B, b, RAIN),
            mixed: mixedPlan(A, B, b, RAIN)
        };
        const p = plans[S.mode] || plans.drive;
        leave = target - (p.mean + Z[S.conf] * p.sd);
        const nb = band(leave, S.dayType);
        if (nb === b)
            break;
        b = nb;
    }
    const fallback = !plans[S.mode];
    let p = plans[S.mode] || plans.drive;
    let mode = fallback ? "drive" : S.mode;
    let buffer = Z[S.conf] * p.sd, travel = p.mean + buffer;
    /* เวลาให้บริการ — ถ้าต้องขึ้นรถตอนที่สายนั้นปิดแล้ว แผนนี้ใช้ไม่ได้จริง
       ถอยไปแผนขับรถซึ่งใช้ได้ตลอด 24 ชม. แล้วบอกผู้ใช้ให้ชัดว่าเพราะอะไร
       ต้องเช็คหลังได้ leave แล้ว เพราะเวลาออกจากบ้านขึ้นกับแผนที่เลือก */
    let svcClosed = null;
    const issues = svcCheck(p, target - travel);
    if (issues.length && plans.drive) {
        svcClosed = { was: mode, issues };
        p = plans.drive;
        mode = "drive";
        buffer = Z[S.conf] * p.sd;
        travel = p.mean + buffer;
    }
    const prep = prepTotal();
    return { A, B, b, plans, plan: p, buffer, travel, leave: target - travel,
        prepStart: target - travel - prep, prep, target, mode, fallback, svcClosed };
}
/* =======================================================================
   6. RENDER
   ======================================================================= */
/* querySelector ที่รู้ชนิดของ element — ช่องกรอกเรียกเป็น $<HTMLInputElement>("#origin") เพื่อให้ .value มีชนิด
   ใช้ as ได้เพราะทุกจุดในไฟล์นี้ยิงหา id ที่มีอยู่จริงใน index.html */
const $ = (s) => document.querySelector(s);
const el = (t2, c, txt) => { const e = document.createElement(t2); if (c)
    e.className = c; if (txt != null)
    e.textContent = txt; return e; };
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (x) => String(x).replace(/[&<>"]/g, c => ESCAPES[c]);
/* ---------- ช่องค้นหาสถานที่พร้อมรายการแนะนำ ----------
   ผูกกับ input ตัวไหนก็ได้ ผลจากข้อมูลในเครื่องขึ้นทันที ส่วนผลจากเน็ตตามมาทีหลัง */
function attachAC(input, onPick) {
    const wrap = input.parentElement;
    wrap.classList.add("acwrap");
    const list = el("div", "aclist hide");
    wrap.appendChild(list);
    let timer;
    let items = [], idx = -1, lastQ = null;
    const close = () => { list.classList.add("hide"); idx = -1; };
    const render = () => {
        if (!items.length) {
            close();
            return;
        }
        list.innerHTML = "";
        items.forEach((p, i) => {
            const b = el("button", "acitem" + (i === idx ? " on" : ""));
            b.type = "button";
            b.tabIndex = -1;
            b.innerHTML = '<span class="acn">' + esc(sname(p.name)) + '</span>' +
                (p.detail ? '<span class="acd">' + esc(p.detail) + '</span>' : "") +
                '<span class="ack">' + t("ac." + (p.kind || "geo")) + '</span>';
            b.onmousedown = e => { e.preventDefault(); pick(p); };
            list.appendChild(b);
        });
        list.classList.remove("hide");
    };
    const pick = (p) => {
        /* ที่มาจากเน็ตต้องจำพิกัดไว้ ไม่งั้น resolve() หาไม่เจอในรอบถัดไป */
        if (p.kind === "geo")
            rememberPlace({ name: p.name, lat: p.lat, lng: p.lng, detail: p.detail });
        input.value = sname(p.name);
        close();
        onPick(p);
    };
    const run = () => {
        const q = input.value.trim();
        lastQ = q;
        items = q ? searchLocal(q) : [];
        render();
        if (q.length < 2)
            return;
        searchOnline(q).then(res => {
            if (input.value.trim() !== lastQ)
                return; /* ผู้ใช้พิมพ์ต่อไปแล้ว ผลนี้ตกรุ่น */
            const seen = new Set(items.map(x => x.name));
            items = items.concat(res.filter(r => !seen.has(r.name))).slice(0, 9);
            render();
        });
    };
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 220); });
    input.addEventListener("focus", () => { if (input.value.trim())
        run(); });
    input.addEventListener("blur", () => setTimeout(close, 140));
    input.addEventListener("keydown", e => {
        if (list.classList.contains("hide"))
            return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            idx = Math.min(idx + 1, items.length - 1);
            render();
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            idx = Math.max(idx - 1, 0);
            render();
        }
        else if (e.key === "Enter" && idx >= 0) {
            e.preventDefault();
            pick(items[idx]);
        }
        else if (e.key === "Escape")
            close();
    });
    return { close };
}
function renderPrep() {
    const host = $("#prepList");
    host.innerHTML = "";
    S.prep.forEach((p, i) => {
        const r = el("label", "chk");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = p.on;
        cb.id = "prep-on-" + i;
        cb.onchange = () => { p.on = cb.checked; save(); draw(); };
        const nm = el("span", "nm", prepName(p));
        const nu = el("input");
        nu.type = "number";
        nu.min = "0";
        nu.max = "240";
        nu.value = String(p.m);
        nu.id = "prep-m-" + i;
        nu.setAttribute("aria-label", t("prep.minsFor", { n: prepName(p) }));
        nu.oninput = () => { p.m = +nu.value || 0; save(); draw(); };
        const u = el("span", "u", t("unit.minShort"));
        const rm = el("button", "rm", "×");
        rm.type = "button";
        rm.title = t("prep.remove");
        rm.onclick = () => { S.prep.splice(i, 1); save(); renderPrep(); draw(); };
        r.append(cb, nm, nu, u, rm);
        host.appendChild(r);
    });
    $("#prepTotal").textContent = String(prepTotal());
    $("#prepUnit").textContent = t("unit.minShort");
}
/* ไอคอนเส้นเดียวชุดเดียวทั้งหน้า — ขนาดเท่ากันหมด ไม่ปนอิโมจิ
   (เทียบเท่า lucide ที่สเปกขอ แต่ฝังเป็น SVG ตรง ๆ เพราะโปรเจกต์ไม่มี React) */
const ICONS = {
    clock: "M8 3.6V8l3 1.8M8 14.4A6.4 6.4 0 1 1 8 1.6a6.4 6.4 0 0 1 0 12.8z",
    wallet: "M2.4 5.2h11.2v7.2H2.4zM2.4 5.2 11 2.4l1 2.8M11.4 8.8h1.2",
    swap: "M3 5.5h9M9.5 3 12 5.5 9.5 8M13 10.5H4M6.5 8 4 10.5 6.5 13",
    walk: "M8.8 3.2a1 1 0 1 0 0-.1M7.6 14l1-3.4-1.8-1.6.6-3.2 2 1 1.6 1.2M6.2 8.2l1.2-2.4M5.6 14l1.4-2.6",
    car: "M2.8 10.4h10.4M3.6 10.4 4.8 6.6a1.4 1.4 0 0 1 1.3-1h3.8a1.4 1.4 0 0 1 1.3 1l1.2 3.8M4.6 12.6h1M10.4 12.6h1M2.8 10.4v2.2h10.4v-2.2",
    train: "M4.4 2.6h7.2v7.2H4.4zM4.4 6.2h7.2M6.2 12.4 4.6 14M9.8 12.4 11.4 14M6.4 9.8h.1M9.6 9.8h.1M5.6 9.8h4.8",
    bus: "M3.2 3h9.6v7.4H3.2zM3.2 6.6h9.6M4.8 12.4v1M11.2 12.4v1M5.2 10.4h.1M10.8 10.4h.1M3.2 10.4h9.6v2H3.2z",
    boat: "M2.6 10.8c1.2 1.4 2.4 1.4 3.6 0 1.2 1.4 2.4 1.4 3.6 0 1.2 1.4 2.4 1.4 3.6 0M4 9.2V5.6h8L13 9.2M8 5.6V3.2",
    pin: "M8 14.2S3.2 10 3.2 6.8a4.8 4.8 0 0 1 9.6 0c0 3.2-4.8 7.4-4.8 7.4zM8 6.6h.1",
    flag: "M4 14V2.6M4 3.2h7.6l-1.6 2.4 1.6 2.4H4",
    wait: "M5 2.6h6M5 13.4h6M5.6 2.6c0 2.4 2.4 3.2 2.4 5.4s-2.4 3-2.4 5.4M10.4 2.6c0 2.4-2.4 3.2-2.4 5.4s2.4 3 2.4 5.4",
    prep: "M8 2.4a5.6 5.6 0 0 1 5.6 5.6c0 2.2-1.4 3.2-1.4 4.6H3.8c0-1.4-1.4-2.4-1.4-4.6A5.6 5.6 0 0 1 8 2.4zM6 14.2h4"
};
function iconEl(name, cls) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("class", "ico" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICONS[name] || ICONS.pin);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.5");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
    return svg;
}
/* ไอคอนของสายหนึ่ง ๆ ตามชนิดพาหนะจริง */
const lineIcon = (lid) => lid === "boat" ? "boat" : (LINES[lid].spb ? "bus" : "train");
function tlItem(clock, title, sub, dur, color, xf, icon) {
    const li = el("li");
    const c = el("div", "clock mono", clock);
    if (!clock)
        c.className = "clock mono dim";
    const rail = el("div", "rail");
    const i = el("i"), b = el("b", xf ? "xf" : "");
    if (color) {
        i.style.background = color;
        b.style.borderColor = color;
        b.style.color = color;
    }
    if (icon)
        b.appendChild(iconEl(icon));
    rail.append(i, b);
    const body = el("div", "body");
    body.appendChild(title);
    if (sub)
        body.appendChild(el("div", "sub", sub));
    if (dur)
        body.appendChild(el("div", "dur", dur));
    li.append(c, rail, body);
    return li;
}
function tagEl(lid) {
    const s = el("span", "badge", ltag(lid));
    s.style.background = lc(lid);
    s.style.color = "#fff";
    if (lid === "yellow")
        s.style.color = "#3A2F00";
    return s;
}
/* ตัวเลือกเส้นทางเป็นแถวเตี้ย ๆ อ่านเทียบกันบนลงล่างได้ ไม่ใช่การ์ดใหญ่สามใบเรียงขวาง
   "แนะนำ" = แผนที่ออกจากบ้านได้สายที่สุดโดยยังถึงทัน ซึ่งเป็นสิ่งที่ผู้ใช้ได้ประโยชน์จริง */
function renderModes(r) {
    const host = $("#modes");
    host.innerHTML = "";
    const order = ["transit", "mixed", "drive"];
    let best = null, bestLeave = -1;
    for (const k of order) {
        const p = r.plans[k];
        if (!p)
            continue;
        const lv = r.target - (p.mean + Z[S.conf] * p.sd);
        if (lv > bestLeave) {
            bestLeave = lv;
            best = k;
        }
    }
    for (const k of order) {
        const p = r.plans[k];
        const b = el("button", "route");
        b.type = "button";
        b.setAttribute("aria-pressed", String(r.mode === k));
        const head = el("div", "rhead");
        head.appendChild(el("span", "rname", t("mode." + k)));
        if (p && k === best)
            head.appendChild(el("span", "rbadge", t("routes.best")));
        b.appendChild(head);
        if (!p) {
            b.appendChild(el("div", "rmeta", t("mode.none")));
            b.disabled = true;
            host.appendChild(b);
            continue;
        }
        const leave = r.target - (p.mean + Z[S.conf] * p.sd);
        const tm = el("div", "rtime");
        tm.append(el("b", null, hhmm(leave)), el("span", "arrow", "→"), el("span", null, hhmm(r.target)));
        b.appendChild(tm);
        const meta = el("div", "rmeta");
        meta.appendChild(el("span", null, histDur(p.mean)));
        meta.appendChild(el("span", "dot", "·"));
        meta.appendChild(el("span", null, t("sum.fare", { n: p.fare })));
        if (p.kind !== "drive") {
            meta.appendChild(el("span", "dot", "·"));
            meta.appendChild(el("span", null, t("sum.xfers", { n: p.xfers })));
        }
        b.appendChild(meta);
        /* แถวไอคอนพาหนะ — เห็นรูปแบบการเดินทางทั้งเที่ยวได้โดยไม่ต้องอ่านไทม์ไลน์ */
        const ic = el("div", "ricons");
        if (p.kind === "drive")
            ic.appendChild(iconEl("car"));
        else {
            const seen = [];
            for (const g of p.segs) {
                const kind = g.t === "ride" ? lineIcon(g.line)
                    : g.t === "moto" ? "car"
                        : g.t === "walk" ? "walk" : "";
                if (kind && seen[seen.length - 1] !== kind) {
                    seen.push(kind);
                }
            }
            for (const kind of seen.slice(0, 5))
                ic.appendChild(iconEl(kind));
        }
        b.appendChild(ic);
        /* แต่ละแผนออกจากบ้านคนละเวลา จึงต้องเช็คเวลาให้บริการด้วยเวลาของแผนนั้นเอง */
        const shut = svcCheck(p, leave);
        if (shut.length) {
            b.appendChild(el("div", "rwarn", t("mode.closed", { tag: ltag(shut[0].line) })));
            b.classList.add("shut");
        }
        b.onclick = () => { S.mode = k; save(); draw(); };
        host.appendChild(b);
    }
}
function renderTimeline(r) {
    const host = $("#timeline");
    host.innerHTML = "";
    let tm = r.prepStart;
    for (const p of S.prep.filter(x => x.on)) {
        host.appendChild(tlItem(hhmm(tm), el("div", "ttl", prepName(p)), null, mins(p.m), "var(--line2)", false, "prep"));
        tm += +p.m || 0;
    }
    host.appendChild(tlItem(hhmm(r.leave), el("div", "ttl", t("tl.leave")), null, null, "var(--primary)", false, "pin"));
    tm = r.leave;
    if (r.plan.kind === "drive") {
        host.appendChild(tlItem(hhmm(tm), el("div", "ttl", t("tl.drive", { p: sname(r.B.name) })), t("tl.driveSub", { km: Math.round(r.plan.km), sp: Math.round(r.plan.sp) }), mins(r.plan.mean), "var(--ink2)", false, "car"));
        tm += r.plan.mean;
    }
    else {
        for (const s of r.plan.segs) {
            if (s.t === "walk") {
                host.appendChild(tlItem(hhmm(tm), el("div", "ttl", t(s.last ? "tl.walkFrom" : "tl.walkTo", { p: sname(s.to.st) })), s.last ? t("tl.walkSub", { p: sname(r.B.name) }) : null, mins(s.eff), "var(--ok)", false, "walk"));
            }
            else if (s.t === "moto") {
                host.appendChild(tlItem(hhmm(tm), el("div", "ttl", t(s.last ? "tl.motoFrom" : "tl.motoTo", { p: sname(s.to.st) })), t("tl.motoSub", { n: s.walkWas || 0 }), mins(s.eff), "var(--warn)", false, "car"));
            }
            else if (s.t === "wait") {
                const ttl = el("div", "ttl");
                ttl.append(tagEl(s.line), document.createTextNode(" " + t("tl.wait")));
                host.appendChild(tlItem(hhmm(tm), ttl, t("tl.waitSub", { n: LINES[s.line].hw[r.b] }), mins(s.eff), lc(s.line), false, "wait"));
            }
            else if (s.t === "ride") {
                const ttl = el("div", "ttl");
                ttl.append(tagEl(s.line), document.createTextNode(" " + sname(s.from) + " → " + sname(s.to)));
                host.appendChild(tlItem(hhmm(tm), ttl, t("tl.rideSub", { n: s.hops, line: lname(s.line) }), mins(s.eff), lc(s.line), false, lineIcon(s.line)));
            }
            else if (s.t === "xfer") {
                host.appendChild(tlItem(hhmm(tm), el("div", "ttl", t("tl.xfer", { p: sname(s.at) })), lname(s.from) + " → " + lname(s.to), mins(s.eff), "var(--ink3)", true, "swap"));
            }
            tm += s.eff;
        }
    }
    host.appendChild(tlItem(hhmm(tm), el("div", "ttl", t("tl.buffer")), t("tl.bufferSub"), mins(r.buffer), "var(--line2)", false, "clock"));
    host.appendChild(tlItem(hhmm(r.target), el("div", "ttl", t("tl.arrive", { p: sname(r.B.name) })), t("tl.arriveSub", { n: S.cushion }), null, "var(--primary)", false, "flag"));
}
function renderBreakdown(r) {
    const host = $("#breakdown");
    host.innerHTML = "";
    const rows = [];
    if (r.plan.kind === "drive") {
        const park = r.b === 0 ? 9 : 5;
        rows.push([t("bd.driveTime"), mins(r.plan.mean - park)]);
        rows.push([t("bd.parking"), mins(park)]);
    }
    else {
        rows.push([t("bd.walk"), mins(r.plan.walk)]);
        rows.push([t("bd.wait"), mins(r.plan.wait)]);
        rows.push([t("bd.ride"), mins(r.plan.ride)]);
    }
    rows.push([t("bd.buffer", { n: S.conf }), mins(r.buffer)]);
    rows.push([t("bd.cushion"), mins(S.cushion)]);
    for (const [n, v] of rows) {
        const li = el("li");
        li.append(el("span", "n", n), el("span", "v mono", v));
        host.appendChild(li);
    }
    const li = el("li", "sum");
    li.append(el("span", "n", t("bd.total")), el("span", "v mono", mins(r.travel + S.cushion)));
    host.appendChild(li);
    const li2 = el("li");
    li2.append(el("span", "n", t("bd.plusPrep")), el("span", "v mono", mins(r.prep)));
    host.appendChild(li2);
}
function renderTips(r) {
    const host = $("#tips");
    host.innerHTML = "";
    const tips = [];
    if (r.plan.kind !== "drive") {
        if (r.plan.xfers > 0)
            tips.push([t("mk.xfer"), t("tip.xfer", { n: r.plan.xfers,
                    m: Math.round(r.plan.segs.filter(s => s.t === "xfer").reduce((a, s) => a + s.eff, 0)) })]);
        const lines = [...new Set(r.plan.segs.filter(s => s.t === "ride").map(s => s.line))];
        const needCard = lines.some(l => ["sukhumvit", "silom"].includes(l));
        const needMrt = lines.some(l => ["blue", "purple"].includes(l));
        if (needCard && needMrt)
            tips.push([t("mk.fare"), t("tip.fareBoth", { f: r.plan.fare })]);
        else
            tips.push([t("mk.fare"), t("tip.fare", { f: r.plan.fare,
                    extra: r.plan.extra ? t("tip.fareExtra", { e: r.plan.extra }) : "" })]);
        /* ขาสุดท้ายของแผนขนส่งสาธารณะเป็นขาเดิน/วินเสมอ (ดู segments() ใน engine.ts) */
        const eg = r.plan.segs[r.plan.segs.length - 1];
        if (eg.eff >= 10)
            tips.push([t("mk.lastleg"), t("tip.lastleg", { p: sname(eg.to.st),
                    how: t(eg.t === "moto" ? "how.moto" : "how.walk"), n: Math.round(eg.eff) })]);
        if (r.b === 0)
            tips.push([t("mk.rush"), t("tip.rush")]);
        if (r.plan.segs.some(s => s.t === "ride" && s.line === "boat"))
            tips.push([t("mk.boat"), t("tip.boat")]);
        /* สายที่มี spb คือสายที่วิ่งบนถนน (รถเมล์/BRT) — เตือนว่าเวลาแกว่งกว่าราง */
        if (r.plan.segs.some(s => s.t === "ride" && !!LINES[s.line].spb))
            tips.push([t("mk.bus"), t("tip.bus")]);
    }
    else {
        tips.push([t("mk.parking"), t("tip.parking", { n: r.b === 0 ? 9 : 5 })]);
        tips.push([t("mk.cost"), t("tip.cost", { f: r.plan.fare })]);
        tips.push([t("mk.reliab"), t("tip.reliab", { n: Math.round(r.buffer) })]);
    }
    if (r.svcClosed) {
        const i = r.svcClosed.issues[0];
        tips.push([t("mk.closed"), t(i.kind === "before" ? "tip.closedBefore" : "tip.closedAfter", { line: lname(i.line), at: hhmm(i.at), t: hhmm(i.kind === "before" ? i.first : i.last) })]);
    }
    if (RAIN)
        tips.push([t("mk.rain"), t("tip.rain")]);
    if (r.prepStart < 5 * 60 + 30)
        tips.push([t("mk.early"), t("tip.early", { t: hhmm(r.prepStart) })]);
    if (r.leave < r.prepStart)
        tips.push([t("mk.check"), t("tip.check")]);
    for (const [m, txt] of tips) {
        const li = el("li");
        li.append(el("span", "mk", m), el("span", null, txt));
        host.appendChild(li);
    }
}
/* ---------- map ---------- */
function renderMap(r) {
    /* viewBox กว้างเท่าช่องที่วางจริง ๆ เพื่อให้ 1 หน่วย = 1 พิกเซลบนจอ
       ถ้าตรึง W ไว้ที่ค่าเดียว ตัวหนังสือใน SVG จะถูกย่อตามความกว้างช่องจนอ่านไม่ออกบนจอแคบ */
    const hostW = $("#mapHost").clientWidth || 820;
    const W = Math.round(Math.max(320, Math.min(1000, hostW)));
    const PAD = Math.round(Math.max(16, W * 0.03));
    const FS = W < 430 ? 12 : 14;
    /* กรอบภาพจับเฉพาะเส้นทางที่เลือก ไม่ใช่ทั้งโครงข่าย */
    const focus = [];
    if (planOk(r)) {
        focus.push([r.A.lat, r.A.lng], [r.B.lat, r.B.lng]);
        if (r.plan.kind !== "drive" && r.plan.path)
            for (const k of r.plan.path) {
                const n = NODES.get(k);
                focus.push([n.lat, n.lng]);
            }
    }
    else
        for (const n of NODES.values())
            focus.push([n.lat, n.lng]);
    let la0 = Math.min(...focus.map(p => p[0])), la1 = Math.max(...focus.map(p => p[0]));
    let lo0 = Math.min(...focus.map(p => p[1])), lo1 = Math.max(...focus.map(p => p[1]));
    const padLa = Math.max((la1 - la0) * 0.22, 0.012), padLo = Math.max((lo1 - lo0) * 0.22, 0.012);
    la0 -= padLa;
    la1 += padLa;
    lo0 -= padLo;
    lo1 += padLo;
    const mid = (la0 + la1) / 2 * R2D, kx = Math.cos(mid);
    const wLo = (lo1 - lo0) * kx, hLa = (la1 - la0);
    /* ความสูงวิ่งตามสัดส่วนของเส้นทาง เส้นทางแนวตั้งจึงได้ภาพสูง ไม่เหลือที่ว่างสองข้าง
       แต่ต้องมีเพดาน ไม่งั้นเส้นทางแนวตั้งจะได้แผนที่ยาวเป็นพืดเต็มจอ */
    let s = (W - PAD * 2) / wLo;
    let H = Math.round(hLa * s + PAD * 2);
    H = Math.min(560, Math.max(H, 300, Math.round(W * 0.46)));
    s = Math.min((W - PAD * 2) / wLo, (H - PAD * 2) / hLa);
    const ox = PAD + ((W - PAD * 2) - wLo * s) / 2, oy = PAD + ((H - PAD * 2) - hLa * s) / 2;
    const X = (lng) => ox + (lng - lo0) * kx * s, Y = (lat) => H - oy - (lat - la0) * s;
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t("map.aria") + '">';
    g += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--surface)"/>';
    g += '<polyline fill="none" stroke="var(--surface3)" stroke-width="9" stroke-linejoin="round" points="' +
        RIVER.map(p => X(p[1]).toFixed(1) + "," + Y(p[0]).toFixed(1)).join(" ") + '"/>';
    for (const [lid, L] of Object.entries(LINES)) {
        const pts = L.st.map(st => X(st[2]).toFixed(1) + "," + Y(st[1]).toFixed(1)).join(" ");
        g += '<polyline fill="none" stroke="' + lc(lid) + '" stroke-width="2.6" stroke-opacity=".34" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/>';
    }
    for (const [lid, a, b2] of EXTRA_EDGES) {
        const A = NODES.get(key(lid, a)), B = NODES.get(key(lid, b2));
        g += '<line x1="' + X(A.lng).toFixed(1) + '" y1="' + Y(A.lat).toFixed(1) + '" x2="' + X(B.lng).toFixed(1) + '" y2="' + Y(B.lat).toFixed(1) +
            '" stroke="' + lc(lid) + '" stroke-width="2.6" stroke-opacity=".34"/>';
    }
    for (const n of NODES.values())
        g += '<circle class="stdot" data-st="' + n.st + '" cx="' + X(n.lng).toFixed(1) + '" cy="' + Y(n.lat).toFixed(1) +
            '" r="4.2" fill="transparent" stroke="transparent" stroke-width="7"><title>' + sname(n.st) + '</title></circle>';
    if (planOk(r)) {
        if (r.plan.kind === "drive") {
            const a = r.A, b2 = r.B;
            g += '<path d="M' + X(a.lng).toFixed(1) + ' ' + Y(a.lat).toFixed(1) + ' Q' +
                ((X(a.lng) + X(b2.lng)) / 2 + 34).toFixed(1) + ' ' + ((Y(a.lat) + Y(b2.lat)) / 2 - 34).toFixed(1) + ' ' +
                X(b2.lng).toFixed(1) + ' ' + Y(b2.lat).toFixed(1) + '" fill="none" stroke="var(--ink2)" stroke-width="3.4" stroke-dasharray="9 7"/>';
        }
        else {
            const p = r.plan.path;
            for (let i = 0; i < p.length - 1; i++) {
                const A = NODES.get(p[i]), B = NODES.get(p[i + 1]);
                const same = A.line === B.line;
                g += '<line x1="' + X(A.lng).toFixed(1) + '" y1="' + Y(A.lat).toFixed(1) + '" x2="' + X(B.lng).toFixed(1) + '" y2="' + Y(B.lat).toFixed(1) +
                    '" stroke="' + lc(A.line) + '" stroke-width="' + (same ? 6.4 : 3) + '" stroke-linecap="round"' + (same ? "" : ' stroke-dasharray="3 4"') + '/>';
            }
            for (const k of p) {
                const n = NODES.get(k);
                g += '<circle cx="' + X(n.lng).toFixed(1) + '" cy="' + Y(n.lat).toFixed(1) + '" r="3.6" fill="var(--surface)" stroke="' + lc(n.line) + '" stroke-width="2.2"/>';
            }
            const bd = r.plan.board, al = r.plan.alight;
            /* ขาเดิน/วิน จากประตูบ้านถึงชานชาลา วาดเป็นเส้นประ */
            const legs = [[r.A, bd], [r.B, al]];
            for (const [pt, st] of legs)
                if (pt && st)
                    g += '<line x1="' + X(pt.lng).toFixed(1) + '" y1="' + Y(pt.lat).toFixed(1) + '" x2="' + X(st.lng).toFixed(1) + '" y2="' + Y(st.lat).toFixed(1) +
                        '" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>';
            /* ป้ายชื่อสถานีต้องอยู่ในกรอบเสมอ ไม่งั้นชื่อยาว ๆ (โดยเฉพาะภาษาอังกฤษ) จะถูกตัดหายไปนอกภาพ
               คำนวณความกว้างโดยประมาณจากจำนวนตัวอักษร แล้วเลือกด้าน + ดันกลับเข้ากรอบ */
            const fit = (x, y, chars, dy) => {
                const CW = 0.64; /* ความกว้างเฉลี่ยต่อตัวอักษร เทียบกับขนาดฟอนต์ */
                const fs = Math.max(9, Math.min(FS, (W - 16) / (chars * CW)));
                const w2 = chars * fs * CW;
                let right = x < W * 0.58, tx = right ? x + 11 : x - 11;
                tx = right ? Math.max(6, Math.min(tx, W - 6 - w2)) : Math.min(W - 6, Math.max(tx, 6 + w2));
                return { tx, ty: Math.max(fs + 2, Math.min(y + dy, H - 5)), anchor: right ? "start" : "end", fs };
            };
            const mark = [[t("map.board"), bd], [t("map.alight"), al]];
            for (const s of r.plan.segs)
                if (s.t === "xfer")
                    mark.push([t("map.xfer"), NODES.get(key(s.from, s.at))]);
            for (const [kind, n] of mark) {
                if (!n)
                    continue;
                const x = X(n.lng), y = Y(n.lat), nm = sname(n.st);
                const f = fit(x, y, nm.length + kind.length * 0.85 + 1, 16);
                g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6.4" fill="var(--surface)" stroke="var(--accent)" stroke-width="3"/>';
                g += '<text x="' + f.tx.toFixed(1) + '" y="' + f.ty.toFixed(1) + '" text-anchor="' + f.anchor +
                    '" font-family="IBM Plex Mono, monospace" font-size="' + f.fs.toFixed(1) + '" font-weight="500" fill="var(--ink)">' +
                    nm + ' <tspan fill="var(--ink3)" font-size="' + (f.fs - 2).toFixed(1) + '">' + kind + '</tspan></text>';
            }
            const ends = [[r.A, bd, t("map.start")], [r.B, al, t("map.end")]];
            for (const [pt, st, lab] of ends) {
                const x = X(pt.lng), y = Y(pt.lat);
                g += '<rect x="' + (x - 4.5).toFixed(1) + '" y="' + (y - 4.5).toFixed(1) + '" width="9" height="9" fill="var(--accent)" transform="rotate(45 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
                const near2 = st && hav(pt.lat, pt.lng, st.lat, st.lng) <= 0.4;
                const txt = near2 ? lab : lab + " " + sname(pt.name);
                const f = fit(x, y, txt.length, -9);
                g += '<text x="' + f.tx.toFixed(1) + '" y="' + f.ty.toFixed(1) + '" text-anchor="' + f.anchor +
                    '" font-family="Anuphan, sans-serif" font-size="' + f.fs.toFixed(1) + '" font-weight="600" fill="var(--accent2)">' +
                    txt + '</text>';
            }
        }
    }
    g += '</svg>';
    $("#mapHost").innerHTML = g;
    $("#mapHost").querySelectorAll(".stdot").forEach(c => {
        c.style.cursor = "pointer";
        c.addEventListener("click", () => {
            S.dest = c.getAttribute("data-st") || "";
            $("#dest").value = sname(S.dest);
            save();
            draw();
        });
    });
}
/* การ์ดแผนที่มีสองมุมมอง: แผนที่จริงที่เลื่อน/ซูมได้ (Leaflet) กับผังเส้นทาง SVG แบบเดิม
   ถ้าโหลด Leaflet ไม่ได้ (ออฟไลน์ / CDN ถูกบล็อก) จะซ่อนแท็บแล้วใช้ผังเส้นทางอย่างเดียว */
function renderMapCard(r) {
    const can = liveOK(), live = can && S.mapView !== "plan";
    document.querySelectorAll("[data-mapv]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.mapv === "live") === live)));
    $(".maptabs").classList.toggle("hide", !can);
    $("#mapLive").classList.toggle("hide", !live);
    $("#mapLive").classList.toggle("dark", isDark());
    $("#mapHost").classList.toggle("hide", live);
    $("#mapHint").textContent = !can ? t("map.noLive") : (live ? t("map.hintLive") : t("map.hint"));
    const gm = $("#gmLink");
    gm.href = googleMapsUrl(r);
    gm.classList.toggle("hide", !r || !!r.err);
    if (live) {
        liveTheme();
        liveDraw(r);
        liveResize();
    }
    else
        renderMap(r);
    $("#mapLegend").innerHTML = Object.keys(LINES).map(lid => '<span><i style="background:' + lc(lid) + '"></i>' + lname(lid) + '</span>').join("");
}
/* ---------- สภาพอากาศ ---------- */
function dayLabel(iso) {
    const today = wxToday();
    if (iso === today)
        return t("wx.today");
    const tm = new Date(today + "T00:00");
    tm.setDate(tm.getDate() + 1);
    if (iso === wxISO(tm))
        return t("wx.tomorrow");
    const d = new Date(iso + "T00:00");
    return t("dow." + d.getDay()) + " " + d.getDate() + "/" + (d.getMonth() + 1);
}
function pickDay(iso) {
    S.wxDay = iso;
    const g = new Date(iso + "T00:00").getDay();
    S.dayType = (g === 0 || g === 6) ? "we" : "wd";
    $("#tripDate").value = iso;
    save();
    draw();
    if (S.tab === "day")
        drawDay();
}
/* สถานี/สถานที่ในข้อมูลของเราที่ใกล้พิกัดนี้ที่สุด
   ใช้ตอนกด "ใช้ตำแหน่งของฉัน" เพื่อตั้งจุดเริ่มต้น และใช้เป็นชื่อพื้นที่สำรองถ้าอ่านชื่อเขตไม่ได้ */
function nearestPlace(lat, lng) {
    let best = "", bd = 1e9;
    const test = (nm, la, lo) => { const d = hav(lat, lng, la, lo); if (d < bd) {
        bd = d;
        best = nm;
    } };
    for (const p of PLACES)
        test(p[0], p[1], p[2]);
    for (const n of NODES.values())
        test(n.st, n.lat, n.lng);
    return { name: best, km: bd };
}
function nowProb() {
    const d = WX && WX.byDate[wxToday()], e = d && d.hours[wxNowHour()];
    return e ? e.prob : (d ? d.pmax : 0);
}
function renderWxPlace() {
    const host = $("#wxPlace");
    host.innerHTML = "";
    const A = resolve(S.origin);
    const bits = [];
    if (A)
        bits.push('<b>' + sname(A.name) + '</b>');
    else if (WX)
        bits.push('<b>' + t("wx.near", { p: sname(nearestPlace(WX.lat, WX.lng).name) }) + '</b>');
    if (WX_PLACE)
        bits.push(WX_PLACE);
    host.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
        '<path d="M8 1.6c-2.4 0-4.3 1.9-4.3 4.3 0 3.2 4.3 8.5 4.3 8.5s4.3-5.3 4.3-8.5c0-2.4-1.9-4.3-4.3-4.3z" ' +
        'fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="5.9" r="1.6" fill="currentColor"/>' +
        '</svg><span>' + bits.join(" · ") + '</span>';
}
/* °C → หน่วยที่ผู้ใช้เลือก ใช้เฉพาะตอนวาดหน้าจอ ค่าที่เก็บและที่เอนจินคิดยังเป็นเซลเซียสทั้งหมด
   (ถ้าแปลงตั้งแต่ต้นทาง เกณฑ์ฝน/ความร้อนในเอนจินจะเพี้ยนทันที) */
const degVal = (c) => S.wxUnit === "f" ? c * 9 / 5 + 32 : c;
const deg = (c) => Math.round(degVal(c)) + "°";
function renderWxNow() {
    const host = $("#wxNow");
    if (!WX || !WX.now || WX.now.temp == null) {
        host.classList.add("hide");
        host.innerHTML = "";
        return;
    }
    host.classList.remove("hide");
    const n = WX.now;
    host.innerHTML =
        wxIcon(n.code ?? 0, 54) +
            '<span class="wxnow-t mono">' + Math.round(degVal(n.temp ?? 0)) + '</span>' +
            '<span class="wxunit">' +
            '<button type="button" data-unit="c" aria-pressed="' + (S.wxUnit === "c") + '">°C</button>' +
            '<span class="bar">|</span>' +
            '<button type="button" data-unit="f" aria-pressed="' + (S.wxUnit === "f") + '">°F</button>' +
            '</span>' +
            '<span class="wxnow-meta">' +
            '<span>' + t("wx.nowRain", { p: Math.round(nowProb()) }) + '</span>' +
            '<span>' + t("wx.nowRh", { p: Math.round(n.rh ?? 0) }) + '</span>' +
            '<span>' + t("wx.nowWind", { v: Math.round(n.wind ?? 0) }) + '</span>' +
            '</span>';
    host.querySelectorAll("[data-unit]").forEach(b => {
        b.onclick = () => { S.wxUnit = b.dataset.unit; save(); renderWeather(); };
    });
    /* ฝั่งขวาของหัวการ์ด: วันเวลาที่อ้างอิง และสภาพอากาศเป็นคำพูด */
    /* WX.now คือสภาพอากาศ ณ ขณะนี้เสมอ ไม่เกี่ยวกับวันที่ผู้ใช้เลือกดูพยากรณ์
       จึงต้องกำกับด้วยเวลาปัจจุบันจริง ไม่ใช่ช่วงเวลาเดินทางที่คำนวณได้ (WXNOW) ซึ่งเป็นคนละเรื่อง */
    $("#wxWhen").textContent = dayLabel(wxToday()) + " " + hhmm(nowMin());
    $("#wxCond").textContent = t("wx.c." + wxGroup(n.code ?? 0));
}
/* กราฟรายชั่วโมง 24 ชั่วโมงข้างหน้า — สลับดูอุณหภูมิ / โอกาสฝน / ลม ได้เหมือนหน้าพยากรณ์ทั่วไป */
function renderWxChart() {
    const host = $("#wxChart");
    host.innerHTML = "";
    document.querySelectorAll("[data-wxm]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.wxm === S.wxTab)));
    if (!WX)
        return;
    const key = { temp: "temp", rain: "prob", wind: "wind" }[S.wxTab];
    const ser = wxSeries(S.wxDay || wxToday(), key, 24).filter((p) => p.v != null);
    if (ser.length < 2)
        return;
    const W = Math.max(230, Math.round(host.clientWidth || 280)), H = 126;
    const PL = 8, PR = 8, PT = 24, PB = 22;
    const vals = ser.map(p => S.wxTab === "temp" ? degVal(p.v) : p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (S.wxTab === "rain") {
        lo = 0;
        hi = 100;
    }
    else {
        const pad = Math.max(1, (hi - lo) * 0.25);
        lo -= pad;
        hi += pad;
    }
    if (hi - lo < 0.5)
        hi = lo + 1;
    const X = (i) => PL + (W - PL - PR) * (i / (ser.length - 1));
    const Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
    const unit = t("wx.u." + S.wxTab);
    const stroke = S.wxTab === "temp" ? "var(--wx-sun)" : "var(--wx-rain)";
    const every = Math.max(3, Math.round(ser.length / 6));
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + t("wx.chart") + '">';
    /* หน่วยบอกไว้มุมบนซ้ายครั้งเดียว ไม่ต้องต่อท้ายทุกจุด (โดยเฉพาะ "กม./ชม." ที่ยาวเกินไป) */
    g += '<text x="0" y="10" font-size="11" fill="var(--ink3)">' + t("wx.uf." + S.wxTab) + '</text>';
    if (S.wxTab === "rain") {
        const bw = Math.max(3, (W - PL - PR) / ser.length - 2.5);
        ser.forEach((p, i) => {
            const y = Y(p.v), h2 = Math.max(1.5, H - PB - y);
            g += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
                '" height="' + h2.toFixed(1) + '" rx="2" fill="' + stroke + '" opacity="' + (p.v >= 60 ? ".95" : ".45") + '"/>';
        });
    }
    else {
        const line = ser.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(S.wxTab === "temp" ? degVal(p.v) : p.v).toFixed(1)).join(" ");
        g += '<path d="' + line + " L" + X(ser.length - 1).toFixed(1) + " " + (H - PB) + " L" + X(0).toFixed(1) + " " + (H - PB) +
            ' Z" fill="' + stroke + '" opacity=".13"/>';
        g += '<path d="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    ser.forEach((p, i) => {
        if (i % every)
            return;
        g += '<text x="' + X(i).toFixed(1) + '" y="' + Math.max(14, Y(p.v) - 8).toFixed(1) +
            '" text-anchor="middle" font-size="12" font-family="IBM Plex Mono, monospace" fill="var(--ink2)">' +
            Math.round(S.wxTab === "temp" ? degVal(p.v) : p.v) + unit + '</text>';
        g += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="var(--ink3)">' +
            String(p.h).padStart(2, "0") + ':00</text>';
    });
    g += '</svg>';
    host.innerHTML = g;
}
function renderWeather() {
    document.querySelectorAll("[data-wx]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.wx === S.wxMode)));
    const host = $("#wxDays"), note = $("#wxNote");
    host.innerHTML = "";
    renderWxPlace();
    renderWxNow();
    renderWxChart();
    if (WX_STATE === "loading" || WX_STATE === "idle") {
        host.classList.add("hide");
        note.textContent = t("wx.loading");
        return;
    }
    if (WX_STATE === "error" || !WX) {
        host.classList.add("hide");
        note.textContent = t("wx.error");
        return;
    }
    host.classList.remove("hide");
    const sel = S.wxDay || wxToday();
    for (const iso of WX.dates) {
        const d = WX.byDate[iso], dt = new Date(iso + "T00:00");
        /* ช่องแคบ ๆ ใส่คำว่า "วันนี้" ไม่พอ ใช้ตัวย่อวันเหมือนกันหมดแล้วทำวันนี้เป็นสีเน้นแทน */
        const b = el("button", "wxday" + (iso === wxToday() ? " today" : ""));
        b.type = "button";
        b.setAttribute("aria-pressed", String(iso === sel));
        b.title = dayLabel(iso) + " · " + t("wx.c." + wxGroup(d.code)) + " · " + t("wx.nowRain", { p: Math.round(d.pmax) });
        b.innerHTML = '<span class="wd">' + t("dow." + dt.getDay()) + '</span>' +
            wxIcon(d.code, 26) +
            '<span class="tt"><b>' + deg(d.tmax) + '</b><i>' + deg(d.tmin) + '</i></span>';
        b.onclick = () => pickDay(iso);
        host.appendChild(b);
    }
    if (S.wxMode !== "auto") {
        note.textContent = t("wx.manual");
        return;
    }
    if (WXNOW) {
        const key = WXNOW.whole ? "wx.sumDay" : "wx.sum";
        note.textContent = t(key, { day: dayLabel(sel), from: hhmm(WXNOW.fromMin ?? 0), to: hhmm(WXNOW.toMin ?? 0),
            p: Math.round(WXNOW.prob), mm: WXNOW.mm.toFixed(1) }) + " — " + t(RAIN ? "wx.isRain" : "wx.noRain");
    }
    else
        note.textContent = t("wx.error");
}
/* ดึงพยากรณ์ของ "จุดเริ่มต้น" — ย้ายบ้านข้ามจังหวัดแล้วฝนคนละเรื่องกัน */
function refreshWeather(force) {
    const A = resolve(S.origin);
    const lat = A ? A.lat : 13.7563, lng = A ? A.lng : 100.5018; /* ไม่รู้จุดเริ่มต้น ใช้กลางกรุงเทพฯ */
    if (!force && lastWxAt && Math.abs(lastWxAt[0] - lat) < 0.05 && Math.abs(lastWxAt[1] - lng) < 0.05
        && WX_STATE === "ok")
        return;
    lastWxAt = [lat, lng];
    WX_PLACE = null;
    loadForecast(lat, lng, () => { draw(); if (S.tab === "day")
        drawDay(); }, PREFS.lang);
    wxReverseGeocode(lat, lng, PREFS.lang).then(p => { if (p) {
        WX_PLACE = p;
        renderWxPlace();
    } });
}
function useMyLocation() {
    const note = $("#wxNote");
    if (!navigator.geolocation) {
        note.textContent = t("wx.gpsNo");
        return;
    }
    note.textContent = t("wx.gpsWait");
    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        /* ตั้งจุดเริ่มต้นเป็นสถานี/สถานที่ที่ใกล้ที่สุด เส้นทางกับพยากรณ์จะได้ตรงกัน */
        const np = nearestPlace(lat, lng);
        S.origin = np.name;
        $("#origin").value = sname(np.name);
        save();
        lastWxAt = [lat, lng];
        WX_PLACE = null;
        loadForecast(lat, lng, () => {
            draw();
            if (S.tab === "day")
                drawDay();
            $("#wxNote").textContent = t("wx.gpsSet", { p: sname(np.name) });
        }, PREFS.lang);
        wxReverseGeocode(lat, lng, PREFS.lang).then(p => { if (p) {
            WX_PLACE = p;
            renderWxPlace();
        } });
    }, () => { note.textContent = t("wx.gpsFail"); }, { timeout: 9000, maximumAge: 300000 });
}
/* ---------- day plan ---------- */
function renderDayRows() {
    const host = $("#dpRows");
    host.innerHTML = "";
    S.day.forEach((d, i) => {
        const row = el("div", "dprow");
        const l1 = el("label", "f", t("day.dest", { n: i + 1 }));
        const p = el("input");
        p.type = "text";
        p.value = sname(d.p);
        p.id = "dp-p-" + i;
        p.oninput = () => { d.p = p.value; save(); drawDay(); };
        l1.appendChild(p);
        attachAC(p, sel => { d.p = sel.name; save(); drawDay(); });
        const l2 = el("label", "f", t("day.arriveAt"));
        const tt = el("input");
        tt.type = "time";
        tt.value = hhmm(d.t);
        tt.id = "dp-t-" + i;
        tt.oninput = () => { const [a, b] = tt.value.split(":").map(Number); if (!isNaN(a)) {
            d.t = a * 60 + b;
            save();
            drawDay();
        } };
        l2.appendChild(tt);
        const l3 = el("label", "f", t("day.stay"));
        const s = el("input");
        s.type = "number";
        s.min = "0";
        s.step = "15";
        s.value = String(d.stay);
        s.id = "dp-s-" + i;
        s.oninput = () => { d.stay = +s.value || 0; save(); drawDay(); };
        l3.appendChild(s);
        const rm = el("button", "rm", "×");
        rm.type = "button";
        rm.title = t("prep.remove");
        rm.onclick = () => { S.day.splice(i, 1); save(); renderDayRows(); drawDay(); };
        row.append(l1, l2, l3, rm);
        host.appendChild(row);
    });
}
function drawDay() {
    const host = $("#chain");
    host.innerHTML = "";
    const stops = S.day.slice().sort((a, b) => a.t - b.t);
    if (!stops.length) {
        host.appendChild(el("li", null, t("day.none")));
        return;
    }
    let fromName = S.origin;
    let prevEnd = null;
    stops.forEach((d, i) => {
        const A = resolve(fromName), B = resolve(d.p);
        if (!A || !B) {
            const li = el("li");
            const what = el("div", "what");
            what.appendChild(el("div", "h", t("day.notfound", { p: !A ? fromName : d.p })));
            li.append(el("div", "when mono", "—"), what);
            host.appendChild(li);
            fromName = d.p;
            return;
        }
        const target = d.t - S.cushion;
        const b = band(target, S.dayType);
        /* แต่ละนัดอยู่คนละช่วงเวลาของวัน ฝนตอนบ่ายจึงไม่ควรไปเผื่อเวลาให้นัดตอนเช้า */
        const rn = S.wxMode === "auto"
            ? wxIsRain(wxWindow(S.wxDay || wxToday(), Math.max(0, target - 60), target))
            : RAIN;
        const p = ({ transit: transitPlan, mixed: mixedPlan, drive: drivePlan })[S.mode](A, B, b, rn) || drivePlan(A, B, b, rn);
        const travel = p.mean + Z[S.conf] * p.sd;
        const dep = target - travel;
        const li = el("li");
        li.append(el("div", "when mono", hhmm(dep) + " → " + hhmm(d.t)));
        const what = el("div", "what");
        what.appendChild(el("div", "h", i === 0
            ? t("day.fromHome", { b: sname(B.name) })
            : t("day.fromPlace", { a: sname(fromName), b: sname(B.name) })));
        const how = p.kind === "drive"
            ? t("day.howDrive", { km: Math.round(p.km) })
            : t("day.howTransit", { n: p.xfers,
                tags: [...new Set(p.segs.filter(s => s.t === "ride").map(s => ltag(s.line)))].join(" + ") });
        what.appendChild(el("div", "d", t("day.detail", { t: hhmm(dep), n: Math.round(travel), how, f: p.fare })));
        if (i === 0) {
            what.appendChild(el("div", "d", t("day.prepLine", { t: hhmm(dep - prepTotal()), n: prepTotal() })));
        }
        else if (prevEnd != null) {
            const slack = dep - prevEnd;
            const box = el("div", slack < 0 ? "conflict" : "okline");
            box.textContent = slack < 0
                ? t("day.conflict", { n: Math.round(-slack), t1: hhmm(dep), t2: hhmm(prevEnd) })
                : t("day.slack", { n: Math.round(slack) });
            what.appendChild(box);
        }
        li.appendChild(what);
        host.appendChild(li);
        prevEnd = d.t + d.stay;
        fromName = d.p;
    });
}
/* เดาว่าผู้ใช้น่าจะหมายถึงที่ไหน แล้วให้กดเลือกได้เลย ดีกว่าบอกแค่ว่า "ไม่พบ" */
function renderErrHints(box, field, q) {
    const put = (list) => {
        if (!list.length) {
            box.appendChild(el("div", "errhint", t("err.tryTyping")));
            return;
        }
        const row = el("div", "errhint");
        row.appendChild(el("span", null, t("err.didYouMean")));
        list.slice(0, 4).forEach(p => {
            const b = el("button", "errchip", sname(p.name));
            b.type = "button";
            b.onclick = () => {
                if (p.kind === "geo")
                    rememberPlace({ name: p.name, lat: p.lat, lng: p.lng, detail: p.detail });
                if (field === "origin") {
                    S.origin = p.name;
                    $("#origin").value = sname(p.name);
                    refreshWeather(true);
                }
                else {
                    S.dest = p.name;
                    $("#dest").value = sname(p.name);
                }
                save();
                draw();
                drawDay();
            };
            row.appendChild(b);
        });
        box.appendChild(row);
    };
    const local = searchLocal(q);
    put(local);
    if (q.trim().length >= 2) {
        const busy = el("div", "errhint busy", t("err.searching"));
        box.appendChild(busy);
        searchOnline(q).then(res => {
            busy.remove();
            const cur = compute();
            if (!cur.err || cur.errQ !== q)
                return; /* ผู้ใช้แก้ไปแล้ว อย่าไปเขียนทับ */
            const seen = new Set(local.map(x => x.name));
            const merged = local.concat(res.filter(r => !seen.has(r.name)));
            if (!merged.length)
                return;
            box.innerHTML = "";
            box.appendChild(el("div", null, cur.err));
            put(merged);
        }).catch(() => busy.remove());
    }
}
/* ---------- top-level draw ---------- */
let LAST = null;
/* โหมด "ออกเดินทาง": ผู้ใช้บอกเวลาที่จะออกจากบ้าน เราต้องหาว่าเวลานัดที่ทำให้
   เอนจินตอบเวลาออกเท่านั้นพอดีคือกี่โมง — เอนจินคิดถอยหลังอย่างเดียว จึงวนปรับ 4 รอบ
   (ลู่เข้าเร็วมากเพราะเวลาเดินทางแทบไม่เปลี่ยนเมื่อขยับเวลานัดไปไม่กี่นาที) */
function solveDepart() {
    for (let i = 0; i < 4; i++) {
        const probe = compute();
        if (!planOk(probe))
            return;
        const diff = S.departAt - probe.leave;
        if (Math.abs(diff) < 0.5)
            return;
        S.arrive = Math.min(1439, Math.max(0, Math.round(S.arrive + diff)));
    }
}
function syncWhenUI() {
    document.querySelectorAll("[data-when]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.when === S.when)));
    $("#timeLabel").textContent = t(S.when === "depart" ? "f.departAt" : "f.arriveBy");
}
function draw() {
    if (S.when === "depart")
        solveDepart();
    syncWeather();
    renderWeather();
    const r = compute();
    LAST = r;
    const err = $("#errBox");
    if (!planOk(r)) {
        err.classList.remove("hide");
        err.innerHTML = "";
        err.appendChild(el("div", null, r.err));
        if (r.errField)
            renderErrHints(err, r.errField, r.errQ || "");
        const retry = el("button", "ghost sm", t("err.retry"));
        retry.type = "button";
        retry.onclick = () => { const f = $("#" + (r.errField || "origin")); f.focus(); f.select(); };
        err.appendChild(retry);
        $("#tPrep").textContent = $("#tLeave").textContent = $("#tArrive").textContent = "—";
        $("#sPrep").textContent = $("#sLeave").textContent = $("#sArrive").textContent = "—";
        $("#vbar").innerHTML = "";
        $("#sumBar").innerHTML = "";
        $("#timeline").innerHTML = "";
        $("#breakdown").innerHTML = "";
        $("#tips").innerHTML = "";
        $("#modes").innerHTML = "";
        renderMapCard(null);
        renderLearn(null);
        return;
    }
    err.classList.add("hide");
    $("#tPrep").textContent = hhmm(r.prepStart);
    $("#sPrep").textContent = t("v.prepSub", { n: r.prep });
    $("#tLeave").textContent = hhmm(r.leave);
    $("#sLeave").textContent = t("v.leaveSub", { p: sname(r.A.name) });
    $("#tArrive").textContent = hhmm(r.target);
    $("#sArrive").textContent = t("v.arriveSub", { n: S.cushion, p: sname(r.B.name) });
    /* แถบสรุป: สี่ค่าที่ผู้ใช้อยากรู้ต่อจากเวลา — นานไหม แพงไหม ต่อรถกี่ครั้ง เดินเยอะไหม */
    const sb = $("#sumBar");
    sb.innerHTML = "";
    const sum = (icon, txt) => {
        const c = el("span", "sitem");
        c.appendChild(iconEl(icon));
        c.appendChild(el("span", null, txt));
        sb.appendChild(c);
    };
    sum("clock", t("sum.dur", { n: Math.round(r.plan.mean) }));
    sum("wallet", t("sum.fare", { n: r.plan.fare }));
    if (r.plan.kind === "drive")
        sum("car", t("sum.km", { n: Math.round(r.plan.km) }));
    else {
        sum("swap", t("sum.xfers", { n: r.plan.xfers }));
        sum("walk", t("sum.walk", { n: Math.round(r.plan.walk) }));
    }
    const vb = $("#vbar");
    vb.innerHTML = "";
    const add = (html, cls) => { const p = el("span", "pill" + (cls ? " " + cls : "")); p.innerHTML = html; vb.appendChild(p); };
    add(t("pill.travel", { n: Math.round(r.plan.mean) }));
    add(t("pill.buffer", { n: Math.round(r.buffer) }), r.buffer > 20 ? "warn" : "good");
    if (r.plan.kind !== "drive") {
        add(t("pill.xfers", { n: r.plan.xfers }));
        add(t("pill.walk", { n: Math.round(r.plan.walk) }));
    }
    else
        add(t("pill.km", { n: Math.round(r.plan.km) }));
    add(t("pill.fare", { n: r.plan.fare }));
    add(t("band." + r.b), r.b === 0 ? "warn" : "");
    if (RAIN)
        add(t("pill.rain"), "warn");
    if (r.svcClosed)
        add(t("pill.closed"), "warn");
    if (r.fallback)
        add(t("pill.fallback"), "warn");
    renderModes(r);
    renderTimeline(r);
    renderBreakdown(r);
    renderTips(r);
    renderMapCard(r);
    renderLearn(r);
    histTouch(r);
    renderRecent();
}
/* =======================================================================
   7. ธีม / ภาษา / บัญชี
   ======================================================================= */
function buildSwatches() {
    const host = $("#swatches");
    host.innerHTML = "";
    for (const [k, a] of Object.entries(ACCENTS)) {
        const b = el("button", "sw");
        b.type = "button";
        b.style.background = (isDark() ? a.d : a.l)[0];
        b.title = a[PREFS.lang] || a.th;
        b.setAttribute("aria-label", a[PREFS.lang] || a.th);
        b.setAttribute("aria-pressed", String(PREFS.accent === k));
        b.onclick = () => {
            PREFS.accent = k;
            savePrefs();
            applyPrefs();
            buildSwatches();
            draw();
            if (S.tab === "day")
                drawDay();
        };
        host.appendChild(b);
    }
}
function syncThemeUI() {
    document.querySelectorAll("#themeModes [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === PREFS.theme)));
    buildSwatches();
}
function syncLangUI() {
    $("#langCur").textContent = PREFS.lang === "th" ? "ไทย" : "English";
    document.querySelectorAll("#langPop [data-lang]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.lang === PREFS.lang)));
}
function renderAuth() {
    const btn = $("#authBtn");
    btn.innerHTML = "";
    if (USER) {
        const initial = (USER.name || "?").trim().charAt(0).toUpperCase();
        btn.className = "acctbtn";
        btn.append(el("span", "av", initial), el("span", "nm", USER.name));
        $("#acctAv").textContent = initial;
        $("#acctName").textContent = USER.name;
        $("#acctMail").textContent = USER.email;
        $("#acctProv").textContent = t("auth.signedInWith", { p: PROVIDERS[USER.provider].name }) +
            (USER.demo ? " · " + t("auth.demoBadge") : "");
    }
    else {
        btn.className = "ghost solid";
        btn.textContent = t("btn.signin");
    }
}
function closePops(except) {
    for (const id of ["langPop", "themePop", "acctPop"])
        if (id !== except)
            $("#" + id).classList.add("hide");
    for (const id of ["langBtn", "themeBtn", "authBtn"])
        $("#" + id).setAttribute("aria-expanded", "false");
}
function togglePop(popId, btnId) {
    const pop = $("#" + popId), willOpen = pop.classList.contains("hide");
    closePops(willOpen ? popId : null);
    pop.classList.toggle("hide", !willOpen);
    $("#" + btnId).setAttribute("aria-expanded", String(willOpen));
}
/* หน้าเข้าสู่ระบบเป็นกล่องซ้อนที่ปิดได้เสมอ ไม่ใช่ด่านบังคับ — เปิดเว็บหรือรีเฟรชแล้ว
   ต้องยืนอยู่หน้าหลักเหมือนเดิม เพราะทุกฟีเจอร์ใช้ได้ครบโดยไม่ต้องมีบัญชี
   บัญชีมีไว้แค่แยกถังประวัติการเดินทางเท่านั้น จึงไม่มีเหตุให้ขวางทางผู้ใช้ก่อน */
function openAuth(open) {
    $("#loginView").classList.toggle("hide", !open);
    /* ล็อกไม่ให้หน้าข้างหลังเลื่อนตามขณะหน้าล็อกอินเปิดอยู่ */
    document.body.style.overflow = open ? "hidden" : "";
    if (open)
        $("#authClose").focus();
}
/* วาดข้อความทั้งหน้าใหม่หลังเปลี่ยนภาษา */
function relabel() {
    applyStaticI18n();
    /* เก็บชื่อไทยไว้เป็นค่าจริงใน state แล้วแสดงชื่อตามภาษาที่เลือก */
    const A = resolve(S.origin);
    if (A)
        S.origin = A.name;
    const B = resolve(S.dest);
    if (B)
        S.dest = B.name;
    S.day.forEach(d => { const p = resolve(d.p); if (p)
        d.p = p.name; });
    save();
    $("#origin").value = sname(S.origin);
    $("#dest").value = sname(S.dest);
    document.querySelectorAll(".oauth [data-provider-label]").forEach(s => s.textContent = t("auth.with", { p: s.getAttribute("data-provider-label") || "" }));
    syncLangUI();
    syncThemeUI();
    renderAuth();
    renderHistory();
    refreshWeather(true);
    renderPrep();
    renderDayRows();
    draw();
    if (S.tab === "day")
        drawDay();
}
/* =======================================================================
   7.5 ประวัติการเดินทาง
   บันทึกให้เองทุกครั้งที่คำนวณสำเร็จ ไม่มีปุ่ม "บันทึก" ให้ผู้ใช้ต้องจำว่าต้องกด
   ตัวเก็บจริงอยู่ใน js/history.js ไฟล์นี้ทำแค่ส่วนที่เห็นบนจอ
   ======================================================================= */
let HIST_CLAIMED = 0; /* จำนวนทริปที่ยกจากโหมดไม่ล็อกอินเข้าบัญชี ไว้บอกผู้ใช้ครั้งเดียว */
/* ย่อผลการคำนวณให้เหลือเท่าที่ต้องเก็บ ไม่เก็บทั้งก้อนเพราะ localStorage มีเพดาน */
function histSnapshot(r) {
    const lines = [];
    if (r.plan.kind !== "drive")
        for (const s of r.plan.segs)
            if (s.t === "ride" && !lines.includes(s.line))
                lines.push(s.line);
    return {
        ts: Date.now(), date: S.wxDay || wxToday(),
        from: r.A.name, to: r.B.name, /* เก็บชื่อไทยซึ่งเป็นคีย์จริง แล้วค่อยแปลตอนแสดง */
        arrive: Math.round(r.target), leave: Math.round(r.leave), prepStart: Math.round(r.prepStart),
        travel: Math.round(r.travel), buffer: Math.round(r.buffer),
        mode: r.mode, kind: r.plan.kind, lines,
        xfers: r.plan.xfers || 0, walk: Math.round(r.plan.walk || 0),
        fare: r.plan.fare || 0, km: Math.round(r.plan.km || 0),
        rain: RAIN, wxCode: WXNOW ? WXNOW.code : null
    };
}
/* draw() ถูกเรียกทุกตัวอักษรที่พิมพ์ จึงต้องหน่วงไว้ ไม่งั้นเขียน localStorage รัวมาก */
let histT;
function histTouch(r) {
    clearTimeout(histT);
    histT = setTimeout(() => {
        histAdd(histSnapshot(r));
        if (S.tab === "hist")
            renderHistory();
    }, 2200);
}
function histDayLabel(iso) {
    const y = new Date(wxToday() + "T00:00");
    y.setDate(y.getDate() - 1);
    if (iso === wxISO(y))
        return t("hist.yesterday");
    return dayLabel(iso);
}
/* "245 นาที" อ่านยากบนการ์ดสรุป เกินชั่วโมงแล้วตัดเป็น ชม. */
function histDur(m) {
    m = Math.round(m || 0);
    return m >= 60 ? t("unit.hm", { h: Math.floor(m / 60), m: m % 60 }) : t("unit.min", { n: m });
}
/* กดทริปเก่าแล้วเด้งกลับไปแท็บวางแผนพร้อมค่าเดิม */
function histLoadInto(e) {
    S.origin = e.from;
    S.dest = e.to;
    S.arrive = e.arrive;
    S.mode = e.mode;
    $("#origin").value = sname(S.origin);
    $("#dest").value = sname(S.dest);
    $("#arrive").value = hhmm(S.arrive);
    S.tab = "one";
    save();
    syncTabs();
    draw();
    refreshWeather(true);
    scrollTo({ top: 0, behavior: "smooth" });
}
/* ประวัติล่าสุดไม่กี่รายการข้างแผนที่ — กดแล้วเติมต้นทาง/ปลายทางเดิมกลับเข้าฟอร์มแล้วคำนวณใหม่
   ของเต็ม (สถิติ ผลจริง นำเข้า/ส่งออก) ยังอยู่ในแท็บประวัติเหมือนเดิม ไม่ได้ย้ายมา */
const RECENT_MAX = 4;
function renderRecent() {
    const card = $("#recentCard"), host = $("#histRecent");
    const list = histList().slice(0, RECENT_MAX);
    card.classList.toggle("hide", !list.length);
    host.innerHTML = "";
    for (const h of list) {
        const b = el("button", "ritem");
        b.type = "button";
        b.append(el("span", "rr", sname(h.from) + "  →  " + sname(h.to)), el("span", "rm", t("recent.meta", { n: Math.round(h.travel), f: h.fare })), el("span", "rt mono", hhmm(h.leave)));
        b.title = t("recent.again");
        b.onclick = () => histLoadInto(h);
        host.appendChild(b);
    }
}
function renderHistory() {
    const list = histList(), st = histStats(list);
    /* ---- ประวัติของใคร ---- */
    const who = $("#histWho");
    who.innerHTML = "";
    if (USER) {
        who.appendChild(el("span", "who", t("hist.for", { n: USER.name })));
        if (USER.demo)
            who.appendChild(el("span", "tagx", t("auth.demoBadge")));
        if (HIST_CLAIMED)
            who.appendChild(el("span", "tagx", t("auth.claimed", { n: HIST_CLAIMED })));
    }
    else {
        who.appendChild(el("span", "tagx", t("hist.guestBucket")));
    }
    /* ---- ตัวเลขสรุป ---- */
    const kp = $("#histKpis");
    kp.innerHTML = "";
    const kpi = (k, v, s, hero, plain) => {
        const c = el("div", "hkpi" + (hero ? " hero" : ""));
        /* plain = ค่าที่มีตัวหนังสือไทยปนอยู่ ต้องไม่ใช้ฟอนต์ mono
           เพราะ IBM Plex Mono ไม่มีตัวไทย แล้วเบราว์เซอร์จะสลับฟอนต์กลางคำจนช่องไฟเพี้ยน */
        c.append(el("span", "k", t(k)), el("span", "v" + (plain ? " txt" : " mono"), v), el("span", "s", s || ""));
        kp.appendChild(c);
    };
    const top1 = st.top[0];
    kpi("hist.k.trips", String(st.trips), st.rainy ? t("hist.rainyN", { n: st.rainy }) : "", true);
    kpi("hist.k.places", String(st.places), top1 ? sname(top1[0]) : "");
    kpi("hist.k.avg", st.avg ? String(st.avg) : "—", st.avg ? t("unit.minShort") : "");
    kpi("hist.k.total", histDur(st.minutes), "", false, true);
    /* ---- ปลายทางที่ไปบ่อย ---- ซ่อนถ้ามีที่เดียว เพราะซ้ำกับการ์ดด้านบน */
    const tc = $("#histTopCard"), tp = $("#histTop");
    tp.innerHTML = "";
    tc.classList.toggle("hide", st.top.length < 2);
    for (const [name, n] of st.top.slice(0, 8)) {
        const b = el("button", "hchip");
        b.type = "button";
        b.append(el("span", null, sname(name)), el("b", null, String(n)));
        b.onclick = () => {
            S.dest = name;
            $("#dest").value = sname(name);
            S.tab = "one";
            save();
            syncTabs();
            draw();
            scrollTo({ top: 0, behavior: "smooth" });
        };
        tp.appendChild(b);
    }
    /* ---- รายการย้อนหลัง ---- */
    const host = $("#histList");
    host.innerHTML = "";
    $("#histClearBtn").classList.toggle("hide", !list.length);
    if (!list.length) {
        const e = el("div", "hempty");
        e.append(el("b", null, t("hist.empty")), el("p", null, t("hist.emptySub")));
        host.appendChild(e);
        return;
    }
    let curDate = null;
    for (const h of list) {
        if (h.date !== curDate) {
            curDate = h.date;
            host.appendChild(el("div", "hday", histDayLabel(curDate)));
        }
        const row = el("div", "hrow");
        row.title = t("hist.leaveAt", { t: hhmm(h.leave) });
        const tm = el("div", "ht mono", hhmm(h.leave));
        tm.appendChild(el("span", "htsub", "→ " + hhmm(h.arrive)));
        const rt = el("div", "hroute");
        const pls = el("div", "hplaces");
        pls.append(el("span", "pl", sname(h.from)), el("span", "ar", "→"), el("span", "pl", sname(h.to)));
        rt.appendChild(pls);
        const meta = el("div", "hmeta");
        for (const lid of (h.lines || []))
            if (LINES[lid])
                meta.appendChild(tagEl(lid));
        if (h.kind === "drive")
            meta.appendChild(el("span", null, t("mode.drive")));
        else if (!(h.lines || []).length)
            meta.appendChild(el("span", null, t("hist.walkOnly")));
        if (h.fare)
            meta.appendChild(el("span", null, t("hist.fare", { n: h.fare })));
        if (h.xfers)
            meta.appendChild(el("span", null, t("pill.xfersPlain", { n: h.xfers })));
        if (h.rain)
            meta.appendChild(el("span", "rain", t("hist.rain")));
        if ((h.n || 1) > 1)
            meta.appendChild(el("span", "rep", t("hist.times", { n: h.n })));
        rt.appendChild(meta);
        /* ผลจริง — ระบบมองไม่เห็นว่าผู้ใช้ถึงที่หมายกี่โมง ต้องให้กดบอกเอง
           ถามเฉพาะทริปที่ผ่านไปแล้ว ทริปวันพรุ่งนี้ยังไม่มีผลให้ตอบ */
        if (h.date <= wxToday()) {
            const out = el("div", "hout");
            out.appendChild(el("span", "olbl", t("hist.out")));
            for (const v of HIST_OUTCOMES) {
                const ob = el("button", "obtn" + (h.out === v ? " on " + v : ""), t("hist.out." + v));
                ob.type = "button";
                ob.onclick = () => { histOutcome(h.id, v); renderHistory(); renderLearn(LAST); };
                out.appendChild(ob);
            }
            rt.appendChild(out);
        }
        const acts = el("div", "hacts");
        const again = el("button", "hbtn", t("hist.again"));
        again.type = "button";
        again.onclick = () => histLoadInto(h);
        const del = el("button", "hbtn x", "×");
        del.type = "button";
        del.title = t("hist.del");
        del.setAttribute("aria-label", t("hist.del"));
        del.onclick = () => { histRemove(h.id); renderHistory(); };
        acts.append(again, del);
        /* เวลาเดินทางแยกเป็นคอลัมน์ชิดขวา ไม่ปนอยู่ในบรรทัดรายละเอียด
           บนจอกว้างช่วงกลางแถวจะได้ไม่โล่งเป็นช่องว่างยาว ๆ และกวาดตาเทียบตัวเลขกันได้ */
        const dur = el("div", "hdur mono", String(h.travel));
        dur.appendChild(el("span", "du", " " + t("unit.minShort")));
        row.append(tm, rt, dur, acts);
        host.appendChild(row);
    }
}
/* ---------- การ์ด "จากประวัติของคุณ" ----------
   สองเรื่องในการ์ดเดียว: เส้นทางนี้เคยใช้เวลาเท่าไร และควรปรับเวลาเผื่อไหม
   ถ้ายังไม่มีข้อมูลพอ จะบอกว่าต้องทำอะไรถึงจะได้ ไม่ใช่เงียบไปเฉย ๆ */
/* ช่องเผื่อเวลาเป็น select ที่มีค่าให้เลือกเป็นขั้น จะบวกดิบ ๆ ไม่ได้
   ต้องเลื่อนไปขั้นถัดไปที่มีจริงในทิศที่ต้องการ ถ้าสุดขั้นแล้วก็ไม่เสนอ */
const CUSHIONS = [0, 5, 10, 15, 30];
function cushionStep(delta) {
    const cand = CUSHIONS.filter(c => delta > 0 ? c > S.cushion : c < S.cushion);
    if (!cand.length)
        return null;
    const target = S.cushion + delta;
    return cand.reduce((a, c) => Math.abs(c - target) < Math.abs(a - target) ? c : a);
}
let learnMsg = null; /* ข้อความยืนยันหลังกดปรับ ค้างไว้ครู่หนึ่งแล้วกลับไปคำแนะนำปกติ */
function renderLearn(r) {
    const card = $("#learnCard"), rt = $("#learnRoute"), say = $("#learnSay"), btn = $("#learnApply");
    const stats = planOk(r) ? histRouteStats(r.A.name, r.B.name) : null;
    const adv = histAdvice();
    if (stats)
        rt.textContent = stats.trips > 1
            ? t("learn.route", { n: stats.trips, a: stats.min, b: stats.max })
            : t("learn.routeOne", { a: stats.avg });
    rt.classList.toggle("hide", !stats);
    let msg = "";
    if (learnMsg)
        msg = learnMsg;
    else if (adv.n < HIST_ADVICE_MIN)
        msg = (adv.n || stats) ? t("learn.need", { n: adv.need ?? 0 }) : "";
    else if (adv.delta > 0)
        msg = t("learn.late", { n: adv.n, k: adv.late ?? 0, d: adv.delta });
    else if (adv.delta < 0)
        msg = t("learn.early", { n: adv.n, k: adv.early ?? 0, d: -adv.delta });
    else
        msg = t("learn.ok", { n: adv.n });
    say.textContent = msg;
    say.classList.toggle("hide", !msg);
    btn.classList.toggle("hide", !!learnMsg || adv.delta === 0 || cushionStep(adv.delta) === null);
    card.classList.toggle("hide", !stats && !msg);
}
/* ---------- ส่งออก / นำเข้าประวัติ ---------- */
function histToast(msg) {
    const b = $("#histImportBtn");
    b.textContent = msg;
    setTimeout(() => { b.textContent = t("hist.import"); }, 3200);
}
function histDownload() {
    const blob = new Blob([histExport()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "planway-history-" + wxToday() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function histPickFile(ev) {
    const input = ev.target;
    const f = input.files && input.files[0];
    input.value = ""; /* เคลียร์ก่อน ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่ยิง change */
    if (!f)
        return;
    const rd = new FileReader();
    rd.onload = () => {
        let msg;
        try {
            const n = histImport(String(rd.result));
            msg = n ? t("hist.imported", { n }) : t("hist.importNone");
        }
        catch (e) {
            msg = t("hist.importBad");
        }
        histToast(msg);
        renderHistory();
        renderLearn(LAST);
    };
    rd.onerror = () => histToast(t("hist.importBad"));
    rd.readAsText(f);
}
/* =======================================================================
   8. WIRING
   ======================================================================= */
const $origin = $("#origin"), $dest = $("#dest");
const $arrive = $("#arrive"), $tripDate = $("#tripDate");
const $cushion = $("#cushion");
$origin.value = sname(S.origin);
$dest.value = sname(S.dest);
$arrive.value = hhmm(S.when === "depart" ? S.departAt : S.arrive);
$tripDate.value = S.wxDay || wxToday();
$cushion.value = String(S.cushion);
document.querySelectorAll("[data-wx]").forEach(b => {
    b.onclick = () => { S.wxMode = b.dataset.wx; save(); draw(); if (S.tab === "day")
        drawDay(); };
});
document.querySelectorAll("[data-mapv]").forEach(b => {
    b.onclick = () => { S.mapView = b.dataset.mapv; save(); renderMapCard(LAST); };
});
document.querySelectorAll("[data-wxm]").forEach(b => {
    b.onclick = () => { S.wxTab = b.dataset.wxm; save(); renderWxChart(); };
});
$("#wxGeo").onclick = useMyLocation;
$origin.oninput = () => { S.origin = $origin.value; save(); draw(); drawDay(); refreshWeatherSoon(); };
$dest.oninput = () => { S.dest = $dest.value; save(); draw(); };
attachAC($origin, p => { S.origin = p.name; save(); draw(); drawDay(); refreshWeather(true); });
attachAC($dest, p => { S.dest = p.name; save(); draw(); });
$("#swap").onclick = () => {
    const a = S.origin;
    S.origin = S.dest;
    S.dest = a;
    $origin.value = sname(S.origin);
    $dest.value = sname(S.dest);
    save();
    draw();
    refreshWeatherSoon();
};
$arrive.oninput = () => {
    const [h, m] = $arrive.value.split(":").map(Number);
    if (isNaN(h))
        return;
    if (S.when === "depart")
        S.departAt = h * 60 + m;
    else
        S.arrive = h * 60 + m;
    save();
    draw();
};
document.querySelectorAll("[data-when]").forEach(b => {
    b.onclick = () => {
        S.when = b.dataset.when;
        /* สลับโหมดแล้วค่าที่ค้างในช่องต้องยังหมายถึงการเดินทางเที่ยวเดิม ไม่ใช่กระโดดไปเวลาอื่น */
        if (S.when === "depart")
            S.departAt = planOk(LAST) ? LAST.leave : S.arrive - 60;
        else if (planOk(LAST))
            S.arrive = LAST.target + S.cushion;
        $arrive.value = hhmm(S.when === "depart" ? S.departAt : S.arrive);
        syncWhenUI();
        save();
        draw();
    };
});
$tripDate.onchange = () => {
    const iso = $tripDate.value;
    if (!iso)
        return;
    const g = new Date(iso + "T00:00").getDay();
    S.dayType = (g === 0 || g === 6) ? "we" : "wd"; /* เสาร์อาทิตย์รถวิ่งห่างกว่า เอนจินใช้ค่านี้ */
    S.wxDay = iso > wxToday() ? iso : null; /* พยากรณ์ล่วงหน้าเลือกได้ ย้อนหลังไม่ได้ */
    save();
    draw();
    drawDay();
    refreshWeather(true);
};
$cushion.onchange = () => { S.cushion = +$cushion.value; save(); draw(); drawDay(); };
$("#prepAdd").onclick = () => {
    const nameBox = $("#prepName");
    const n = nameBox.value.trim();
    if (!n)
        return;
    S.prep.push({ n, m: +$("#prepMin").value || 0, on: true });
    nameBox.value = "";
    save();
    renderPrep();
    draw();
    drawDay();
};
$("#prepName").onkeydown = e => { if (e.key === "Enter") {
    e.preventDefault();
    $("#prepAdd").click();
} };
$("#dpAdd").onclick = () => {
    const last = S.day[S.day.length - 1];
    S.day.push({ p: "สยามพารากอน", t: Math.min(22 * 60, (last ? last.t + 180 : 14 * 60)), stay: 60 });
    save();
    renderDayRows();
    drawDay();
};
const TABS = ["one", "day", "hist"];
for (const k of TABS)
    $("#tab-" + k).onclick = () => { S.tab = k; syncTabs(); };
function syncTabs() {
    const cur = TABS.includes(S.tab) ? S.tab : "one";
    S.tab = cur;
    for (const k of TABS) {
        $("#tab-" + k).setAttribute("aria-selected", String(k === cur));
        $("#" + k + "View").classList.toggle("hide", k !== cur);
    }
    /* แท็บประวัติไม่ต้องใช้แผงตั้งค่าด้านซ้ายเลย ซ่อนไปให้รายการได้ความกว้างเต็ม
       บนมือถือสำคัญมาก ไม่งั้นต้องเลื่อนผ่านฟอร์มทั้งหน้าก่อนถึงจะเห็นประวัติ */
    document.body.classList.toggle("tab-hist", cur === "hist");
    document.body.classList.toggle("tab-day", cur === "day");
    save();
    if (cur === "day")
        drawDay();
    if (cur === "hist")
        renderHistory();
}
$("#copyBtn").onclick = async () => {
    const r = LAST;
    if (!planOk(r))
        return;
    const pad = " ".repeat(10);
    const lines = [t("copy.head", { a: sname(r.A.name), b: sname(r.B.name), t: hhmm(S.arrive) }),
        hhmm(r.prepStart) + "  " + t("copy.prep"),
        ...S.prep.filter(p => p.on).map(p => pad + "· " + prepName(p) + " (" + t("unit.min", { n: p.m }) + ")"),
        hhmm(r.leave) + "  " + t("copy.leave")];
    if (r.plan.kind === "drive")
        lines.push(pad + t("copy.drive", { km: Math.round(r.plan.km), n: Math.round(r.plan.mean) }));
    else
        for (const s of r.plan.segs) {
            if (s.t === "ride")
                lines.push(pad + t("copy.ride", { tag: ltag(s.line), a: sname(s.from), b: sname(s.to), n: Math.round(s.eff) }));
            if (s.t === "xfer")
                lines.push(pad + t("copy.xfer", { p: sname(s.at), n: Math.round(s.eff) }));
            if (s.t === "walk")
                lines.push(pad + t("copy.walk", { n: Math.round(s.eff) }));
            if (s.t === "moto")
                lines.push(pad + t("copy.moto", { n: Math.round(s.eff) }));
        }
    lines.push(hhmm(r.target) + "  " + t("copy.arrive", { p: sname(r.B.name), n: Math.round(r.buffer) }));
    const done = (k) => { $("#copyBtn").textContent = t(k); setTimeout(() => $("#copyBtn").textContent = t("btn.copy"), 1600); };
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        done("btn.copied");
    }
    catch (e) {
        done("btn.copyFail");
    }
};
/* --- ภาษา --- */
$("#langBtn").onclick = e => { e.stopPropagation(); togglePop("langPop", "langBtn"); };
document.querySelectorAll("#langPop [data-lang]").forEach(b => {
    b.onclick = () => { PREFS.lang = b.dataset.lang; savePrefs(); applyPrefs(); closePops(); relabel(); };
});
/* --- ธีม --- */
$("#themeBtn").onclick = e => { e.stopPropagation(); togglePop("themePop", "themeBtn"); };
document.querySelectorAll("#themeModes [data-mode]").forEach(b => {
    b.onclick = () => {
        PREFS.theme = b.dataset.mode;
        savePrefs();
        applyPrefs();
        syncThemeUI();
        draw();
        if (S.tab === "day")
            drawDay();
    };
});
/* --- บัญชี --- */
$("#authBtn").onclick = e => {
    e.stopPropagation();
    if (USER)
        togglePop("acctPop", "authBtn");
    else {
        closePops();
        openAuth(true);
    }
};
document.querySelectorAll(".oauth[data-provider]").forEach(b => {
    b.onclick = () => {
        signInWith(b.dataset.provider || "");
        /* ทริปที่เพิ่งวางแผนไว้ตอนยังไม่ล็อกอิน ยกเข้าบัญชีให้เลย จะได้ไม่รู้สึกว่าของหาย */
        HIST_CLAIMED = histClaimGuest();
        openAuth(false);
        renderAuth();
        renderHistory();
    };
});
$("#guestBtn").onclick = () => { openAuth(false); };
$("#signOutBtn").onclick = () => {
    signOut();
    HIST_CLAIMED = 0;
    closePops();
    renderAuth();
    renderHistory(); /* ออกจากระบบแล้วยังอยู่หน้าหลักตามเดิม */
};
/* ฟอร์มคำนวณให้เองทุกครั้งที่ค่าเปลี่ยนอยู่แล้ว ปุ่มนี้จึงมีไว้เพื่อสองอย่าง:
   ให้ผู้ใช้ที่พิมพ์ในช่องแล้วยังไม่ได้ blur ได้สั่งคำนวณ และเลื่อนจอไปหาคำตอบบนมือถือ */
$("#planBtn").onclick = () => {
    document.activeElement?.blur();
    draw();
    if (matchMedia("(max-width:1199px)").matches)
        $(".answer").scrollIntoView({ behavior: "smooth", block: "start" });
};
/* จอแคบ: ซ่อนแท็บกับเครื่องมือไว้หลังปุ่มเมนู */
$("#navToggle").onclick = e => {
    e.stopPropagation();
    const open = document.body.classList.toggle("nav-open");
    $("#navToggle").setAttribute("aria-expanded", String(open));
};
$("#recentAll").onclick = () => { S.tab = "hist"; syncTabs(); renderHistory(); };
$("#authClose").onclick = () => openAuth(false);
$("#loginView").onclick = e => { if (e.target === $("#loginView"))
    openAuth(false); };
$("#learnApply").onclick = () => {
    const v = cushionStep(histAdvice().delta);
    if (v === null)
        return;
    S.cushion = v;
    $cushion.value = String(v);
    save();
    learnMsg = t("learn.applied", { n: v });
    draw();
    setTimeout(() => { learnMsg = null; renderLearn(LAST); }, 4000);
};
$("#histExportBtn").onclick = histDownload;
$("#histImportBtn").onclick = () => $("#histFile").click();
$("#histFile").onchange = histPickFile;
$("#histClearBtn").onclick = () => {
    const n = histList().reduce((a, e) => a + (e.n || 1), 0);
    if (!n || !confirm(t("hist.clearAsk", { n })))
        return;
    histClear();
    renderHistory();
};
document.addEventListener("keydown", e => {
    /* ตอนเป็นด่านแรก กด Esc หนีไม่ได้ ต้องเลือกอย่างใดอย่างหนึ่งก่อน */
    if (e.key === "Escape") {
        openAuth(false);
        closePops();
    }
});
document.addEventListener("click", () => { closePops(); document.body.classList.remove("nav-open"); });
document.querySelectorAll(".pop").forEach(p => p.addEventListener("click", e => e.stopPropagation()));
/* --- ดึงพยากรณ์ใหม่เมื่อผู้ใช้เปลี่ยนจุดเริ่มต้น (หน่วงไว้ ไม่ยิงทุกตัวอักษรที่พิมพ์) --- */
let wxT;
function refreshWeatherSoon() { clearTimeout(wxT); wxT = setTimeout(refreshWeather, 700); }
/* --- เปลี่ยนขนาดหน้าต่าง: แผนที่ผูกกับความกว้างช่อง จึงต้องวาดใหม่ --- */
let rzT;
addEventListener("resize", () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { if (LAST && !LAST.err)
        renderMapCard(LAST); renderWxChart(); }, 150);
});
/* --- หัวจอหดเมื่อเลื่อนลง --- */
addEventListener("scroll", () => {
    $(".nav").classList.toggle("compact", scrollY > 8);
}, { passive: true });
/* --- หน้าเปิดค้างไว้ได้ทั้งวัน เวลาและพยากรณ์จึงต้องเดินต่อเอง ---
   นาฬิกาเดินทุกนาที ส่วนพยากรณ์จะยิงใหม่ก็ต่อเมื่อแคชหมดอายุจริง (loadForecast เช็ค TTL ให้)
   จึงไม่ได้ถล่มเซิร์ฟเวอร์รายนาที แค่เช็คค่าที่มีอยู่แล้วในเครื่อง */
function wxTick() {
    renderWxNow();
    if (WX && Date.now() - WX.at > WX_TTL)
        refreshWeather(true);
}
setInterval(wxTick, 60000);
/* กลับมาที่แท็บหลังพับโน้ตบุ๊กไว้ ตัวจับเวลาอาจไม่ได้เดินตามจริง ต้องเช็คซ้ำทันที */
document.addEventListener("visibilitychange", () => { if (!document.hidden)
    wxTick(); });
/* --- ธีมของระบบเปลี่ยนขณะเปิดหน้าอยู่ --- */
matchMedia("(prefers-color-scheme:dark)").addEventListener?.("change", () => {
    applyPrefs();
    buildSwatches();
    draw();
    if (S.tab === "day")
        drawDay();
});
/* --- เริ่มทำงาน ---
   ข้อความทุกคำในหน้านี้ถูกเติมด้วย JS (ดู applyStaticI18n) ถ้าบูตพังกลางทาง
   ผู้ใช้จะเห็นหน้าขาวเปล่าซึ่งบอกไม่ได้เลยว่าเกิดอะไรขึ้น จึงดักไว้แล้วพิมพ์ error ลงหน้าจอ */
try {
    applyStaticI18n();
    document.querySelectorAll(".oauth [data-provider-label]").forEach(s => s.textContent = t("auth.with", { p: s.getAttribute("data-provider-label") || "" }));
    syncLangUI();
    syncThemeUI();
    renderAuth();
    syncWhenUI();
    /* ยิงขอพยากรณ์ก่อนวาดหน้าจอ — เป็นงานที่รอเน็ตนานที่สุดในหน้านี้
       เริ่มก่อนแล้วปล่อยให้วิ่งคู่ขนานไปกับการคำนวณเส้นทางและวาดแผนที่ */
    refreshWeather();
    renderPrep();
    renderDayRows();
    syncTabs();
    draw();
    renderRecent();
}
catch (bootErr) {
    const box = document.createElement("pre");
    box.style.cssText = "margin:16px;padding:16px;border:1px solid #DC2626;border-radius:12px;" +
        "background:#FEF2F2;color:#7F1D1D;font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap";
    box.textContent = "PlanWay เปิดหน้าไม่สำเร็จ\n\n" + (bootErr?.stack || String(bootErr));
    document.body.prepend(box);
    throw bootErr;
}
