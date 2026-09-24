/* PlanWay — npm run dev
   คอมไพล์ TypeScript แบบ watch พร้อมกับเสิร์ฟไฟล์ static ในคำสั่งเดียว

   เขียนเองประมาณ 40 บรรทัดแทนที่จะลง dev server สำเร็จรูป เพราะเว็บนี้ไม่มี bundler
   ไม่มี HMR และไม่มีอะไรต้อง transform นอกจาก tsc — สิ่งที่ต้องการจริง ๆ มีแค่
   "ส่งไฟล์ตามที่ขอ" เท่านั้น จะได้ไม่ต้องเพิ่ม dependency ให้โปรเจกต์ที่ตั้งใจให้มีศูนย์ตัว

   ponytail: ไม่มี live-reload ถ้าอยากได้ ใช้ส่วนขยาย Live Server ของ VS Code คู่กับ
   npm run watch แทน หรือค่อยเติม EventSource + fs.watch ตรงนี้ */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const BASE = resolve(ROOT);
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map":  "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2"
};

/* เรียก tsc ผ่าน node ตรง ๆ ไม่ผ่าน npx — บน Windows การ spawn ไฟล์ .cmd โดยไม่ใช้ shell
   ถูก Node บล็อก (EINVAL) และการเปิด shell ก็ไม่มีอะไรดีขึ้น */
const TSC = fileURLToPath(new URL("node_modules/typescript/bin/tsc", import.meta.url));
const tsc = spawn(process.execPath, [TSC, "--watch", "--preserveWatchOutput"],
                  { cwd: ROOT, stdio: "inherit" });

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  /* กัน path traversal — ../../ ต้องออกไปอ่านไฟล์นอกโฟลเดอร์โปรเจกต์ไม่ได้ */
  const file = resolve(ROOT, rel);
  if (file !== BASE && !file.startsWith(BASE + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"          /* กันเบราว์เซอร์แคช js/ ที่ tsc เพิ่งเขียนทับ */
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => {
  console.log(`\n  PlanWay  →  http://localhost:${PORT}\n`);
});

const bye = () => { tsc.kill(); process.exit(0); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
