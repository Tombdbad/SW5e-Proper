import type { ReactNode } from "react";
import { floorPlan, type Area, type RoomAsset, type Ship, type World } from "@shared/logic";
import { AssetArt, FloorDefs, TokenArt, floorOf, tokenOf, SIDE_COLORS, type FloorKind } from "./sprites";

interface RoomPlanProps {
  world: World;
  // The room the party is in
  here: Area;
  // A door, way out or secret way was tapped: the area it leads to
  onSelect?: (areaId: string) => void;
}

const WALL = "#8b97a6";

// Where an asset set in a wall is drawn: a short bar on the wall line of its square
const inWall = (a: RoomAsset, s: number) => {
  const cx = a.x * s + s / 2;
  const cy = a.y * s + s / 2;
  const half = s * 0.42;
  return a.side === "n" ? { x1: cx - half, y1: a.y * s, x2: cx + half, y2: a.y * s }
    : a.side === "s" ? { x1: cx - half, y1: (a.y + 1) * s, x2: cx + half, y2: (a.y + 1) * s }
    : a.side === "w" ? { x1: a.x * s, y1: cy - half, x2: a.x * s, y2: cy + half }
    : { x1: (a.x + 1) * s, y1: cy - half, x2: (a.x + 1) * s, y2: cy + half };
};

// The floor of a room or of a fight: its surface, the grid of 5-foot squares, what stands on it,
// the walls and what is set in them. Tokens and highlights are passed as children, drawn on top.
export function RoomFloor({ width, height, assets, s, floor, ships = [], locked, onWallTap, describe, children }: {
  width: number;
  height: number;
  assets: RoomAsset[];
  s: number;
  floor: FloorKind;
  ships?: Ship[];
  // Whether a door asset is locked, and what a wall asset is called when pointed at
  locked?: (asset: RoomAsset) => boolean;
  onWallTap?: (asset: RoomAsset) => void;
  describe?: (asset: RoomAsset) => string;
  children?: ReactNode;
}) {
  const W = width * s;
  const H = height * s;
  return (
    <>
      <FloorDefs s={s} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#floor-${floor})`} />
      {Array.from({ length: width - 1 }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * s} y1={0} x2={(i + 1) * s} y2={H} stroke="#ffffff" strokeOpacity={0.07} strokeWidth={0.6} />
      ))}
      {Array.from({ length: height - 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * s} x2={W} y2={(i + 1) * s} stroke="#ffffff" strokeOpacity={0.07} strokeWidth={0.6} />
      ))}
      {assets.filter((a) => !a.side && a.kind !== "npc").map((a) => (
        <AssetArt key={a.id} asset={a} s={s} ship={ships.find((ship) => ship.id === a.ref)} />
      ))}
      {children}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke={WALL} strokeWidth={4} />
      <rect x={-2} y={-2} width={W + 4} height={H + 4} fill="none" stroke="#1f2933" strokeWidth={1} />
      {assets.filter((a) => a.side).map((a) => {
        // Set in a wall: a door (amber, red when locked), a way out (green), a window (blue glass), a secret way (violet)
        const color = a.kind === "window" ? "#7dd3fc" : a.kind === "secret" ? "#c084fc" : a.kind === "exit" ? "#4ade80" : locked?.(a) ? "#f87171" : "#f59e0b";
        const tappable = a.kind !== "window" && !!onWallTap;
        const at = inWall(a, s);
        return (
          <g key={a.id} style={tappable ? { cursor: "pointer" } : undefined} onClick={tappable ? () => onWallTap!(a) : undefined} data-testid={`plan-${a.kind}`}>
            {/* The gap in the wall, then the door leaf or pane in it */}
            <line {...at} stroke="#0b0f14" strokeWidth={6} />
            <line {...at} stroke={color} strokeWidth={a.kind === "window" ? 2.5 : 4.5} strokeDasharray={a.kind === "secret" ? "4 3" : undefined} strokeLinecap="round" />
            {tappable && <line {...at} stroke="transparent" strokeWidth={s * 0.9} />}
            <title>{describe?.(a) ?? a.name}</title>
          </g>
        );
      })}
    </>
  );
}

// The floor plan of the building the party is in (every room on one grid of 5-foot squares) and,
// larger, the room they stand in with its furniture, doors, windows, people and caches. Hidden
// doors, caches and secret ways are not drawn until they are found.
export default function RoomPlan({ world, here, onSelect }: RoomPlanProps) {
  const plan = here.parentId ? floorPlan(world, here.parentId) : undefined;
  const layout = here.layout;
  if (!plan || !layout) return null;
  const s = 28;
  const pathOf = (a: RoomAsset) => world.paths.find((p) => p.id === a.ref);
  const shown = layout.assets.filter((a) => {
    if (a.kind === "door") return !pathOf(a)?.hidden;
    if (a.kind === "secret") return !!here.secretEntry?.found;
    if (a.kind === "loot") return here.loot.some((c) => c.id === a.ref && !c.hidden);
    if (a.kind === "npc") return here.occupants.some((o) => o.id === a.ref);
    if (a.kind === "ship") return here.ships.some((ship) => ship.id === a.ref);
    return true;
  });
  const floor = floorOf(world.areas[here.parentId!]?.type);
  const furniture = Array.from(new Set(shown.filter((a) => a.kind === "furniture").map((a) => a.name)));

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
      <svg viewBox={`-4 -4 ${layout.width * s + 8} ${layout.height * s + 8}`} className="w-full" data-testid="room-grid">
        <RoomFloor
          width={layout.width}
          height={layout.height}
          assets={shown}
          s={s}
          floor={floor}
          ships={here.ships}
          locked={(a) => !!pathOf(a)?.locked}
          onWallTap={onSelect ? (a) => a.to && onSelect(a.to) : undefined}
          describe={(a) => (a.kind === "window" ? a.name : `${a.name} to ${world.areas[a.to ?? ""]?.name ?? "outside"}`)}
        >
          {shown.filter((a) => a.kind === "npc").map((a) => {
            const occupant = here.occupants.find((x) => x.id === a.ref)!;
            return (
              <g key={a.id} transform={`translate(${a.x * s + s / 2} ${a.y * s + s / 2})`} data-testid="plan-npc">
                <TokenArt kind={tokenOf(occupant)} d={s * 0.9} ring={SIDE_COLORS[occupant.disposition]} label={occupant.name} large={/large|huge|gargantuan/i.test(occupant.size ?? "")} />
                <title>{a.name}</title>
              </g>
            );
          })}
        </RoomFloor>
      </svg>
      <p className="text-xs text-gray-400">
        {layout.width * 5} x {layout.height * 5} ft., 5 ft. squares.{" "}
        <span style={{ color: "#f59e0b" }}>Door</span> <span style={{ color: "#f87171" }}>locked</span> <span style={{ color: "#4ade80" }}>way out</span>{" "}
        <span style={{ color: "#7dd3fc" }}>window</span> <span style={{ color: "#c084fc" }}>secret way</span>. Tap a door to go through it.
      </p>
      {furniture.length > 0 && (
        <p className="text-xs text-gray-400" data-testid="plan-legend">
          In the room: {furniture.join(", ").toLowerCase()}.
        </p>
      )}
    </div>
  );
}
