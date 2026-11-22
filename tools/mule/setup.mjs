// Wires Mule Create (skill `mule`) to this repo and the PC's tools (2026-11-22). Safe to run again; it only adds or replaces its own things.
//   node tools/mule/setup.mjs [MuleCreate folder]      (default: the MuleCreate folder beside the repo)
// 1. installs the SW5e brief recipe (tools/mule/recipe) into %APPDATA%\Mule\recipes\sw5e, with this repo's path filled in;
// 2. adds the Mixar MCP server (as Claude Code has it in ~/.claude.json) to %APPDATA%\Mule\.mcp.json, which Mule copies into every brief folder;
// 3. makes scenes\, briefs\ and refs\ in the MuleCreate folder and, with Blender, writes refs\sw5e_scale.usda (tools/blender/mule.py refs).
// The repo's own .mcp.json gives sessions here Mule's MCP server (sketch_machine, http://127.0.0.1:8770/mcp, while Mule is open).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const slash = (p) => p.split(path.sep).join("/");
const mule = path.resolve(process.argv[2] ?? path.join(repo, "..", "MuleCreate"));
const data = path.join(process.env.APPDATA ?? path.join(os.homedir(), ".local", "share"), "Mule");

// 1. the recipe
const from = path.join(repo, "tools", "mule", "recipe");
const to = path.join(data, "recipes", "sw5e");
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
for (const f of fs.readdirSync(to, { recursive: true })) {
  const p = path.join(to, String(f));
  if (fs.statSync(p).isFile() && /\.(md|toml)$/.test(p)) fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("@@REPO@@", slash(repo)));
}
console.log("recipe   ", to);

// 2. Mixar for brief sessions
const mcpFile = path.join(data, ".mcp.json");
const mcp = fs.existsSync(mcpFile) ? JSON.parse(fs.readFileSync(mcpFile, "utf8")) : {};
mcp.mcpServers ??= {};
let mixar;
try { mixar = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8")).mcpServers?.mixar; } catch { /* no Claude config */ }
if (mixar) {
  const { type, command, args, env } = mixar;
  mcp.mcpServers.mixar = { type, command, args, ...(env ? { env } : {}) };
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(mcpFile, JSON.stringify(mcp, null, 2) + "\n");
  console.log("mcp      ", mcpFile, "(" + Object.keys(mcp.mcpServers).join(", ") + ")");
} else console.log("mcp       Mixar is not in ~/.claude.json mcpServers; left", mcpFile, "as it was");

// 3. folders and the scale references
for (const d of ["scenes", "briefs", "refs"]) fs.mkdirSync(path.join(mule, d), { recursive: true });
const blender = process.env.BLENDER ?? "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe";
if (fs.existsSync(blender)) {
  const r = spawnSync(blender, ["-b", "--factory-startup", "--python-exit-code", "1", "--python", path.join(repo, "tools", "blender", "mule.py"), "--", "refs", path.join(mule, "refs")], { encoding: "utf8" });
  console.log("refs     ", r.status === 0 ? path.join(mule, "refs", "sw5e_scale.usda") : "Blender failed:\n" + (r.stderr || r.stdout).slice(-800));
} else console.log("refs      no Blender at", blender, "(set BLENDER)");
console.log("Mule     ", path.join(mule, "Mule", "Mule.exe"), fs.existsSync(path.join(mule, "Mule", "Mule.exe")) ? "" : "(not found)");
