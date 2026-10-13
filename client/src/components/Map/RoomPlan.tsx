import { floorPlan, type Area, type RoomAsset, type World } from "@shared/logic";

interface RoomPlanProps {
  world: World;
  // The room the party is in
  here: Area;
  // A door, way out or secret way was tapped: the area it leads to
  onSelect?: (areaId: string) => void;
}

const WALL = "#94a3b8";
const NPC_COLOR = { hostile: "#f87171", friendly: "#86efac", neutral: "#e5e7eb" };

// Where an asset set in a wall is drawn: a short bar on the wall line of its square
const inWall = (a: RoomAsset, s: number) => {
  const cx = a.x * s + s / 2;
  const cy = a.y * s + s / 2;
  const half = s * 0.4;
  return a.side === "n" ? { x1: cx - half, y1: a.y * s, x2: cx + half, y2: a.y * s }
    : a.side === "s" ? { x1: cx - half, y1: (a.y + 1) * s, x2: cx + half, y2: (a.y + 1) * s }
    : a.side === "w" ? { x1: a.x * s, y1: cy - half, x2: a.x * s, y2: cy + half }
    : { x1: (a.x + 1) * s, y1: cy - half, x2: (a.x + 1) * s, y2: cy + half };
};

// The floor plan of the building the party is in (every room on one grid of 5-foot squares) and,
// larger, the room they stand in with its furniture, doors, windows, people and caches. Hidden
// doors, caches and secret ways are not drawn until they are found.
export default function RoomPlan({ world, here, onSelect }: RoomPlanProps) {
  const plan = here.parentId ? floorPlan(world, here.parentId) : undefined;
  const layout = here.layout;
  if (!plan || !layout) return null;
  const s = 24;
  const pathOf = (a: RoomAsset) => world.paths.find((p) => p.id === a.ref);
  const shown = layout.assets.filter((a) => {
    if (a.kind === "door") return !pathOf(a)?.hidden;
    if (a.kind === "secret") return !!here.secretEntry?.found;
    if (a.kind === "loot") return here.loot.some((c) => c.id === a.ref && !c.hidden);
    if (a.kind === "npc") return here.occupants.some((o) => o.id === a.ref);
    if (a.kind === "ship") return here.ships.some((ship) => ship.id === a.ref);
    return true;
  });
  const legend = Array.from(new Set(shown.filter((a) => a.kind === "furniture").map((a) => a.name)));
  const letter = (name: string) => legend.indexOf(name) + 1;

  return (
    <div className="space-y-1" data-testid="room-plan">
      <svg viewBox={`${plan.x - 0.5} ${plan.y - 0.5} ${plan.width + 1} ${plan.height + 1}`} className="w-full max-h-28" data-testid="floor-plan">
        {plan.rooms.map((room) => (
          <rect
            key={room.id}
            x={room.layout!.x}
            y={room.layout!.y}
            width={room.layout!.width}
            height={room.layout!.height}
            fill={room.id === here.id ? "#facc15" : "#1f2937"}
            fillOpacity={room.id === here.id ? 0.5 : 1}
            stroke={WALL}
            strokeWidth={0.2}
          >
            <title>{room.name}</title>
          </rect>
        ))}
      </svg>
      <svg viewBox={`-3 -3 ${layout.width * s + 6} ${layout.height * s + 6}`} className="w-full" data-testid="room-grid">
        <rect x={0} y={0} width={layout.width * s} height={layout.height * s} fill="#111827" />
        {Array.from({ length: layout.width - 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * s} y1={0} x2={(i + 1) * s} y2={layout.height * s} stroke="#374151" strokeWidth={0.5} />
        ))}
        {Array.from({ length: layout.height - 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i + 1) * s} x2={layout.width * s} y2={(i + 1) * s} stroke="#374151" strokeWidth={0.5} />
        ))}
        <rect x={0} y={0} width={layout.width * s} height={layout.height * s} fill="none" stroke={WALL} strokeWidth={3} />
        {shown.map((a) => {
          if (a.kind === "furniture" || a.kind === "ship") {
            return (
              <g key={a.id}>
                <rect x={a.x * s + 2} y={a.y * s + 2} width={a.w * s - 4} height={a.h * s - 4} rx={a.kind === "ship" ? 10 : 2} fill={a.kind === "ship" ? "#0e7490" : a.cover ? "#78716c" : "#57534e"} stroke={a.blocks ? "#d6d3d1" : "#78716c"} strokeDasharray={a.blocks ? undefined : "3 2"} strokeWidth={1}>
                  <title>{a.name}</title>
                </rect>
                <text x={(a.x + a.w / 2) * s} y={(a.y + a.h / 2) * s + 4} textAnchor="middle" fontSize={a.kind === "ship" ? 9 : 10} fill="#f5f5f4">
                  {a.kind === "ship" ? a.name.slice(0, a.w * 3) : letter(a.name)}
                </text>
              </g>
            );
          }
          if (a.kind === "loot") {
            return (
              <rect key={a.id} x={a.x * s + 5} y={a.y * s + 5} width={s - 10} height={s - 10} fill="#eab308" stroke="#fef08a">
                <title>{a.name}</title>
              </rect>
            );
          }
          if (a.kind === "npc") {
            const occupant = here.occupants.find((x) => x.id === a.ref)!;
            return (
              <circle key={a.id} cx={a.x * s + s / 2} cy={a.y * s + s / 2} r={s * 0.32} fill={NPC_COLOR[occupant.disposition]} stroke="#111827">
                <title>{a.name}</title>
              </circle>
            );
          }
          // Set in a wall: a door (brown, red when locked), a way out (green), a window (blue), a secret way (purple)
          const path = a.kind === "door" ? pathOf(a) : undefined;
          const color = a.kind === "window" ? "#7dd3fc" : a.kind === "secret" ? "#c084fc" : a.kind === "exit" ? "#4ade80" : path?.locked ? "#f87171" : "#f59e0b";
          const tappable = a.kind !== "window" && !!a.to && !!onSelect;
          return (
            <line
              key={a.id}
              {...inWall(a, s)}
              stroke={color}
              strokeWidth={a.kind === "window" ? 3 : 7}
              strokeDasharray={a.kind === "secret" ? "4 3" : undefined}
              strokeLinecap="round"
              style={tappable ? { cursor: "pointer" } : undefined}
              onClick={tappable ? () => onSelect!(a.to!) : undefined}
              data-testid={`plan-${a.kind}`}
            >
              <title>{a.kind === "window" ? a.name : `${a.name} to ${world.areas[a.to ?? ""]?.name ?? "outside"}`}</title>
            </line>
          );
        })}
      </svg>
      <p className="text-xs text-gray-400">
        {layout.width * 5} x {layout.height * 5} ft., 5 ft. squares.{" "}
        <span style={{ color: "#f59e0b" }}>Door</span> <span style={{ color: "#f87171" }}>locked</span> <span style={{ color: "#4ade80" }}>way out</span>{" "}
        <span style={{ color: "#7dd3fc" }}>window</span> <span style={{ color: "#c084fc" }}>secret way</span> <span style={{ color: "#eab308" }}>cache</span>. Tap a door to go through it.
      </p>
      {legend.length > 0 && (
        <p className="text-xs text-gray-400" data-testid="plan-legend">
          {legend.map((name, i) => `${i + 1} ${name}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

