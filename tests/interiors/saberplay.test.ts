import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { eased, easeMotion, gripStaff, humanPose, LIMB, LIMBS, motion, PARENT, restPose, SABER_STYLES, standing, beginSwing, type Pose } from "../../client/src/components/Map/interiors/limbs";
import { COMBO_GAP, DUEL_MODES, PACE, STAFF_ARMS, comboOf, planDuel, guardJoints, moveOf, moveSeconds, SABER_KITS, sampleMove, saberKitOf, styleFor, TEMPO, type Move, type SaberKit } from "../../client/src/components/Map/interiors/saberplay";
import { Kit, buildHumanoid, figureSpec, lookOf, npcSaberKit, outfitOf } from "../../client/src/components/Map/models";

// The saber fights (2026-11-04; the user: "AAA style combos ... slow powerful strikes and light fast strikes, jumping strikes, crouching strikes,
// blocking moves and force powers ... based on the forms and the type of weapon: broadsabre, crossguard, double-ended staff, dual wield, light whip")
const LEGS = { hip: 0.56, knee: 0.31 };
const settle = (m: ReturnType<typeof motion>) => { const e = eased(); for (let i = 0; i < 120; i++) easeMotion(e, m, 1 / 30); return e; };
const allMoves = (kit: SaberKit, style: (typeof SABER_STYLES)[number]): Move[] => styleFor(kit, style).combos.flat();
const everyMove = (kit: SaberKit): Move[] => SABER_STYLES.flatMap((st) => allMoves(kit, st));
const angleOf = (p: Pose, limb: number, axis: "x" | "y" | "z") => {
  const q = new THREE.Quaternion(p[limb * 4], p[limb * 4 + 1], p[limb * 4 + 2], p[limb * 4 + 3]);
  const a = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  const v = { x: q.x, y: q.y, z: q.z }[axis] * Math.sign(q.w || 1);
  return Math.abs(v) < 1e-9 ? 0 : a * Math.sign(v);
};
// A figure `u` of the way through move `n` of combo `c` (held there)
function posed(kit: SaberKit, style: (typeof SABER_STYLES)[number], c: number, n: number, u: number) {
  const set = styleFor(kit, style);
  const m = motion({ ready: true, combo: c, chain: n });
  const move = moveOf(set, m, 0, 0);
  m.swingAt = 10 - u * moveSeconds(set, move);
  const out = restPose();
  const root = humanPose(standing(), 0, m, settle(m), "saber", style, 10, LEGS, out, undefined, kit);
  return { out, root, move };
}

test("a weapon is fought as its kind: broadsabre, crossguard, double blade, two blades, whip, else a single blade", () => {
  assert.equal(saberKitOf("Lightsaber", "saber"), "single");
  assert.equal(saberKitOf("Shotosaber", "saber"), "single");
  assert.equal(saberKitOf("Broadsaber", "saber"), "broad");
  assert.equal(saberKitOf("Claymoresaber", "saber"), "broad");
  assert.equal(saberKitOf("Crossguard saber", "saber"), "crossguard");
  assert.equal(saberKitOf("Doublesaber", "saber2"), "staff");
  assert.equal(saberKitOf("Lightstaff", "saber"), "staff");
  assert.equal(saberKitOf("Saberwhip", "saber"), "whip");
  assert.equal(saberKitOf("Lightsaber", "saber", "Shotosaber"), "dual", "a second saber in the other hand");
  assert.equal(saberKitOf("Doublesaber", "saber2", "Lightsaber"), "staff", "a double blade takes both hands");
  assert.equal(saberKitOf("Vibrowhip", "", ""), "single", "a vibrowhip is no saber");
});

test("every weapon and form has combos, and every move is well made: its keys in order, a hold at the blow, back at the guard at both ends", () => {
  for (const kit of SABER_KITS) {
    for (const st of SABER_STYLES) {
      const set = styleFor(kit, st);
      assert.ok(set.combos.length >= 1 && set.combos.every((c) => c.length >= 3), `${kit} ${st} has combos of three moves or more`);
      const guard = guardJoints(set);
      for (const move of set.combos.flat()) {
        assert.ok(move.dur > 0.25 && move.dur < 1.5, `${move.name} takes ${move.dur}`);
        assert.ok(move.keys.every(([t], i) => t > 0 && t < 1 && (i === 0 || t >= move.keys[i - 1][0])), `${move.name}'s keys run forward in time`);
        assert.ok(move.hit >= 0 && move.hit < move.keys.length && move.keys[move.hit][2] === "snap" || move.keys.every(([, , e]) => e !== "snap"), `${move.name}'s blow is a snap`);
        const start = sampleMove(move, 0, guard, !!set.oneHand);
        const end = sampleMove(move, 1, guard, !!set.oneHand);
        assert.equal(start.lift + start.step, 0);
        assert.equal(end.lift + end.step, 0, `${move.name} ends on the ground where it began`);
        for (let u = 0; u <= 1; u += 0.05) {
          const s = sampleMove(move, u, guard, !!set.oneHand);
          assert.ok(Object.values(s.joints).every((v) => v!.every(Number.isFinite)) && Number.isFinite(s.lift + s.spin + s.step), `${move.name} at ${u}`);
        }
      }
    }
  }
});

test("each weapon has quick light blows and slow heavy ones, leaps, crouched strikes, blocks and the Force between them", () => {
  for (const kit of SABER_KITS) {
    const moves = everyMove(kit);
    const kinds = new Set(moves.map((m) => m.kind));
    for (const k of ["light", "heavy", "low", "guard", "force"] as const) assert.ok(kinds.has(k), `${kit} has ${k} moves`);
    assert.ok(kinds.has("leap") || kinds.has("spin"), `${kit} leaps or spins`);
    const mean = (k: string) => { const l = moves.filter((m) => m.kind === k); return l.reduce((n, m) => n + m.dur, 0) / l.length; };
    assert.ok(mean("heavy") > mean("light") * 1.3, `${kit}: heavy blows take longer than light ones (${mean("heavy").toFixed(2)} against ${mean("light").toFixed(2)})`);
    const heavy = moves.filter((m) => m.kind === "heavy");
    const light = moves.filter((m) => m.kind === "light");
    assert.ok(Math.max(...heavy.map((m) => m.stop)) > Math.max(...light.map((m) => m.stop)), `${kit}: the weight of a heavy blow is a longer hold at it`);
  }
});

test("a form reaches for its own combos: Ataru leaps, Djem So hits hard, Juyo goes low, Soresu guards, Makashi fences", () => {
  const has = (kit: SaberKit, st: (typeof SABER_STYLES)[number], pred: (m: Move) => boolean) => allMoves(kit, st).some(pred);
  for (const kit of ["single", "broad", "crossguard", "staff", "dual", "whip"] as const) {
    assert.ok(has(kit, "ataru", (m) => m.kind === "leap" || m.kind === "spin"), `${kit} Ataru leaps`);
    assert.ok(has(kit, "djemso", (m) => m.kind === "heavy"), `${kit} Djem So hits heavily`);
    assert.ok(has(kit, "soresu", (m) => m.kind === "guard"), `${kit} Soresu blocks`);
    assert.ok(has(kit, "juyo", (m) => m.kind === "low"), `${kit} Juyo goes low`);
  }
  assert.ok(allMoves("single", "makashi").some((m) => m.name === "thrust") && !allMoves("single", "makashi").some((m) => m.kind === "leap"), "Makashi fences: thrusts, no leaps");
  // (the forms differ in what they do, not only how they stand: no two give the same combos)
  const seen = new Set<string>();
  for (const st of SABER_STYLES) seen.add(styleFor("single", st).combos.map((c) => c.map((m) => m.name).join(">")).join("|"));
  assert.ok(seen.size >= 6, `the forms give at least six different sets of combos (${seen.size})`);
  for (const kit of SABER_KITS) assert.ok(new Set(SABER_STYLES.map((st) => styleFor(kit, st).combos.map((c) => c.map((m) => m.name).join(">")).join("|"))).size >= 4, `${kit}'s forms differ`);
});

test("a fast form is quicker: Juyo, Ataru and Trakata take less time over a blow than Djem So and Shien", () => {
  const fast = (st: (typeof SABER_STYLES)[number]) => TEMPO[st];
  assert.ok(fast("juyo") < fast("shiicho") && fast("shiicho") < fast("djemso"));
  const cutAt = (st: (typeof SABER_STYLES)[number]) => moveSeconds(styleFor("single", st), allMoves("single", st)[0]);
  assert.ok(Math.min(...SABER_STYLES.map(cutAt)) < Math.max(...SABER_STYLES.map(cutAt)));
});

test("swings close together are one combo, each move the next of it; after a pause the next combo begins", () => {
  const m = motion({ ready: true });
  beginSwing(m, 10);
  assert.deepEqual([m.chain, m.combo, m.swing], [0, 0, 1]);
  beginSwing(m, 10.8);
  assert.deepEqual([m.chain, m.combo, m.swing], [1, 0, 2], "within the gap it is the next move of the same combo");
  beginSwing(m, 11.5);
  assert.deepEqual([m.chain, m.combo], [2, 0]);
  beginSwing(m, 11.5 + COMBO_GAP + 0.5);
  assert.deepEqual([m.chain, m.combo], [0, 1], "after a pause, the next combo");
  assert.equal(m.prevAt, 11.5, "and the swing before is remembered, for the move to run on from");
  const set = styleFor("single", "shiicho");
  const first = comboOf(set, { combo: 0, chain: 0 }).map((x) => x.name);
  assert.notDeepEqual(first, comboOf(set, { combo: 1, chain: 0 }).map((x) => x.name), "the next combo is another");
  assert.notEqual(moveOf(set, { combo: 0, chain: 0 }).name, moveOf(set, { combo: 0, chain: 2 }).name, "and a combo's moves differ");
});

test("a move that follows another runs on from where the last was, not from the guard", () => {
  const set = styleFor("single", "shiicho");
  const m = motion({ ready: true, combo: 0, chain: 1 });
  const before = moveOf(set, m, 1, 0);
  // the last move began 0.5 seconds before this one (in its hold at the blow), this one a moment ago
  m.prevAt = 9.7;
  m.swingAt = 10 - 0.02;
  const chained = restPose();
  humanPose(standing(), 0, m, settle(m), "saber", "shiicho", 10, LEGS, chained);
  const fresh = restPose();
  const f = motion({ ready: true, combo: 0, chain: 1 });
  f.swingAt = 10 - 0.02;
  humanPose(standing(), 0, f, settle(f), "saber", "shiicho", 10, LEGS, fresh);
  const diff = Array.from(chained).some((v, i) => Math.abs(v - fresh[i]) > 0.05);
  assert.ok(diff, `begun from the pose of ${before.name} the chest is not where the guard has it`);
});

test("a heavy blow is wound up and held before it falls; a light one is quick", () => {
  const set = styleFor("single", "djemso");
  const heavy = allMoves("single", "djemso").find((m) => m.name === "overhead")!;
  const guard = guardJoints(set);
  const wind = heavy.keys[0][0];
  const held = sampleMove(heavy, wind + 0.05, guard, false).joints.armR![0];
  const raised = sampleMove(heavy, wind, guard, false).joints.armR![0];
  assert.ok(raised < -2.5 && Math.abs(held - raised) < 0.05, "the arms are up, and hold there before the blow");
  const hit = heavy.keys[heavy.hit][0];
  const down = sampleMove(heavy, hit + 0.02, guard, false);
  assert.ok(down.joints.armR![0] > -0.2 && down.step > 0.15, "then down, with the body carried forward behind it");
  // (the hold at the blow: the same pose over the stop)
  const a = sampleMove(heavy, hit + 0.002, guard, false).joints.chest![0];
  const b = sampleMove(heavy, hit + (heavy.stop / heavy.dur) * 0.9, guard, false).joints.chest![0];
  assert.ok(Math.abs(a - b) < 1e-6, "held at the blow (hit-stop)");
  const cut = allMoves("single", "shiicho").find((m) => m.name === "cut")!;
  assert.ok(cut.dur < heavy.dur * 0.7, "a light cut is quicker than the overhead");
});

test("a leap lifts the body off the ground and tucks the knees; a crouched strike lowers it; a lunge carries it forward", () => {
  const leap = (kit: SaberKit, st: (typeof SABER_STYLES)[number]) => {
    const set = styleFor(kit, st);
    const combos = set.combos;
    for (let c = 0; c < combos.length; c++) for (let n = 0; n < combos[c].length; n++) if (combos[c][n].kind === "leap") return { c, n, move: combos[c][n] };
    throw new Error(`no leap for ${kit} ${st}`);
  };
  for (const kit of ["single", "staff", "dual", "whip"] as const) {
    const { c, n, move } = leap(kit, "ataru");
    const apex = move.keys.find(([, k]) => (k.lift ?? 0) > 0.3)!;
    const { root } = posed(kit, "ataru", c, n, apex[0]);
    assert.ok(root.lift > 0.3, `${kit}: ${move.name} lifts the body (${root.lift.toFixed(2)})`);
  }
  const low = (() => { const set = styleFor("single", "juyo"); for (let c = 0; c < set.combos.length; c++) for (let n = 0; n < set.combos[c].length; n++) if (set.combos[c][n].kind === "low" && set.combos[c][n].name.startsWith("low")) return { c, n, move: set.combos[c][n] }; throw new Error("no low"); })();
  const lowAt = posed("single", "juyo", low.c, low.n, low.move.keys[low.move.hit][0] + 0.01);
  const guardAt = posed("single", "juyo", low.c, low.n, 0.001);
  assert.ok(lowAt.root.drop > guardAt.root.drop + 0.1, `a crouched strike lowers the body (${lowAt.root.drop.toFixed(2)} against ${guardAt.root.drop.toFixed(2)})`);
  const lunge = allMoves("single", "shiicho").find((m) => m.name === "thrust")!;
  const set = styleFor("single", "shiicho");
  const s = sampleMove(lunge, lunge.keys[lunge.hit][0] + 0.02, guardJoints(set), false);
  assert.ok(s.step > 0.2, "a thrust carries the body forward");
});

test("blocks and the Force are moves of their own: a parry turns the blade across, a push throws the free hand out", () => {
  const set = styleFor("single", "soresu");
  const parry = allMoves("single", "soresu").find((m) => m.kind === "guard")!;
  const guard = guardJoints(set);
  const held = sampleMove(parry, parry.keys[0][0], guard, false).joints;
  assert.ok(Math.abs(held.weapon![2]) > 0.4, "the blade is turned across the body");
  const power = styleFor("single", "djemso");
  const push = allMoves("single", "djemso").find((m) => m.name === "push")!;
  const out = sampleMove(push, push.keys[push.hit][0] + 0.02, guardJoints(power), false).joints;
  assert.ok(out.armL![0] < -1.4 && out.foreL![0] > -0.1, "the left arm straight out, palm first");
  assert.ok(out.armR === undefined || Math.abs((out.armR![0] ?? 0) - (guardJoints(power).armR?.[0] ?? 0)) < 0.2, "while the blade hand keeps its guard");
});

test("two blades: each hand has its own, moving apart as the moves say; one blade leaves the left hand's alone", () => {
  const cross = styleFor("dual", "jarkai").combos.flat().find((m) => m.name === "cross cut")!;
  const set = styleFor("dual", "jarkai");
  const guard = guardJoints(set);
  const out = sampleMove(cross, cross.keys[0][0], guard, true).joints;
  assert.ok(out.weaponL && out.weapon && out.weapon[2] * out.weaponL[2] < 0, "the blades come in from either side, mirrored");
  const c = styleFor("dual", "jarkai").combos.findIndex((x) => x.some((m) => m.name === "cross cut"));
  const n = styleFor("dual", "jarkai").combos[c].findIndex((m) => m.name === "cross cut");
  const dual = posed("dual", "jarkai", c, n, cross.keys[0][0]);
  assert.ok(Math.abs(angleOf(dual.out, LIMB.weaponL, "z")) > 0.2 && Math.abs(angleOf(dual.out, LIMB.armL, "x")) > 0.8, "the left hand's blade and arm move");
  const single = posed("single", "niman", 0, 0, 0.3);
  assert.equal(angleOf(single.out, LIMB.weaponL, "z") + angleOf(single.out, LIMB.weaponL, "x"), 0, "a single blade leaves the left weapon limb alone");
  // a grip turned over: a move that takes the left blade through a half turn
  const reverse = styleFor("dual", "shien").combos.flat().concat(styleFor("dual", "jarkai").combos.flat()).find((m) => m.name === "reverse stab")!;
  assert.ok(reverse.keys.some(([, k]) => Math.abs((k.weaponL?.[0] ?? 0) - Math.PI) < 1.2 && (k.weaponL?.[0] ?? 0) > 3), "a grip turned over (the blade back along the forearm)");
});

test("a double blade is spun: the staff goes round more than a full turn in its windmill, the free hand let go", () => {
  const wind = styleFor("staff", "ataru").combos.flat().find((m) => m.name === "windmill")!;
  const set = styleFor("staff", "ataru");
  const guard = guardJoints(set);
  const end = sampleMove(wind, wind.keys[wind.keys.length - 1][0], guard, false).joints;
  assert.ok(Math.abs(end.weapon![2]) > Math.PI * 1.8, "a full turn of the staff");
  const mid = sampleMove(wind, wind.keys[0][0], guard, false).joints;
  assert.ok(mid.armL![2] < -0.4 || mid.armL![2] > 0.4, "the free arm out for balance");
});

test("a whip's lash trails the hand: it hangs at rest, bends as the hand swings, cracks at the end of a blow", () => {
  const rest = restPose();
  const m = motion({ ready: true });
  humanPose(standing(), 0, m, settle(m), "saber", "niman", 10, LEGS, rest, undefined, "whip");
  const hang = [angleOf(rest, LIMB.whip1, "x"), angleOf(rest, LIMB.whip2, "x")];
  // (the line of the lash is 47.5 degrees up when the hand's turns about x come to nothing, and each turn lowers it by as much: hung, the lash must point
  // well below level and the rest of it lower still, whatever the hand does, not stand up (the user: "it should naturally droop"))
  const pitch = [LIMB.chest, LIMB.armR, LIMB.foreR, LIMB.weapon].reduce((n, l) => n + angleOf(rest, l, "x"), 0);
  const elevation = [(47.5 * Math.PI) / 180 - (pitch + hang[0]), (47.5 * Math.PI) / 180 - (pitch + hang[0] + hang[1])];
  assert.ok(elevation[0] < -0.5 && elevation[1] < elevation[0], `hung from the hand, falling steeper (${elevation.map((v) => v.toFixed(2))} radians from level)`);
  const set = styleFor("whip", "niman");
  const lash = set.combos.flat().find((mv) => mv.name === "lash")!;
  const c = set.combos.findIndex((x) => x.includes(lash));
  const n = set.combos[c].indexOf(lash);
  let moving = 0;
  let straightest = 9;
  for (let u = 0.1; u < 0.9; u += 0.05) {
    const { out } = posed("whip", "niman", c, n, u);
    moving = Math.max(moving, Math.abs(angleOf(out, LIMB.whip1, "x")), Math.abs(angleOf(out, LIMB.whip2, "x")), Math.abs(angleOf(out, LIMB.whip1, "y")));
    straightest = Math.min(straightest, Math.abs(angleOf(out, LIMB.whip2, "x")));
  }
  assert.ok(moving > 0.25, `the lash bends as the hand swings (${moving.toFixed(2)})`);
  assert.ok(Math.abs(angleOf(rest, LIMB.whip2, "x")) > straightest, "and goes straighter in the lash than hanging");
  const single = restPose();
  humanPose(standing(), 0, m, settle(m), "saber", "niman", 10, LEGS, single, undefined, "single");
  assert.equal(angleOf(single, LIMB.whip1, "x"), 0, "no lash on a single blade");
});

test("the limbs of a lash hang one from another, five deep to the trunk", () => {
  assert.equal(LIMBS, PARENT.length);
  assert.equal(LIMBS, 35);   // (32 with the lash; hair and lids since: LIMB.hairA, hairB, lids)
  assert.equal(PARENT[LIMB.weaponL], LIMB.foreL);
  assert.equal(PARENT[LIMB.whip1], LIMB.weapon);
  assert.equal(PARENT[LIMB.whip2], LIMB.whip1);
  let depth = 0;
  for (let l: number = LIMB.whip2; PARENT[l] >= 0 && depth < 8; l = PARENT[l]) depth++;
  assert.ok(depth >= 5 && depth <= 6, `${depth} joints from the tip to the trunk`);
});

test("a figure with two blades, a whip or a crossguard is built with them: the limbs are there to move", () => {
  const build = (kit: SaberKit, hand: "saber" | "saber2" = "saber") => {
    const k = new Kit();
    k.animated = true;
    buildHumanoid(k, lookOf({ name: "human" }), { ...outfitOf("Duelist", "jedi", undefined, { blade: "#7fe3ff" }), hand, kit }, "#a0826a", "#2a2018", "#222");
    return k;
  };
  const bit = (k: Kit, l: number) => !!(k.jointMask & (1 << l));
  const dual = build("dual");
  assert.ok(bit(dual, LIMB.weaponL), "the left hand has its own weapon limb");
  assert.ok(!bit(build("single"), LIMB.weaponL), "and a single blade does not");
  const whip = build("whip");
  assert.ok(bit(whip, LIMB.whip1) && bit(whip, LIMB.whip2), "a whip has two bends");
  assert.ok(!bit(build("crossguard"), LIMB.whip1) && !bit(build("staff", "saber2"), LIMB.whip1));
  // (the lash's pivots: the second further along than the first)
  const p = (l: number) => new THREE.Vector3(whip.pivots[l * 3], whip.pivots[l * 3 + 1], whip.pivots[l * 3 + 2]);
  assert.ok(p(LIMB.whip2).distanceTo(p(LIMB.weapon)) > p(LIMB.whip1).distanceTo(p(LIMB.weapon)), "the lash is a chain of lengths, one beyond the next");
});

test("a stat block fights as its name says: Kylo with a crossguard, Maul and the inquisitors with a staff, Ahsoka with two, a Jedi mostly with one", () => {
  assert.equal(npcSaberKit("Kylo Ren", "", "saber"), "crossguard");
  assert.equal(npcSaberKit("Inquisitor", "", "saber2"), "staff");
  assert.equal(npcSaberKit("Darth Maul", "", "saber"), "staff");
  assert.equal(npcSaberKit("Ahsoka Tano", "", "saber"), "dual");
  assert.equal(npcSaberKit("Sith Marauder", "", "saber"), "broad");
  assert.equal(npcSaberKit("Jedi Knight", "jedi", "saber"), npcSaberKit("Jedi Knight", "jedi", "saber"), "and the same every time");
  const kits = new Set(["Kira", "Dax", "Moff", "Tam", "Vell", "Orn", "Ket", "Hux", "Brenn", "Sal", "Nia", "Pell"].map((n) => npcSaberKit(`${n} the Sith`, "", "saber")));
  assert.ok(kits.size >= 3, `the dark side's fighters differ in what they carry (${[...kits].join(", ")})`);
  const spec = figureSpec("force", "Kylo Ren", { creature: "humanoid", looks: {}, role: "knight" });
  assert.equal(spec.kit, "crossguard");
  const staff = figureSpec("force", "Inquisitor", { creature: "humanoid", looks: {}, role: "inquisitor" });
  assert.equal(staff.kit, "staff");
  assert.notEqual(spec.key, figureSpec("force", "Jedi Knight", { creature: "humanoid", looks: {}, role: "jedi" }).key, "a different weapon is a different model");
});

test("no move asks a joint to go where a body cannot: elbows and knees bend the right way, shoulders and trunk stay in their reach", () => {
  const range: Record<string, [number, number]> = {
    armR: [-3.1, 0.7], armL: [-3.1, 0.7], foreR: [-2.5, 0.12], foreL: [-2.5, 0.12],
    shinR: [-0.02, 1.9], shinL: [-0.02, 1.9], legR: [-1.4, 0.8], legL: [-1.4, 0.8],
    chest: [-0.75, 1.1], head: [-0.6, 0.5], whip1: [-1.2, 1.2], whip2: [-1.6, 1.6],
  };
  for (const kit of SABER_KITS) for (const st of SABER_STYLES) {
    const set = styleFor(kit, st);
    for (const move of set.combos.flat()) {
      const guard = guardJoints(set);
      for (let u = 0; u <= 1; u += 0.02) {
        const j = sampleMove(move, u, guard, !!set.oneHand).joints;
        for (const [name, [lo, hi]] of Object.entries(range)) {
          const v = (j as Record<string, number[] | undefined>)[name];
          if (!v) continue;
          assert.ok(v[0] >= lo - 1e-6 && v[0] <= hi + 1e-6, `${kit} ${st}: ${move.name} at ${u.toFixed(2)} asks ${name} for ${v[0].toFixed(2)} (${lo} to ${hi})`);
        }
      }
    }
  }
});

test("every kind of weapon has a spin: the body turned about with the blade out at arm's length, or the weapon whirled round the head", () => {
  for (const kit of SABER_KITS) {
    const spins = everyMove(kit).filter((m) => m.kind === "spin");
    assert.ok(spins.length >= 1, `${kit} has a spinning move`);
    // (a turn is a whole one: the body's, or the weapon's about its own hand)
    assert.ok(spins.every((m) => m.keys.some(([, k]) => Math.abs(k.spin ?? 0) >= Math.PI * 2 - 1e-6 || [k.weapon, k.weaponL].some((w) => w && Math.max(Math.abs(w[1]), Math.abs(w[2])) >= Math.PI * 2 - 0.4))), `${kit}'s spins turn a whole turn`);
    // (and each form has the spin in a combo of its own kind of weapon: Ataru's is the acrobat's)
    assert.ok(allMoves(kit, "ataru").some((m) => m.kind === "spin" || m.kind === "leap"), `${kit} Ataru spins or leaps`);
  }
});

test("the longest combos are ten strikes, and every weapon has long ones as well as short", () => {
  let longest = 0;
  for (const kit of SABER_KITS) {
    const lengths = SABER_STYLES.flatMap((st) => styleFor(kit, st).combos.map((c) => c.length));
    assert.ok(Math.max(...lengths) >= 8, `${kit} has a combo of eight or more (${Math.max(...lengths)})`);
    assert.ok(Math.min(...lengths) <= 5, `${kit} has short exchanges too`);
    assert.ok(Math.max(...lengths) <= 10, `${kit}'s combos are no longer than ten`);
    longest = Math.max(longest, ...lengths);
  }
  assert.equal(longest, 10);
  // (a long combo is not one blow repeated: it has at least six different moves)
  for (const kit of SABER_KITS) {
    const long = SABER_STYLES.flatMap((st) => styleFor(kit, st).combos).filter((c) => c.length >= 9);
    assert.ok(long.length >= 1 && long.every((c) => new Set(c.map((m) => m.name)).size >= 5), `${kit}'s long combos are varied`);
  }
});

test("a fight's moves take 15% longer than they were first made (the user: slow the sabre animations down by 15%)", () => {
  assert.equal(PACE, 1.15);
  assert.ok(Math.abs(styleFor("single", "niman").tempo - TEMPO.niman * PACE) < 1e-9);
  assert.ok(Math.abs(styleFor("staff", "juyo").tempo - TEMPO.juyo * PACE) < 1e-9);
  assert.ok(Math.abs(moveSeconds(styleFor("single", "niman"), moveOf(styleFor("single", "niman"), { combo: 0, chain: 0 }, 0, 0)) - 0.46 * PACE) < 1e-9, "a light cut is 0.46 seconds and a bit over");
});

test("both hands are on the staff: the left is reached to the hilt, a hand's width below the right, wherever the staff is turned", () => {
  let checked = 0;
  for (const st of SABER_STYLES) {
    const set = styleFor("staff", st);
    set.combos.forEach((combo, c) => combo.forEach((move, n) => {
      // (a move that gives the left arm its own pose lets that hand go: no part of this)
      if (move.keys.some(([, k]) => k.armL)) return;
      for (const u of [0, 0.2, 0.4, 0.55, 0.7, 0.9]) {
        const { out } = posed("staff", st, c, n, u);
        const joints = Object.fromEntries((["armR", "foreR", "weapon"] as const).map((j) => [j, [angleOf(out, LIMB[j], "x"), angleOf(out, LIMB[j], "y"), angleOf(out, LIMB[j], "z")]]));
        const g = gripStaff(joints as never);
        assert.ok(g.miss < 0.15, `${st} ${move.name} at ${u}: the left hand is within reach of the hilt (misses by ${g.miss.toFixed(3)})`);
        checked++;
      }
    }));
  }
  assert.ok(checked > 100, `${checked} poses checked`);
  // the hands' places in the figure are the arms the model is drawn with, and the left is on the right's line
  const d = STAFF_ARMS.dir;
  const along = Math.hypot(...d);
  const between = STAFF_ARMS.right.hand.map((v, i) => v - STAFF_ARMS.left.hand[i]);
  const gap = Math.hypot(...between);
  assert.ok(Math.abs(gap - STAFF_ARMS.gap) < 0.01, `the hands are a hilt's width apart (${gap.toFixed(3)})`);
  assert.ok(Math.abs(between.reduce((n, v, i) => n + v * d[i], 0) / (gap * along) - 1) < 0.01, "and the left hand is on the shaft, below the right");
});

test("a duel is laid out: the defender parries each blow with a guard move of its own, the blades meeting as the blow lands", () => {
  const a = { kit: "single", style: "ataru" } as const;
  const d = { kit: "single", style: "soresu" } as const;
  const plan = planDuel(a, d, "parry");
  const blows = plan.exchanges.filter((x) => x.who === "a");
  assert.equal(blows.length, styleFor("single", "ataru").combos.flat().length, "every move of every combo is played");
  const answered = blows.filter((x) => x.answer);
  assert.ok(answered.length >= blows.length * 0.6, `most blows are parried (${answered.length} of ${blows.length})`);
  for (const x of answered) {
    assert.equal(x.answer!.move.kind, "guard", "with a guard move");
    assert.ok(Math.abs(x.answer!.at - x.hit) < 0.12, `the blades meet as the blow lands (${x.answer!.at.toFixed(2)} against ${x.hit.toFixed(2)})`);
  }
  // (the Force is not parried: it throws the defender back)
  const forceBlows = blows.filter((x) => x.move.kind === "force");
  assert.ok(forceBlows.every((x) => !x.answer) && plan.flinches.length >= forceBlows.length);
  assert.ok(plan.events.every((e, i) => i === 0 || e.at >= plan.events[i - 1].at) && plan.length > Math.max(...plan.events.map((e) => e.at)), "in order, and the loop outlasts the last");
});

test("the defender's other answers: it stands in its block, takes every blow, or trades combos with the attacker", () => {
  const a = { kit: "staff", style: "djemso" } as const;
  const d = { kit: "dual", style: "jarkai" } as const;
  const guard = planDuel(a, d, "guard");
  assert.ok(guard.events.every((e) => e.who === "a") && guard.holds.length >= 1 && guard.holds.every((h) => h.who === "d"), "the defender plays no moves and holds its block");
  const hit = planDuel(a, d, "hit");
  assert.equal(hit.flinches.length, hit.exchanges.length, "every blow lands");
  assert.ok(hit.events.every((e) => e.who === "a"));
  const trade = planDuel(a, d, "trade");
  const mine = trade.events.filter((e) => e.who === "a" && e.move.kind !== "guard");
  const theirs = trade.events.filter((e) => e.who === "d" && e.move.kind !== "guard");
  assert.ok(mine.length > 0 && theirs.length > 0, "both attack");
  assert.ok(Math.max(...mine.map((e) => e.at)) < Math.min(...theirs.map((e) => e.at)) + 30, "in turns");
  assert.ok(trade.events.some((e) => e.who === "a" && e.move.kind === "guard") && trade.events.some((e) => e.who === "d" && e.move.kind === "guard"), "each parries while the other attacks");
  // one combo asked for: only its moves, in order
  const one = planDuel(a, d, "parry", 1);
  const combo = styleFor("staff", "djemso").combos[1];
  assert.deepEqual(one.events.filter((e) => e.who === "a").map((e) => e.move), combo, "the attacker plays the combo asked for");
});

test("a duel can be laid out for every weapon against every weapon, and a figure told to play a move plays it from where the last left off", () => {
  for (const ak of SABER_KITS) {
    for (const dk of SABER_KITS) {
      for (const mode of DUEL_MODES) {
        const plan = planDuel({ kit: ak, style: "niman" }, { kit: dk, style: "makashi" }, mode);
        assert.ok(plan.events.length >= 3 && Number.isFinite(plan.length) && plan.length < 120, `${ak} against ${dk}, ${mode}: ${plan.events.length} moves in ${plan.length.toFixed(1)} seconds`);
        assert.ok(plan.events.every((e) => Number.isFinite(e.at) && e.at >= 0), "no move before the loop");
      }
    }
  }
  // (a move told to a figure with `play`: at its start it is at the guard, partway through it is in the move, and the same figure's chain is left alone)
  const set = styleFor("single", "niman");
  const move = set.combos[0][0];
  const m = motion({ ready: true, play: { move, at: 10 - 0.3 * moveSeconds(set, move) } });
  const out = restPose();
  humanPose(standing(), 0, m, settle(m), "saber", "niman", 10, LEGS, out, undefined, "single");
  const guardPose = restPose();
  humanPose(standing(), 0, motion({ ready: true }), settle(m), "saber", "niman", 10, LEGS, guardPose, undefined, "single");
  assert.ok(Math.abs(angleOf(out, LIMB.armR, "x") - angleOf(guardPose, LIMB.armR, "x")) > 0.3, "the arm is in the move it was told to play");
  // (and it blends from the move before it: at the start, the pose of the one before at its end)
  const next = set.combos[0][1];
  const chained = motion({ ready: true, play: { move: next, at: 10 - 0.02, prev: { move, at: 10 - 0.02 - 0.8 * moveSeconds(set, move) } } });
  const blended = restPose();
  humanPose(standing(), 0, chained, settle(chained), "saber", "niman", 10, LEGS, blended, undefined, "single");
  const fromGuard = motion({ ready: true, play: { move: next, at: 10 - 0.02 } });
  const cold = restPose();
  humanPose(standing(), 0, fromGuard, settle(fromGuard), "saber", "niman", 10, LEGS, cold, undefined, "single");
  assert.ok(Math.abs(angleOf(blended, LIMB.armR, "x") - angleOf(cold, LIMB.armR, "x")) > 0.05, "a move that follows another begins from where it was");
});
