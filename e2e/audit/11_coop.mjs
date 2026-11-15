// Flow 11: co-op. Two browser contexts: the host hosts, the guest joins by the code; an action in one shows in the other.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, api, sleep } from "./h.mjs";

await flow("11_coop", "Two players in one session", async ({ page, context, view, shot, note, state, mark, makePage }) => {
  const ann = await quickChar(`${TAG} host ${view}`);
  const bo = await quickChar(`${TAG} guest ${view}`);
  const world = await genWorld(3, 3);
  const camp = await quickCamp(ann.id, world, { mode: "tabletop" });
  await openGame(page, BASE, camp.id, ann.name, 3500);
  await page.getByTestId("coop-toggle").click();
  await page.getByTestId("coop-host").click();
  await page.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('[data-testid="coop-code"]')?.textContent?.trim() ?? ""), null, { timeout: 20000 });
  const code = (await page.getByTestId("coop-code").innerText()).trim();
  note("join code", code);
  note("lan notice", (await page.getByTestId("coop-lan-off").count()) ? "shown (server on loopback)" : "not shown");
  await shot("host_code");
  await page.getByTestId("coop-close").click();
  mark("hosted");
  // the guest is a second context of the same kind (phone or desktop)
  const guest = await makePage("guest");
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await shot("guest_join_page", guest);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  // (the campaign's mode is shown and confirmed before the join)
  await guest.getByTestId("coop-mode-join").click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 120000 });
  await sleep(4000);
  mark("guest in");
  await shot("guest_playing", guest);
  await page.getByTestId("coop-toggle").click();
  await page.waitForFunction((n) => document.querySelector('[data-testid="coop-members"]')?.innerText.includes(n), bo.name, { timeout: 20000 });
  note("host sees members", (await page.getByTestId("coop-members").innerText()).replace(/\s+/g, " ").slice(0, 120));
  await shot("host_sees_guest");
  await page.getByTestId("coop-close").click().catch(() => {});
  // an action in one shows in the other: the host waits until evening; the shared clock must change on the guest's screen
  const clockOf = async (p) => (await p.getByTestId("play-clock").innerText().catch(() => "?")).replace(/\s+/g, " ");
  const before = { host: await clockOf(page), guest: await clockOf(guest) };
  await page.getByRole("button", { name: "Until evening" }).click().catch((e) => note("until evening", "not clickable: " + String(e.message).slice(0, 80)));
  let after = null;
  for (let i = 0; i < 30; i++) { await sleep(1000); after = { host: await clockOf(page), guest: await clockOf(guest) }; if (after.guest !== before.guest) break; }
  state("clock", { before, after });
  note("guest clock followed the host", after && after.guest !== before.guest);
  await shot("guest_after_host_waits", guest);
  await shot("host_after_waits");
  const gc = (await api("GET", `/api/campaigns/${camp.id}`)).json;
  note("campaign clock saved", gc.timeElapsed?.total ?? null);
});
