// Draws the app icons (client/public/icon-*.png, apple-touch-icon.png) from client/public/favicon.svg.
// The maskable icon keeps its drawing inside the middle 80% (the phone may crop the rest to a circle).
// Usage: node tools/build-icons.mjs
import sharp from "sharp";
import fs from "node:fs";
const pub = new URL("../client/public/", import.meta.url);
const svg = fs.readFileSync(new URL("favicon.svg", pub));
const out = (name) => new URL(name, pub).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out(name));
const inner = await sharp(svg, { density: 300 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0b1020" } }).composite([{ input: inner, gravity: "centre" }]).png().toFile(out("icon-maskable-512.png"));
console.log("icons written");
