// usage: node tools/mixar-mcp.mjs <tool> '<json args>'   (talks to Mixar's stdio MCP connector; prints text results, saves images to $MIXAR_OUT or %TEMP%\mixar-out)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [tool, argText = "{}"] = process.argv.slice(2);
const out = process.env.MIXAR_OUT || path.join(process.env.TEMP || ".", "mixar-out");
fs.mkdirSync(out, { recursive: true });
const p = spawn("C:\\Users\\Admin\\.mixar\\connector\\mixar-mcp.cmd", [], { shell: true, stdio: ["pipe", "pipe", "pipe"] });
let buf = "", id = 0; const waiting = new Map();
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { const m = JSON.parse(line); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } } catch {} } });
p.stderr.on("data", (d) => process.stderr.write(d));
const rpc = (method, params) => new Promise((res) => { const i = ++id; waiting.set(i, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); });
const note = (method, params) => p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
const timer = setTimeout(() => { console.error("timeout"); p.kill(); process.exit(2); }, 600000);
const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sw5e-claude", version: "1" } });
note("notifications/initialized", {});
if (tool === "--list") { const r = await rpc("tools/list", {}); console.log(r.result.tools.map((t) => t.name).join("\n")); }
else if (tool === "--schema") { const r = await rpc("tools/list", {}); const t = r.result.tools.find((x) => x.name === argText); console.log(JSON.stringify(t, null, 1)); }
else {
  const r = await rpc("tools/call", { name: tool, arguments: JSON.parse(argText) });
  if (r.error) console.log("ERROR", JSON.stringify(r.error));
  let n = 0;
  for (const c of r.result?.content ?? []) {
    if (c.type === "text") console.log(c.text);
    else if (c.type === "image") { const f = path.join(out, `${tool}-${Date.now()}-${n++}.png`); fs.writeFileSync(f, Buffer.from(c.data, "base64")); console.log("IMAGE", f); }
  }
  if (r.result?.isError) console.log("(isError)", JSON.stringify(r.result).slice(0, 1500));
}
clearTimeout(timer); p.kill(); process.exit(0);
