/* PlanWay — ชนิดข้อมูลที่ใช้ร่วมกันทั้งโปรเจกต์

   ไฟล์ .d.ts ไม่ถูกคอมไพล์ออกมาเป็น .js และทุกอย่างในนี้อยู่ใน global scope
   เหมือนกับไฟล์ .ts ตัวอื่นที่ไม่มี import/export ซึ่งเป็นโครงสร้างเดิมของโปรเจกต์
   (สคริปต์ธรรมดาเรียงกันใน index.html เปิดจาก file:// ได้โดยไม่ต้องมี bundler) */

/* ---- Leaflet ----
   โหลดจาก CDN ตอน runtime ไม่ได้ติดตั้งผ่าน npm จึงประกาศเป็น any
   ponytail: อยากได้ type จริงของ Leaflet ให้ลง @types/leaflet แล้วลบบรรทัดนี้ */
declare const L: any;

/* ---- โครงข่าย (data.ts) ---- */
/** [ชื่อสถานี, lat, lng] */
type StationTuple = [string, number, number];

interface Line {
  n: string;                       /* ชื่อเต็มของสาย */
  tag: string;                     /* ตัวย่อบนป้ายสี */
  c: string;                       /* สีโหมดสว่าง */
  cd: string;                      /* สีโหมดมืด */
  sp: number;                      /* ความเร็วเฉลี่ย km/h */
  spb?: [number, number, number];  /* ความเร็วแยกตามช่วงเวลา (km/h) สำหรับสายที่วิ่งบนถนนร่วมกับรถทั่วไป
                                      มีค่านี้ = เอนจินถือว่าเป็นสายที่ติดจราจร: คิดเวลาตามช่วง แกว่งกว่า
                                      และจับคู่จุดต่อรถกับสายอื่นให้อัตโนมัติตามระยะเดิน */
  hw: [number, number, number];    /* ระยะห่างขบวน (นาที): peak, normal, late */
  svc: [number, number];           /* เวลาเปิด-ปิด (นาทีจากเที่ยงคืน) */
  fare: [number, number, number];  /* [ค่าแรกเข้า, ต่อสถานี, เพดาน] บาท */
  st: StationTuple[];
}

type LineId = string;
/** [lineId, สถานี A, สถานี B] */
type ExtraEdge = [LineId, string, string];
/** [สาย A, สถานี A, สาย B, สถานี B, นาทีที่ต้องเดิน] */
type Transfer = [LineId, string, LineId, string, number];
/** [ชื่อสถานที่, lat, lng] */
type PlaceTuple = [string, number, number];
/** [lat, lng] */
type LatLng = [number, number];

/* ---- กราฟ (engine.ts) ---- */
interface GNode {
  line: LineId;
  st: string;
  lat: number;
  lng: number;
  idx: number;
}
interface Edge {
  to: string;
  min: number;
  kind: "ride" | "xfer";
  km?: number;
  walk?: number;
}
/** จุดอะไรก็ได้ที่มีพิกัด */
interface Point {
  lat: number;
  lng: number;
  name?: string;
}
interface NearHit { k: string; w: number; line: LineId; }
interface Route {
  path: string[];
  total: number;                   /* คะแนนที่ใช้เลือกเส้นทาง (รวมค่าถ่วงเดิน/เปลี่ยนสาย/ค่าโดยสาร)
                                      ไม่ใช่นาทีจริง — เวลาที่แสดงผลคำนวณใหม่ใน transitPlan() */
  accessWalk: number;
  egressWalk: number;
}

/* ---- ขาการเดินทาง ----
   แยกตาม t เพื่อให้ TypeScript รู้ว่าขาแบบไหนมีฟิลด์อะไร
   walk กับ moto ใช้รูปเดียวกัน เพราะ mixedPlan() เปลี่ยน t ของขาเดินยาว ๆ เป็น moto */
interface SegBase {
  min: number;
  /** ค่าโดยสารของขานี้ (บาท) มีเฉพาะขาที่ต้องจ่ายเงิน — ride, moto, drive */
  fare?: number;
  /** เวลาจริงหลังปรับตามฝน/วิน — ไทม์ไลน์และ svcCheck ใช้ค่านี้ ไม่ใช่ min */
  eff: number;
}
interface WalkSeg extends SegBase {
  t: "walk" | "moto";
  to: GNode;
  last?: boolean;
  /** นาทีที่ต้องเดิน ถ้าไม่นั่งวิน — ใช้บอกผู้ใช้ว่าเปลี่ยนจากอะไรมา */
  walkWas?: number;
}
interface WaitSeg extends SegBase { t: "wait"; line: LineId; }
interface RideSeg extends SegBase {
  t: "ride";
  line: LineId;
  from: string;
  to: string;
  hops: number;
}
interface XferSeg extends SegBase {
  t: "xfer";
  at: string;
  from: LineId;
  to: LineId;
}
interface DriveSeg extends SegBase { t: "drive"; km: number; sp: number; }
type Seg = WalkSeg | WaitSeg | RideSeg | XferSeg | DriveSeg;

/* ---- แผนการเดินทาง ----
   ฟิลด์ที่มีเฉพาะฝั่งเดียว ประกาศเป็น `?: undefined` ไว้ในอีกฝั่งด้วย
   จะได้อ่าน plan.km หรือ plan.walk จาก union ตรง ๆ ได้ โดยยังแยกชนิดถูกอยู่ */
interface TransitPlan {
  kind: "transit" | "mixed";
  segs: Seg[];
  mean: number;
  sd: number;
  fare: number;
  xfers: number;
  walk: number;
  wait: number;
  ride: number;
  board: GNode;
  alight: GNode;
  path: string[];
  /** ค่าวินที่บวกเพิ่มในแผนผสม */
  extra?: number;
  km?: undefined;
  sp?: undefined;
}
interface DrivePlan {
  kind: "drive";
  segs: Seg[];
  mean: number;
  sd: number;
  fare: number;
  xfers: number;
  km: number;
  sp: number;
  walk?: undefined;
  wait?: undefined;
  ride?: undefined;
  board?: undefined;
  alight?: undefined;
  path?: undefined;
  extra?: undefined;
}
type Plan = TransitPlan | DrivePlan;

/** สายที่ปิดให้บริการ ณ เวลาที่ต้องขึ้นรถ */
interface SvcIssue {
  line: LineId;
  at: number;
  from: string;
  to: string;
  kind: "before" | "after";
  first: number;
  last: number;
}

/* ---- ผลการคำนวณ (app.ts) ---- */
interface Plans {
  transit: TransitPlan | null;
  drive: DrivePlan;
  mixed: TransitPlan | null;
}
interface ComputeErr {
  err: string;
  errField?: "origin" | "dest";
  errQ?: string;
  A?: undefined;
  B?: undefined;
  b?: undefined;
  plans?: undefined;
  plan?: undefined;
  buffer?: undefined;
  travel?: undefined;
  leave?: undefined;
  prepStart?: undefined;
  prep?: undefined;
  target?: undefined;
  mode?: undefined;
  fallback?: undefined;
  svcClosed?: undefined;
}
interface ComputeOk {
  err?: undefined;
  errField?: undefined;
  errQ?: undefined;
  A: ResolvedPlace;
  B: ResolvedPlace;
  /** ช่วงเวลาของวัน: 0 = ชั่วโมงเร่งด่วน, 1 = ปกติ, 2 = ดึก */
  b: Band;
  plans: Plans;
  plan: Plan;
  buffer: number;
  travel: number;
  leave: number;
  prepStart: number;
  prep: number;
  target: number;
  mode: TravelMode;
  fallback: boolean;
  svcClosed: { was: TravelMode; issues: SvcIssue[] } | null;
}
type Compute = ComputeErr | ComputeOk;
type Band = 0 | 1 | 2;

/* ---- ค้นหาสถานที่ (places.ts) ---- */
type PlaceKind = "place" | "station" | "geo";
interface FoundPlace {
  name: string;
  lat: number;
  lng: number;
  detail?: string;
}
interface SearchHit {
  name: string;
  kind: PlaceKind;
  lat: number;
  lng: number;
  rank: number;
  detail: string;
}
interface ResolvedPlace extends Point {
  name: string;
  type: PlaceKind;
  line?: LineId;
}

/* ---- พยากรณ์อากาศ (weather.ts) ---- */
interface WxHour {
  temp: number;
  rh: number;
  prob: number;
  mm: number;
  code: number;
  wind: number;
}
/** คีย์ของ WxHour ที่เอามาวาดกราฟได้ */
type WxMetric = "temp" | "prob" | "wind";
interface WxDay {
  code: number;
  tmin: number;
  tmax: number;
  pmax: number;
  psum: number;
  hours: (WxHour | null)[];
}
interface WxNow {
  time?: string;
  temp?: number;
  rh?: number;
  mm?: number;
  code?: number;
  wind?: number;
}
interface WxData {
  lat: number;
  lng: number;
  at: number;
  dates: string[];
  byDate: Record<string, WxDay>;
  now: WxNow;
}
/** สรุปอากาศเฉพาะช่วงที่อยู่นอกบ้าน */
interface WxSummary {
  prob: number;
  mm: number;
  code: number;
  /** true = ไม่มีข้อมูลรายชั่วโมง จึงใช้ค่าทั้งวันแทน */
  whole: boolean;
  h0: number;
  h1: number;
  fromMin?: number;
  toMin?: number;
}
interface WxPoint { h: number; v: number | null; code: number | null; }
/** จุดที่มีค่าจริง — หลังกรอง v ที่เป็น null ออกแล้ว */
interface WxPointVal extends WxPoint { v: number; }
type WxGroup = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "shower" | "rain" | "storm";
type WxState = "idle" | "loading" | "ok" | "error";

/* ---- ประวัติการเดินทาง (history.ts) ---- */
type HistOutcome = "early" | "ok" | "late";
interface HistEntry {
  id: string;
  /** วางแผนเส้นทางนี้ในวันเดียวกันไปกี่ครั้ง */
  n: number;
  ts: number;
  date: string;
  from: string;
  to: string;
  arrive: number;
  leave: number;
  prepStart: number;
  travel: number;
  buffer: number;
  mode: TravelMode;
  kind: Plan["kind"];
  lines: LineId[];
  xfers: number;
  walk: number;
  fare: number;
  km: number;
  rain: boolean;
  wxCode: number | null;
  out?: HistOutcome | null;
}
/** รายการที่ยังไม่ได้ลงทะเบียน — histAdd() เป็นคนใส่ id กับ n ให้ */
type HistDraft = Omit<HistEntry, "id" | "n">;
type HistStore = Record<string, HistEntry[]>;
interface HistStats {
  trips: number;
  minutes: number;
  avg: number;
  places: number;
  rainy: number;
  /** [ปลายทาง, จำนวนครั้ง] เรียงมากไปน้อย */
  top: [string, number][];
}
interface HistRouteStats {
  trips: number;
  min: number;
  max: number;
  avg: number;
  last: HistEntry;
}
interface HistAdvice {
  n: number;
  need?: number;
  late?: number;
  early?: number;
  ok?: number;
  lateRate?: number;
  earlyRate?: number;
  /** นาทีที่ควรปรับเวลาเผื่อ — บวก = เผื่อเพิ่ม */
  delta: number;
  why?: "ok" | "late" | "early";
}

/* ---- ธีม / ภาษา / บัญชี (prefs.ts) ---- */
type Lang = "th" | "en";
type ThemeMode = "auto" | "light" | "dark";
/** [accent, accent2, accent-soft] */
type AccentTriplet = [string, string, string];
interface Accent {
  th: string;
  en: string;
  l: AccentTriplet;
  d: AccentTriplet;
}
interface Provider {
  name: string;
  demoName: Record<Lang, string>;
  demoMail: string;
}
interface Prefs {
  theme: ThemeMode;
  accent: string;
  lang: Lang;
}
interface User {
  provider: string;
  name: string;
  email: string;
  demo: boolean;
}

/* ---- state ของแอป (app.ts) ---- */
type TravelMode = "transit" | "mixed" | "drive";
type DayType = "wd" | "we";
interface PrepItem {
  /** คีย์ของรายการที่มากับโปรแกรม (แปลภาษาได้) */
  k?: string;
  /** ข้อความที่ผู้ใช้พิมพ์เอง (คงไว้ตามที่พิมพ์) */
  n?: string;
  m: number;
  on: boolean;
}
interface DayStop { p: string; t: number; stay: number; }
interface State {
  origin: string;
  dest: string;
  /** เวลาที่ต้องไปถึงให้ทัน — เอนจินคิดถอยหลังจากค่านี้เสมอ ไม่ว่าผู้ใช้จะกรอกโหมดไหน */
  arrive: number;
  /** ผู้ใช้กรอกเวลาแบบไหน: ถึงก่อนเวลา (เดิม) หรือบอกเวลาที่จะออกจากบ้าน */
  when: "arrive" | "depart";
  /** เวลาที่จะออกจากบ้าน ใช้เฉพาะโหมด depart — solveDepart() แปลงกลับเป็น arrive ให้ */
  departAt: number;
  dayType: DayType;
  cushion: number;
  conf: number;
  wxMode: "auto" | "rain" | "dry";
  wxDay: string | null;
  wxTab: "temp" | "rain" | "wind";
  /** หน่วยอุณหภูมิที่ "แสดงผล" เท่านั้น — ข้อมูลที่ดึงมาและที่เอนจินใช้เป็นองศาเซลเซียสเสมอ */
  wxUnit: "c" | "f";
  mapView: "live" | "plan";
  mode: TravelMode;
  tab: "one" | "day" | "hist";
  prep: PrepItem[];
  day: DayStop[];
}
