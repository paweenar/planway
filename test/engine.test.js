/* ทดสอบเอนจินแบบไม่ต้องมีเบราว์เซอร์:  node test/engine.test.js  */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* data.js + engine.js เป็นสคริปต์ธรรมดา (ไม่ใช่ ES module) เพื่อให้เปิด index.html
   จาก file:// ได้ตรงๆ  ที่นี่จึงรวมสองไฟล์แล้วดึงตัวแปรออกมาผ่าน new Function */
const { LINES, NODES, PLACES, transitPlan, mixedPlan, drivePlan } =
  new Function(read('js/data.js') + read('js/engine.js') +
    ';return {LINES,NODES,PLACES,transitPlan,mixedPlan,drivePlan};')();

function P(name){
  const pl = PLACES.find(p => p[0] === name);
  if (pl) return {name, lat: pl[1], lng: pl[2]};
  for (const [,n] of NODES) if (n.st === name) return {name, lat: n.lat, lng: n.lng};
  throw new Error('ไม่พบ ' + name);
}

/* [ต้นทาง, ปลายทาง, เวลาเดินทางจริงโดยประมาณ (นาที), ยอมคลาดได้] */
const CASES = [
  ["อารีย์","สยาม",13,6],
  ["หมอชิต","อโศก",26,7],
  ["พญาไท","สุวรรณภูมิ",44,9],
  ["บางหว้า","ลาดพร้าว",47,10],
  ["คูคต","เคหะฯ",112,18],
  ["ตลาดบางใหญ่","สยาม",78,14],
  ["ท่าพระ","สีลม",21,7],
  ["คลองสาน","อโศก",38,9],
];

let fail = 0;
console.log("ชั่วโมงเร่งด่วน (band 0)\n");
for (const [a, c, want, tol] of CASES) {
  const p = transitPlan(P(a), P(c), 0, false);
  if (!p) { console.log("✗", a, "→", c, "ไม่พบเส้นทาง"); fail++; continue; }
  const got = Math.round(p.mean), ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  const rides = p.segs.filter(s => s.t === "ride").map(s => LINES[s.line].tag).join("+");
  console.log(`${ok?"✓":"✗"} ${(a+" → "+c).padEnd(30)} ${String(got).padStart(4)} นาที (คาด ~${want})  p90 ${Math.round(p.mean+1.28*p.sd)}  ${rides}`);
}

/* ต้องไม่มีใครเดินข้ามแม่น้ำ */
const cs = transitPlan(P("คลองสาน"), P("อโศก"), 0, false);
const usesGold = cs.segs.some(s => s.t === "ride" && s.line === "gold");
console.log(`\n${usesGold?"✓":"✗"} คลองสาน ต้องขึ้นสายสีทอง ไม่ใช่เดินข้ามเจ้าพระยา`);
if (!usesGold) fail++;

/* ขับรถทางไกลต้องได้ใช้ทางด่วน */
const far = drivePlan(P("อารีย์"), P("นิคมอุตสาหกรรมบางปู"), 0, false);
const farOk = far.mean < 100;
console.log(`${farOk?"✓":"✗"} อารีย์ → บางปู ${Math.round(far.km)} กม. = ${Math.round(far.mean)} นาที (ต้อง < 100)`);
if (!farOk) fail++;

/* ปลายทางนอกโครงข่ายต้องตอบว่าไม่มีเส้นทาง ไม่ใช่ตอบมั่ว */
const none = transitPlan(P("อารีย์"), P("ตลาดไท"), 1, false);
console.log(`${none===null?"✓":"✗"} ตลาดไท อยู่นอกโครงข่าย → คืนค่า null`);
if (none !== null) fail++;

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} เคส` : "\n✅ ผ่านทั้งหมด");
process.exit(fail ? 1 : 0);
