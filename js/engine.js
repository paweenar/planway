/* PlanWay — เอนจินหาเส้นทางและโมเดลเวลา (ไม่ผูกกับ DOM) */
/* =======================================================================
   2. GRAPH
   ======================================================================= */
const R2D = Math.PI/180;
function hav(a,b,c,d){
  const dLat=(c-a)*R2D, dLng=(d-b)*R2D, m=(a+c)/2*R2D;
  const x=dLng*Math.cos(m), y=dLat;
  return Math.sqrt(x*x+y*y)*6371;
}
const key=(l,s)=>l+""+s;
const NODES=new Map();     // key -> {line, st, lat, lng, idx}
const ADJ=new Map();       // key -> [{to, min, kind, walk}]
function addAdj(a,b,o){ if(!ADJ.has(a)) ADJ.set(a,[]); ADJ.get(a).push(Object.assign({to:b},o)); }

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
  const A=NODES.get(key(lid,x)), B=NODES.get(key(lid,y));
  const km=hav(A.lat,A.lng,B.lat,B.lng), min=km/LINES[lid].sp*60+0.45;
  addAdj(key(lid,x),key(lid,y),{min,kind:"ride",km});
  addAdj(key(lid,y),key(lid,x),{min,kind:"ride",km});
}
for(const [la,sa,lb,sb,w] of TRANSFERS){
  addAdj(key(la,sa),key(lb,sb),{min:w,kind:"xfer",walk:w});
  addAdj(key(lb,sb),key(la,sa),{min:w,kind:"xfer",walk:w});
}

const WALK_MIN_PER_KM = 13.0;   // ~4.6 km/h incl. crossings & stairs
function band(minOfDay, dayType){
  if(minOfDay>=21*60+30 || minOfDay<6*60) return 2;
  if(dayType==="wd" && ((minOfDay>=6*60+45&&minOfDay<9*60+20)||(minOfDay>=16*60+30&&minOfDay<19*60+45))) return 0;
  return 1;
}
const waitFor=(lid,b)=>LINES[lid].hw[b]/2 + (b===0?0.6:0);   // peak: often miss one train

/* you cannot walk across the Chao Phraya — a walk that crosses it must reach a bridge */
function cross(p,q,a,b){
  const d=(u,v,w)=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
  const s=(x,y)=>x>0?1:(x<0?-1:0);
  return s(d(p,q,a))!==s(d(p,q,b)) && s(d(a,b,p))!==s(d(a,b,q));
}
function crossesRiver(lat1,lng1,lat2,lng2){
  const p=[lat1,lng1], q=[lat2,lng2];
  for(let i=0;i<RIVER.length-1;i++) if(cross(p,q,RIVER[i],RIVER[i+1])) return true;
  return false;
}

/* nearest boardable stations from a point */
function near(pt, maxWalk=26){
  const out=[];
  for(const [k,n] of NODES){
    let w = hav(pt.lat,pt.lng,n.lat,n.lng)*WALK_MIN_PER_KM + 1;
    if(crossesRiver(pt.lat,pt.lng,n.lat,n.lng)) w = w*2.5+12;   // ต้องอ้อมไปขึ้นสะพาน
    if(w<=maxWalk) out.push({k,w,line:n.line});
  }
  out.sort((a,b)=>a.w-b.w);
  const seen=new Map(), pick=[];
  for(const o of out){
    const c=seen.get(o.line)||0;
    if(c<2 && pick.length<8){ pick.push(o); seen.set(o.line,c+1); }
  }
  return pick;
}

/* Dijkstra over station nodes, wait time charged on boarding a line */
function transitRoute(from, to, b){
  const srcs=near(from), dsts=near(to);
  if(!srcs.length||!dsts.length) return null;
  const dstW=new Map(); dsts.forEach(d=>dstW.set(d.k,d.w));
  const g=new Map(), prev=new Map(), pq=[];
  for(const s of srcs){
    const cost=s.w+waitFor(s.line,b);
    if(!g.has(s.k)||cost<g.get(s.k)){ g.set(s.k,cost); prev.set(s.k,null); }
  }
  for(const [k,v] of g) pq.push([v,k]);
  const done=new Set();
  while(pq.length){
    pq.sort((a,b2)=>a[0]-b2[0]);
    const [d,k]=pq.shift();
    if(done.has(k)) continue; done.add(k);
    for(const e of (ADJ.get(k)||[])){
      const add = e.kind==="xfer" ? e.min + waitFor(NODES.get(e.to).line,b) : e.min;
      const nd=d+add;
      if(!g.has(e.to)||nd<g.get(e.to)-1e-9){ g.set(e.to,nd); prev.set(e.to,k); pq.push([nd,e.to]); }
    }
  }
  let best=null;
  for(const [k,w] of dstW){ if(g.has(k)){ const t=g.get(k)+w; if(!best||t<best.total) best={k,total:t,egress:w}; } }
  if(!best) return null;
  const path=[]; let cur=best.k;
  while(cur){ path.unshift(cur); cur=prev.get(cur); }
  const accessW = srcs.find(s=>s.k===path[0]).w;
  return {path,total:best.total,accessWalk:accessW,egressWalk:best.egress};
}

/* path -> readable segments */
function segments(route,b){
  const segs=[], p=route.path;
  segs.push({t:"walk",min:route.accessWalk,to:NODES.get(p[0])});
  let i=0;
  while(i<p.length-1){
    const line=NODES.get(p[i]).line;
    segs.push({t:"wait",min:waitFor(line,b),line});
    let j=i, hops=0, ride=0;
    while(j<p.length-1){
      const e=(ADJ.get(p[j])||[]).find(x=>x.to===p[j+1]);
      if(!e||e.kind!=="ride") break;
      ride+=e.min; hops++; j++;
    }
    segs.push({t:"ride",min:ride,line,from:NODES.get(p[i]).st,to:NODES.get(p[j]).st,hops});
    if(j<p.length-1){
      const e=(ADJ.get(p[j])||[]).find(x=>x.to===p[j+1]);
      segs.push({t:"xfer",min:e.min,at:NODES.get(p[j]).st,from:NODES.get(p[j]).line,to:NODES.get(p[j+1]).line});
      i=j+1;
    } else i=j;
  }
  segs.push({t:"walk",min:route.egressWalk,last:true,to:NODES.get(p[p.length-1])});
  return segs;
}

/* =======================================================================
   3. TIME MODEL — mean, spread, fare, per mode
   ======================================================================= */
const Z={50:0,80:0.84,90:1.28,95:1.645};

/* ---- เวลาให้บริการ ----
   ก่อนหน้านี้เอนจินไม่รู้ว่ารถหยุดวิ่งกี่โมง นัดตีสองจึงถูกเสนอเส้นทาง BTS ที่ไม่มีอยู่จริง
   svc ใน LINES เป็นเวลาเปิด-ปิดที่ผู้ให้บริการประกาศ ไม่ใช่ตารางเดินรถ จึงใช้ "เตือน" เท่านั้น */
const svcOf = lid => (LINES[lid] && LINES[lid].svc) || [0, 1440];

/* ปิดเที่ยงคืน (last = 1440) หมายถึงขบวนสุดท้ายออกก่อนเที่ยงคืน ไม่ใช่วิ่งข้ามคืน */
function svcOpen(lid, min){
  const [a, b] = svcOf(lid);
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return b >= 1440 ? m >= a : (m >= a && m <= b);
}

/* เดินเวลาจากนาทีที่ออกจากบ้าน บวกทีละช่วงแบบเดียวกับที่ไทม์ไลน์วาด
   แล้วดูว่าตอนถึงคิวขึ้นรถแต่ละขา สายนั้นยังเปิดอยู่ไหม
   (ช่วง wait มาก่อน ride เสมอ เวลา ณ ขา ride จึงเป็นเวลาที่ขึ้นรถจริง) */
function svcCheck(plan, leaveMin){
  const out = [];
  if (!plan || plan.kind === "drive") return out;
  let tm = leaveMin;
  for (const s of plan.segs){
    if (s.t === "ride" && !svcOpen(s.line, tm)){
      const [a, b] = svcOf(s.line);
      const m = ((Math.round(tm) % 1440) + 1440) % 1440;
      out.push({ line:s.line, at:tm, from:s.from, to:s.to,
                 kind: m < a ? "before" : "after", first:a, last:b });
    }
    tm += (s.eff != null ? s.eff : s.min);
  }
  return out;
}

function fareOf(lid,hops){
  const [base,per,cap]=LINES[lid].fare;
  return Math.min(cap, base+per*Math.max(0,hops-1));
}
function transitPlan(from,to,b,rain){
  const r=transitRoute(from,to,b); if(!r) return null;
  const segs=segments(r,b);
  let mean=0,varr=0,fare=0,xfers=0,walk=0,wait=0,ride=0;
  for(const s of segs){
    let m=s.min, sd=0;
    if(s.t==="walk"){ sd=m*0.12; if(rain){m*=1.25; sd*=1.6;} walk+=m; }
    if(s.t==="wait"){ sd=LINES[s.line].hw[b]*0.34; if(rain) sd*=1.15; wait+=m; }
    if(s.t==="ride"){ sd=m*0.09+(b===0?0.8:0.3); if(rain){m*=1.04; sd*=1.15;} ride+=m; fare+=fareOf(s.line,s.hops); }
    if(s.t==="xfer"){ sd=m*0.25+0.8; if(rain){m*=1.15; sd*=1.3;} xfers++; walk+=m; }
    s.eff=m; mean+=m; varr+=sd*sd;
  }
  varr += 2.2*2.2;   // ความคลาดเคลื่อนพื้นฐาน: หาทางออกสถานี ต่อคิว ตกขบวน
  return {kind:"transit",segs,mean,sd:Math.sqrt(varr),fare,xfers,walk,wait,ride,
          board:segs[0].to, alight:segs[segs.length-1].to, path:r.path};
}
function drivePlan(from,to,b,rain){
  const km=hav(from.lat,from.lng,to.lat,to.lng)*1.42;
  const sp=[15,25,38][b] + Math.min(26,km*0.62);   // ยิ่งไกล ยิ่งได้ใช้ทางด่วน
  let mean=km/sp*60+ (b===0?9:5);           // + parking / last 300 m
  let sd=mean*0.34;
  if(rain){ mean*=1.28; sd*=1.45; }
  const fare=Math.round((km*6.5+40)/5)*5;    // fuel+toll+parking, or taxi-ish
  return {kind:"drive",mean,sd,fare,km,sp,segs:[
    {t:"drive",min:mean,eff:mean,km,sp}],xfers:0};
}
function mixedPlan(from,to,b,rain){
  const t=transitPlan(from,to,b,rain); if(!t) return null;
  const m=JSON.parse(JSON.stringify(t)); m.kind="mixed"; m.extra=0;
  let mean=0,varr=0,fare=m.fare;
  for(const s of m.segs){
    let mm=s.eff, sd;
    if(s.t==="walk" && s.min>9){
      const viaMin=3+s.min/3.1;              // motorcycle taxi from/to the station
      s.t="moto"; s.walkWas=Math.round(s.min); mm=rain?viaMin*1.2:viaMin;
      sd=mm*0.28; fare+=25; m.extra+=25;
    } else if(s.t==="walk"){ sd=mm*0.12; }
    else if(s.t==="wait"){ sd=LINES[s.line].hw[b]*0.34; }
    else if(s.t==="ride"){ sd=mm*0.09+(b===0?0.8:0.3); }
    else { sd=mm*0.25+0.8; }
    s.eff=mm; mean+=mm; varr+=sd*sd;
  }
  m.mean=mean; m.sd=Math.sqrt(varr+2.2*2.2); m.fare=fare;
  return m;
}
