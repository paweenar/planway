/* PlanWay — ดีไซน์ใหม่ของหน้าแดชบอร์ด (React + Tailwind + lucide-react)

   ไฟล์นี้อยู่นอก src/ โดยตั้งใจ — src/ เป็นแอปจริงที่ tsc คอมไพล์เป็นสคริปต์ธรรมดา
   ไฟล์นี้เป็นตัวดีไซน์ ยังไม่ได้ต่อกับเอนจินคำนวณเวลา ข้อมูลที่ใช้เป็นตัวอย่าง
   ที่มีรูปร่างเหมือนของจริงจาก transitPlan() เพื่อให้ย้ายมาต่อได้ทันทีเมื่อตัดสินใจเรื่องสแต็ก

   ต้องมี: react, tailwindcss, lucide-react */

import { useState } from "react";
import {
  Search, MapPin, Navigation, Clock, Route, History, Map as MapIcon, Settings,
  Footprints, Train, Bus, ArrowRightLeft, Hourglass, Flag, CloudRain,
  Ticket, Repeat, ShieldCheck, ChevronRight, Sparkles,
} from "lucide-react";

/* =====================================================================
   ข้อมูลตัวอย่าง — รูปร่างเดียวกับที่ transitPlan() คืนมา
   ===================================================================== */

const PLAN = {
  origin: "อารีย์",
  dest: "ศูนย์ประชุมสิริกิติ์",
  arrive: "09:00",
  marks: [
    { key: "prep",  label: "เริ่มเตรียมตัว", time: "07:22", note: "อาบน้ำ กินข้าว เก็บของ" },
    { key: "leave", label: "ออกจากบ้าน",   time: "08:15", note: "เวลาที่ต้องพ้นประตู" },
    { key: "reach", label: "ถึงที่นัด",     time: "08:50", note: "เผื่อถึงก่อน 10 นาที" },
  ],
  stats: { fare: 46, xfers: 1, travel: 35, p90: 42 },
  weather: { label: "ฝนเล็กน้อย", temp: 29, rainPct: 62, note: "เผื่อเวลาเดินเพิ่ม 25%" },
  segs: [
    { t: "walk",  min: 2,  title: "เดินไปสถานีอารีย์",        sub: "170 ม." },
    { t: "wait",  min: 2,  title: "รอขบวน",                   sub: "BTS สุขุมวิท · ทุก ~2.6 นาที" },
    { t: "ride",  min: 14, title: "อารีย์ → อโศก",            sub: "BTS สุขุมวิท · 7 สถานี", tag: "BTS", color: "#7DC241" },
    { t: "xfer",  min: 4,  title: "เปลี่ยนสายที่อโศก",        sub: "เดินเชื่อมไป MRT สุขุมวิท" },
    { t: "ride",  min: 6,  title: "สุขุมวิท → สิริกิติ์",      sub: "MRT สายสีน้ำเงิน · 1 สถานี", tag: "MRT", color: "#5B8BE0" },
    { t: "walk",  min: 5,  title: "เดินเข้าศูนย์ประชุมฯ",     sub: "400 ม.", last: true },
  ],
};

const NAV = [
  { key: "plan",  icon: Route,    label: "วางแผนเดินทาง" },
  { key: "day",   icon: Clock,    label: "แผนทั้งวัน" },
  { key: "map",   icon: MapIcon,  label: "แผนที่" },
  { key: "hist",  icon: History,  label: "ประวัติ" },
];

/* ไอคอนและสีของแต่ละขา — เก็บไว้ที่เดียว ไทม์ไลน์กับสรุปด้านบนใช้ชุดเดียวกัน */
const SEG_STYLE = {
  walk: { Icon: Footprints,     ring: "ring-slate-700",   text: "text-slate-300",   dot: "bg-slate-800" },
  wait: { Icon: Hourglass,      ring: "ring-amber-500/40", text: "text-amber-300",  dot: "bg-amber-500/10" },
  ride: { Icon: Train,          ring: "ring-blue-500/40",  text: "text-blue-300",   dot: "bg-blue-500/10" },
  bus:  { Icon: Bus,            ring: "ring-blue-500/40",  text: "text-blue-300",   dot: "bg-blue-500/10" },
  xfer: { Icon: ArrowRightLeft, ring: "ring-violet-500/40",text: "text-violet-300", dot: "bg-violet-500/10" },
};

/* =====================================================================
   ชิ้นส่วนย่อย
   ===================================================================== */

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
        ${active
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
          : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SearchCard() {
  return (
    <div className="space-y-2.5">
      <Field icon={Navigation} label="ต้นทาง"  value={PLAN.origin} />
      <Field icon={MapPin}     label="ปลายทาง" value={PLAN.dest} />
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
        <Clock className="h-[18px] w-[18px] shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500">ต้องถึงเวลา</p>
          <p className="truncate text-sm font-semibold text-slate-100">{PLAN.arrive} น.</p>
        </div>
      </div>
      <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5
                         text-sm font-semibold text-white transition hover:bg-blue-500
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950">
        <Search className="h-4 w-4" />
        คำนวณเวลาออกจากบ้าน
      </button>
    </div>
  );
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5
                    transition focus-within:border-blue-500/60 hover:border-slate-700">
      <Icon className="h-[18px] w-[18px] shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <input
          defaultValue={value}
          className="w-full truncate bg-transparent text-sm font-semibold text-slate-100 outline-none"
        />
      </div>
    </div>
  );
}

function WeatherCard({ wx }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase text-slate-500">สภาพอากาศช่วงเดินทาง</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{wx.label}</p>
        </div>
        <CloudRain className="h-9 w-9 text-blue-400" strokeWidth={1.6} />
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-3xl font-semibold tracking-tight text-slate-50">{wx.temp}°</span>
        <span className="text-sm text-blue-300">ฝน {wx.rainPct}%</span>
      </div>
      <p className="mt-2 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-400">{wx.note}</p>
    </div>
  );
}

function TimeCard({ mark, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition
        ${active
          ? "border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-950/50"
          : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide
                     ${active ? "text-blue-300" : "text-slate-500"}`}>
        {mark.label}
      </p>
      <p className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight
                     ${active ? "text-white" : "text-slate-200"}`}>
        {mark.time}
      </p>
      <p className="mt-1 text-xs text-slate-400">{mark.note}</p>
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500" />}
    </button>
  );
}

function StatTile({ icon: Icon, label, value, unit, accent = "text-slate-100" }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${accent}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
    </div>
  );
}

/* หนึ่งขาของการเดินทาง — เส้นเชื่อมวาดด้วย border ของคอลัมน์ซ้าย ไม่ใช้ absolute
   ขาสุดท้ายตัดเส้นทิ้งเพื่อไม่ให้เส้นห้อยเลยหมุดปลายทาง */
function TimelineRow({ seg }) {
  const style = SEG_STYLE[seg.t] || SEG_STYLE.walk;
  const Icon = seg.last ? Flag : style.Icon;

  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                          ring-1 ${style.ring} ${style.dot} ${style.text}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        {!seg.last && <span className="w-px flex-1 bg-gradient-to-b from-slate-700 to-slate-800" />}
      </div>

      <div className={`min-w-0 flex-1 ${seg.last ? "pb-0" : "pb-6"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-100">{seg.title}</p>
          {seg.tag && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-950"
              style={{ backgroundColor: seg.color }}
            >
              {seg.tag}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="truncate">{seg.sub}</span>
          <span className="text-slate-600">·</span>
          <span className="shrink-0 font-medium tabular-nums text-slate-300">{seg.min} นาที</span>
        </div>
      </div>
    </li>
  );
}

/* แผนที่จำลอง — ของจริงเสียบ Leaflet ตรงกล่องนี้ได้เลย โครงเดิมใน src/map.ts วาดด้วยพิกัดชุดเดียวกัน */
function MapPanel() {
  return (
    <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 xl:min-h-[560px]">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">เส้นทางบนแผนที่</h2>
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ข้อมูลล่าสุด
        </span>
      </header>

      <div className="relative flex-1 bg-slate-950/60">
        <svg viewBox="0 0 400 520" className="h-full w-full" role="img" aria-label="ผังเส้นทางจากอารีย์ถึงศูนย์ประชุมสิริกิติ์">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#1e293b" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="400" height="520" fill="url(#grid)" />
          <path d="M96 84 L96 300" stroke="#7DC241" strokeWidth="6" strokeLinecap="round" />
          <path d="M96 300 L300 300 L300 430" stroke="#5B8BE0" strokeWidth="6" strokeLinecap="round" />
          {[
            [96, 84, "#7DC241", "อารีย์"],
            [96, 300, "#7DC241", "อโศก"],
            [300, 430, "#5B8BE0", "สิริกิติ์"],
          ].map(([x, y, c, name]) => (
            <g key={name}>
              <circle cx={x} cy={y} r="9" fill="#0f172a" stroke={c} strokeWidth="4" />
              <text x={x + 18} y={y + 5} fill="#cbd5e1" fontSize="15">{name}</text>
            </g>
          ))}
        </svg>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
        <span>BTS สุขุมวิท → MRT สายสีน้ำเงิน</span>
        <button className="flex items-center gap-1 font-medium text-blue-400 transition hover:text-blue-300">
          เปิดแผนที่เต็มจอ <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </section>
  );
}

/* =====================================================================
   หน้าหลัก
   ===================================================================== */

export default function PlanWayDashboard() {
  const [nav, setNav] = useState("plan");
  const [mark, setMark] = useState("leave");
  const { stats, weather } = PLAN;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased">
      <div className="mx-auto flex max-w-[1600px]">

        {/* ---------- Sidebar: โผล่ตั้งแต่ lg ขึ้นไป ---------- */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-6 overflow-y-auto
                          border-r border-slate-800 bg-slate-900/40 p-5 lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Route className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">PlanWay</p>
              <p className="text-[11px] text-slate-500">โครงข่ายกรุงเทพฯ–ปริมณฑล</p>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV.map(item => (
              <NavItem key={item.key} icon={item.icon} label={item.label}
                       active={nav === item.key} onClick={() => setNav(item.key)} />
            ))}
          </nav>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">การเดินทาง</p>
            <SearchCard />
          </div>

          <WeatherCard wx={weather} />

          <button className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
                             text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100">
            <Settings className="h-[18px] w-[18px]" />
            ตั้งค่า
          </button>
        </aside>

        {/* ---------- เนื้อหาหลัก ---------- */}
        <main className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">

          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">แผนการเดินทางวันนี้</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {PLAN.origin} <span className="text-slate-600">→</span> {PLAN.dest}
              </h1>
            </div>
            <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10
                             px-3 py-1.5 text-xs font-semibold text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              ถึงทันที่ระดับความมั่นใจ 90%
            </span>
          </header>

          {/* บนจอเล็กไม่มี Sidebar — ยกช่องค้นหากับอากาศขึ้นมาไว้บนสุดแทน */}
          <div className="grid gap-4 lg:hidden">
            <SearchCard />
            <WeatherCard wx={weather} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {PLAN.marks.map(m => (
              <TimeCard key={m.key} mark={m} active={mark === m.key} onClick={() => setMark(m.key)} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            {/* ซ้าย-กลาง: สถิติ + ไทม์ไลน์ */}
            <div className="space-y-5 xl:col-span-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatTile icon={Ticket}     label="ค่าโดยสาร"  value={stats.fare}   unit="บาท" />
                <StatTile icon={Repeat}     label="เปลี่ยนสาย" value={stats.xfers}  unit="ครั้ง" />
                <StatTile icon={ShieldCheck} label="เผื่อแล้ว"  value={stats.p90}    unit="นาที"
                          accent="text-emerald-400" />
              </div>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-100">รายละเอียดการเดินทาง</h2>
                  <span className="text-xs font-medium tabular-nums text-slate-400">
                    รวม {stats.travel} นาที
                  </span>
                </div>
                <ol className="space-y-0">
                  {PLAN.segs.map((seg, i) => <TimelineRow key={i} seg={seg} />)}
                </ol>
              </section>
            </div>

            {/* ขวา: แผนที่ ตรึงไว้ให้เห็นตลอดเวลาที่เลื่อนอ่านไทม์ไลน์ */}
            <div className="xl:col-span-2">
              <div className="xl:sticky xl:top-6">
                <MapPanel />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
