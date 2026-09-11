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
