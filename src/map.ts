/* PlanWay — แผนที่จริงแบบเลื่อน/ซูมได้ (Leaflet + Esri Canvas basemap)

   ทำไมไม่ใช่ Google Maps:
     - Maps JavaScript API และ Maps Embed API (/maps/embed/v1/) ต้องมี API key + เปิด billing
       ทดสอบแล้วตอบ 401 ถ้าไม่มี key
     - endpoint แบบไม่ใช้ key (maps.google.com/maps?...&output=embed) ถูก redirect ผ่าน response
       ที่ติด X-Frame-Options: SAMEORIGIN จึงฝังใน iframe ไม่ได้ (ทดสอบแล้วขึ้นกรอบเปล่า)
   Leaflet + Esri Canvas ฟรีจริง ไม่ต้องมี key และดีกว่าตรงที่วาด "เส้นทางที่เราคำนวณได้" ทับลงไปได้
   ส่วนใครอยากได้ Google จริง ๆ มีปุ่มเปิดในแท็บใหม่ให้ (ลิงก์ธรรมดาไม่ต้องใช้ key)

   ถ้าจะเปลี่ยนไปใช้ Google Maps จริงในอนาคต แก้ที่ liveDraw() ที่เดียว
   โดยใส่ key ผ่าน backend ของเราเอง ห้ามฝัง key ไว้ในไฟล์ที่ส่งให้เบราว์เซอร์ */

/* ตัวแปรของ Leaflet เป็น any เพราะ L มาจาก CDN ไม่มี type (ดู src/types.d.ts) */
let LMAP: any = null, LLAYER: any = null, LBASE: any = null;
let lastFit: string | null = null, baseIsDark: boolean | null = null;
const liveOK = (): boolean => typeof L !== "undefined";

/* Esri Canvas — ฟรี ไม่ต้องมี API key และมีชุดโทนมืดจริง ๆ ให้ใช้คู่กับธีมมืด
   (ไม่ใช้ tile.openstreetmap.org เพราะนโยบายเขาห้ามแอปอื่นใช้ และเขาส่ง tile ธงยูเครน
    มาแทนแผนที่เมื่อตรวจพบว่าไม่ใช่เว็บของ OSM เอง — ทดสอบแล้วเจอจริง)
   พื้นหลังเป็นโทนเทาจาง ๆ เส้นทางสีของเราจึงเด่นขึ้นมา */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &middot; OpenStreetMap contributors';
function baseLayers(dark: boolean): any {
  const tone = dark ? "Dark" : "Light";
  return L.layerGroup([
    L.tileLayer(ESRI + "World_" + tone + "_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom:19, minZoom:8, attribution:ESRI_ATTR }),
    /* ชั้นชื่อสถานที่แยกออกมา ต้องวางทับพื้นแต่อยู่ใต้เส้นทางของเรา */
    L.tileLayer(ESRI + "World_" + tone + "_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom:19, minZoom:8 })
  ]);
}
function liveInit(): any {
  if (!liveOK() || LMAP) return LMAP;
  LMAP = L.map("mapLive", { zoomControl:true, scrollWheelZoom:true, worldCopyJump:false, fadeAnimation:false });
  /* prefix มาตรฐานของ Leaflet มีธงยูเครนติดมาด้วย ตัดออกให้เหลือเครดิตอย่างเดียว */
  LMAP.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  baseIsDark = isDark();
  LBASE = baseLayers(baseIsDark).addTo(LMAP);
  LMAP.setView([13.7563, 100.5018], 11);
  LLAYER = L.layerGroup().addTo(LMAP);
  return LMAP;
}
/* สลับธีมแล้วต้องเปลี่ยนชุด tile ด้วย ไม่ใช่เอา CSS filter ไปกลับสีทับ */
function liveTheme(): void {
  if (!LMAP || baseIsDark === isDark()) return;
  baseIsDark = isDark();
  LMAP.removeLayer(LBASE);
  LBASE = baseLayers(baseIsDark).addTo(LMAP);
  LBASE.eachLayer((l: any) => l.bringToBack());
}

/* คืนขนาดที่ถูกต้องให้ Leaflet หลังจากกล่องเปลี่ยนขนาดหรือเพิ่งถูกแสดง
   ถ้าไม่เรียก แผนที่จะวาดเป็นช่องสีเทาเพราะมันจำขนาดตอนที่ container ยังถูกซ่อนอยู่ */
function liveResize(): void {
  if (LMAP) setTimeout(() => LMAP.invalidateSize(), 30);
}

function liveDraw(r: Compute | null): void {
  if (!liveOK()) return;
  liveInit();
  LLAYER.clearLayers();
  if (!planOk(r)) return;

  const pts: LatLng[] = [];
  /* Leaflet ยัดสีลงไปเป็น attribute ของ SVG จึงต้องส่งค่าสีจริง ใช้ var(--accent) ไม่ได้ */
  const ACC = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#D9482A";
  const mark = (lat: number, lng: number, label: string) => L.circleMarker([lat, lng], {
      radius: 8, color: ACC, fillColor:"#fff", fillOpacity:1, weight:3
    }).addTo(LLAYER).bindTooltip(label, { direction:"top", offset:[0,-6] });

  if (r.plan.kind === "drive"){
    L.polyline([[r.A.lat, r.A.lng], [r.B.lat, r.B.lng]],
      { color:"#7A8698", weight:4, dashArray:"10 8" }).addTo(LLAYER);
    pts.push([r.A.lat, r.A.lng], [r.B.lat, r.B.lng]);
  } else {
    const path = r.plan.path || [];
    for (let i = 0; i < path.length - 1; i++){
      const a = NODES.get(path[i])!, b = NODES.get(path[i+1])!;
      const same = a.line === b.line;
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: lc(a.line), weight: same ? 7 : 4, opacity: same ? .95 : .7,
        dashArray: same ? null : "4 6", lineCap:"round"
      }).addTo(LLAYER);
      pts.push([a.lat, a.lng], [b.lat, b.lng]);
    }
    /* ขาเดิน/วิน จากประตูบ้านถึงชานชาลา และจากสถานีถึงปลายทาง */
    const bd = r.plan.board, al = r.plan.alight;
    for (const [pt, st] of [[r.A, bd], [r.B, al]]) if (pt && st)
      L.polyline([[pt.lat, pt.lng], [st.lat, st.lng]],
        { color:"#8894A6", weight:3, dashArray:"2 7", lineCap:"round" }).addTo(LLAYER);

    for (const k of path){
      const n = NODES.get(k)!;
      /* คลิกสถานีบนแผนที่แล้วตั้งเป็นปลายทางได้เหมือนผังเส้นทาง */
      const m = L.circleMarker([n.lat, n.lng], {
        radius:4.5, color:"#8894A6", fillColor:"#fff", fillOpacity:1, weight:2
      }).addTo(LLAYER).bindTooltip(sname(n.st), { direction:"top", offset:[0,-6] });
      m.on("click", () => { S.dest = n.st; ($("#dest") as HTMLInputElement).value = sname(n.st); save(); draw(); });
      pts.push([n.lat, n.lng]);
    }
    if (bd) mark(bd.lat, bd.lng, sname(bd.st) + " · " + t("map.board"));
    if (al) mark(al.lat, al.lng, sname(al.st) + " · " + t("map.alight"));
    for (const s of r.plan.segs) if (s.t === "xfer"){
      const n = NODES.get(key(s.from, s.at));
      if (n) mark(n.lat, n.lng, sname(n.st) + " · " + t("map.xfer"));
    }
  }
  mark(r.A.lat, r.A.lng, t("map.start") + " · " + sname(r.A.name));
  mark(r.B.lat, r.B.lng, t("map.end")   + " · " + sname(r.B.name));
  pts.push([r.A.lat, r.A.lng], [r.B.lat, r.B.lng]);

  /* ขยับกรอบภาพเฉพาะตอนเส้นทางเปลี่ยนจริง ไม่งั้นผู้ใช้ซูมเองแล้วโดนดีดกลับทุกครั้งที่วาดใหม่ */
  const sig = r.A.name + "|" + r.B.name + "|" + r.plan.kind;
  if (pts.length && sig !== lastFit){
    LMAP.fitBounds(L.latLngBounds(pts), { padding:[26,26], maxZoom:15 });
    lastFit = sig;
  }
}

/* ลิงก์เปิด Google Maps ตัวจริงในแท็บใหม่ — เป็น URL scheme ธรรมดา ไม่ต้องใช้ API key */
function googleMapsUrl(r: Compute | null): string {
  if (!planOk(r)) return "https://www.google.com/maps";
  const mode = r.plan.kind === "drive" ? "driving" : "transit";
  return "https://www.google.com/maps/dir/?api=1" +
    "&origin=" + r.A.lat + "," + r.A.lng +
    "&destination=" + r.B.lat + "," + r.B.lng +
    "&travelmode=" + mode;
}
