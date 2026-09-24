/* PlanWay — เอนจินหาเส้นทางและโมเดลเวลา (ไม่ผูกกับ DOM) */
/* =======================================================================
   2. GRAPH
   ======================================================================= */
const R2D = Math.PI/180;
function hav(a: number, b: number, c: number, d: number): number {
  const dLat=(c-a)*R2D, dLng=(d-b)*R2D, m=(a+c)/2*R2D;
  const x=dLng*Math.cos(m), y=dLat;
  return Math.sqrt(x*x+y*y)*6371;
}
const key=(l: LineId, s: string): string => l+""+s;
const NODES=new Map<string, GNode>();   // key -> GNode
const ADJ=new Map<string, Edge[]>();    // key -> Edge[]
function addAdj(a: string, b: string, o: Omit<Edge,"to">): void { if(!ADJ.has(a)) ADJ.set(a,[]); ADJ.get(a)!.push(Object.assign({to:b},o)); }

for(const [lid,L] of Object.entries(LINES)){
  L.st.forEach((s,i)=>NODES.set(key(lid,s[0]),{line:lid,st:s[0],lat:s[1],lng:s[2],idx:i}));
  for(let i=0;i<L.st.length-1;i++){
    const a=L.st[i], b=L.st[i+1];
    const km=hav(a[1],a[2],b[1],b[2]);
    const min=km/L.sp*60+0.45;
    addAdj(key(lid,a[0]),key(lid,b[0]),{min,kind:"ride",km});
    addAdj(key(lid,b[0]),key(lid,a[0]),{min,kind:"ride",km});
  }
}
for(const [lid,x,y] of EXTRA_EDGES){
  const A=NODES.get(key(lid,x))!, B=NODES.get(key(lid,y))!;
  const km=hav(A.lat,A.lng,B.lat,B.lng), min=km/LINES[lid].sp*60+0.45;
  addAdj(key(lid,x),key(lid,y),{min,kind:"ride",km});
  addAdj(key(lid,y),key(lid,x),{min,kind:"ride",km});
}
for(const [la,sa,lb,sb,w] of TRANSFERS){
  addAdj(key(la,sa),key(lb,sb),{min:w,kind:"xfer",walk:w});
  addAdj(key(lb,sb),key(la,sa),{min:w,kind:"xfer",walk:w});
}

const WALK_MIN_PER_KM = 13.0;   // ~4.6 km/h incl. crossings & stairs
function band(minOfDay: number, dayType: DayType): Band {
  if(minOfDay>=21*60+30 || minOfDay<6*60) return 2;
  if(dayType==="wd" && ((minOfDay>=6*60+45&&minOfDay<9*60+20)||(minOfDay>=16*60+30&&minOfDay<19*60+45))) return 0;
  return 1;
}
const waitFor=(lid: LineId, b: Band): number => LINES[lid].hw[b]/2 + (b===0?0.6:0);   // peak: often miss one train

/* ---- ต้นทุนที่ใช้ "เลือกทาง" ----
   ก่อนหน้านี้เอนจินเลือกเส้นทางที่นาทีน้อยที่สุดล้วน ๆ ซึ่งให้คำตอบที่ไม่มีใครทำจริง เช่น
   เดิน 22 นาทีไปขึ้นรถไฟฟ้า ทั้งที่มี BRT วิ่งผ่านหน้าปากซอย หรือเปลี่ยนสาย 3 ต่อจ่าย 98 บาท
   เพื่อให้ถึงเร็วขึ้น 4 นาที — เร็วกว่าจริง แต่ไม่ใช่ "ดีที่สุด"
   ค่าถ่วงสามตัวนี้ใช้ตอนค้นหาเท่านั้น เวลาและค่าโดยสารที่รายงานยังเป็นของจริงล้วน ๆ */
const WALK_W = 1.45;   /* เดิน 10 นาที เหนื่อยเท่านั่งรถ 14.5 นาที (แดด ฝน ของหนัก) */
const XFER_P = 4.0;    /* เปลี่ยนสายหนึ่งครั้ง: ขึ้นลงบันได หาชานชาลา ลุ้นว่าจะทันขบวน */
const BAHT_M = 0.22;   /* 1 บาท ≈ 0.22 นาที — ค่าแรกเข้า 17 บาท จึงเท่ากับเสียเวลา ~3.7 นาที */
/* ขึ้นสายใหม่หนึ่งครั้งเสียทั้งเวลารอและค่าแรกเข้า — สองอย่างนี้มาคู่กันเสมอ */
const boardCost = (lid: LineId, b: Band): number => waitFor(lid,b) + LINES[lid].fare[0]*BAHT_M;

/* you cannot walk across the Chao Phraya — a walk that crosses it must reach a bridge */
function cross(p: LatLng, q: LatLng, a: LatLng, b: LatLng): boolean {
  const d=(u: LatLng, v: LatLng, w: LatLng)=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
  const s=(x: number)=>x>0?1:(x<0?-1:0);
  return s(d(p,q,a))!==s(d(p,q,b)) && s(d(a,b,p))!==s(d(a,b,q));
}
function crossesRiver(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
  const p: LatLng=[lat1,lng1], q: LatLng=[lat2,lng2];
  for(let i=0;i<RIVER.length-1;i++) if(cross(p,q,RIVER[i],RIVER[i+1])) return true;
  return false;
}

/* ป้ายรถเมล์ไม่ต้องไล่เขียน TRANSFERS ทีละคู่ — ป้ายที่อยู่ใกล้กันพอเดินถึงก็ต่อกันเอง
   รถไฟฟ้ายังใช้ TRANSFERS เขียนมือเหมือนเดิม เพราะทางเชื่อมจริงในสถานีอ้อมกว่าระยะเส้นตรงมาก
   (เช่น เพชรบุรี → มักกะสัน เดิน 6 นาที ทั้งที่ห่างกันไม่ถึง 300 เมตร)
   ponytail: ไล่ทุกคู่แบบ O(n²) ~330 โหนด ทำครั้งเดียวตอนโหลด ถ้าโครงข่ายโตถึงหลักพันค่อยหั่นเป็นกริด */
const XFER_M = 320;                    /* ใกล้กว่านี้ถือว่าเป็นป้ายเดียวกัน (เมตร) */
for(const [ka,A] of NODES) for(const [kb,B] of NODES){
  if(kb<=ka || A.line===B.line) continue;
  if(!LINES[A.line].spb && !LINES[B.line].spb) continue;          /* ต้องมีฝั่งที่เป็นสายบนถนน */
  const km=hav(A.lat,A.lng,B.lat,B.lng);
  if(km*1000>XFER_M || crossesRiver(A.lat,A.lng,B.lat,B.lng)) continue;
  const w=Math.round((km*WALK_MIN_PER_KM+1.5)*10)/10;             /* +1.5 = ข้ามถนน/หาป้ายฝั่งตรงข้าม */
  addAdj(ka,kb,{min:w,kind:"xfer",walk:w});
  addAdj(kb,ka,{min:w,kind:"xfer",walk:w});
}

/* เวลานั่งจริงของขาหนึ่ง: สายบนถนนคิดตามความเร็วของช่วงเวลานั้น รถไฟฟ้าใช้ค่าที่คิดไว้ตอนสร้างกราฟ */
function rideMin(e: Edge, lid: LineId, b: Band): number {
  const spb=LINES[lid].spb;
  return spb ? e.km!/spb[b]*60+0.45 : e.min;
}

/* nearest boardable stations from a point */
function near(pt: Point, maxWalk=26): NearHit[] {
  const out: NearHit[]=[];
  for(const [k,n] of NODES){
    let w = hav(pt.lat,pt.lng,n.lat,n.lng)*WALK_MIN_PER_KM + 1;
    if(crossesRiver(pt.lat,pt.lng,n.lat,n.lng)) w = w*2.5+12;   // ต้องอ้อมไปขึ้นสะพาน
    if(w<=maxWalk) out.push({k,w,line:n.line});
  }
  out.sort((a,b)=>a.w-b.w);
  const seen=new Map<LineId, number>(), pick: NearHit[]=[];
  for(const o of out){
    const c=seen.get(o.line)||0;
    if(c<2 && pick.length<14){ pick.push(o); seen.set(o.line,c+1); }
  }
  return pick;
}

/* Dijkstra over station nodes, wait time charged on boarding a line */
function transitRoute(from: Point, to: Point, b: Band): Route | null {
  const srcs=near(from), dsts=near(to);
  if(!srcs.length||!dsts.length) return null;
  const dstW=new Map<string, number>(); dsts.forEach(d=>dstW.set(d.k,d.w));
  const g=new Map<string, number>(), prev=new Map<string, string|null>(), pq: [number, string][]=[];
  for(const s of srcs){
    const cost=s.w*WALK_W+boardCost(s.line,b);
    if(!g.has(s.k)||cost<g.get(s.k)!){ g.set(s.k,cost); prev.set(s.k,null); }
  }
  for(const [k,v] of g) pq.push([v,k]);
  const done=new Set<string>();
  while(pq.length){
    pq.sort((a,b2)=>a[0]-b2[0]);
    const [d,k]=pq.shift()!;
    if(done.has(k)) continue; done.add(k);
    for(const e of (ADJ.get(k)||[])){
      const nl=NODES.get(e.to)!.line;
      const add = e.kind==="xfer" ? e.min*WALK_W + XFER_P + boardCost(nl,b) : rideMin(e,nl,b);
      const nd=d+add;
      if(!g.has(e.to)||nd<g.get(e.to)!-1e-9){ g.set(e.to,nd); prev.set(e.to,k); pq.push([nd,e.to]); }
    }
  }
  let best: { k: string; total: number; egress: number } | null = null;
  for(const [k,w] of dstW){ if(g.has(k)){ const t=g.get(k)!+w*WALK_W; if(!best||t<best.total) best={k,total:t,egress:w}; } }
  if(!best) return null;
  const path: string[]=[]; let cur: string|null|undefined = best.k;
  while(cur){ path.unshift(cur); cur=prev.get(cur); }
  const accessW = srcs.find(s=>s.k===path[0])!.w;
  return {path,total:best.total,accessWalk:accessW,egressWalk:best.egress};
}

/* path -> readable segments */
function segments(route: Route, b: Band): Seg[] {
  const segs: Seg[]=[], p=route.path;
  /* eff ตั้งเท่ากับ min ไปก่อน แล้ว transitPlan/mixedPlan จะเขียนทับด้วยเวลาจริง */
  segs.push({t:"walk",min:route.accessWalk,eff:route.accessWalk,to:NODES.get(p[0])!});
  let i=0;
  while(i<p.length-1){
    const line=NODES.get(p[i])!.line;
    segs.push({t:"wait",min:waitFor(line,b),eff:waitFor(line,b),line});
    let j=i, hops=0, ride=0;
    while(j<p.length-1){
      const e=(ADJ.get(p[j])||[]).find((x: Edge)=>x.to===p[j+1]);
      if(!e||e.kind!=="ride") break;
      ride+=rideMin(e,line,b); hops++; j++;
    }
    segs.push({t:"ride",min:ride,eff:ride,line,from:NODES.get(p[i])!.st,to:NODES.get(p[j])!.st,hops});
    if(j<p.length-1){
      const e=(ADJ.get(p[j])||[]).find((x: Edge)=>x.to===p[j+1])!;
      segs.push({t:"xfer",min:e.min,eff:e.min,at:NODES.get(p[j])!.st,from:NODES.get(p[j])!.line,to:NODES.get(p[j+1])!.line});
      i=j+1;
    } else i=j;
  }
  segs.push({t:"walk",min:route.egressWalk,eff:route.egressWalk,last:true,to:NODES.get(p[p.length-1])!});
  return segs;
}

/* =======================================================================
   3. TIME MODEL — mean, spread, fare, per mode
   ======================================================================= */
const Z: Record<number, number> = {50:0,80:0.84,90:1.28,95:1.645};

/* ---- เวลาให้บริการ ----
   ก่อนหน้านี้เอนจินไม่รู้ว่ารถหยุดวิ่งกี่โมง นัดตีสองจึงถูกเสนอเส้นทาง BTS ที่ไม่มีอยู่จริง
   svc ใน LINES เป็นเวลาเปิด-ปิดที่ผู้ให้บริการประกาศ ไม่ใช่ตารางเดินรถ จึงใช้ "เตือน" เท่านั้น */
const svcOf = (lid: LineId): [number, number] => (LINES[lid] && LINES[lid].svc) || [0, 1440];

/* ปิดเที่ยงคืน (last = 1440) หมายถึงขบวนสุดท้ายออกก่อนเที่ยงคืน ไม่ใช่วิ่งข้ามคืน */
function svcOpen(lid: LineId, min: number): boolean {
  const [a, b] = svcOf(lid);
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return b >= 1440 ? m >= a : (m >= a && m <= b);
}

/* เดินเวลาจากนาทีที่ออกจากบ้าน บวกทีละช่วงแบบเดียวกับที่ไทม์ไลน์วาด
   แล้วดูว่าตอนถึงคิวขึ้นรถแต่ละขา สายนั้นยังเปิดอยู่ไหม
   (ช่วง wait มาก่อน ride เสมอ เวลา ณ ขา ride จึงเป็นเวลาที่ขึ้นรถจริง) */
function svcCheck(plan: Plan | null, leaveMin: number): SvcIssue[] {
  const out: SvcIssue[] = [];
  if (!plan || plan.kind === "drive") return out;
  let tm = leaveMin;
  for (const s of plan.segs){
    if (s.t === "ride" && !svcOpen(s.line, tm)){
      const [a, b] = svcOf(s.line);
      const m = ((Math.round(tm) % 1440) + 1440) % 1440;
      out.push({ line:s.line, at:tm, from:s.from, to:s.to,
                 kind: m < a ? "before" : "after", first:a, last:b });
    }
    tm += s.eff;
  }
  return out;
}

/* ผลการคำนวณที่ไม่ error — เขียนเป็น type guard เพื่อให้ TypeScript ยอมให้อ่าน r.A / r.plan ต่อได้
   (เช็ค r.err เฉย ๆ ไม่พอ เพราะชนิดของ err เป็น string ซึ่งเป็นค่าว่างได้ในสายตา TypeScript) */
function planOk(r: Compute | null | undefined): r is ComputeOk { return !!r && !r.err; }

function fareOf(lid: LineId, hops: number): number {
  const [base,per,cap]=LINES[lid].fare;
  return Math.min(cap, base+per*Math.max(0,hops-1));
}
function transitPlan(from: Point, to: Point, b: Band, rain: boolean): TransitPlan | null {
  const r=transitRoute(from,to,b); if(!r) return null;
  const segs=segments(r,b);
  let mean=0,varr=0,fare=0,xfers=0,walk=0,wait=0,ride=0;
  for(const s of segs){
    let m=s.min, sd=0;
    if(s.t==="walk"){ sd=m*0.12; if(rain){m*=1.25; sd*=1.6;} walk+=m; }
    if(s.t==="wait"){ sd=LINES[s.line].hw[b]*0.34; if(rain) sd*=1.15; wait+=m; }
    if(s.t==="ride"){
      /* สายบนถนนเจอไฟแดง รถติด และจอดรับส่งไม่เท่ากันทุกรอบ ค่าเบี่ยงเบนจึงสูงกว่าราง ~2.5 เท่า */
      const road=!!LINES[s.line].spb;
      sd=m*(road?0.22:0.09)+(b===0?0.8:0.3);
      if(rain){ m*=road?1.18:1.04; sd*=road?1.45:1.15; }
      ride+=m; fare+=fareOf(s.line,s.hops);
    }
    if(s.t==="xfer"){ sd=m*0.25+0.8; if(rain){m*=1.15; sd*=1.3;} xfers++; walk+=m; }
    s.eff=m; mean+=m; varr+=sd*sd;
  }
  varr += 2.2*2.2;   // ความคลาดเคลื่อนพื้นฐาน: หาทางออกสถานี ต่อคิว ตกขบวน
  return {kind:"transit",segs,mean,sd:Math.sqrt(varr),fare,xfers,walk,wait,ride,
          /* segments() ขึ้นต้นและลงท้ายด้วยขาเดินเสมอ ปลายทั้งสองจึงเป็นสถานีที่ขึ้น/ลงรถ */
          board:(segs[0] as WalkSeg).to, alight:(segs[segs.length-1] as WalkSeg).to, path:r.path};
}
function drivePlan(from: Point, to: Point, b: Band, rain: boolean): DrivePlan {
  const km=hav(from.lat,from.lng,to.lat,to.lng)*1.42;
  const sp=[15,25,38][b] + Math.min(26,km*0.62);   // ยิ่งไกล ยิ่งได้ใช้ทางด่วน
  let mean=km/sp*60+ (b===0?9:5);           // + parking / last 300 m
  let sd=mean*0.34;
  if(rain){ mean*=1.28; sd*=1.45; }
  const fare=Math.round((km*6.5+40)/5)*5;    // fuel+toll+parking, or taxi-ish
  return {kind:"drive",mean,sd,fare,km,sp,segs:[
    {t:"drive",min:mean,eff:mean,km,sp}],xfers:0};
}
function mixedPlan(from: Point, to: Point, b: Band, rain: boolean): TransitPlan | null {
  const t=transitPlan(from,to,b,rain); if(!t) return null;
  const m: TransitPlan=JSON.parse(JSON.stringify(t)); m.kind="mixed"; m.extra=0;
  let mean=0,varr=0,fare=m.fare;
  for(const s of m.segs){
    let mm=s.eff, sd: number;
    if(s.t==="walk" && s.min>9){
      const viaMin=3+s.min/3.1;              // motorcycle taxi from/to the station
      s.t="moto"; s.walkWas=Math.round(s.min); mm=rain?viaMin*1.2:viaMin;
      sd=mm*0.28; fare+=25; m.extra=(m.extra||0)+25;
    } else if(s.t==="walk"){ sd=mm*0.12; }
    else if(s.t==="wait"){ sd=LINES[s.line].hw[b]*0.34; }
    else if(s.t==="ride"){ sd=mm*(LINES[s.line].spb?0.22:0.09)+(b===0?0.8:0.3); }
    else { sd=mm*0.25+0.8; }
    s.eff=mm; mean+=mm; varr+=sd*sd;
  }
  m.mean=mean; m.sd=Math.sqrt(varr+2.2*2.2); m.fare=fare;
  return m;
}
