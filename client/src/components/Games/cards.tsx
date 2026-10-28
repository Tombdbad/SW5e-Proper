// Card faces, drawn in code (2026-10-27): our own designs, since the studio's card art is not ours to copy (research file on the Desktop). Sabacc's
// four suits have a glyph each (a saber, a flask, a coin, a staff), its eight face cards an emblem, Pazaak's cards a colour by sign. SVG, so they
// are sharp at any size and need no files. The numbers and names are data (shared/logic/sabacc.ts, pazaak.ts); the pictures are original.
import type { ReactNode } from "react";
import type { Card } from "@shared/logic/sabacc";
import { sideLabel, type SideCard } from "@shared/logic/pazaak";

const SUIT_COLOUR: Record<string, string> = { sabers: "#c2410c", flasks: "#0e7490", coins: "#b7791f", staves: "#4d7c0f" };

// A suit's glyph in a 24-unit box
function Glyph({ suit, size = 22 }: { suit: string; size?: number }) {
  const c = SUIT_COLOUR[suit] ?? "#444";
  const body: Record<string, ReactNode> = {
    // two blades crossed, with a glow at the hilt
    sabers: <g stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M5 19 L19 5" /><path d="M19 19 L5 5" /><path d="M4 20 l2-2 M20 20 l-2-2" stroke="#1f2937" strokeWidth="2.6" /></g>,
    // a round-bellied flask with a neck and a stopper
    flasks: <g><path d="M9 3h6v5l4 8a4 4 0 0 1-3.6 6H8.6A4 4 0 0 1 5 16l4-8z" fill={c} opacity="0.9" /><rect x="8.5" y="2" width="7" height="2.2" rx="1" fill="#1f2937" /><path d="M7 15h10" stroke="#fff" strokeWidth="1" opacity="0.6" /></g>,
    // a coin with a star struck in it
    coins: <g><circle cx="12" cy="12" r="9" fill={c} /><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fde68a" strokeWidth="1" /><path d="M12 6.5l1.6 3.6 3.9.3-3 2.5.9 3.8-3.4-2-3.4 2 .9-3.8-3-2.5 3.9-.3z" fill="#fde68a" /></g>,
    // a staff topped with a crystal
    staves: <g><path d="M12 21V8" stroke="#6b4423" strokeWidth="2.6" strokeLinecap="round" /><path d="M12 2l3.5 4.5L12 11 8.5 6.5z" fill={c} /><path d="M8 14l8-2" stroke="#6b4423" strokeWidth="1.6" strokeLinecap="round" /></g>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>{body[suit]}</svg>;
}

// An emblem for each of the eight face cards, in a 40-unit box
function Emblem({ name }: { name: string }) {
  const ink = "#1f2937";
  const e: Record<string, ReactNode> = {
    "The Star": <g><circle cx="20" cy="20" r="15" fill="#312e81" /><path d="M20 6l3.4 8.6 9.2.7-7 6 2.2 9-7.8-4.8-7.8 4.8 2.2-9-7-6 9.2-.7z" fill="#fde68a" /></g>,
    "The Evil One": <g><path d="M7 8l5 5M33 8l-5 5" stroke={ink} strokeWidth="3" strokeLinecap="round" /><path d="M10 14h20v10q0 10-10 12-10-2-10-12z" fill="#7f1d1d" /><path d="M14 22l5 2M26 22l-5 2" stroke="#fde68a" strokeWidth="2.4" strokeLinecap="round" /><path d="M15 31q5-3 10 0" stroke="#fde68a" strokeWidth="2" fill="none" /></g>,
    Moderation: <g><path d="M20 6v26M8 34h24" stroke={ink} strokeWidth="2.6" strokeLinecap="round" /><path d="M8 12h24" stroke={ink} strokeWidth="2.2" /><path d="M8 12l-4 10h8zM32 12l-4 10h8z" fill="#0e7490" /></g>,
    Demise: <g><path d="M20 5c-8 0-12 6-12 12 0 5 3 7 5 8v5h14v-5c2-1 5-3 5-8 0-6-4-12-12-12z" fill="#e5e7eb" stroke={ink} strokeWidth="1.6" /><circle cx="15" cy="18" r="3" fill={ink} /><circle cx="25" cy="18" r="3" fill={ink} /><path d="M18 27v4M22 27v4" stroke={ink} strokeWidth="2" /></g>,
    Balance: <g><circle cx="20" cy="20" r="14" fill="none" stroke={ink} strokeWidth="2.4" /><path d="M20 6a14 14 0 0 1 0 28z" fill={ink} /><circle cx="20" cy="13" r="3.4" fill="#f3f4f6" /><circle cx="20" cy="27" r="3.4" fill={ink} /></g>,
    Endurance: <g><path d="M20 4l14 5v10c0 9-6 14-14 17C12 33 6 28 6 19V9z" fill="#78350f" stroke={ink} strokeWidth="1.8" /><path d="M20 9v22M11 17h18" stroke="#fde68a" strokeWidth="2.4" /></g>,
    "Queen of Air and Darkness": <g><path d="M24 6a14 14 0 1 0 0 28 11 11 0 1 1 0-28z" fill="#4c1d95" /><path d="M9 12l3 5 3-5 3 5 3-5v8H9z" fill="#fde68a" transform="translate(6 -4)" /><circle cx="29" cy="12" r="1.4" fill="#fff" /><circle cx="31" cy="27" r="1.2" fill="#fff" /></g>,
    "The Idiot": <g><path d="M8 20q4-14 12-14t12 14z" fill="#be123c" /><circle cx="8" cy="22" r="3.2" fill="#fde68a" /><circle cx="32" cy="22" r="3.2" fill="#fde68a" /><circle cx="20" cy="6" r="3.2" fill="#fde68a" /><circle cx="20" cy="29" r="9" fill="#fcd9b6" /><circle cx="17" cy="28" r="1.2" fill={ink} /><circle cx="23" cy="28" r="1.2" fill={ink} /><path d="M16 33q4 3 8 0" stroke={ink} strokeWidth="1.4" fill="none" /></g>,
  };
  return <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden>{e[name] ?? <circle cx="20" cy="20" r="12" fill="#9ca3af" />}</svg>;
}

const RANKS = ["", "", "", "", "", "", "", "", "", "", "", "", "Cmdr", "Mstr", "Mast", "Ace"];
const rankLabel = (c: Card) => (c.rank && c.rank > 11 ? ["C", "M", "Ma", "A"][c.rank - 12] : String(c.rank ?? ""));

// A sabacc card face (`small` for a hand shown in a row, `large` for the player's own)
export function SabaccCard({ card, size = "md", selected, onClick, title }: { card: Card; size?: "sm" | "md" | "lg"; selected?: boolean; onClick?: () => void; title?: string }) {
  const [w, h] = size === "sm" ? [34, 50] : size === "lg" ? [78, 112] : [58, 84];
  const suited = !!card.suit;
  const colour = suited ? SUIT_COLOUR[card.suit!] : card.value < 0 ? "#5b21b6" : "#374151";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `${card.name} (${card.value})`}
      className="relative shrink-0 select-none rounded-md text-left shadow"
      style={{ width: w, height: h, background: "#f5efe0", border: `2px solid ${selected ? "#facc15" : colour}`, transform: selected ? "translateY(-6px)" : undefined, cursor: onClick ? "pointer" : "default", padding: 0 }}
      data-testid="sabacc-card"
    >
      <span className="absolute left-1 top-0.5 font-bold leading-none" style={{ color: colour, fontSize: size === "sm" ? 10 : size === "lg" ? 17 : 13 }}>{suited ? rankLabel(card) : card.value}</span>
      <span className="absolute inset-0 flex items-center justify-center">{suited ? <Glyph suit={card.suit!} size={size === "sm" ? 16 : size === "lg" ? 44 : 28} /> : <span style={{ transform: `scale(${size === "sm" ? 0.55 : size === "lg" ? 1.25 : 0.85})` }}><Emblem name={card.name} /></span>}</span>
      {!suited && size !== "sm" && <span className="absolute bottom-0.5 left-0 right-0 text-center font-semibold leading-none" style={{ color: colour, fontSize: size === "lg" ? 9 : 7 }}>{card.name.length > 14 ? "Queen of Air" : card.name}</span>}
      {size !== "sm" && <span className="absolute bottom-0.5 right-1 rotate-180 font-bold leading-none" style={{ color: colour, fontSize: size === "lg" ? 15 : 11, display: suited ? undefined : "none" }}>{suited ? rankLabel(card) : ""}</span>}
    </button>
  );
}

// The back of a card: a deep blue with a gold ring and a star
export function CardBack({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const [w, h] = size === "sm" ? [34, 50] : size === "lg" ? [78, 112] : [58, 84];
  return (
    <span className="relative inline-block shrink-0 rounded-md shadow" style={{ width: w, height: h, background: "linear-gradient(135deg,#1e3a5f,#0f1f38)", border: "2px solid #8a6d1d" }} title={label} data-testid="card-back">
      <svg viewBox="0 0 40 56" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect x="4" y="4" width="32" height="48" rx="3" fill="none" stroke="#b7791f" strokeWidth="1" />
        <circle cx="20" cy="28" r="9" fill="none" stroke="#b7791f" strokeWidth="1.2" />
        <path d="M20 21l2 5 5 .4-3.8 3.2 1.2 5-4.4-2.7-4.4 2.7 1.2-5-3.8-3.2 5-.4z" fill="#d6a531" />
      </svg>
    </span>
  );
}

// A pazaak card: the main deck's green 1-10, the side deck's blue plus, red minus and blue-and-red flip cards
export function PazaakCardFace({ value, side, played, onClick, disabled, title }: { value?: number; side?: SideCard; played?: boolean; onClick?: () => void; disabled?: boolean; title?: string }) {
  const kind = side ? side.kind : "main";
  const bg = kind === "main" ? "#14532d" : kind === "plus" ? "#1d4ed8" : kind === "minus" ? "#b91c1c" : "linear-gradient(135deg,#1d4ed8 50%,#b91c1c 50%)";
  const text = side ? sideLabel(side) : String(value);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
      className="relative flex shrink-0 select-none items-center justify-center rounded-md font-bold text-white shadow disabled:cursor-default"
      style={{ width: 46, height: 66, background: bg, border: "2px solid #e5e7eb", opacity: played ? 0.45 : 1, fontSize: 18 }}
      data-testid="pazaak-card"
    >
      <span className="absolute inset-1 rounded border border-white/40" />
      {text}
    </button>
  );
}
export { RANKS };
