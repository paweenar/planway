"use strict";
/* PlanWay — พยากรณ์อากาศจริงตามพื้นที่ (Open-Meteo)
   เลือก Open-Meteo เพราะไม่ต้องใช้ API key ไม่ต้องมี backend และเปิด CORS ให้เรียกจากเบราว์เซอร์ตรง ๆ
   จึงยังคงคุณสมบัติของต้นแบบไว้ได้ คือเปิดไฟล์ index.html แล้วใช้ได้เลย

   ถ้าย้ายไปใช้ผู้ให้บริการที่ต้องมี key (OpenWeather / AccuWeather) ต้องยิงผ่าน backend ของเราเอง
   ห้ามฝัง key ไว้ในไฟล์ที่ส่งให้เบราว์เซอร์ */
const WX_URL = "https://api.open-meteo.com/v1/forecast";
const GEO_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const WX_TTL = 30 * 60 * 1000; /* พยากรณ์รายชั่วโมงอัปเดตไม่บ่อย เก็บไว้ 30 นาทีพอ */
const WX_KEY = "okd.wx.v2";
/* WX = { lat, lng, at, now:{...}, dates:[ISO], byDate:{ ISO:{code,tmin,tmax,pmax,psum,hours:[...]} } }
   hours[h] = { temp, rh, prob, mm, code, wind }  (null ถ้าไม่มีข้อมูลชั่วโมงนั้น) */
let WX = null;
let WX_STATE = "idle";
let WX_PLACE = null; /* ชื่อพื้นที่ที่อ่านออก เช่น "เขตพญาไท · กรุงเทพมหานคร" */
let wxInflight = null;
const wxRound = (v) => Math.round(v * 100) / 100;
const wxISO = (d) => d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const wxToday = () => wxISO(new Date());
const wxNowHour = () => new Date().getHours();
/* จัดกลุ่มรหัสสภาพอากาศ WMO ให้เหลือ 8 แบบที่คนใช้จริง */
function wxGroup(code) {
    if (code === 0)
        return "clear";
    if (code === 1 || code === 2)
        return "partly";
    if (code === 3)
        return "cloud";
    if (code === 45 || code === 48)
        return "fog";
    if (code >= 51 && code <= 57)
        return "drizzle";
    if (code >= 80 && code <= 82)
        return "shower";
    if (code >= 95)
        return "storm";
    if (code >= 61 && code <= 67)
        return "rain";
    return "cloud";
}
/* ใช้จัดอันดับว่าชั่วโมงไหน "หนัก" กว่ากัน เวลาสรุปทั้งช่วงเดินทางเป็นไอคอนเดียว */
const WX_RANK = { clear: 0, partly: 1, cloud: 2, fog: 3, drizzle: 4, shower: 5, rain: 6, storm: 7 };
/* ไอคอนวาดเองด้วย SVG ไม่ใช้อิโมจิ เพราะอิโมจิหน้าตาต่างกันมากในแต่ละเครื่อง */
function wxIcon(code, size) {
    const g = wxGroup(code), s = size || 18;
    const sun = '<circle cx="7.5" cy="7.5" r="3.6" fill="var(--wx-sun)"/>' +
        [0, 45, 90, 135, 180, 225, 270, 315].map(a => '<line x1="7.5" y1="7.5" x2="7.5" y2="1.2" stroke="var(--wx-sun)" stroke-width="1.4" stroke-linecap="round" transform="rotate(' + a + ' 7.5 7.5)"/>').join("");
    const cloud = '<path d="M5.2 16.5h8.4a3.1 3.1 0 0 0 .3-6.18 4.5 4.5 0 0 0-8.62-.9A3.35 3.35 0 0 0 5.2 16.5z" fill="var(--wx-cloud)"/>';
    const drops = (n) => Array.from({ length: n }, (_, i) => '<line x1="' + (6.2 + i * 3.4) + '" y1="17.4" x2="' + (5.2 + i * 3.4) + '" y2="20.6" stroke="var(--wx-rain)" stroke-width="1.6" stroke-linecap="round"/>').join("");
    const bolt = '<path d="M10.6 16.4l-3.1 4.8h2.4l-.8 3.4 3.5-4.9h-2.4l1-3.3z" fill="var(--wx-bolt)"/>';
    let inner;
    if (g === "clear")
        inner = sun;
    else if (g === "partly")
        inner = '<g transform="translate(3.4 -1.6) scale(.8)">' + sun + "</g>" + cloud;
    else if (g === "fog")
        inner = cloud + '<line x1="3.5" y1="19.2" x2="15" y2="19.2" stroke="var(--wx-cloud)" stroke-width="1.5" stroke-linecap="round"/>';
    else if (g === "drizzle")
        inner = cloud + drops(2);
    else if (g === "shower")
        inner = cloud + drops(3);
    else if (g === "rain")
        inner = cloud + drops(3);
    else if (g === "storm")
        inner = cloud + bolt;
    else
        inner = cloud;
    return '<svg viewBox="0 0 20 24" width="' + s + '" height="' + Math.round(s * 1.2) + '" aria-hidden="true">' + inner + '</svg>';
}
function wxParse(j, lat, lng) {
    const byDate = {}, dates = j.daily.time.slice();
    dates.forEach((d, i) => {
        byDate[d] = {
            code: j.daily.weather_code[i],
            tmin: Math.round(j.daily.temperature_2m_min[i]),
            tmax: Math.round(j.daily.temperature_2m_max[i]),
            pmax: j.daily.precipitation_probability_max[i] ?? 0,
            psum: wxRound(j.daily.precipitation_sum[i] ?? 0),
            hours: new Array(24).fill(null)
        };
    });
    j.hourly.time.forEach((ts, i) => {
        const d = ts.slice(0, 10), h = +ts.slice(11, 13);
        if (!byDate[d])
            return;
        byDate[d].hours[h] = {
            temp: j.hourly.temperature_2m[i],
            rh: j.hourly.relative_humidity_2m[i],
            prob: j.hourly.precipitation_probability[i] ?? 0,
            mm: j.hourly.precipitation[i] ?? 0,
            code: j.hourly.weather_code[i] ?? 0,
            wind: j.hourly.wind_speed_10m[i] ?? 0
        };
    });
    const c = j.current || {};
    return {
        lat, lng, at: Date.now(), dates, byDate,
        now: { time: c.time, temp: c.temperature_2m, rh: c.relative_humidity_2m,
            mm: c.precipitation, code: c.weather_code, wind: c.wind_speed_10m }
    };
}
function wxFromCache(lat, lng) {
    try {
        const raw = localStorage.getItem(WX_KEY);
        if (!raw)
            return null;
        const c = JSON.parse(raw);
        if (Date.now() - c.at > WX_TTL)
            return null;
        if (Math.abs(c.lat - lat) > 0.05 || Math.abs(c.lng - lng) > 0.05)
            return null;
        if (!c.byDate[wxToday()])
            return null; /* ข้ามวันแล้ว ต้องดึงใหม่ */
        return c;
    }
    catch (e) {
        return null;
    }
}
/* ชื่อพื้นที่จากพิกัด — บริการนี้ฟรีและไม่ต้องใช้ key เช่นกัน
   ถ้าล้มเหลวก็ไม่เป็นไร ผู้เรียกจะถอยไปใช้ชื่อสถานีที่ใกล้ที่สุดจากข้อมูลของเราเอง */
/* ชื่อเขตของพิกัดเดิมไม่เปลี่ยนระหว่างเปิดหน้าอยู่แล้ว จำคำตอบไว้กันยิงซ้ำ
   ปัดพิกัดเหลือทศนิยม 2 ตำแหน่ง (~1 กม.) ก็พอแล้วสำหรับระดับเขต/จังหวัด */
const GEO_MEMO = new Map();
function wxReverseGeocode(lat, lng, lang) {
    const key = lat.toFixed(2) + "," + lng.toFixed(2) + "," + lang;
    const hit = GEO_MEMO.get(key);
    if (hit)
        return hit;
    const p = wxFetchPlace(lat, lng, lang);
    GEO_MEMO.set(key, p);
    return p;
}
function wxFetchPlace(lat, lng, lang) {
    return fetch(GEO_URL + "?latitude=" + lat.toFixed(4) + "&longitude=" + lng.toFixed(4) +
        "&localityLanguage=" + (lang === "en" ? "en" : "th"))
        .then(r => r.ok ? r.json() : null)
        .then(j => {
        if (!j)
            return null;
        const parts = [j.locality, j.principalSubdivision].filter(Boolean);
        const seen = new Set(), out = [];
        for (const p of parts)
            if (!seen.has(p)) {
                seen.add(p);
                out.push(p);
            }
        return out.length ? out.join(" · ") : null;
    })
        .catch(() => null);
}
/* onDone จะถูกเรียกเมื่อสถานะเปลี่ยน (โหลดเสร็จ / ล้มเหลว) เพื่อให้ผู้เรียกวาดหน้าจอใหม่ */
function loadForecast(lat, lng, onDone, lang) {
    const cached = wxFromCache(lat, lng);
    if (cached) {
        WX = cached;
        WX_STATE = "ok";
        return Promise.resolve(WX);
    }
    if (wxInflight)
        return wxInflight;
    WX_STATE = "loading";
    const q = WX_URL + "?latitude=" + lat.toFixed(3) + "&longitude=" + lng.toFixed(3) +
        "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum" +
        "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m" +
        "&timezone=Asia%2FBangkok&forecast_days=7";
    wxInflight = fetch(q)
        .then(res => { if (!res.ok)
        throw new Error("HTTP " + res.status); return res.json(); })
        .then(j => {
        WX = wxParse(j, lat, lng);
        WX_STATE = "ok";
        try {
            localStorage.setItem(WX_KEY, JSON.stringify(WX));
        }
        catch (e) { }
        return WX;
    })
        .catch(() => { WX_STATE = "error"; WX = null; return null; })
        .finally(() => { wxInflight = null; if (onDone)
        onDone(); });
    return wxInflight;
}
/* สรุปสภาพอากาศเฉพาะ "ช่วงที่อยู่นอกบ้านจริง" ไม่ใช่ทั้งวัน
   ฝนตกตอนบ่ายไม่ควรทำให้แผนเดินทางตอนเช้าถูกเผื่อเวลาเพิ่ม */
function wxWindow(dateISO, fromMin, toMin) {
    if (!WX)
        return null;
    const d = WX.byDate[dateISO];
    if (!d)
        return null;
    const h0 = Math.max(0, Math.floor(fromMin / 60));
    const h1 = Math.min(23, Math.max(h0, Math.ceil(toMin / 60) - 1));
    let prob = 0, mm = 0, code = 0, any = false;
    for (let h = h0; h <= h1; h++) {
        const e = d.hours[h];
        if (!e)
            continue;
        any = true;
        prob = Math.max(prob, e.prob);
        mm += e.mm;
        if (WX_RANK[wxGroup(e.code)] > WX_RANK[wxGroup(code)])
            code = e.code;
    }
    if (!any)
        return { prob: d.pmax, mm: d.psum, code: d.code, whole: true, h0, h1 };
    return { prob, mm: wxRound(mm), code, whole: false, h0, h1 };
}
/* ชุดตัวเลขรายชั่วโมงสำหรับวาดกราฟ — วันนี้เริ่มจากชั่วโมงปัจจุบัน วันอื่นเริ่มเที่ยงคืน */
function wxSeries(dateISO, key, count) {
    if (!WX)
        return [];
    const n = count || 24, out = [];
    const start = (dateISO === wxToday()) ? wxNowHour() : 0;
    let iso = dateISO, h = start;
    for (let i = 0; i < n; i++) {
        const d = WX.byDate[iso];
        const e = d ? d.hours[h] : null;
        out.push({ h, v: e ? e[key] : null, code: e ? e.code : null });
        if (++h > 23) {
            h = 0;
            iso = WX.dates[WX.dates.indexOf(iso) + 1];
            if (!iso)
                break;
        }
    }
    return out;
}
/* เกณฑ์ว่า "นับเป็นวันฝนตก" ไหม — ต้องพอที่จะทำให้เดินช้าลงและรถติดจริง
   ฝนปรอย 0.2 มม. ไม่ควรไปบวกเวลาเดินทางให้ผู้ใช้ */
const wxIsRain = (w) => !!w && (w.mm >= 0.6 || w.prob >= 60);
