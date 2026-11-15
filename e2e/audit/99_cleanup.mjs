// Removes only the rows this audit created (ids listed in AUDIT/05_artifacts/created.ndjson) from the test server's database.
import fs from "node:fs";
import { api, ART, BASE } from "./h.mjs";

const lines = fs.existsSync(`${ART}/created.ndjson`) ? fs.readFileSync(`${ART}/created.ndjson`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
let ok = 0, bad = 0;
for (const kind of ["campaign", "character"]) {
  for (const r of lines.filter((l) => l.kind === kind)) {
    const res = await api("DELETE", `/api/${kind === "campaign" ? "campaigns" : "characters"}/${r.id}`);
    if (res.status < 300) ok++; else bad++;
  }
}
console.log(`removed ${ok}, failed ${bad}, of ${lines.length} rows created by the audit on ${BASE}`);
