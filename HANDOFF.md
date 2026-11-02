# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed (5240b30, 71151e7, 402355a, 227d69d, and this session's foe/melee commit).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead. Port 5000 runs the OLD build 1277668 (started by hand).

## 2026-11-02 (10): monsters, foe animations, melee balance (the user's latest request, part done)
The user: "Monsters should not use grenades, weapons, or items. Foes throwing, spraying, healing or calling for backup need relevant animations.
The remaining 325 unread ... need their own rules written, visual effects, character animations, and implementation. we also need to balance melee damage."
Done (last commit):
- shooter.ts `monstrous()`; monsters' ranged shots and stat-block spheres are natural (spat globs/spines, coloured by damage type, burst on
  impact); no grenades, medpacs, backup calls or learned kit (GameBoard `foeKit`, `callsForHelp`, `asUnit`). A monster nemesis instead
  `adapted` (resists the party's worst damage type, max 2; nemesis.ts `learnKit`).
- Foe wind-ups (`SHOOT.act`, `Unit.act`, events act/broken/miss): throw 0.5 s, spray 0.55 s, call 1.4 s; a stagger >= 0.4 breaks them.
  limbs.ts `Motion.act` poses (throw, spray, comlink call, medpac kneel); `creatureLunge` rears/lunges monsters. Call rings, arrival flash, miss puff.
- Melee: `SHOOT.melee` round 4 s shared by multiattack count (min 1.2 s), `hitChance(bonus, AC)`, 0.5 s wind-up the party can step out of.
- `Unit.evade` (half area damage) and `Unit.endure` (once to 1 HP) exist in the sim but are NOT yet set from items.
- Checked: tsc 0; shooter + shootergear tests 40 pass. NOT run: full npm test, vite build, browser.

## TODO / next, in order
1. Tests for the new rules (monstrous, broken wind-up, melee pace vs the adolescent dewback, monster adaptation).
2. The 325 unread items. Sorted (scratch script approach: itemFactsOf over enhancedItems, keep rows with nothing read):
   - parse in `parseItemEffects`: extra weapon dice ("roll a dN and add", Ostrine "additional 1dN <types>", pick a type by hash: house rule),
     "range increases by X/Y", properties with numbers (`gains the barbed (1d4) property`, thrown/versatile/smart: widen the regex in
     itemFactsOf), "number is reduced by N steps" (only "one step" read now), "ignores resistance to X", Fortitude/Reflex/Will evasion
     -> `Unit.evade`, Bioenhancement HP per level, Enhanced Endurance -> `Unit.endure`, Expanded Magazine (quick reload).
   - shooter belt acts: nets/bolas (restrain), harpoons (pull), stealth fields/camouflage, Overload Shield (shove), items that cast a power
     (charges), focus/wristpad power riders (damage per points, push distance, radius, range, temp HP on heals).
   - left for later: class-feature charge items, droid parts (Medic/Mechanic/Shock Arm/Repulsors), rings of storing, vocoders, tools.
3. Ask the user: build, restart 5000, push. Then browser-check a soldierly and a beast fight; `npm run e2e`.

## Learned
- Per-frame damage must go through `seep`. Bash heredoc/node -e with template literals breaks: use the Edit tool for TSX.
- Pit bout in test DB: tap Teric Jarek, ask about the pit, Enter the bout. Campaign 625's clock is on day 1 (pit shut): patch `timeElapsed` from a non-game page.
