/* PlanWay — ประวัติการเดินทาง
   เก็บว่าผู้ใช้วางแผนไปที่ไหนมาบ้าง แล้วสรุปให้ดูย้อนหลังได้

   ที่เก็บ: localStorage คีย์เดียว okd.hist.v1 เป็นอ็อบเจกต์ { uid: [entry, ...] }
   แยกตามผู้ใช้ เพราะเครื่องเดียวอาจมีหลายคนสลับกันล็อกอิน คนหนึ่งต้องไม่เห็นของอีกคน

   ข้อจำกัดที่ต้องบอกผู้ใช้ให้ชัด: ตอนนี้ยังไม่มี backend ประวัติจึงอยู่ในเบราว์เซอร์นี้เท่านั้น
   ล้างข้อมูลเบราว์เซอร์แล้วหาย และเปิดอีกเครื่องจะไม่เห็น
   ถ้าต่อ backend จริงในอนาคต: เปลี่ยนแค่ histRead/histWrite ให้ยิง /api/history
   โดยยืนยันตัวตนด้วย session cookie แบบ httpOnly ห้ามส่ง token ผ่าน JS */

const HIST_KEY = "okd.hist.v1";
const HIST_MAX = 300;              /* กันไม่ให้ localStorage บวมจนเขียนไม่ลง */
const HIST_GUEST = "guest";

/* ผู้ใช้คนละคนต้องได้คนละถัง — ใช้ provider+อีเมลเป็นตัวระบุ ไม่ใช่แค่ชื่อ */
function histUid(){
  return USER ? (USER.provider + ":" + (USER.email || "?")) : HIST_GUEST;
}

function histRead(){
  try{
    const raw = localStorage.getItem(HIST_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
  }catch(e){ return {}; }
}
function histWrite(all){
  try{ localStorage.setItem(HIST_KEY, JSON.stringify(all)); }catch(e){}
}

/* รายการของผู้ใช้ปัจจุบัน เรียงใหม่สุดขึ้นก่อน */
function histList(){
  const a = histRead()[histUid()];
  return Array.isArray(a) ? a.slice().sort((x,y) => y.ts - x.ts) : [];
}

/* คีย์กันซ้ำ: วันเดียวกัน ต้นทางเดียวกัน ปลายทางเดียวกัน = ทริปเดียว
   ผู้ใช้ปรับเวลานัดหรือสลับโหมดไปมา ไม่ควรกลายเป็นหลายรายการ */
const histSig = e => e.date + "|" + e.from + "|" + e.to;

function histAdd(entry){
  const all = histRead(), uid = histUid();
  const list = Array.isArray(all[uid]) ? all[uid] : [];
  const sig = histSig(entry);
  const i = list.findIndex(e => histSig(e) === sig);
  if (i >= 0){
    /* ปรับค่าในฟอร์มไปมาภายในครึ่งชั่วโมง ถือเป็นการวางแผนครั้งเดียว ไม่นับเพิ่ม
       ไม่งั้นเลื่อนเวลานัดสามที ประวัติจะบอกว่าไปที่นั่นมาสามครั้ง */
    const again = (Date.now() - (list[i].ts || 0)) > 30 * 60 * 1000;
    entry.id = list[i].id;
    entry.n  = (list[i].n || 1) + (again ? 1 : 0);
    /* ผลจริงที่ผู้ใช้กดบอกไว้เป็นข้อมูลที่ระบบสร้างเองไม่ได้ ห้ามให้การบันทึกอัตโนมัติลบทิ้ง
       (เจอตอนตรวจภาพ: เปิดหน้าค้างไว้ที่ทริปเดิม แล้วปุ่มผลจริงที่กดไปเด้งกลับเป็นว่าง) */
    if (list[i].out) entry.out = list[i].out;
    list[i]  = entry;
  } else {
    entry.id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    entry.n  = 1;
    list.push(entry);
  }
  /* ตัดของเก่าทิ้งเมื่อเกินเพดาน */
  list.sort((x,y) => y.ts - x.ts);
  all[uid] = list.slice(0, HIST_MAX);
  histWrite(all);
  return entry;
}

function histRemove(id){
  const all = histRead(), uid = histUid();
  if (!Array.isArray(all[uid])) return;
  all[uid] = all[uid].filter(e => e.id !== id);
  histWrite(all);
}
function histClear(){
  const all = histRead();
  delete all[histUid()];
  histWrite(all);
}

/* ตอนล็อกอิน: ถ้าเพิ่งใช้แบบไม่ล็อกอินมาก่อน ให้ยกประวัติเข้าบัญชีให้เลย
   จะได้ไม่รู้สึกว่าล็อกอินแล้วของหาย  ย้าย ไม่ใช่ก๊อบ กันไม่ให้เห็นซ้ำสองที่ */
function histClaimGuest(){
  const all = histRead(), uid = histUid();
  if (uid === HIST_GUEST) return 0;
  const g = all[HIST_GUEST];
  if (!Array.isArray(g) || !g.length) return 0;

  const mine = Array.isArray(all[uid]) ? all[uid] : [];
  const seen = new Set(mine.map(histSig));
  const add = g.filter(e => !seen.has(histSig(e)));
  all[uid] = mine.concat(add).sort((x,y) => y.ts - x.ts).slice(0, HIST_MAX);
  delete all[HIST_GUEST];
  histWrite(all);
  return add.length;
}

/* สรุปตัวเลขไว้โชว์บนการ์ด KPI */
function histStats(list){
  const n = list.length;
  if (!n) return { trips:0, minutes:0, avg:0, places:0, top:[], rainy:0 };
  let minutes = 0, rainy = 0;
  const count = new Map();
  for (const e of list){
    minutes += (e.travel || 0) * (e.n || 1);
    if (e.rain) rainy++;
    count.set(e.to, (count.get(e.to) || 0) + (e.n || 1));
  }
  const top = [...count.entries()].sort((a,b) => b[1] - a[1]);
  return {
    trips: list.reduce((a,e) => a + (e.n || 1), 0),
    minutes: Math.round(minutes),
    avg: Math.round(minutes / list.reduce((a,e) => a + (e.n || 1), 0)),
    places: count.size,
    rainy, top
  };
}

/* =======================================================================
   เรียนรู้จากพฤติกรรมผู้ใช้
   ระบบมองไม่เห็นว่าผู้ใช้ถึงที่หมายจริงกี่โมง จึงเดาเองไม่ได้ ต้องให้ผู้ใช้บอก
   หน้าประวัติมีปุ่มให้กดสามแบบต่อทริป: ถึงเร็วไป / พอดี / มาสาย
   แล้วเอาสถิติที่ได้มาเสนอปรับ "เวลาเผื่อถึงก่อนนัด" ให้ตรงกับตัวผู้ใช้จริง

   เสนอ ไม่ใช่แอบปรับ — ผู้ใช้ต้องกดยอมรับเอง ไม่งั้นเวลาที่เห็นจะเปลี่ยนโดยไม่รู้สาเหตุ
   ======================================================================= */

const HIST_OUTCOMES = ["early", "ok", "late"];

function histOutcome(id, v){
  const all = histRead(), uid = histUid();
  const list = Array.isArray(all[uid]) ? all[uid] : [];
  const e = list.find(x => x.id === id);
  if (!e) return;
  e.out = (e.out === v) ? null : v;      /* กดซ้ำที่เดิม = ยกเลิกคำตอบ */
  histWrite(all);
}

/* สถิติของเส้นทางคู่นี้โดยเฉพาะ ไว้บอกว่า "เส้นนี้เคยใช้เวลาเท่าไร" */
function histRouteStats(from, to){
  const same = histList().filter(e => e.from === from && e.to === to);
  if (!same.length) return null;
  const mins = same.map(e => e.travel).filter(n => n > 0);
  if (!mins.length) return null;
  return {
    trips: same.reduce((a, e) => a + (e.n || 1), 0),
    min: Math.min(...mins),
    max: Math.max(...mins),
    avg: Math.round(mins.reduce((a, n) => a + n, 0) / mins.length),
    last: same[0]
  };
}

/* คำแนะนำจากผลจริงที่ผู้ใช้กดไว้
   ดูแค่ 12 ทริปล่าสุดที่มีคำตอบ เพราะพฤติกรรมเปลี่ยนได้ ของเมื่อปีที่แล้วไม่ควรถ่วง */
const HIST_ADVICE_MIN = 4;
function histAdvice(){
  const done = histList().filter(e => HIST_OUTCOMES.includes(e.out)).slice(0, 12);
  const n = done.length;
  if (n < HIST_ADVICE_MIN) return { n, need: HIST_ADVICE_MIN - n, delta: 0 };

  const late  = done.filter(e => e.out === "late").length;
  const early = done.filter(e => e.out === "early").length;
  const lateRate = late / n, earlyRate = early / n;

  /* มาสายแม้แต่ครั้งเดียวในสี่ ถือว่าเผื่อน้อยไป — ฝั่งนี้ต้องไวกว่าอีกฝั่ง
     เพราะโทษของการไปสายหนักกว่าการไปถึงเร็วเกิน */
  let delta = 0, why = "ok";
  if (lateRate >= 0.4)       { delta = 10; why = "late"; }
  else if (lateRate >= 0.2)  { delta = 5;  why = "late"; }
  else if (earlyRate >= 0.6) { delta = -5; why = "early"; }

  return { n, late, early, ok: n - late - early, lateRate, earlyRate, delta, why };
}

/* ---- ส่งออก / นำเข้า ----
   ยังไม่มี backend ให้ซิงก์ข้ามเครื่อง ระหว่างนี้ให้ย้ายด้วยไฟล์ไปก่อน
   เก็บเป็น JSON ธรรมดา อ่านออกด้วยตาและแก้เองได้ ไม่ผูกกับรูปแบบภายในของเรา */
const HIST_FILE_V = 1;

function histExport(){
  return JSON.stringify({
    app:"planway", kind:"history", v:HIST_FILE_V,
    exportedAt:new Date().toISOString(),
    trips: histList()
  }, null, 2);
}

/* คืนจำนวนที่เพิ่มเข้ามาจริง หรือโยน Error ถ้าไฟล์ไม่ใช่ของเรา
   รวมแบบไม่ทับของเดิม — ทริปที่มีอยู่แล้ว (วันที่+ต้นทาง+ปลายทางเดียวกัน) ข้ามไป */
function histImport(text){
  let j;
  try{ j = JSON.parse(text); }catch(e){ throw new Error("bad-json"); }
  if (!j || j.kind !== "history" || !Array.isArray(j.trips)) throw new Error("bad-file");

  const all = histRead(), uid = histUid();
  const mine = Array.isArray(all[uid]) ? all[uid] : [];
  const seen = new Set(mine.map(histSig));
  let added = 0;
  for (const e of j.trips){
    if (!e || !e.date || !e.from || !e.to) continue;
    if (seen.has(histSig(e))) continue;
    seen.add(histSig(e));
    mine.push(Object.assign({}, e,
      { id:"h" + Date.now().toString(36) + Math.random().toString(36).slice(2,6) }));
    added++;
  }
  all[uid] = mine.sort((x,y) => (y.ts||0) - (x.ts||0)).slice(0, HIST_MAX);
  histWrite(all);
  return added;
}
