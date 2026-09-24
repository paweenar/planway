"use strict";
/* PlanWay — ธีม / สีหลัก / ภาษา / บัญชีผู้ใช้
   โหลดไฟล์นี้ใน <head> แบบ blocking เพื่อให้ธีมถูกทาก่อน paint แรก (กันหน้าจอกระพริบ) */
/* สีหลักแต่ละชุด: l = โหมดสว่าง, d = โหมดมืด  → [accent, accent2, accent-soft] */
const ACCENTS = {
    clay: { th: "ส้มอิฐ", en: "Clay", l: ["#D9482A", "#AE3518", "#FBE7E1"], d: ["#FF7A52", "#FF9878", "#33201B"] },
    ocean: { th: "น้ำเงิน", en: "Ocean", l: ["#2563C9", "#1B4A9E", "#E3EBFB"], d: ["#6FA6FF", "#93BEFF", "#17233A"] },
    forest: { th: "เขียว", en: "Forest", l: ["#0F7A55", "#0A5B3F", "#DCF0E8"], d: ["#3FCB92", "#6FDCAF", "#122A22"] },
    grape: { th: "ม่วง", en: "Grape", l: ["#6D3FBF", "#54309A", "#EBE4FA"], d: ["#A98BF5", "#C0AAF8", "#241C3B"] },
    rose: { th: "ชมพู", en: "Rose", l: ["#C81E5E", "#9E1449", "#FCE4EC"], d: ["#FF7FAE", "#FFA3C4", "#3A1A29"] },
    slate: { th: "เทาหิน", en: "Slate", l: ["#3F4A5A", "#2B3340", "#E5E9EF"], d: ["#9FB2CC", "#C2D0E4", "#232A34"] }
};
const PREFS = { theme: "auto", accent: "clay", lang: "th" };
try {
    const raw = localStorage.getItem("okd.prefs.v1");
    if (raw)
        Object.assign(PREFS, JSON.parse(raw));
}
catch (e) { }
function savePrefs() { try {
    localStorage.setItem("okd.prefs.v1", JSON.stringify(PREFS));
}
catch (e) { } }
function isDark() {
    if (PREFS.theme === "dark")
        return true;
    if (PREFS.theme === "light")
        return false;
    return matchMedia("(prefers-color-scheme:dark)").matches;
}
function applyPrefs() {
    const root = document.documentElement;
    if (PREFS.theme === "auto")
        root.removeAttribute("data-theme");
    else
        root.setAttribute("data-theme", PREFS.theme);
    root.setAttribute("data-accent", PREFS.accent);
    root.setAttribute("lang", PREFS.lang);
    const a = ACCENTS[PREFS.accent] || ACCENTS.clay;
    const set = isDark() ? a.d : a.l;
    root.style.setProperty("--accent", set[0]);
    root.style.setProperty("--accent2", set[1]);
    root.style.setProperty("--accent-soft", set[2]);
    /* ตัวหนังสือบนพื้นสีหลัก — โหมดมืดใช้สีอ่อน จึงต้องเป็นตัวอักษรสีเข้ม */
    root.style.setProperty("--on-accent", isDark() ? "#12151A" : "#FFFFFF");
}
applyPrefs();
/* ---------------------------------------------------------------------
   บัญชีผู้ใช้ — ตอนนี้เป็น "โหมดสาธิต" เก็บโปรไฟล์ไว้ใน localStorage เท่านั้น
   ยังไม่ได้ยิงไปหา Google / Apple / Facebook จริง

   ตอนต่อของจริง: อย่าเก็บ client secret หรือ token ไว้ในเบราว์เซอร์
   ให้ทำ 3 จุดนี้แทน (ทุกจุดอยู่ในฟังก์ชัน signInWith() ด้านล่าง)
     Google   → Google Identity Services  https://accounts.google.com/gsi/client
                google.accounts.id.initialize({client_id, callback}) แล้วส่ง credential (JWT)
                ไป verify ที่ backend ของเราเอง
     Apple    → Sign in with Apple JS      https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js
                AppleID.auth.init({clientId, redirectURI, usePopup:true}) แล้ว verify id_token ฝั่งเซิร์ฟเวอร์
     Facebook → Facebook Login SDK         https://connect.facebook.net/en_US/sdk.js
                FB.login() แล้วแลก access token เป็น session ฝั่งเซิร์ฟเวอร์
   backend คืน session cookie (httpOnly) กลับมา แล้วค่อยเรียก /api/me เพื่อเอาโปรไฟล์
   --------------------------------------------------------------------- */
const PROVIDERS = {
    google: { name: "Google", demoName: { th: "ผู้ใช้ทดลอง", en: "Demo User" }, demoMail: "demo.user@example.com" },
    apple: { name: "Apple", demoName: { th: "ผู้ใช้ทดลอง", en: "Demo User" }, demoMail: "demo.user@privaterelay.example.com" },
    facebook: { name: "Facebook", demoName: { th: "ผู้ใช้ทดลอง", en: "Demo User" }, demoMail: "demo.user@example.com" }
};
let USER = null;
try {
    const raw = localStorage.getItem("okd.user.v1");
    if (raw)
        USER = JSON.parse(raw);
}
catch (e) { }
function signInWith(provider) {
    const p = PROVIDERS[provider];
    if (!p)
        return null;
    USER = { provider, name: p.demoName[PREFS.lang] || p.demoName.th, email: p.demoMail, demo: true };
    try {
        localStorage.setItem("okd.user.v1", JSON.stringify(USER));
    }
    catch (e) { }
    return USER;
}
function signOut() {
    USER = null;
    try {
        localStorage.removeItem("okd.user.v1");
    }
    catch (e) { }
}
