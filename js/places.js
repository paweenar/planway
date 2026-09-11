/* PlanWay — ค้นหาสถานที่
   เดิมแอปรู้จักเฉพาะชื่อที่ฝังไว้ใน data.js (สถานี 185 + สถานที่ยอดนิยม 24)
   พิมพ์ชื่ออื่นแล้วขึ้น "ไม่พบจุดเริ่มต้น" ทันที ไฟล์นี้เพิ่มการค้นหาจากฐานข้อมูล OpenStreetMap
   ให้พิมพ์ชื่อสถานที่อะไรก็ได้ในไทย

   ใช้สองเจ้าต่อกัน ทั้งคู่ฟรีและไม่ต้องใช้ API key
     Photon      — ออกแบบมาสำหรับ autocomplete โดยเฉพาะ ยิงระหว่างพิมพ์ได้
     Nominatim   — ความแม่นในการค้นชื่อบางส่วนดีกว่า แต่นโยบายห้ามใช้ทำ autocomplete
                   จึงยิงเฉพาะตอน Photon หาไม่เจอ และหน่วงเวลาแล้วเท่านั้น */

const PHOTON_URL = "https://photon.komoot.io/api/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PLACES_KEY = "okd.places.v1";

/* สถานที่ที่ค้นเจอจากอินเทอร์เน็ต เก็บไว้ให้ resolve() หาเจอในครั้งต่อ ๆ ไป
   ต้องเก็บลง localStorage ด้วย ไม่งั้นเปิดหน้าใหม่แล้วจุดเริ่มต้นที่บันทึกไว้จะหาไม่เจออีก */
let FOUND = new Map();
try {
  const raw = localStorage.getItem(PLACES_KEY);
  if (raw) for (const p of JSON.parse(raw)) FOUND.set(p.name, p);
} catch (e) {}
function rememberPlace(p){
  FOUND.set(p.name, p);
  try {
    const all = [...FOUND.values()].slice(-120);   /* เก็บ 120 รายการล่าสุดพอ */
    localStorage.setItem(PLACES_KEY, JSON.stringify(all));
  } catch (e) {}
}

/* ความคล้ายแบบทนคำผิด — วัดจากลำดับตัวอักษรร่วมที่ยาวที่สุด (LCS) เทียบกับความยาวคำค้น
   "ตากอากาศบางปู" เทียบกับ "สถานตากอากาศบางปู" ได้ 1.0 ทั้งที่ไม่ได้ขึ้นต้นเหมือนกัน */
function lcsLen(a, b){
  const m = a.length, n = b.length;
  let prev = new Array(n + 1).fill(0), cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++){
    for (let j = 1; j <= n; j++)
      cur[j] = a[i-1] === b[j-1] ? prev[j-1] + 1 : Math.max(prev[j], cur[j-1]);
    const tmp = prev; prev = cur; cur = tmp; cur.fill(0);
  }
  return prev[n];
}
const simScore = (q, name) => lcsLen(q, name) / Math.max(1, q.length);

/* ค้นจากข้อมูลในเครื่องก่อนเสมอ — เร็ว ใช้ออฟไลน์ได้ และสถานีรถไฟฟ้าสำคัญกว่าผลจากเน็ต */
function searchLocal(q){
  const qn = (q || "").trim().toLowerCase();
  if (!qn) return [];
  const seen = new Set(), out = [];
  const add = (name, kind, lat, lng, rank) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, kind, lat, lng, rank, detail: kind === "station" ? lineNamesOf(name) : "" });
  };
  const scan = (name, kind, lat, lng) => {
    const en = (NAME_EN[name] || "").toLowerCase(), th = name.toLowerCase();
    if (th === qn || en === qn)            add(name, kind, lat, lng, 0);
    else if (th.startsWith(qn) || en.startsWith(qn)) add(name, kind, lat, lng, 1);
    else if (th.includes(qn) || en.includes(qn))     add(name, kind, lat, lng, 2);
    else {
      const s = Math.max(simScore(qn, th), en ? simScore(qn, en) : 0);
      if (s >= 0.78) add(name, kind, lat, lng, 3 + (1 - s));
    }
  };
  for (const p of PLACES) scan(p[0], "place", p[1], p[2]);
  for (const n of NODES.values()) scan(n.st, "station", n.lat, n.lng);
  for (const p of FOUND.values()) scan(p.name, "geo", p.lat, p.lng);
  return out.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length).slice(0, 8);
}
/* สถานีชื่อเดียวกันอยู่ได้หลายสาย เอามาแสดงเป็นคำอธิบายใต้ชื่อ */
function lineNamesOf(st){
  const tags = [];
  for (const n of NODES.values())
    if (n.st === st && !tags.includes(LINES[n.line].tag)) tags.push(LINES[n.line].tag);
  return tags.join(" · ");
}

function photonSearch(q){
  const u = PHOTON_URL + "?q=" + encodeURIComponent(q) +
            "&limit=6&lang=default&lat=13.75&lon=100.52";
  return fetch(u).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.features) return [];
    return j.features
      .filter(f => (f.properties.countrycode || "TH") === "TH" && f.properties.name)
      .map(f => ({
        name: f.properties.name,
        detail: [f.properties.district, f.properties.city, f.properties.county, f.properties.state]
                  .filter(Boolean).slice(0, 2).join(" · "),
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: "geo", rank: 10
      }));
  }).catch(() => []);
}
function nominatimSearch(q){
  const u = NOMINATIM_URL + "?format=jsonv2&limit=5&accept-language=th&countrycodes=th&q=" +
            encodeURIComponent(q);
  return fetch(u).then(r => r.ok ? r.json() : null).then(j => {
    if (!Array.isArray(j)) return [];
    return j.map(f => {
      const parts = f.display_name.split(",").map(s => s.trim());
      return { name: parts[0], detail: parts.slice(1, 3).join(" · "),
               lat: +f.lat, lng: +f.lon, kind: "geo", rank: 11 };
    });
  }).catch(() => []);
}

/* ผลการค้นจากเน็ต เก็บแคชไว้ไม่ต้องยิงซ้ำระหว่างพิมพ์กลับไปกลับมา */
const onlineCache = new Map();
async function searchOnline(q){
  const key = q.trim().toLowerCase();
  if (!key || key.length < 2) return [];
  if (onlineCache.has(key)) return onlineCache.get(key);
  let res = await photonSearch(q);
  if (!res.length) res = await nominatimSearch(q);   /* Photon ไม่เจอค่อยถาม Nominatim */
  const seen = new Set(), out = [];
  for (const r of res){
    if (seen.has(r.name)) continue;
    seen.add(r.name); out.push(r);
  }
  onlineCache.set(key, out);
  return out;
}
