// Top-down art for the room plans and the fight grid, drawn as SVG so it stays sharp on a phone
// and costs no downloads: furniture, people, droids, creatures and ships in the worn, practical
// look of the setting (durasteel plating, sand-scoured plastoid, console glow). Everything is
// drawn in a box of w x h pixels with its top-left corner at 0,0.
import type { ReactNode } from "react";
import type { Occupant, RoomAsset, Ship } from "@shared/logic";

const C = {
  steel: "#3d4856", steelDark: "#27303b", steelLight: "#7b8794", line: "#11161d",
  glow: "#5ad1ff", amber: "#f0a03c", red: "#e5484d", green: "#58c98b",
  sand: "#c9a56e", sandDark: "#9a7a4c", clay: "#8b5e3c", clayDark: "#5f3f28",
  olive: "#6f7448", cream: "#e8dcc0", rock: "#6d6a66", rockDark: "#4a4744", white: "#e9edf0",
};

type Box = { w: number; h: number };
const pad = 2;

// ---------------------------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------------------------

export type FloorKind = "plating" | "hangar" | "sand" | "rock" | "stone" | "clay";

export function floorOf(buildingType = ""): FloorKind {
  if (/cave|trailhead/.test(buildingType)) return "rock";
  if (/camp|landing field|landing pad/.test(buildingType)) return "sand";
  if (/ruin|palace|archive/.test(buildingType)) return "stone";
  if (/cantina|market|residences|town gate|city gate/.test(buildingType)) return "clay";
  if (/spaceport|docking|cargo|warehouse|wreck/.test(buildingType)) return "hangar";
  return "plating";
}

// Pattern definitions for the floors; draw once inside an <svg>, then fill with url(#floor-<kind>)
export function FloorDefs({ s }: { s: number }) {
  const tile = (id: FloorKind, base: string, body: ReactNode) => (
    <pattern id={`floor-${id}`} width={s * 2} height={s * 2} patternUnits="userSpaceOnUse">
      <rect width={s * 2} height={s * 2} fill={base} />
      {body}
    </pattern>
  );
  return (
    <defs>
      {tile("plating", "#1d2530", <>
        <path d={`M0 0H${s * 2}M0 ${s}H${s * 2}M0 0V${s * 2}M${s} 0V${s}M${s * 1.5} ${s}V${s * 2}`} stroke="#2e3947" strokeWidth={1.2} fill="none" />
        <circle cx={3} cy={3} r={0.9} fill="#3d4a5a" /><circle cx={s + 3} cy={s + 3} r={0.9} fill="#3d4a5a" />
      </>)}
      {tile("hangar", "#232a31", <>
        <path d={`M0 0H${s * 2}M0 0V${s * 2}`} stroke="#333d47" strokeWidth={1.5} fill="none" />
        <path d={`M${s * 0.2} ${s * 1.8}l${s * 0.4} -${s * 0.4}M${s * 0.8} ${s * 1.8}l${s * 0.4} -${s * 0.4}`} stroke="#6b5a22" strokeWidth={2} />
      </>)}
      {tile("sand", "#8f7447", <>
        <path d={`M0 ${s * 0.5}q${s * 0.5} -${s * 0.2} ${s} 0t${s} 0M0 ${s * 1.4}q${s * 0.5} ${s * 0.2} ${s} 0t${s} 0`} stroke="#a58a5a" strokeWidth={1} fill="none" />
        <circle cx={s * 0.4} cy={s} r={1} fill="#6f5a37" /><circle cx={s * 1.5} cy={s * 0.3} r={1.2} fill="#6f5a37" />
      </>)}
      {tile("rock", "#3a3835", <>
        <path d={`M0 ${s * 0.7}l${s * 0.6} ${s * 0.3}l${s * 0.5} -${s * 0.4}l${s * 0.9} ${s * 0.2}M${s * 0.6} ${s}l${s * 0.2} ${s}M${s * 1.1} ${s * 0.6}l-${s * 0.1} -${s * 0.6}`} stroke="#4d4a46" strokeWidth={1.2} fill="none" />
        <circle cx={s * 1.6} cy={s * 1.5} r={1.5} fill="#2c2a28" />
      </>)}
      {tile("stone", "#45423d", <>
        <path d={`M0 0H${s * 2}M0 ${s}H${s * 2}M${s * 0.5} 0V${s}M${s * 1.5} ${s}V${s * 2}M0 ${s}V${s * 2}`} stroke="#5a564f" strokeWidth={1.4} fill="none" />
        <path d={`M${s * 1.2} ${s * 0.2}l${s * 0.3} ${s * 0.4}`} stroke="#34322e" strokeWidth={1} />
      </>)}
      {tile("clay", "#4a3a2d", <>
        <path d={`M0 0H${s * 2}M0 0V${s * 2}M${s} 0V${s * 2}M0 ${s}H${s * 2}`} stroke="#5c4838" strokeWidth={1} fill="none" />
        <circle cx={s * 0.5} cy={s * 0.5} r={s * 0.18} fill="none" stroke="#5c4838" strokeWidth={0.8} />
      </>)}
      <radialGradient id="glow-blue"><stop offset="0" stopColor={C.glow} stopOpacity="0.95" /><stop offset="1" stopColor={C.glow} stopOpacity="0" /></radialGradient>
      <radialGradient id="glow-amber"><stop offset="0" stopColor="#ffd27a" stopOpacity="0.95" /><stop offset="1" stopColor={C.amber} stopOpacity="0" /></radialGradient>
      <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000" floodOpacity="0.6" /></filter>
    </defs>
  );
}

// ---------------------------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------------------------

const slab = ({ w, h }: Box, fill: string, rx = 3, stroke = C.line) => <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} rx={rx} fill={fill} stroke={stroke} strokeWidth={1} />;
const long = ({ w, h }: Box) => Math.max(w, h);

function crate({ w, h }: Box, fill: string, x = pad, y = pad, cw = w - pad * 2, ch = h - pad * 2) {
  return (
    <g>
      <rect x={x} y={y} width={cw} height={ch} rx={1.5} fill={fill} stroke={C.line} strokeWidth={1} />
      <rect x={x + cw * 0.14} y={y + ch * 0.14} width={cw * 0.72} height={ch * 0.72} fill="none" stroke="#0006" strokeWidth={1} />
      <path d={`M${x + cw * 0.14} ${y + ch * 0.5}H${x + cw * 0.86}`} stroke="#fff3" strokeWidth={1} />
      <rect x={x + cw * 0.4} y={y + ch * 0.42} width={cw * 0.2} height={ch * 0.16} fill={C.amber} opacity={0.8} />
    </g>
  );
}

function screen(x: number, y: number, w: number, h: number, color = C.glow) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1} fill="#0b1a24" stroke={color} strokeWidth={0.8} />
      <path d={`M${x + 1.5} ${y + h * 0.65}l${w * 0.25} -${h * 0.3}l${w * 0.2} ${h * 0.2}l${w * 0.3} -${h * 0.35}`} stroke={color} strokeWidth={0.9} fill="none" />
    </g>
  );
}

// Seats round a table: small padded stools
const stools = (cx: number, cy: number, r: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.6;
    return <circle key={i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={Math.max(2, r * 0.22)} fill={C.clay} stroke={C.line} strokeWidth={0.7} />;
  });

const rockShape = ({ w, h }: Box, fill: string, seed = 0) => {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const r = 0.36 + (((i * 37 + seed * 17) % 10) / 10) * 0.12;
    return `${w / 2 + Math.cos(a) * w * r},${h / 2 + Math.sin(a) * h * r}`;
  }).join(" ");
  return (
    <g>
      <polygon points={pts} fill={fill} stroke={C.line} strokeWidth={1} />
      <path d={`M${w * 0.35} ${h * 0.4}l${w * 0.2} ${h * 0.12}l${w * 0.12} -${h * 0.1}`} stroke="#fff2" strokeWidth={1} fill="none" />
    </g>
  );
};

// One piece of furniture, by what it is called (the names come from ROOM_PLANS in shared/logic)
export function FurnitureArt({ name, w, h }: { name: string } & Box) {
  const b = { w, h };
  const n = name.toLowerCase();
  const cx = w / 2;
  const cy = h / 2;
  const wide = w >= h;
  if (/bar counter/.test(n)) {
    return (
      <g>
        {slab(b, C.clayDark, 5)}
        <rect x={pad + 2} y={pad + 2} width={w - pad * 2 - 4} height={h - pad * 2 - 4} rx={4} fill={C.clay} />
        {Array.from({ length: Math.floor(long(b) / 14) }, (_, i) => (
          <circle key={i} cx={wide ? 12 + i * 14 : cx} cy={wide ? cy : 12 + i * 14} r={2.2} fill={[C.glow, C.amber, C.green][i % 3]} stroke={C.line} strokeWidth={0.5} />
        ))}
      </g>
    );
  }
  if (/sabacc/.test(n)) {
    return (
      <g>
        {stools(cx, cy, w * 0.44, 5)}
        <circle cx={cx} cy={cy} r={w * 0.34} fill={C.steelDark} stroke={C.line} />
        <polygon points={Array.from({ length: 6 }, (_, i) => `${cx + Math.cos((i / 6) * Math.PI * 2) * w * 0.26},${cy + Math.sin((i / 6) * Math.PI * 2) * w * 0.26}`).join(" ")} fill="#1f5a4a" stroke={C.green} strokeWidth={0.8} />
        <rect x={cx - 3} y={cy - 4} width={6} height={8} rx={1} fill={C.cream} transform={`rotate(18 ${cx} ${cy})`} />
      </g>
    );
  }
  if (/holo-table/.test(n)) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={w * 0.42} fill={C.steelDark} stroke={C.steelLight} />
        <circle cx={cx} cy={cy} r={w * 0.4} fill="url(#glow-blue)" />
        <circle cx={cx} cy={cy} r={w * 0.26} fill="none" stroke={C.glow} strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={w * 0.13} fill="none" stroke={C.glow} strokeWidth={0.8} />
        <path d={`M${cx - w * 0.3} ${cy}H${cx + w * 0.3}M${cx} ${cy - w * 0.3}V${cy + w * 0.3}`} stroke={C.glow} strokeWidth={0.5} opacity={0.7} />
      </g>
    );
  }
  if (/reactor/.test(n)) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={w * 0.46} fill="none" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" />
        <circle cx={cx} cy={cy} r={w * 0.38} fill={C.steelDark} stroke={C.line} />
        <circle cx={cx} cy={cy} r={w * 0.3} fill="url(#glow-amber)" />
        <circle cx={cx} cy={cy} r={w * 0.12} fill="#fff6d8" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={cx - 2} y={cy - w * 0.4} width={4} height={w * 0.12} fill={C.steelLight} transform={`rotate(${i * 90 + 45} ${cx} ${cy})`} />)}
      </g>
    );
  }
  if (/low table|^table|mess table/.test(n)) {
    if (w === h) {
      return (
        <g>
          {stools(cx, cy, w * 0.4, 3)}
          <circle cx={cx} cy={cy} r={w * 0.27} fill={C.steel} stroke={C.line} />
          <circle cx={cx} cy={cy} r={w * 0.2} fill="none" stroke="#fff2" />
          <circle cx={cx + 2} cy={cy - 1} r={1.8} fill={C.amber} />
        </g>
      );
    }
    return (
      <g>
        {slab({ w, h }, C.steel, 3)}
        {Array.from({ length: Math.floor(long(b) / 12) }, (_, i) => <circle key={i} cx={wide ? 9 + i * 12 : cx} cy={wide ? cy : 9 + i * 12} r={2} fill={i % 2 ? C.cream : C.amber} />)}
      </g>
    );
  }
  if (/booth|couch|bench/.test(n)) {
    const seats = Math.max(2, Math.round(long(b) / 12));
    return (
      <g>
        {slab(b, /bench/.test(n) ? C.steel : C.clayDark, 4)}
        {Array.from({ length: seats }, (_, i) => {
          const step = (long(b) - pad * 2 - 4) / seats;
          return wide
            ? <rect key={i} x={pad + 2 + i * step} y={pad + h * 0.3} width={step - 1.5} height={h * 0.55 - pad} rx={2} fill={/bench/.test(n) ? C.steelLight : C.clay} />
            : <rect key={i} x={pad + w * 0.3} y={pad + 2 + i * step} width={w * 0.55 - pad} height={step - 1.5} rx={2} fill={/bench/.test(n) ? C.steelLight : C.clay} />;
        })}
      </g>
    );
  }
  if (/bunk|bed/.test(n)) {
    const medical = /medical/.test(n);
    return (
      <g>
        {slab(b, medical ? C.white : C.steel, 3)}
        {wide
          ? <><rect x={pad + 2} y={pad + 2} width={w * 0.22} height={h - pad * 2 - 4} rx={2} fill={medical ? "#cfe7f2" : C.cream} /><rect x={w * 0.34} y={pad + 2} width={w * 0.6} height={h - pad * 2 - 4} rx={2} fill={medical ? "#9fc6d8" : C.olive} /></>
          : <><rect x={pad + 2} y={pad + 2} width={w - pad * 2 - 4} height={h * 0.22} rx={2} fill={medical ? "#cfe7f2" : C.cream} /><rect x={pad + 2} y={h * 0.34} width={w - pad * 2 - 4} height={h * 0.6} rx={2} fill={medical ? "#9fc6d8" : C.olive} /></>}
        {medical && <circle cx={w - 6} cy={6} r={2} fill={C.glow} />}
      </g>
    );
  }
  if (/bacta|coolant|drink dispenser|fuel pump|power coupling/.test(n)) {
    const tint = /bacta/.test(n) ? C.glow : /coolant/.test(n) ? "#7ee0c0" : /fuel/.test(n) ? C.red : /power/.test(n) ? "#f5d342" : C.amber;
    return (
      <g>
        <circle cx={cx} cy={cy} r={w * 0.4} fill={C.steelDark} stroke={C.steelLight} />
        <circle cx={cx} cy={cy} r={w * 0.28} fill={tint} opacity={0.75} />
        <circle cx={cx - w * 0.08} cy={cy - w * 0.08} r={w * 0.08} fill="#fff8" />
        {/fuel/.test(n) && <path d={`M${cx} ${cy}q${w * 0.3} ${h * 0.1} ${w * 0.35} ${h * 0.4}`} stroke={C.line} strokeWidth={2} fill="none" />}
        {/power/.test(n) && <path d={`M${cx - 2} ${cy - 5}l-3 6h5l-2 5`} stroke={C.line} strokeWidth={1.4} fill="none" />}
      </g>
    );
  }
  if (/console|terminal|sensor|instrument/.test(n)) {
    return (
      <g>
        {slab(b, C.steelDark, 2, C.steelLight)}
        {wide ? screen(pad + 3, pad + 2, w * 0.55, h - pad * 2 - 4) : screen(pad + 2, pad + 3, w - pad * 2 - 4, h * 0.55)}
        {[0, 1, 2].map((i) => <circle key={i} cx={wide ? w * 0.72 + i * 4 : cx - 4 + i * 4} cy={wide ? cy : h * 0.78} r={1.3} fill={[C.red, C.amber, C.green][i]} />)}
        {/sensor/.test(n) && <circle cx={cx} cy={cy} r={w * 0.3} fill="none" stroke={C.steelLight} strokeWidth={1.5} />}
      </g>
    );
  }
  if (/desk|workbench/.test(n)) {
    return (
      <g>
        {slab(b, /work/.test(n) ? C.steel : C.clayDark, 2)}
        {screen(pad + 3, pad + 3, Math.min(10, w * 0.3), Math.min(8, h * 0.5), /work/.test(n) ? C.amber : C.glow)}
        <path d={`M${w * 0.55} ${cy}h${w * 0.3}`} stroke={C.steelLight} strokeWidth={2} strokeLinecap="round" />
        <circle cx={w * 0.5} cy={cy + 1} r={1.6} fill={C.amber} />
      </g>
    );
  }
  if (/holding cell/.test(n)) {
    return (
      <g>
        {slab(b, "#151a21", 1, C.steelLight)}
        {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${pad + 4 + (i * (w - 12)) / 4} ${pad + 2}V${h - pad - 2}`} stroke={C.red} strokeWidth={1.2} opacity={0.85} />)}
        <rect x={w * 0.3} y={h * 0.62} width={w * 0.4} height={h * 0.2} rx={2} fill={C.steel} />
      </g>
    );
  }
  if (/market stall/.test(n)) {
    return (
      <g>
        {slab(b, C.clayDark, 2)}
        {Array.from({ length: 6 }, (_, i) => wide
          ? <rect key={i} x={pad + (i * (w - pad * 2)) / 6} y={pad} width={(w - pad * 2) / 6} height={h * 0.45} fill={i % 2 ? C.cream : "#c8663a"} />
          : <rect key={i} x={pad} y={pad + (i * (h - pad * 2)) / 6} width={w * 0.45} height={(h - pad * 2) / 6} fill={i % 2 ? C.cream : "#c8663a"} />)}
        {[0, 1, 2].map((i) => <circle key={i} cx={wide ? w * 0.25 + i * w * 0.25 : w * 0.72} cy={wide ? h * 0.72 : h * 0.25 + i * h * 0.25} r={2.3} fill={[C.green, C.amber, C.glow][i]} />)}
      </g>
    );
  }
  if (/crate stack|cargo pallet/.test(n)) {
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} fill="#0004" rx={2} />
        {crate(b, C.olive, pad, pad, w * 0.52, h * 0.52)}
        {crate(b, C.steel, w * 0.46, pad + 2, w * 0.5, h * 0.44)}
        {crate(b, "#8a5a2b", pad + 3, h * 0.5, w * 0.44, h * 0.46)}
        {crate(b, C.olive, w * 0.5, h * 0.5, w * 0.46, h * 0.46)}
      </g>
    );
  }
  if (/crate|parts bin|footlocker|tool cart|lifter/.test(n)) return crate(b, /parts|tool/.test(n) ? C.steel : /foot/.test(n) ? "#4b5563" : C.olive);
  if (/shelving|locker|cabinet|rack|pipe run|loading crane/.test(n)) {
    const lines = Math.max(2, Math.round(long(b) / 9));
    return (
      <g>
        {slab(b, C.steelDark, 1, C.steelLight)}
        {Array.from({ length: lines }, (_, i) => wide
          ? <path key={i} d={`M${pad + ((i + 0.5) * (w - pad * 2)) / lines} ${pad + 2}V${h - pad - 2}`} stroke={/weapon/.test(n) ? C.steelLight : /pipe/.test(n) ? C.amber : "#55616f"} strokeWidth={/weapon|pipe/.test(n) ? 2 : 1} />
          : <path key={i} d={`M${pad + 2} ${pad + ((i + 0.5) * (h - pad * 2)) / lines}H${w - pad - 2}`} stroke={/weapon/.test(n) ? C.steelLight : /pipe/.test(n) ? C.amber : "#55616f"} strokeWidth={/weapon|pipe/.test(n) ? 2 : 1} />)}
      </g>
    );
  }
  if (/barricade|restraint/.test(n)) {
    return (
      <g>
        {slab(b, C.steel, 1)}
        <path d={`M${pad} ${h - pad}L${w * 0.3} ${pad}M${w * 0.35} ${h - pad}L${w * 0.65} ${pad}M${w * 0.7} ${h - pad}L${w - pad} ${pad}`} stroke="#f5d342" strokeWidth={2} />
      </g>
    );
  }
  if (/command chair/.test(n)) {
    return (
      <g>
        <rect x={w * 0.2} y={h * 0.15} width={w * 0.6} height={h * 0.7} rx={5} fill={C.steelDark} stroke={C.steelLight} />
        <rect x={w * 0.3} y={h * 0.35} width={w * 0.4} height={h * 0.4} rx={3} fill={C.clay} />
      </g>
    );
  }
  if (/sarcophagus|altar/.test(n)) {
    return (
      <g>
        {slab(b, C.rock, 2)}
        <rect x={w * 0.2} y={h * 0.15} width={w * 0.6} height={h * 0.7} rx={2} fill="none" stroke={C.rockDark} strokeWidth={1.5} />
        {/altar/.test(n) && <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.2} fill={C.red} opacity={0.8} />}
      </g>
    );
  }
  if (/dais/.test(n)) {
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={2} fill="#ffffff10" stroke={C.steelLight} strokeDasharray="4 3" />
        <rect x={5} y={4} width={w - 10} height={h - 8} rx={2} fill="#ffffff10" stroke={C.steelLight} strokeWidth={0.7} />
      </g>
    );
  }
  if (/campfire/.test(n)) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={w * 0.45} fill="url(#glow-amber)" />
        {stools(cx, cy, w * 0.26, 7)}
        <circle cx={cx} cy={cy} r={w * 0.12} fill="#ffd27a" />
      </g>
    );
  }
  if (/pillar|awning post/.test(n)) {
    const broken = /broken|rock/.test(n);
    return broken ? rockShape(b, C.rock, 3) : (
      <g>
        <rect x={w * 0.14} y={h * 0.14} width={w * 0.72} height={h * 0.72} fill={C.steelDark} stroke={C.line} />
        <circle cx={cx} cy={cy} r={w * 0.28} fill={C.steelLight} stroke={C.line} />
        <circle cx={cx - 2} cy={cy - 2} r={w * 0.1} fill="#fff4" />
      </g>
    );
  }
  if (/boulder|rubble/.test(n)) {
    return /rubble/.test(n) ? (
      <g>
        <g transform={`translate(0 0) scale(${wide ? 0.55 : 1} ${wide ? 1 : 0.55})`}>{rockShape(b, C.rockDark, 1)}</g>
        <g transform={`translate(${wide ? w * 0.42 : 0} ${wide ? 0 : h * 0.42}) scale(${wide ? 0.58 : 1} ${wide ? 1 : 0.58})`}>{rockShape(b, C.rock, 5)}</g>
      </g>
    ) : rockShape(b, C.rock, 2);
  }
  return slab(b, C.steel);
}

// ---------------------------------------------------------------------------------------------
// People, droids and creatures
// ---------------------------------------------------------------------------------------------

export type TokenKind = "player" | "force" | "trooper" | "officer" | "person" | "crowd" | "astromech" | "battledroid" | "droid" | "beast" | "horror" | "swarm" | "hutt";

// What to draw for an occupant, from its stat block's creature type, its name and its role
export function tokenOf(o: Partial<Pick<Occupant, "name" | "role" | "creature" | "count">> & { isPlayer?: boolean; forceUser?: boolean }): TokenKind {
  if (o.isPlayer) return o.forceUser ? "force" : "player";
  const name = (o.name ?? "").toLowerCase();
  const creature = (o.creature ?? "").toLowerCase();
  if (/swarm/.test(creature) || /swarm/.test(name)) return "swarm";
  if (/hutt/.test(name)) return "hutt";
  if (/astromech|r2|r5|utility|gonk|mouse|pit droid|junk droid/.test(name) || o.role === "utility droid") return "astromech";
  if (/b1|b2|bx|battle droid|commando droid|tactical/.test(name)) return "battledroid";
  if (/droid|construct/.test(creature) || /droid|probe|ig[- ]|kx|dsd|destroyer|vulture|series/.test(name)) return "droid";
  if (/inquisitor|sith|jedi|dark side|guard, |royal guard|shadow/.test(name)) return "force";
  if (/trooper|navy|pilot/.test(name)) return "trooper";
  if (/officer|isb|captain/.test(name) || o.role === "officer" || o.role === "leader") return "officer";
  if (/aberration|undead|elemental|plant|tree/.test(creature) || o.role === "horror") return "horror";
  if (/beast/.test(creature) || o.role === "wildlife") return "beast";
  if (o.role === "civilians") return "crowd";
  return "person";
}

const hue = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 7);

// A creature seen from above, on a base ringed in the colour of its side. `d` is the base's diameter.
export function TokenArt({ kind, d, ring, label, dim, large }: { kind: TokenKind; d: number; ring: string; label?: string; dim?: boolean; large?: boolean }) {
  const r = d / 2;
  const k = (large ? 1.18 : 1) * r;
  const tone = `hsl(${hue(label ?? kind)} 30% 42%)`;
  let figure: ReactNode;
  if (kind === "astromech") {
    figure = (
      <g>
        <circle r={k * 0.62} fill={C.white} stroke={C.line} />
        <path d={`M${-k * 0.62} 0A${k * 0.62} ${k * 0.62} 0 0 1 ${k * 0.62} 0`} fill="#3b6fb5" opacity={0.85} />
        <circle cy={-k * 0.28} r={k * 0.16} fill={C.line} /><circle cy={-k * 0.28} r={k * 0.07} fill={C.red} />
        <rect x={-k * 0.86} y={-k * 0.3} width={k * 0.22} height={k * 0.6} rx={2} fill={C.steelLight} stroke={C.line} strokeWidth={0.6} />
        <rect x={k * 0.64} y={-k * 0.3} width={k * 0.22} height={k * 0.6} rx={2} fill={C.steelLight} stroke={C.line} strokeWidth={0.6} />
      </g>
    );
  } else if (kind === "battledroid") {
    figure = (
      <g>
        <rect x={-k * 0.5} y={-k * 0.14} width={k} height={k * 0.34} rx={k * 0.12} fill="#c9b48a" stroke={C.line} />
        <rect x={-k * 0.14} y={-k * 0.66} width={k * 0.28} height={k * 0.62} rx={k * 0.12} fill="#d8c59c" stroke={C.line} />
        <path d={`M${k * 0.42} 0l${k * 0.2} ${-k * 0.62}`} stroke={C.line} strokeWidth={2} />
      </g>
    );
  } else if (kind === "droid") {
    figure = (
      <g>
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M0 0L${Math.cos(i * 1.57 + 0.8) * k * 0.85} ${Math.sin(i * 1.57 + 0.8) * k * 0.85}`} stroke={C.steelLight} strokeWidth={1.6} />)}
        <circle r={k * 0.5} fill="#2a2f36" stroke={C.steelLight} />
        <circle cx={-k * 0.16} cy={-k * 0.12} r={k * 0.12} fill={C.red} /><circle cx={k * 0.18} cy={-k * 0.1} r={k * 0.08} fill={C.amber} />
      </g>
    );
  } else if (kind === "beast") {
    figure = (
      <g>
        {[-1, 1].map((sx) => [-1, 1].map((sy) => <ellipse key={`${sx}${sy}`} cx={sx * k * 0.42} cy={sy * k * 0.3 + k * 0.08} rx={k * 0.16} ry={k * 0.1} fill={tone} stroke={C.line} strokeWidth={0.6} />))}
        <path d={`M0 ${k * 0.5}q${k * 0.3} ${k * 0.25} ${k * 0.1} ${k * 0.42}`} stroke={tone} strokeWidth={2.2} fill="none" />
        <ellipse rx={k * 0.36} ry={k * 0.55} cy={k * 0.05} fill={tone} stroke={C.line} />
        <ellipse cy={-k * 0.52} rx={k * 0.24} ry={k * 0.22} fill={tone} stroke={C.line} />
        <path d={`M${-k * 0.14} ${-k * 0.7}l${-k * 0.1} ${-k * 0.16}M${k * 0.14} ${-k * 0.7}l${k * 0.1} ${-k * 0.16}`} stroke={C.cream} strokeWidth={1.4} />
      </g>
    );
  } else if (kind === "horror") {
    figure = (
      <g>
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M0 0Q${Math.cos(i * 1.05) * k * 0.6} ${Math.sin(i * 1.05) * k * 0.2} ${Math.cos(i * 1.05 + 0.4) * k * 0.9} ${Math.sin(i * 1.05 + 0.4) * k * 0.9}`} stroke="#5b3b6b" strokeWidth={2.2} fill="none" />)}
        <circle r={k * 0.42} fill="#3a2545" stroke={C.line} />
        <circle cx={-k * 0.14} cy={-k * 0.08} r={k * 0.08} fill={C.red} /><circle cx={k * 0.14} cy={-k * 0.08} r={k * 0.08} fill={C.red} />
      </g>
    );
  } else if (kind === "swarm" || kind === "crowd") {
    figure = (
      <g>
        {[[-0.35, -0.2], [0.3, -0.3], [0, 0.1], [-0.3, 0.38], [0.36, 0.3]].map(([x, y], i) => (
          <circle key={i} cx={x * k} cy={y * k} r={k * (kind === "crowd" ? 0.2 : 0.13)} fill={kind === "crowd" ? `hsl(${(i * 67) % 360} 25% 55%)` : tone} stroke={C.line} strokeWidth={0.6} />
        ))}
      </g>
    );
  } else if (kind === "hutt") {
    figure = (
      <g>
        <path d={`M0 ${-k * 0.6}q${k * 0.55} 0 ${k * 0.5} ${k * 0.5}q0 ${k * 0.4} ${-k * 0.2} ${k * 0.75}q${-k * 0.5} ${-k * 0.1} ${-k * 0.75} ${-k * 0.55}q${-k * 0.1} ${-k * 0.7} ${k * 0.45} ${-k * 0.7}z`} fill="#7c8a4a" stroke={C.line} />
        <circle cx={-k * 0.12} cy={-k * 0.3} r={k * 0.07} fill={C.amber} /><circle cx={k * 0.16} cy={-k * 0.3} r={k * 0.07} fill={C.amber} />
      </g>
    );
  } else {
    // A humanoid from above: shoulders, head, and what marks them out
    const body = kind === "trooper" ? C.white : kind === "officer" ? "#56624f" : kind === "force" ? "#4a3626" : kind === "player" ? "#7a4b2a" : tone;
    const head = kind === "trooper" ? C.white : kind === "force" ? "#33251b" : "#d9b99a";
    figure = (
      <g>
        <ellipse rx={k * 0.62} ry={k * 0.34} cy={k * 0.08} fill={body} stroke={C.line} />
        {kind === "player" && <rect x={-k * 0.34} y={-k * 0.14} width={k * 0.68} height={k * 0.44} rx={k * 0.1} fill="#2f3a48" opacity={0.9} />}
        <circle cy={-k * 0.06} r={k * 0.27} fill={head} stroke={C.line} />
        {kind === "trooper" && <path d={`M${-k * 0.2} ${-k * 0.14}h${k * 0.4}`} stroke={C.line} strokeWidth={2.2} />}
        {kind === "officer" && <path d={`M${-k * 0.27} ${-k * 0.1}a${k * 0.27} ${k * 0.27} 0 0 1 ${k * 0.54} 0z`} fill="#3f4a3a" />}
        {kind === "force"
          ? <path d={`M${k * 0.55} ${k * 0.05}L${k * 0.78} ${-k * 0.86}`} stroke={/sith|inquisitor|dark|guard/i.test(label ?? "") || ring === C.red ? "#ff5a5a" : "#7fe3ff"} strokeWidth={2.4} strokeLinecap="round" />
          : kind !== "person" && <path d={`M${k * 0.5} ${k * 0.02}l${k * 0.08} ${-k * 0.6}`} stroke={C.line} strokeWidth={2.2} strokeLinecap="round" />}
      </g>
    );
  }
  return (
    <g opacity={dim ? 0.35 : 1} filter="url(#soft-shadow)">
      <circle r={r * 0.94} fill="#0b0f14" fillOpacity={0.7} stroke={ring} strokeWidth={2} />
      {figure}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Ships, seen from above with the bow to the right
// ---------------------------------------------------------------------------------------------

export function ShipArt({ ship, w, h }: { ship: Pick<Ship, "name" | "size" | "role" | "status"> } & Box) {
  const role = `${ship.role} ${ship.size}`.toLowerCase();
  const hull = ship.status === "wrecked" ? "#5a554f" : "#aeb6bd";
  const dark = "#59636d";
  let body: ReactNode;
  if (/fighter|interceptor|tiny/.test(role)) {
    // A snub fighter: long nose, four strike foils with cannon tips, engines aft
    body = (
      <g>
        <path d={`M${w * 0.3} ${h * 0.5}L${w * 0.2} ${h * 0.06}L${w * 0.4} ${h * 0.06}L${w * 0.5} ${h * 0.42}L${w * 0.5} ${h * 0.58}L${w * 0.4} ${h * 0.94}L${w * 0.2} ${h * 0.94}Z`} fill={dark} stroke={C.line} />
        <path d={`M${w * 0.12} ${h * 0.4}L${w * 0.7} ${h * 0.42}L${w * 0.96} ${h * 0.5}L${w * 0.7} ${h * 0.58}L${w * 0.12} ${h * 0.6}Z`} fill={hull} stroke={C.line} />
        <ellipse cx={w * 0.56} cy={h * 0.5} rx={w * 0.07} ry={h * 0.06} fill="#1b2a38" stroke={C.glow} strokeWidth={0.7} />
        <path d={`M${w * 0.22} ${h * 0.06}H${w * 0.62}M${w * 0.22} ${h * 0.94}H${w * 0.62}`} stroke={C.red} strokeWidth={1.6} />
        <rect x={w * 0.06} y={h * 0.4} width={w * 0.08} height={h * 0.2} fill={C.glow} opacity={0.8} />
      </g>
    );
  } else if (/shuttle|transport|courier|small/.test(role)) {
    // A shuttle: a wedge hull with folding wings and a tall dorsal fin
    body = (
      <g>
        <path d={`M${w * 0.34} ${h * 0.5}L${w * 0.14} ${h * 0.04}L${w * 0.46} ${h * 0.3}Z`} fill={dark} stroke={C.line} />
        <path d={`M${w * 0.34} ${h * 0.5}L${w * 0.14} ${h * 0.96}L${w * 0.46} ${h * 0.7}Z`} fill={dark} stroke={C.line} />
        <path d={`M${w * 0.12} ${h * 0.3}L${w * 0.62} ${h * 0.34}L${w * 0.94} ${h * 0.5}L${w * 0.62} ${h * 0.66}L${w * 0.12} ${h * 0.7}Z`} fill={hull} stroke={C.line} />
        <path d={`M${w * 0.16} ${h * 0.5}H${w * 0.6}`} stroke={dark} strokeWidth={2.5} />
        <path d={`M${w * 0.7} ${h * 0.43}L${w * 0.86} ${h * 0.5}L${w * 0.7} ${h * 0.57}Z`} fill="#1b2a38" stroke={C.glow} strokeWidth={0.6} />
        <rect x={w * 0.07} y={h * 0.36} width={w * 0.06} height={h * 0.28} fill={C.glow} opacity={0.8} />
      </g>
    );
  } else if (/freighter|hauler|smuggl|medium/.test(role)) {
    // A light freighter: a saucer with forward mandibles and a cockpit pod on the starboard side
    body = (
      <g>
        <path d={`M${w * 0.6} ${h * 0.3}L${w * 0.96} ${h * 0.36}L${w * 0.96} ${h * 0.46}L${w * 0.66} ${h * 0.46}Z`} fill={hull} stroke={C.line} />
        <path d={`M${w * 0.6} ${h * 0.7}L${w * 0.96} ${h * 0.64}L${w * 0.96} ${h * 0.54}L${w * 0.66} ${h * 0.54}Z`} fill={hull} stroke={C.line} />
        <path d={`M${w * 0.5} ${h * 0.8}L${w * 0.76} ${h * 0.92}L${w * 0.84} ${h * 0.84}L${w * 0.62} ${h * 0.7}Z`} fill={dark} stroke={C.line} />
        <ellipse cx={w * 0.42} cy={h * 0.5} rx={w * 0.36} ry={h * 0.44} fill={hull} stroke={C.line} />
        <ellipse cx={w * 0.42} cy={h * 0.5} rx={w * 0.14} ry={h * 0.17} fill={dark} stroke={C.line} />
        <circle cx={w * 0.42} cy={h * 0.5} r={Math.min(w, h) * 0.05} fill={C.steelLight} />
        <path d={`M${w * 0.42} ${h * 0.06}V${h * 0.33}M${w * 0.42} ${h * 0.67}V${h * 0.94}M${w * 0.08} ${h * 0.5}H${w * 0.28}`} stroke={dark} strokeWidth={1.2} />
        <ellipse cx={w * 0.81} cy={h * 0.87} rx={w * 0.04} ry={h * 0.05} fill="#1b2a38" stroke={C.glow} strokeWidth={0.6} />
        <path d={`M${w * 0.07} ${h * 0.3}Q${w * 0.02} ${h * 0.5} ${w * 0.07} ${h * 0.7}`} stroke={C.glow} strokeWidth={2.5} fill="none" />
      </g>
    );
  } else {
    // A corvette: hammerhead bow, slim neck, a block of engines aft
    body = (
      <g>
        <rect x={w * 0.04} y={h * 0.18} width={w * 0.26} height={h * 0.64} rx={3} fill={dark} stroke={C.line} />
        {[0, 1, 2, 3].map((i) => <circle key={i} cx={w * 0.06} cy={h * (0.27 + i * 0.155)} r={h * 0.055} fill={C.glow} opacity={0.85} />)}
        <rect x={w * 0.28} y={h * 0.38} width={w * 0.5} height={h * 0.24} fill={hull} stroke={C.line} />
        <path d={`M${w * 0.74} ${h * 0.2}H${w * 0.94}Q${w * 0.99} ${h * 0.5} ${w * 0.94} ${h * 0.8}H${w * 0.74}Z`} fill={hull} stroke={C.line} />
        <path d={`M${w * 0.34} ${h * 0.5}H${w * 0.74}`} stroke={C.red} strokeWidth={1.5} />
        <rect x={w * 0.84} y={h * 0.44} width={w * 0.07} height={h * 0.12} fill="#1b2a38" stroke={C.glow} strokeWidth={0.6} />
      </g>
    );
  }
  return (
    <g filter="url(#soft-shadow)">
      {body}
      {ship.status === "wrecked" && <path d={`M${w * 0.3} ${h * 0.2}l${w * 0.1} ${h * 0.3}l-${w * 0.08} ${h * 0.1}l${w * 0.12} ${h * 0.25}`} stroke={C.line} strokeWidth={2} fill="none" />}
    </g>
  );
}

// Any asset that stands on the floor of a room
export function AssetArt({ asset, s, ship }: { asset: RoomAsset; s: number; ship?: Ship }) {
  const w = asset.w * s;
  const h = asset.h * s;
  return (
    <g transform={`translate(${asset.x * s} ${asset.y * s})`}>
      {asset.kind === "ship" ? (
        <ShipArt ship={ship ?? { name: asset.name, size: "Medium", role: "freighter", status: "landed" }} w={w} h={h} />
      ) : asset.kind === "loot" ? (
        <g>
          <rect x={s * 0.14} y={s * 0.2} width={s * 0.72} height={s * 0.6} rx={2} fill="#3a3320" stroke="#f5d342" strokeWidth={1.2} />
          <path d={`M${s * 0.14} ${s * 0.44}H${s * 0.86}`} stroke="#f5d342" strokeWidth={1} />
          <rect x={s * 0.44} y={s * 0.38} width={s * 0.12} height={s * 0.14} fill="#f5d342" />
        </g>
      ) : (
        <FurnitureArt name={asset.name} w={w} h={h} />
      )}
      <title>{asset.name}</title>
    </g>
  );
}

export const SIDE_COLORS = { hostile: C.red, friendly: C.green, neutral: "#cbd5e1", player: "#facc15" };
