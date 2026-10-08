import assert from "node:assert/strict";
import { parseSubscription, pillLabel } from "./budget.ts";

const sub = (windows: unknown[], extra = {}) => ({
  subscription: { name: "Prova", unlimited: false, blocked: false, windows, ...extra },
});
const win = (name: string, used: number, limit: number, started = true) => ({
  name, started, end_at: "2026-10-08T15:18:48Z",
  dimensions: [{ metric: "amount_usd", limit: String(limit), used: String(used), used_percent: (used / limit) * 100, blocked: used >= limit }],
});

assert.deepEqual(parseSubscription({ subscription: { unlimited: true, windows: [] } }).state, "none");
assert.equal(parseSubscription(null).state, "none");

const ok = parseSubscription(sub([win("5 ore", 4.5, 18), win("Settimana", 23.5, 235)]));
assert.equal(ok.plan, "Prova");
assert.equal(pillLabel(ok), "5h 25% · sett 10%");

const full = parseSubscription(sub([win("5 ore", 18, 18), win("Settimana", 30, 235)], { blocked: true }));
assert.match(pillLabel(full)!, /^Esaurito fino alle \d\d:\d\d$/);

assert.equal(parseSubscription(sub([win("5 ore", 0, 18, false)])).windows[0].endAt, null);
assert.equal(pillLabel({ state: "none", blocked: false, windows: [] }), null);
console.log("ok");
