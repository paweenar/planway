/* PlanWay — state, การคำนวณย้อนหลัง, การวาดหน้าจอ
   ข้อความทุกบรรทัดในไฟล์นี้ต้องผ่าน t() และชื่อสถานีทุกจุดต้องผ่าน sname()
   มิฉะนั้นการสลับภาษาจะไม่ครบ */
/* =======================================================================
   4. STATE
   ======================================================================= */
const S={
  origin:"อารีย์", dest:"ศูนย์ประชุมสิริกิติ์", arrive:9*60, dayType:"wd",
  /* conf ไม่มีปุ่มให้เลือกแล้ว คงไว้ที่ 90% ซึ่งเป็นค่าที่เหมาะกับนัดงานทั่วไป
     ถ้าอยากเปิดให้ผู้ใช้เลือกอีกครั้ง เพิ่มปุ่ม data-conf กลับเข้าไปใน index.html ได้เลย */
  cushion:10, conf:90, wxMode:"auto", wxDay:null, wxTab:"temp", mapView:"live", mode:"transit", tab:"one",
  prep:[{k:"shower",m:25,on:true},{k:"food",m:15,on:true},
        {k:"pack",m:8,on:true},{k:"exit",m:5,on:true}],
  day:[{p:"ศูนย์ประชุมสิริกิติ์",t:9*60,stay:90},{p:"เซ็นทรัลเวิลด์",t:12*60,stay:60},
       {p:"ม.เกษตรศาสตร์ บางเขน",t:15*60,stay:60}]
};
try{ const raw=localStorage.getItem("okd.v2"); if(raw) Object.assign(S,JSON.parse(raw)); }catch(e){}
function save(){ try{ localStorage.setItem("okd.v2",JSON.stringify(S)); }catch(e){} }
/* วันที่ค้างใน localStorage จากการเปิดครั้งก่อนอาจผ่านไปแล้ว ให้กลับมาเป็นวันนี้ */
if(S.wxDay && S.wxDay < wxToday()) S.wxDay=null;

/* รายการเตรียมตัวที่มากับโปรแกรมเก็บเป็นคีย์ (k) จึงแปลภาษาได้
   ส่วนรายการที่ผู้ใช้พิมพ์เองเก็บเป็นข้อความดิบ (n) และคงไว้ตามที่พิมพ์ */
const prepName=p=>p.k?t("prep."+p.k):(p.n||"");

function resolve(q){
  q=(q||"").trim(); if(!q) return null;
  /* สถานที่ที่ผู้ใช้เลือกจากผลค้นหาออนไลน์ ต้องมาก่อนเสมอ */
  if(FOUND.has(q)){ const p=FOUND.get(q); return {name:p.name,lat:p.lat,lng:p.lng,type:"geo"}; }
  /* ผู้ใช้อาจพิมพ์ชื่ออังกฤษ — แปลงกลับเป็นชื่อไทยซึ่งเป็นคีย์จริงของกราฟก่อน */
  const qn=q.toLowerCase();
  let alt=NAME_TH[qn];
  if(!alt && qn.length>=2){
    for(const en in NAME_TH) if(en.startsWith(qn)){ alt=NAME_TH[en]; break; }
    if(!alt) for(const en in NAME_TH) if(en.includes(qn)){ alt=NAME_TH[en]; break; }
  }
  for(const c of (alt?[alt,q]:[q])){
    const pl=PLACES.find(p=>p[0]===c) || PLACES.find(p=>p[0].includes(c));
    if(pl) return {name:pl[0],lat:pl[1],lng:pl[2],type:"place"};
    for(const [k,n] of NODES) if(n.st===c) return {name:n.st,lat:n.lat,lng:n.lng,type:"station",line:n.line};
    for(const [k,n] of NODES) if(n.st.includes(c)) return {name:n.st,lat:n.lat,lng:n.lng,type:"station",line:n.line};
  }
  return null;
}
/* ---- สภาพอากาศ ----
   RAIN  = สรุปแล้วว่าช่วงเดินทางนับเป็นฝนตกไหม (เอนจินรับค่านี้ไปคิดเวลาเดินและรถติด)
   WXNOW = รายละเอียดพยากรณ์ของช่วงนั้น ไว้แสดงให้ผู้ใช้เห็นว่าตัดสินจากอะไร */
let RAIN=false, WXNOW=null, lastWxAt=null;
function syncWeather(){
  if(S.wxMode==="rain"){ RAIN=true;  WXNOW=null; return; }
  if(S.wxMode==="dry"){  RAIN=false; WXNOW=null; return; }
  /* ดูเฉพาะช่วงที่อยู่นอกบ้านจริง ใช้เวลาเดินทางจากการคำนวณรอบก่อนเป็นตัวตั้ง
     (รอบแรกยังไม่มี จึงเดา 60 นาที แล้วรอบถัดไปจะตรงเอง) */
  const target=S.arrive-S.cushion;
  const dur=(LAST&&!LAST.err)?Math.min(180,Math.max(25,LAST.travel)):60;
  const from=Math.max(0,target-dur);
  WXNOW=wxWindow(S.wxDay||wxToday(),from,target);
  if(WXNOW){ WXNOW.fromMin=from; WXNOW.toMin=target; }
  RAIN=wxIsRain(WXNOW);
}

const prepTotal=()=>S.prep.filter(p=>p.on).reduce((a,p)=>a+(+p.m||0),0);
function hhmm(m){ m=((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); }
const mins=n=>t("unit.min",{n:Math.round(n)});
const lc=l=>isDark()?LINES[l].cd:LINES[l].c;

/* =======================================================================
   5. COMPUTE
   ======================================================================= */
function compute(){
  const A=resolve(S.origin), B=resolve(S.dest);
  if(!A||!B) return {err: !A? t("err.origin",{q:S.origin}) : t("err.dest",{q:S.dest}),
                     errField: !A?"origin":"dest", errQ: !A?S.origin:S.dest};
  if(A.name===B.name) return {err:t("err.same")};

  const target=S.arrive-S.cushion;
  let b=band(target,S.dayType), plans=null, leave=target;
  for(let it=0;it<3;it++){
    plans={
      transit:transitPlan(A,B,b,RAIN),
      drive:drivePlan(A,B,b,RAIN),
      mixed:mixedPlan(A,B,b,RAIN)
    };
    const p=plans[S.mode]||plans.drive;
    leave=target-(p.mean+Z[S.conf]*p.sd);
    const nb=band(leave,S.dayType);
    if(nb===b) break; b=nb;
  }
  const fallback=!plans[S.mode];
  const p=plans[S.mode]||plans.drive;
  const buffer=Z[S.conf]*p.sd;
  const travel=p.mean+buffer;
  const prep=prepTotal();
  return {A,B,b,plans,plan:p,buffer,travel,leave:target-travel,
          prepStart:target-travel-prep,prep,target,
          mode:fallback?"drive":S.mode,fallback};
}

/* =======================================================================
   6. RENDER
   ======================================================================= */
const $=s=>document.querySelector(s);
const el=(t2,c,txt)=>{const e=document.createElement(t2); if(c)e.className=c; if(txt!=null)e.textContent=txt; return e;};

const esc=x=>String(x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- ช่องค้นหาสถานที่พร้อมรายการแนะนำ ----------
   ผูกกับ input ตัวไหนก็ได้ ผลจากข้อมูลในเครื่องขึ้นทันที ส่วนผลจากเน็ตตามมาทีหลัง */
function attachAC(input,onPick){
  const wrap=input.parentElement;
  wrap.classList.add("acwrap");
  const list=el("div","aclist hide");
  wrap.appendChild(list);
  let timer=null, items=[], idx=-1, lastQ=null;

  const close=()=>{ list.classList.add("hide"); idx=-1; };
  const render=()=>{
    if(!items.length){ close(); return; }
    list.innerHTML="";
    items.forEach((p,i)=>{
      const b=el("button","acitem"+(i===idx?" on":"")); b.type="button"; b.tabIndex=-1;
      b.innerHTML='<span class="acn">'+esc(sname(p.name))+'</span>'+
        (p.detail?'<span class="acd">'+esc(p.detail)+'</span>':"")+
        '<span class="ack">'+t("ac."+(p.kind||"geo"))+'</span>';
      b.onmousedown=e=>{ e.preventDefault(); pick(p); };
      list.appendChild(b);
    });
    list.classList.remove("hide");
  };
  const pick=p=>{
    /* ที่มาจากเน็ตต้องจำพิกัดไว้ ไม่งั้น resolve() หาไม่เจอในรอบถัดไป */
    if(p.kind==="geo") rememberPlace({name:p.name,lat:p.lat,lng:p.lng,detail:p.detail});
    input.value=sname(p.name);
    close();
    onPick(p);
  };
  const run=()=>{
    const q=input.value.trim();
    lastQ=q;
    items=q?searchLocal(q):[];
    render();
    if(q.length<2) return;
    searchOnline(q).then(res=>{
      if(input.value.trim()!==lastQ) return;      /* ผู้ใช้พิมพ์ต่อไปแล้ว ผลนี้ตกรุ่น */
      const seen=new Set(items.map(x=>x.name));
      items=items.concat(res.filter(r=>!seen.has(r.name))).slice(0,9);
      render();
    });
  };
  input.addEventListener("input",()=>{ clearTimeout(timer); timer=setTimeout(run,220); });
  input.addEventListener("focus",()=>{ if(input.value.trim()) run(); });
  input.addEventListener("blur",()=>setTimeout(close,140));
  input.addEventListener("keydown",e=>{
    if(list.classList.contains("hide")) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); idx=Math.min(idx+1,items.length-1); render(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); idx=Math.max(idx-1,0); render(); }
    else if(e.key==="Enter"&&idx>=0){ e.preventDefault(); pick(items[idx]); }
    else if(e.key==="Escape") close();
  });
  return {close};
}

function renderPrep(){
  const host=$("#prepList"); host.innerHTML="";
  S.prep.forEach((p,i)=>{
    const r=el("label","chk");
    const cb=el("input"); cb.type="checkbox"; cb.checked=p.on; cb.id="prep-on-"+i;
    cb.onchange=()=>{p.on=cb.checked; save(); draw();};
    const nm=el("span","nm",prepName(p));
    const nu=el("input"); nu.type="number"; nu.min=0; nu.max=240; nu.value=p.m; nu.id="prep-m-"+i;
    nu.setAttribute("aria-label",t("prep.minsFor",{n:prepName(p)}));
    nu.oninput=()=>{p.m=+nu.value||0; save(); draw();};
    const u=el("span","u",t("unit.minShort"));
    const rm=el("button","rm","×"); rm.type="button"; rm.title=t("prep.remove");
    rm.onclick=()=>{S.prep.splice(i,1); save(); renderPrep(); draw();};
    r.append(cb,nm,nu,u,rm); host.appendChild(r);
  });
  $("#prepTotal").textContent=prepTotal();
  $("#prepUnit").textContent=t("unit.minShort");
}

function tlItem(clock,title,sub,dur,color,xf){
  const li=el("li");
  const c=el("div","clock mono",clock); if(!clock) c.className="clock mono dim";
  const rail=el("div","rail"); const i=el("i"), b=el("b",xf?"xf":"");
  if(color){ i.style.background=color; b.style.borderColor=color; }
  rail.append(i,b);
  const body=el("div","body");
  body.appendChild(title);
  if(sub) body.appendChild(el("div","sub",sub));
  if(dur) body.appendChild(el("div","dur",dur));
  li.append(c,rail,body); return li;
}
function tagEl(lid){
  const s=el("span","badge",ltag(lid));
  s.style.background=lc(lid); s.style.color="#fff";
  if(lid==="yellow") s.style.color="#3A2F00";
  return s;
}

function renderTimeline(r){
  const host=$("#timeline"); host.innerHTML="";
  let tm=r.prepStart;
  for(const p of S.prep.filter(x=>x.on)){
    host.appendChild(tlItem(hhmm(tm),el("div","ttl",prepName(p)),null,mins(p.m),"var(--line2)"));
    tm+=+p.m||0;
  }
  host.appendChild(tlItem(hhmm(r.leave),el("div","ttl",t("tl.leave")),null,null,"var(--accent)"));
  tm=r.leave;

  if(r.plan.kind==="drive"){
    host.appendChild(tlItem(hhmm(tm),el("div","ttl",t("tl.drive",{p:sname(r.B.name)})),
      t("tl.driveSub",{km:Math.round(r.plan.km),sp:Math.round(r.plan.sp)}),
      mins(r.plan.mean),"var(--ink2)"));
    tm+=r.plan.mean;
  } else {
    for(const s of r.plan.segs){
      if(s.t==="walk"){
        host.appendChild(tlItem(hhmm(tm),
          el("div","ttl",t(s.last?"tl.walkFrom":"tl.walkTo",{p:sname(s.to.st)})),
          s.last?t("tl.walkSub",{p:sname(r.B.name)}):null, mins(s.eff),"var(--line2)"));
      } else if(s.t==="moto"){
        host.appendChild(tlItem(hhmm(tm),
          el("div","ttl",t(s.last?"tl.motoFrom":"tl.motoTo",{p:sname(s.to.st)})),
          t("tl.motoSub",{n:s.walkWas}), mins(s.eff),"var(--warn)"));
      } else if(s.t==="wait"){
        const ttl=el("div","ttl"); ttl.append(tagEl(s.line),document.createTextNode(" "+t("tl.wait")));
        host.appendChild(tlItem(hhmm(tm),ttl,t("tl.waitSub",{n:LINES[s.line].hw[r.b]}),mins(s.eff),lc(s.line)));
      } else if(s.t==="ride"){
        const ttl=el("div","ttl");
        ttl.append(tagEl(s.line),document.createTextNode(" "+sname(s.from)+" → "+sname(s.to)));
        host.appendChild(tlItem(hhmm(tm),ttl,t("tl.rideSub",{n:s.hops,line:lname(s.line)}),mins(s.eff),lc(s.line)));
      } else if(s.t==="xfer"){
        host.appendChild(tlItem(hhmm(tm),el("div","ttl",t("tl.xfer",{p:sname(s.at)})),
          lname(s.from)+" → "+lname(s.to), mins(s.eff),"var(--ink3)",true));
      }
      tm+=s.eff;
    }
  }
  host.appendChild(tlItem(hhmm(tm),el("div","ttl",t("tl.buffer")),t("tl.bufferSub"),mins(r.buffer),"var(--accent)"));
  host.appendChild(tlItem(hhmm(r.target),el("div","ttl",t("tl.arrive",{p:sname(r.B.name)})),
    t("tl.arriveSub",{n:S.cushion}),null,null));
}

function renderBreakdown(r){
  const host=$("#breakdown"); host.innerHTML="";
  const rows=[];
  if(r.plan.kind==="drive"){
    const park=r.b===0?9:5;
    rows.push([t("bd.driveTime"),mins(r.plan.mean-park)]);
    rows.push([t("bd.parking"),mins(park)]);
  } else {
    rows.push([t("bd.walk"),mins(r.plan.walk)]);
    rows.push([t("bd.wait"),mins(r.plan.wait)]);
    rows.push([t("bd.ride"),mins(r.plan.ride)]);
  }
  rows.push([t("bd.buffer",{n:S.conf}),mins(r.buffer)]);
  rows.push([t("bd.cushion"),mins(S.cushion)]);
  for(const [n,v] of rows){
    const li=el("li"); li.append(el("span","n",n),el("span","v mono",v)); host.appendChild(li);
  }
  const li=el("li","sum");
  li.append(el("span","n",t("bd.total")),el("span","v mono",mins(r.travel+S.cushion)));
  host.appendChild(li);
  const li2=el("li");
  li2.append(el("span","n",t("bd.plusPrep")),el("span","v mono",mins(r.prep)));
  host.appendChild(li2);
}

function renderTips(r){
  const host=$("#tips"); host.innerHTML="";
  const tips=[];
  if(r.plan.kind!=="drive"){
    if(r.plan.xfers>0) tips.push([t("mk.xfer"),t("tip.xfer",{n:r.plan.xfers,
      m:Math.round(r.plan.segs.filter(s=>s.t==="xfer").reduce((a,s)=>a+s.eff,0))})]);
    const lines=[...new Set(r.plan.segs.filter(s=>s.t==="ride").map(s=>s.line))];
    const needCard=lines.some(l=>["sukhumvit","silom"].includes(l));
    const needMrt=lines.some(l=>["blue","purple"].includes(l));
    if(needCard&&needMrt) tips.push([t("mk.fare"),t("tip.fareBoth",{f:r.plan.fare})]);
    else tips.push([t("mk.fare"),t("tip.fare",{f:r.plan.fare,
      extra:r.plan.extra?t("tip.fareExtra",{e:r.plan.extra}):""})]);
    const eg=r.plan.segs[r.plan.segs.length-1];
    if(eg.eff>=10) tips.push([t("mk.lastleg"),t("tip.lastleg",{p:sname(eg.to.st),
      how:t(eg.t==="moto"?"how.moto":"how.walk"),n:Math.round(eg.eff)})]);
    if(r.b===0) tips.push([t("mk.rush"),t("tip.rush")]);
    if(r.plan.segs.some(s=>s.t==="ride"&&s.line==="boat")) tips.push([t("mk.boat"),t("tip.boat")]);
  } else {
    tips.push([t("mk.parking"),t("tip.parking",{n:r.b===0?9:5})]);
    tips.push([t("mk.cost"),t("tip.cost",{f:r.plan.fare})]);
    tips.push([t("mk.reliab"),t("tip.reliab",{n:Math.round(r.buffer)})]);
  }
  if(RAIN) tips.push([t("mk.rain"),t("tip.rain")]);
  if(r.prepStart<5*60+30) tips.push([t("mk.early"),t("tip.early",{t:hhmm(r.prepStart)})]);
  if(r.leave<r.prepStart) tips.push([t("mk.check"),t("tip.check")]);
  for(const [m,txt] of tips){
    const li=el("li"); li.append(el("span","mk",m),el("span",null,txt)); host.appendChild(li);
  }
}

function renderModes(r){
  const host=$("#modes"); host.innerHTML="";
  for(const k of ["transit","mixed","drive"]){
    const p=r.plans[k];
    const b=el("button","mode"); b.type="button";
    b.setAttribute("aria-pressed",String(r.mode===k));
    b.appendChild(el("div","mn",t("mode."+k)));
    if(!p){
      b.appendChild(el("div","mt mono","—"));
      b.appendChild(el("div","ms",t("mode.none")));
      b.disabled=true;
    } else {
      const tt=r.target-(p.mean+Z[S.conf]*p.sd);
      b.appendChild(el("div","mt mono",hhmm(tt)));
      b.appendChild(el("div","ms",t("mode.sub",{a:Math.round(p.mean),b:Math.round(p.mean+Z[S.conf]*p.sd)})));
      b.appendChild(el("div","mx", k==="drive"
        ? t("mode.kmfare",{km:Math.round(p.km),f:p.fare})
        : t("mode.xfare",{n:p.xfers,f:p.fare})));
      b.onclick=()=>{S.mode=k; save(); draw();};
    }
    host.appendChild(b);
  }
}

/* ---------- map ---------- */
function renderMap(r){
  /* viewBox กว้างเท่าช่องที่วางจริง ๆ เพื่อให้ 1 หน่วย = 1 พิกเซลบนจอ
     ถ้าตรึง W ไว้ที่ค่าเดียว ตัวหนังสือใน SVG จะถูกย่อตามความกว้างช่องจนอ่านไม่ออกบนจอแคบ */
  const hostW=$("#mapHost").clientWidth||820;
  const W=Math.round(Math.max(320,Math.min(1000,hostW)));
  const PAD=Math.round(Math.max(16,W*0.03));
  const FS=W<430?12:14;
  /* กรอบภาพจับเฉพาะเส้นทางที่เลือก ไม่ใช่ทั้งโครงข่าย */
  let focus=[];
  if(r && !r.err){
    focus.push([r.A.lat,r.A.lng],[r.B.lat,r.B.lng]);
    if(r.plan.kind!=="drive" && r.plan.path)
      for(const k of r.plan.path){ const n=NODES.get(k); focus.push([n.lat,n.lng]); }
  } else for(const n of NODES.values()) focus.push([n.lat,n.lng]);

  let la0=Math.min(...focus.map(p=>p[0])), la1=Math.max(...focus.map(p=>p[0]));
  let lo0=Math.min(...focus.map(p=>p[1])), lo1=Math.max(...focus.map(p=>p[1]));
  const padLa=Math.max((la1-la0)*0.22,0.012), padLo=Math.max((lo1-lo0)*0.22,0.012);
  la0-=padLa; la1+=padLa; lo0-=padLo; lo1+=padLo;
  const mid=(la0+la1)/2*R2D, kx=Math.cos(mid);
  const wLo=(lo1-lo0)*kx, hLa=(la1-la0);
  /* ความสูงวิ่งตามสัดส่วนของเส้นทาง เส้นทางแนวตั้งจึงได้ภาพสูง ไม่เหลือที่ว่างสองข้าง
     แต่ต้องมีเพดาน ไม่งั้นเส้นทางแนวตั้งจะได้แผนที่ยาวเป็นพืดเต็มจอ */
  let s=(W-PAD*2)/wLo;
  let H=Math.round(hLa*s+PAD*2);
  H=Math.min(560,Math.max(H,300,Math.round(W*0.46)));
  s=Math.min((W-PAD*2)/wLo,(H-PAD*2)/hLa);
  const ox=PAD+((W-PAD*2)-wLo*s)/2, oy=PAD+((H-PAD*2)-hLa*s)/2;
  const X=lng=>ox+(lng-lo0)*kx*s, Y=lat=>H-oy-(lat-la0)*s;

  let g='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+t("map.aria")+'">';
  g+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="var(--surface)"/>';
  g+='<polyline fill="none" stroke="var(--surface3)" stroke-width="9" stroke-linejoin="round" points="'+
      RIVER.map(p=>X(p[1]).toFixed(1)+","+Y(p[0]).toFixed(1)).join(" ")+'"/>';

  for(const [lid,L] of Object.entries(LINES)){
    const pts=L.st.map(st=>X(st[2]).toFixed(1)+","+Y(st[1]).toFixed(1)).join(" ");
    g+='<polyline fill="none" stroke="'+lc(lid)+'" stroke-width="2.6" stroke-opacity=".34" stroke-linecap="round" stroke-linejoin="round" points="'+pts+'"/>';
  }
  for(const [lid,a,b2] of EXTRA_EDGES){
    const A=NODES.get(key(lid,a)),B=NODES.get(key(lid,b2));
    g+='<line x1="'+X(A.lng).toFixed(1)+'" y1="'+Y(A.lat).toFixed(1)+'" x2="'+X(B.lng).toFixed(1)+'" y2="'+Y(B.lat).toFixed(1)+
       '" stroke="'+lc(lid)+'" stroke-width="2.6" stroke-opacity=".34"/>';
  }
  for(const n of NODES.values())
    g+='<circle class="stdot" data-st="'+n.st+'" cx="'+X(n.lng).toFixed(1)+'" cy="'+Y(n.lat).toFixed(1)+
       '" r="4.2" fill="transparent" stroke="transparent" stroke-width="7"><title>'+sname(n.st)+'</title></circle>';

  if(r && !r.err){
    if(r.plan.kind==="drive"){
      const a=r.A,b2=r.B;
      g+='<path d="M'+X(a.lng).toFixed(1)+' '+Y(a.lat).toFixed(1)+' Q'+
          ((X(a.lng)+X(b2.lng))/2+34).toFixed(1)+' '+((Y(a.lat)+Y(b2.lat))/2-34).toFixed(1)+' '+
          X(b2.lng).toFixed(1)+' '+Y(b2.lat).toFixed(1)+'" fill="none" stroke="var(--ink2)" stroke-width="3.4" stroke-dasharray="9 7"/>';
    } else {
      const p=r.plan.path;
      for(let i=0;i<p.length-1;i++){
        const A=NODES.get(p[i]),B=NODES.get(p[i+1]);
        const same=A.line===B.line;
        g+='<line x1="'+X(A.lng).toFixed(1)+'" y1="'+Y(A.lat).toFixed(1)+'" x2="'+X(B.lng).toFixed(1)+'" y2="'+Y(B.lat).toFixed(1)+
           '" stroke="'+lc(A.line)+'" stroke-width="'+(same?6.4:3)+'" stroke-linecap="round"'+(same?"":' stroke-dasharray="3 4"')+'/>';
      }
      for(const k of p){
        const n=NODES.get(k);
        g+='<circle cx="'+X(n.lng).toFixed(1)+'" cy="'+Y(n.lat).toFixed(1)+'" r="3.6" fill="var(--surface)" stroke="'+lc(n.line)+'" stroke-width="2.2"/>';
      }
      const bd=r.plan.board, al=r.plan.alight;
      /* ขาเดิน/วิน จากประตูบ้านถึงชานชาลา วาดเป็นเส้นประ */
      for(const [pt,st] of [[r.A,bd],[r.B,al]]) if(pt&&st)
        g+='<line x1="'+X(pt.lng).toFixed(1)+'" y1="'+Y(pt.lat).toFixed(1)+'" x2="'+X(st.lng).toFixed(1)+'" y2="'+Y(st.lat).toFixed(1)+
           '" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>';

      /* ป้ายชื่อสถานีต้องอยู่ในกรอบเสมอ ไม่งั้นชื่อยาว ๆ (โดยเฉพาะภาษาอังกฤษ) จะถูกตัดหายไปนอกภาพ
         คำนวณความกว้างโดยประมาณจากจำนวนตัวอักษร แล้วเลือกด้าน + ดันกลับเข้ากรอบ */
      const fit=(x,y,chars,dy)=>{
        const CW=0.64;                       /* ความกว้างเฉลี่ยต่อตัวอักษร เทียบกับขนาดฟอนต์ */
        const fs=Math.max(9,Math.min(FS,(W-16)/(chars*CW)));
        const w2=chars*fs*CW;
        let right=x<W*0.58, tx=right?x+11:x-11;
        tx = right ? Math.max(6,Math.min(tx,W-6-w2)) : Math.min(W-6,Math.max(tx,6+w2));
        return {tx,ty:Math.max(fs+2,Math.min(y+dy,H-5)),anchor:right?"start":"end",fs};
      };

      const mark=[[t("map.board"),bd],[t("map.alight"),al]];
      r.plan.segs.filter(s=>s.t==="xfer").forEach(s=>mark.push([t("map.xfer"),NODES.get(key(s.from,s.at))]));
      for(const [kind,n] of mark){
        if(!n) continue;
        const x=X(n.lng),y=Y(n.lat), nm=sname(n.st);
        const f=fit(x,y,nm.length+kind.length*0.85+1,16);
        g+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="6.4" fill="var(--surface)" stroke="var(--accent)" stroke-width="3"/>';
        g+='<text x="'+f.tx.toFixed(1)+'" y="'+f.ty.toFixed(1)+'" text-anchor="'+f.anchor+
           '" font-family="IBM Plex Mono, monospace" font-size="'+f.fs.toFixed(1)+'" font-weight="500" fill="var(--ink)">'+
           nm+' <tspan fill="var(--ink3)" font-size="'+(f.fs-2).toFixed(1)+'">'+kind+'</tspan></text>';
      }
      for(const [pt,st,lab] of [[r.A,bd,t("map.start")],[r.B,al,t("map.end")]]){
        const x=X(pt.lng),y=Y(pt.lat);
        g+='<rect x="'+(x-4.5).toFixed(1)+'" y="'+(y-4.5).toFixed(1)+'" width="9" height="9" fill="var(--accent)" transform="rotate(45 '+x.toFixed(1)+' '+y.toFixed(1)+')"/>';
        const near2 = st && hav(pt.lat,pt.lng,st.lat,st.lng)<=0.4;
        const txt = near2 ? lab : lab+" "+sname(pt.name);
        const f=fit(x,y,txt.length,-9);
        g+='<text x="'+f.tx.toFixed(1)+'" y="'+f.ty.toFixed(1)+'" text-anchor="'+f.anchor+
           '" font-family="Anuphan, sans-serif" font-size="'+f.fs.toFixed(1)+'" font-weight="600" fill="var(--accent2)">'+
           txt+'</text>';
      }
    }
  }
  g+='</svg>';
  $("#mapHost").innerHTML=g;
  $("#mapHost").querySelectorAll(".stdot").forEach(c=>{
    c.style.cursor="pointer";
    c.addEventListener("click",()=>{
      S.dest=c.getAttribute("data-st"); $("#dest").value=sname(S.dest); save(); draw();
    });
  });
}

/* การ์ดแผนที่มีสองมุมมอง: แผนที่จริงที่เลื่อน/ซูมได้ (Leaflet) กับผังเส้นทาง SVG แบบเดิม
   ถ้าโหลด Leaflet ไม่ได้ (ออฟไลน์ / CDN ถูกบล็อก) จะซ่อนแท็บแล้วใช้ผังเส้นทางอย่างเดียว */
function renderMapCard(r){
  const can=liveOK(), live=can && S.mapView!=="plan";
  document.querySelectorAll("[data-mapv]").forEach(b=>
    b.setAttribute("aria-pressed",String((b.dataset.mapv==="live")===live)));
  document.querySelector(".maptabs").classList.toggle("hide",!can);
  $("#mapLive").classList.toggle("hide",!live);
  $("#mapLive").classList.toggle("dark",isDark());
  $("#mapHost").classList.toggle("hide",live);
  $("#mapHint").textContent = !can ? t("map.noLive") : (live?t("map.hintLive"):t("map.hint"));
  const gm=$("#gmLink");
  gm.href=googleMapsUrl(r);
  gm.classList.toggle("hide",!r||!!r.err);
  if(live){ liveTheme(); liveDraw(r); liveResize(); } else renderMap(r);
  $("#mapLegend").innerHTML=Object.keys(LINES).map(lid=>
    '<span><i style="background:'+lc(lid)+'"></i>'+lname(lid)+'</span>').join("");
}

/* ---------- สภาพอากาศ ---------- */
function dayLabel(iso){
  const today=wxToday();
  if(iso===today) return t("wx.today");
  const tm=new Date(today+"T00:00"); tm.setDate(tm.getDate()+1);
  if(iso===wxISO(tm)) return t("wx.tomorrow");
  const d=new Date(iso+"T00:00");
  return t("dow."+d.getDay())+" "+d.getDate()+"/"+(d.getMonth()+1);
}
function pickDay(iso){
  S.wxDay=iso;
  const g=new Date(iso+"T00:00").getDay();
  S.dayType=(g===0||g===6)?"we":"wd";
  $("#daytype").value=S.dayType;
  save(); draw(); if(S.tab==="day") drawDay();
}
/* สถานี/สถานที่ในข้อมูลของเราที่ใกล้พิกัดนี้ที่สุด
   ใช้ตอนกด "ใช้ตำแหน่งของฉัน" เพื่อตั้งจุดเริ่มต้น และใช้เป็นชื่อพื้นที่สำรองถ้าอ่านชื่อเขตไม่ได้ */
function nearestPlace(lat,lng){
  let best=null,bd=1e9;
  const test=(nm,la,lo)=>{ const d=hav(lat,lng,la,lo); if(d<bd){bd=d;best=nm;} };
  for(const p of PLACES) test(p[0],p[1],p[2]);
  for(const n of NODES.values()) test(n.st,n.lat,n.lng);
  return {name:best,km:bd};
}
function nowProb(){
  const d=WX&&WX.byDate[wxToday()], e=d&&d.hours[wxNowHour()];
  return e?e.prob:(d?d.pmax:0);
}

function renderWxPlace(){
  const host=$("#wxPlace"); host.innerHTML="";
  const A=resolve(S.origin);
  const bits=[];
  if(A) bits.push('<b>'+sname(A.name)+'</b>');
  else if(WX) bits.push('<b>'+t("wx.near",{p:sname(nearestPlace(WX.lat,WX.lng).name)})+'</b>');
  if(WX_PLACE) bits.push(WX_PLACE);
  host.innerHTML='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'+
    '<path d="M8 1.6c-2.4 0-4.3 1.9-4.3 4.3 0 3.2 4.3 8.5 4.3 8.5s4.3-5.3 4.3-8.5c0-2.4-1.9-4.3-4.3-4.3z" '+
    'fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="5.9" r="1.6" fill="currentColor"/>'+
    '</svg><span>'+bits.join(" · ")+'</span>';
}

function renderWxNow(){
  const host=$("#wxNow");
  if(!WX||!WX.now||WX.now.temp==null){ host.classList.add("hide"); host.innerHTML=""; return; }
  host.classList.remove("hide");
  const n=WX.now;
  host.innerHTML=
    wxIcon(n.code,42)+
    '<span class="wxnow-t mono">'+Math.round(n.temp)+'<i>°C</i></span>'+
    '<span class="wxnow-meta">'+
      '<b>'+t("wx.c."+wxGroup(n.code))+'</b>'+
      '<span>'+t("wx.nowRain",{p:Math.round(nowProb())})+'</span>'+
      '<span>'+t("wx.nowRh",{p:Math.round(n.rh)})+'</span>'+
      '<span>'+t("wx.nowWind",{v:Math.round(n.wind)})+'</span>'+
    '</span>';
}

/* กราฟรายชั่วโมง 24 ชั่วโมงข้างหน้า — สลับดูอุณหภูมิ / โอกาสฝน / ลม ได้เหมือนหน้าพยากรณ์ทั่วไป */
function renderWxChart(){
  const host=$("#wxChart"); host.innerHTML="";
  document.querySelectorAll("[data-wxm]").forEach(b=>
    b.setAttribute("aria-pressed",String(b.dataset.wxm===S.wxTab)));
  if(!WX) return;
  const key={temp:"temp",rain:"prob",wind:"wind"}[S.wxTab]||"temp";
  const ser=wxSeries(S.wxDay||wxToday(),key,24).filter(p=>p.v!=null);
  if(ser.length<2) return;

  const W=Math.max(230,Math.round(host.clientWidth||280)), H=126;
  const PL=8,PR=8,PT=24,PB=22;
  const vals=ser.map(p=>p.v);
  let lo=Math.min(...vals), hi=Math.max(...vals);
  if(S.wxTab==="rain"){ lo=0; hi=100; }
  else { const pad=Math.max(1,(hi-lo)*0.25); lo-=pad; hi+=pad; }
  if(hi-lo<0.5) hi=lo+1;
  const X=i=>PL+(W-PL-PR)*(i/(ser.length-1));
  const Y=v=>PT+(H-PT-PB)*(1-(v-lo)/(hi-lo));
  const unit=t("wx.u."+S.wxTab);
  const stroke=S.wxTab==="temp"?"var(--wx-sun)":"var(--wx-rain)";
  const every=Math.max(3,Math.round(ser.length/6));

  let g='<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" role="img" aria-label="'+t("wx.chart")+'">';
  /* หน่วยบอกไว้มุมบนซ้ายครั้งเดียว ไม่ต้องต่อท้ายทุกจุด (โดยเฉพาะ "กม./ชม." ที่ยาวเกินไป) */
  g+='<text x="0" y="10" font-size="11" fill="var(--ink3)">'+t("wx.uf."+S.wxTab)+'</text>';
  if(S.wxTab==="rain"){
    const bw=Math.max(3,(W-PL-PR)/ser.length-2.5);
    ser.forEach((p,i)=>{
      const y=Y(p.v), h2=Math.max(1.5,H-PB-y);
      g+='<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+
         '" height="'+h2.toFixed(1)+'" rx="2" fill="'+stroke+'" opacity="'+(p.v>=60?".95":".45")+'"/>';
    });
  } else {
    const line=ser.map((p,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(p.v).toFixed(1)).join(" ");
    g+='<path d="'+line+" L"+X(ser.length-1).toFixed(1)+" "+(H-PB)+" L"+X(0).toFixed(1)+" "+(H-PB)+
       ' Z" fill="'+stroke+'" opacity=".13"/>';
    g+='<path d="'+line+'" fill="none" stroke="'+stroke+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  ser.forEach((p,i)=>{
    if(i%every) return;
    g+='<text x="'+X(i).toFixed(1)+'" y="'+Math.max(14,Y(p.v)-8).toFixed(1)+
       '" text-anchor="middle" font-size="12" font-family="IBM Plex Mono, monospace" fill="var(--ink2)">'+
       Math.round(p.v)+unit+'</text>';
    g+='<text x="'+X(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--ink3)">'+
       String(p.h).padStart(2,"0")+':00</text>';
  });
  g+='</svg>';
  host.innerHTML=g;
}

function renderWeather(){
  document.querySelectorAll("[data-wx]").forEach(b=>
    b.setAttribute("aria-pressed",String(b.dataset.wx===S.wxMode)));
  const host=$("#wxDays"), note=$("#wxNote");
  host.innerHTML="";
  renderWxPlace(); renderWxNow(); renderWxChart();

  if(WX_STATE==="loading"||WX_STATE==="idle"){ host.classList.add("hide"); note.textContent=t("wx.loading"); return; }
  if(WX_STATE==="error"||!WX){ host.classList.add("hide"); note.textContent=t("wx.error"); return; }
  host.classList.remove("hide");

  const sel=S.wxDay||wxToday();
  for(const iso of WX.dates){
    const d=WX.byDate[iso], dt=new Date(iso+"T00:00");
    /* ช่องแคบ ๆ ใส่คำว่า "วันนี้" ไม่พอ ใช้ตัวย่อวันเหมือนกันหมดแล้วทำวันนี้เป็นสีเน้นแทน */
    const b=el("button","wxday"+(iso===wxToday()?" today":"")); b.type="button";
    b.setAttribute("aria-pressed",String(iso===sel));
    b.title=dayLabel(iso)+" · "+t("wx.c."+wxGroup(d.code))+" · "+d.tmin+"–"+d.tmax+"°C";
    b.innerHTML='<span class="wd">'+t("dow."+dt.getDay())+'</span>'+
                wxIcon(d.code,20)+
                '<span class="tt"><b>'+d.tmax+'°</b></span>'+   /* ช่องกว้างแค่ ~40px ใส่สองค่าแล้วชนกัน อุณหภูมิต่ำสุดไปอยู่ใน tooltip แทน */
                '<span class="pp'+(d.pmax>=60?" wet":"")+'">'+Math.round(d.pmax)+'%</span>';
    b.onclick=()=>pickDay(iso);
    host.appendChild(b);
  }

  if(S.wxMode!=="auto"){ note.textContent=t("wx.manual"); return; }
  if(WXNOW){
    const key=WXNOW.whole?"wx.sumDay":"wx.sum";
    note.textContent=t(key,{day:dayLabel(sel),from:hhmm(WXNOW.fromMin),to:hhmm(WXNOW.toMin),
      p:Math.round(WXNOW.prob),mm:WXNOW.mm.toFixed(1)})+" — "+t(RAIN?"wx.isRain":"wx.noRain");
  } else note.textContent=t("wx.error");
}

/* ดึงพยากรณ์ของ "จุดเริ่มต้น" — ย้ายบ้านข้ามจังหวัดแล้วฝนคนละเรื่องกัน */
function refreshWeather(force){
  const A=resolve(S.origin);
  const lat=A?A.lat:13.7563, lng=A?A.lng:100.5018;      /* ไม่รู้จุดเริ่มต้น ใช้กลางกรุงเทพฯ */
  if(!force && lastWxAt && Math.abs(lastWxAt[0]-lat)<0.05 && Math.abs(lastWxAt[1]-lng)<0.05
     && WX_STATE==="ok") return;
  lastWxAt=[lat,lng]; WX_PLACE=null;
  loadForecast(lat,lng,()=>{ draw(); if(S.tab==="day") drawDay(); },PREFS.lang);
  wxReverseGeocode(lat,lng,PREFS.lang).then(p=>{ if(p){ WX_PLACE=p; renderWxPlace(); } });
}

function useMyLocation(){
  const note=$("#wxNote");
  if(!navigator.geolocation){ note.textContent=t("wx.gpsNo"); return; }
  note.textContent=t("wx.gpsWait");
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude;
    /* ตั้งจุดเริ่มต้นเป็นสถานี/สถานที่ที่ใกล้ที่สุด เส้นทางกับพยากรณ์จะได้ตรงกัน */
    const np=nearestPlace(lat,lng);
    S.origin=np.name; $("#origin").value=sname(np.name); save();
    lastWxAt=[lat,lng]; WX_PLACE=null;
    loadForecast(lat,lng,()=>{
      draw(); if(S.tab==="day") drawDay();
      $("#wxNote").textContent=t("wx.gpsSet",{p:sname(np.name)});
    },PREFS.lang);
    wxReverseGeocode(lat,lng,PREFS.lang).then(p=>{ if(p){ WX_PLACE=p; renderWxPlace(); } });
  },()=>{ note.textContent=t("wx.gpsFail"); },{timeout:9000,maximumAge:300000});
}

/* ---------- day plan ---------- */
function renderDayRows(){
  const host=$("#dpRows"); host.innerHTML="";
  S.day.forEach((d,i)=>{
    const row=el("div","dprow");
    const l1=el("label","f",t("day.dest",{n:i+1}));
    const p=el("input"); p.type="text"; p.value=sname(d.p); p.id="dp-p-"+i;
    p.oninput=()=>{d.p=p.value; save(); drawDay();};
    l1.appendChild(p);
    attachAC(p,sel=>{ d.p=sel.name; save(); drawDay(); });
    const l2=el("label","f",t("day.arriveAt"));
    const tt=el("input"); tt.type="time"; tt.value=hhmm(d.t); tt.id="dp-t-"+i;
    tt.oninput=()=>{const[a,b]=tt.value.split(":").map(Number); if(!isNaN(a)){d.t=a*60+b; save(); drawDay();}}; l2.appendChild(tt);
    const l3=el("label","f",t("day.stay"));
    const s=el("input"); s.type="number"; s.min=0; s.step=15; s.value=d.stay; s.id="dp-s-"+i;
    s.oninput=()=>{d.stay=+s.value||0; save(); drawDay();}; l3.appendChild(s);
    const rm=el("button","rm","×"); rm.type="button"; rm.title=t("prep.remove");
    rm.onclick=()=>{S.day.splice(i,1); save(); renderDayRows(); drawDay();};
    row.append(l1,l2,l3,rm); host.appendChild(row);
  });
}
function drawDay(){
  const host=$("#chain"); host.innerHTML="";
  const stops=S.day.slice().sort((a,b)=>a.t-b.t);
  if(!stops.length){ host.appendChild(el("li",null,t("day.none"))); return; }
  let fromName=S.origin, prevEnd=null;
  stops.forEach((d,i)=>{
    const A=resolve(fromName), B=resolve(d.p);
    if(!A||!B){
      const li=el("li");
      const what=el("div","what");
      what.appendChild(el("div","h",t("day.notfound",{p:!A?fromName:d.p})));
      li.append(el("div","when mono","—"),what);
      host.appendChild(li); fromName=d.p; return;
    }
    const target=d.t-S.cushion;
    const b=band(target,S.dayType);
    /* แต่ละนัดอยู่คนละช่วงเวลาของวัน ฝนตอนบ่ายจึงไม่ควรไปเผื่อเวลาให้นัดตอนเช้า */
    const rn = S.wxMode==="auto"
      ? wxIsRain(wxWindow(S.wxDay||wxToday(),Math.max(0,target-60),target))
      : RAIN;
    const p=({transit:transitPlan,mixed:mixedPlan,drive:drivePlan})[S.mode](A,B,b,rn)||drivePlan(A,B,b,rn);
    const travel=p.mean+Z[S.conf]*p.sd;
    const dep=target-travel;

    const li=el("li");
    li.append(el("div","when mono",hhmm(dep)+" → "+hhmm(d.t)));
    const what=el("div","what");
    what.appendChild(el("div","h", i===0
      ? t("day.fromHome",{b:sname(B.name)})
      : t("day.fromPlace",{a:sname(fromName),b:sname(B.name)})));
    const how = p.kind==="drive"
      ? t("day.howDrive",{km:Math.round(p.km)})
      : t("day.howTransit",{n:p.xfers,
          tags:[...new Set(p.segs.filter(s=>s.t==="ride").map(s=>ltag(s.line)))].join(" + ")});
    what.appendChild(el("div","d",t("day.detail",{t:hhmm(dep),n:Math.round(travel),how,f:p.fare})));
    if(i===0){
      what.appendChild(el("div","d",t("day.prepLine",{t:hhmm(dep-prepTotal()),n:prepTotal()})));
    } else if(prevEnd!=null){
      const slack=dep-prevEnd;
      const box=el("div",slack<0?"conflict":"okline");
      box.textContent = slack<0
        ? t("day.conflict",{n:Math.round(-slack),t1:hhmm(dep),t2:hhmm(prevEnd)})
        : t("day.slack",{n:Math.round(slack)});
      what.appendChild(box);
    }
    li.appendChild(what); host.appendChild(li);
    prevEnd=d.t+d.stay; fromName=d.p;
  });
}

/* เดาว่าผู้ใช้น่าจะหมายถึงที่ไหน แล้วให้กดเลือกได้เลย ดีกว่าบอกแค่ว่า "ไม่พบ" */
function renderErrHints(box,field,q){
  const put=list=>{
    if(!list.length){ box.appendChild(el("div","errhint",t("err.tryTyping"))); return; }
    const row=el("div","errhint");
    row.appendChild(el("span",null,t("err.didYouMean")));
    list.slice(0,4).forEach(p=>{
      const b=el("button","errchip",sname(p.name)); b.type="button";
      b.onclick=()=>{
        if(p.kind==="geo") rememberPlace({name:p.name,lat:p.lat,lng:p.lng,detail:p.detail});
        if(field==="origin"){ S.origin=p.name; $("#origin").value=sname(p.name); refreshWeather(true); }
        else { S.dest=p.name; $("#dest").value=sname(p.name); }
        save(); draw(); drawDay();
      };
      row.appendChild(b);
    });
    box.appendChild(row);
  };
  const local=searchLocal(q);
  put(local);
  if(q.trim().length>=2) searchOnline(q).then(res=>{
    const cur=compute();
    if(!cur.err||cur.errQ!==q) return;            /* ผู้ใช้แก้ไปแล้ว อย่าไปเขียนทับ */
    const seen=new Set(local.map(x=>x.name));
    const merged=local.concat(res.filter(r=>!seen.has(r.name)));
    if(!merged.length) return;
    box.innerHTML=""; box.appendChild(el("div",null,cur.err)); put(merged);
  });
}

/* ---------- top-level draw ---------- */
let LAST=null;
function draw(){
  syncWeather(); renderWeather();

  const r=compute(); LAST=r;
  const err=$("#errBox");
  if(r.err){
    err.classList.remove("hide"); err.innerHTML="";
    err.appendChild(el("div",null,r.err));
    if(r.errField) renderErrHints(err,r.errField,r.errQ);
    $("#tPrep").textContent=$("#tLeave").textContent=$("#tArrive").textContent="—";
    $("#sPrep").textContent=$("#sLeave").textContent=$("#sArrive").textContent="—";
    $("#vbar").innerHTML=""; $("#timeline").innerHTML=""; $("#breakdown").innerHTML="";
    $("#tips").innerHTML=""; $("#modes").innerHTML=""; renderMapCard(null); return;
  }
  err.classList.add("hide");

  $("#tPrep").textContent=hhmm(r.prepStart);
  $("#sPrep").textContent=t("v.prepSub",{n:r.prep});
  $("#tLeave").textContent=hhmm(r.leave);
  $("#sLeave").textContent=t("v.leaveSub",{p:sname(r.A.name)});
  $("#tArrive").textContent=hhmm(r.target);
  $("#sArrive").textContent=t("v.arriveSub",{n:S.cushion,p:sname(r.B.name)});

  const vb=$("#vbar"); vb.innerHTML="";
  const add=(html,cls)=>{const p=el("span","pill"+(cls?" "+cls:"")); p.innerHTML=html; vb.appendChild(p);};
  add(t("pill.travel",{n:Math.round(r.plan.mean)}));
  add(t("pill.buffer",{n:Math.round(r.buffer)}), r.buffer>20?"warn":"good");
  if(r.plan.kind!=="drive"){
    add(t("pill.xfers",{n:r.plan.xfers}));
    add(t("pill.walk",{n:Math.round(r.plan.walk)}));
  } else add(t("pill.km",{n:Math.round(r.plan.km)}));
  add(t("pill.fare",{n:r.plan.fare}));
  add(t("band."+r.b), r.b===0?"warn":"");
  if(RAIN) add(t("pill.rain"),"warn");
  if(r.fallback) add(t("pill.fallback"),"warn");

  renderModes(r); renderTimeline(r); renderBreakdown(r); renderTips(r); renderMapCard(r);
}

/* =======================================================================
   7. ธีม / ภาษา / บัญชี
   ======================================================================= */
function buildSwatches(){
  const host=$("#swatches"); host.innerHTML="";
  for(const [k,a] of Object.entries(ACCENTS)){
    const b=el("button","sw"); b.type="button";
    b.style.background=(isDark()?a.d:a.l)[0];
    b.title=a[PREFS.lang]||a.th;
    b.setAttribute("aria-label",a[PREFS.lang]||a.th);
    b.setAttribute("aria-pressed",String(PREFS.accent===k));
    b.onclick=()=>{
      PREFS.accent=k; savePrefs(); applyPrefs();
      buildSwatches(); draw(); if(S.tab==="day") drawDay();
    };
    host.appendChild(b);
  }
}
function syncThemeUI(){
  document.querySelectorAll("#themeModes [data-mode]").forEach(b=>
    b.setAttribute("aria-pressed",String(b.dataset.mode===PREFS.theme)));
  buildSwatches();
}
function syncLangUI(){
  $("#langCur").textContent = PREFS.lang==="th" ? "ไทย" : "English";
  document.querySelectorAll("#langPop [data-lang]").forEach(b=>
    b.setAttribute("aria-checked",String(b.dataset.lang===PREFS.lang)));
}
function renderAuth(){
  const btn=$("#authBtn");
  btn.innerHTML="";
  if(USER){
    const initial=(USER.name||"?").trim().charAt(0).toUpperCase();
    btn.className="acctbtn";
    btn.append(el("span","av",initial), el("span","nm",USER.name));
    $("#acctAv").textContent=initial;
    $("#acctName").textContent=USER.name;
    $("#acctMail").textContent=USER.email;
    $("#acctProv").textContent=t("auth.signedInWith",{p:PROVIDERS[USER.provider].name})+
      (USER.demo?" · "+t("auth.demoBadge"):"");
  } else {
    btn.className="ghost solid";
    btn.textContent=t("btn.signin");
  }
}
function closePops(except){
  for(const id of ["langPop","themePop","acctPop"]) if(id!==except) $("#"+id).classList.add("hide");
  for(const id of ["langBtn","themeBtn","authBtn"]) $("#"+id).setAttribute("aria-expanded","false");
}
function togglePop(popId,btnId){
  const pop=$("#"+popId), willOpen=pop.classList.contains("hide");
  closePops(willOpen?popId:null);
  pop.classList.toggle("hide",!willOpen);
  $("#"+btnId).setAttribute("aria-expanded",String(willOpen));
}
function openAuth(open){
  $("#authModal").classList.toggle("hide",!open);
  if(open) $("#authClose").focus();
}

/* วาดข้อความทั้งหน้าใหม่หลังเปลี่ยนภาษา */
function relabel(){
  applyStaticI18n();
  /* เก็บชื่อไทยไว้เป็นค่าจริงใน state แล้วแสดงชื่อตามภาษาที่เลือก */
  const A=resolve(S.origin); if(A) S.origin=A.name;
  const B=resolve(S.dest);   if(B) S.dest=B.name;
  S.day.forEach(d=>{ const p=resolve(d.p); if(p) d.p=p.name; });
  save();
  $("#origin").value=sname(S.origin); $("#dest").value=sname(S.dest);
  document.querySelectorAll(".oauth [data-provider-label]").forEach(s=>
    s.textContent=t("auth.with",{p:s.getAttribute("data-provider-label")}));
  syncLangUI(); syncThemeUI(); renderAuth(); refreshWeather(true);
  renderPrep(); renderDayRows(); draw(); if(S.tab==="day") drawDay();
}

/* =======================================================================
   8. WIRING
   ======================================================================= */
$("#origin").value=sname(S.origin); $("#dest").value=sname(S.dest);
$("#arrive").value=hhmm(S.arrive); $("#daytype").value=S.dayType;
$("#cushion").value=String(S.cushion);
document.querySelectorAll("[data-wx]").forEach(b=>{
  b.onclick=()=>{ S.wxMode=b.dataset.wx; save(); draw(); if(S.tab==="day") drawDay(); };
});
document.querySelectorAll("[data-mapv]").forEach(b=>{
  b.onclick=()=>{ S.mapView=b.dataset.mapv; save(); renderMapCard(LAST); };
});
document.querySelectorAll("[data-wxm]").forEach(b=>{
  b.onclick=()=>{ S.wxTab=b.dataset.wxm; save(); renderWxChart(); };
});
$("#wxGeo").onclick=useMyLocation;
$("#origin").oninput=e=>{S.origin=e.target.value; save(); draw(); drawDay(); refreshWeatherSoon();};
$("#dest").oninput=e=>{S.dest=e.target.value; save(); draw();};
attachAC($("#origin"),p=>{ S.origin=p.name; save(); draw(); drawDay(); refreshWeather(true); });
attachAC($("#dest"),  p=>{ S.dest=p.name;   save(); draw(); });
$("#swap").onclick=()=>{const a=S.origin; S.origin=S.dest; S.dest=a;
  $("#origin").value=sname(S.origin); $("#dest").value=sname(S.dest); save(); draw(); refreshWeatherSoon();};
$("#arrive").oninput=e=>{const[h,m]=e.target.value.split(":").map(Number);
  if(!isNaN(h)){S.arrive=h*60+m; save(); draw();}};
$("#daytype").onchange=e=>{S.dayType=e.target.value; save(); draw(); drawDay();};
$("#cushion").onchange=e=>{S.cushion=+e.target.value; save(); draw(); drawDay();};
$("#prepAdd").onclick=()=>{
  const n=$("#prepName").value.trim(); if(!n) return;
  S.prep.push({n,m:+$("#prepMin").value||0,on:true});
  $("#prepName").value=""; save(); renderPrep(); draw(); drawDay();
};
$("#prepName").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("#prepAdd").click();}};
$("#dpAdd").onclick=()=>{
  const last=S.day[S.day.length-1];
  S.day.push({p:"สยามพารากอน",t:Math.min(22*60,(last?last.t+180:14*60)),stay:60});
  save(); renderDayRows(); drawDay();
};
$("#tab-one").onclick=()=>{S.tab="one"; syncTabs();};
$("#tab-day").onclick=()=>{S.tab="day"; syncTabs();};
function syncTabs(){
  const one=S.tab==="one";
  $("#tab-one").setAttribute("aria-selected",String(one));
  $("#tab-day").setAttribute("aria-selected",String(!one));
  $("#oneView").classList.toggle("hide",!one);
  $("#dayView").classList.toggle("hide",one);
  save(); if(!one) drawDay();
}
$("#copyBtn").onclick=async()=>{
  const r=LAST; if(!r||r.err) return;
  const pad=" ".repeat(10);
  const lines=[t("copy.head",{a:sname(r.A.name),b:sname(r.B.name),t:hhmm(S.arrive)}),
    hhmm(r.prepStart)+"  "+t("copy.prep"),
    ...S.prep.filter(p=>p.on).map(p=>pad+"· "+prepName(p)+" ("+t("unit.min",{n:p.m})+")"),
    hhmm(r.leave)+"  "+t("copy.leave")];
  if(r.plan.kind==="drive")
    lines.push(pad+t("copy.drive",{km:Math.round(r.plan.km),n:Math.round(r.plan.mean)}));
  else for(const s of r.plan.segs){
    if(s.t==="ride") lines.push(pad+t("copy.ride",{tag:ltag(s.line),a:sname(s.from),b:sname(s.to),n:Math.round(s.eff)}));
    if(s.t==="xfer") lines.push(pad+t("copy.xfer",{p:sname(s.at),n:Math.round(s.eff)}));
    if(s.t==="walk") lines.push(pad+t("copy.walk",{n:Math.round(s.eff)}));
    if(s.t==="moto") lines.push(pad+t("copy.moto",{n:Math.round(s.eff)}));
  }
  lines.push(hhmm(r.target)+"  "+t("copy.arrive",{p:sname(r.B.name),n:Math.round(r.buffer)}));
  const done=k=>{ $("#copyBtn").textContent=t(k); setTimeout(()=>$("#copyBtn").textContent=t("btn.copy"),1600); };
  try{ await navigator.clipboard.writeText(lines.join("\n")); done("btn.copied"); }
  catch(e){ done("btn.copyFail"); }
};

/* --- ภาษา --- */
$("#langBtn").onclick=e=>{e.stopPropagation(); togglePop("langPop","langBtn");};
document.querySelectorAll("#langPop [data-lang]").forEach(b=>{
  b.onclick=()=>{ PREFS.lang=b.dataset.lang; savePrefs(); applyPrefs(); closePops(); relabel(); };
});

/* --- ธีม --- */
$("#themeBtn").onclick=e=>{e.stopPropagation(); togglePop("themePop","themeBtn");};
document.querySelectorAll("#themeModes [data-mode]").forEach(b=>{
  b.onclick=()=>{
    PREFS.theme=b.dataset.mode; savePrefs(); applyPrefs();
    syncThemeUI(); draw(); if(S.tab==="day") drawDay();
  };
});

/* --- บัญชี --- */
$("#authBtn").onclick=e=>{
  e.stopPropagation();
  if(USER) togglePop("acctPop","authBtn"); else { closePops(); openAuth(true); }
};
document.querySelectorAll(".oauth[data-provider]").forEach(b=>{
  b.onclick=()=>{ signInWith(b.dataset.provider); openAuth(false); renderAuth(); };
});
$("#signOutBtn").onclick=()=>{ signOut(); closePops(); renderAuth(); };
$("#authClose").onclick=()=>openAuth(false);
$("#authModal").onclick=e=>{ if(e.target===$("#authModal")) openAuth(false); };
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ openAuth(false); closePops(); }
});
document.addEventListener("click",()=>closePops());
document.querySelectorAll(".pop").forEach(p=>p.addEventListener("click",e=>e.stopPropagation()));

/* --- ดึงพยากรณ์ใหม่เมื่อผู้ใช้เปลี่ยนจุดเริ่มต้น (หน่วงไว้ ไม่ยิงทุกตัวอักษรที่พิมพ์) --- */
let wxT=null;
function refreshWeatherSoon(){ clearTimeout(wxT); wxT=setTimeout(refreshWeather,700); }

/* --- เปลี่ยนขนาดหน้าต่าง: แผนที่ผูกกับความกว้างช่อง จึงต้องวาดใหม่ --- */
let rzT=null;
addEventListener("resize",()=>{
  clearTimeout(rzT);
  rzT=setTimeout(()=>{ if(LAST&&!LAST.err) renderMapCard(LAST); renderWxChart(); },150);
});

/* --- หัวจอหดเมื่อเลื่อนลง --- */
addEventListener("scroll",()=>{
  document.querySelector(".top").classList.toggle("compact",scrollY>8);
},{passive:true});

/* --- ธีมของระบบเปลี่ยนขณะเปิดหน้าอยู่ --- */
matchMedia("(prefers-color-scheme:dark)").addEventListener?.("change",()=>{
  applyPrefs(); buildSwatches(); draw(); if(S.tab==="day") drawDay();
});

/* --- เริ่มทำงาน --- */
applyStaticI18n();
document.querySelectorAll(".oauth [data-provider-label]").forEach(s=>
  s.textContent=t("auth.with",{p:s.getAttribute("data-provider-label")}));
syncLangUI(); syncThemeUI(); renderAuth();
renderPrep(); renderDayRows(); syncTabs(); draw(); refreshWeather();
