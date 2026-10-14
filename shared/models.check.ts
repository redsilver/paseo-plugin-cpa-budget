import assert from "node:assert/strict";
import { modelLabel, modelsUrl, syncedModels } from "./models.ts";

assert.equal(modelsUrl("https://cpa.example.com/api"), "https://cpa.example.com/api/v1/models");
assert.equal(modelsUrl("https://cpa.example.com/api/v1/"), "https://cpa.example.com/api/v1/models");
assert.equal(modelLabel("claude-opus-5-5[1m]"), "Opus 5.5 · 1M");
assert.equal(modelLabel("lavoro/gpt-6.1-sol"), "GPT-6.1 Sol · lavoro");
assert.equal(modelLabel("gpt-5.5"), "GPT-5.5");

const served = [
  { id: "claude-haiku-5-5", created: 30 },
  { id: "claude-sonnet-5-5", created: 30 },
  { id: "claude-opus-5-5", created: 20 },
  { id: "claude-fable-5-1", created: 10 },
  { id: "claude-opus-4-1-20250805", created: 5 },
  { id: "gpt-6.1-sol", created: 40 },
  { id: "gpt-6-astra", created: 35 },
  { id: "gpt-image-2.5", created: 50 },
  { id: "codex-auto-review", created: 50 },
];
const rule = { models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "gpt-6.1-sol"], denied_models: ["gpt-6-astra"] };

const claude = syncedModels("claude", served, rule);
assert.deepEqual(claude.map((m) => m.id), ["claude-haiku-5-5[1m]", "claude-sonnet-5-5[1m]", "claude-opus-5-5[1m]"]);
assert.equal(claude.find((m) => m.isDefault)?.id, "claude-sonnet-5-5[1m]");
assert.equal(claude[0].thinkingOptions, undefined);

const codex = syncedModels("codex", served, rule);
assert.deepEqual(codex.map((m) => m.id), ["gpt-6.1-sol"]);
assert.deepEqual(codex[0].thinkingOptions?.map((o) => o.id), ["low", "medium", "high", "xhigh"]);

// Haiku 4.x has 200K tokens: no [1m].
assert.deepEqual(syncedModels("claude", [{ id: "claude-haiku-4-5" }], {}).map((m) => m.id), ["claude-haiku-4-5"]);

// No rule: every chat model, dated snapshots left out.
assert.deepEqual(syncedModels("claude", served, {}).map((m) => m.id).at(-1), "claude-fable-5-1[1m]");

// A configured entry keeps its label and default; a model gone from the server disappears.
const kept = syncedModels("claude", served, rule, [
  { id: "claude-opus-5-5[1m]", label: "Opus mio", isDefault: true },
  { id: "claude-fable-5-1[1m]", label: "Fable" },
]);
assert.deepEqual(kept.map((m) => [m.label, Boolean(m.isDefault)]), [["Haiku 5.5 · 1M", false], ["Sonnet 5.5 · 1M", false], ["Opus mio", true]]);
// The server's context window decides the [1m] suffix when it gives one.
assert.deepEqual(
  syncedModels("claude", [{ id: "claude-sonnet-4-6", contextWindow: 200_000 }, { id: "claude-opus-4-6", contextWindow: 1_000_000 }], {}).map((m) => m.id),
  ["claude-sonnet-4-6", "claude-opus-4-6[1m]"],
);

// Effort levels and default from the server's Codex catalog; the old ones do not stick.
const sol = { id: "gpt-6.1-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], defaultEffort: "low" };
const synced = syncedModels("codex", [sol], {}, [
  { id: "gpt-6.1-sol", label: "Sol", isDefault: true, thinkingOptions: [{ id: "low", label: "Low" }] },
]);
assert.deepEqual(synced[0].thinkingOptions?.map((o) => o.id), sol.efforts);
assert.deepEqual(synced[0].thinkingOptions?.filter((o) => o.isDefault).map((o) => o.id), ["low"]);
assert.equal(synced[0].thinkingOptions?.find((o) => o.id === "xhigh")?.label, "XHigh");
assert.deepEqual([synced[0].label, synced[0].isDefault], ["Sol", true]);
// A default the model lacks falls back to medium.
assert.deepEqual(
  syncedModels("codex", [{ ...sol, defaultEffort: "none" }], {})[0].thinkingOptions?.filter((o) => o.isDefault).map((o) => o.id),
  ["medium"],
);
// No default on the server and no medium: the first level.
assert.deepEqual(
  syncedModels("codex", [{ id: "gpt-x", efforts: ["low", "high"] }], {})[0].thinkingOptions?.filter((o) => o.isDefault).map((o) => o.id),
  ["low"],
);

// Without the catalog an entry keeps the effort levels it has; a new one gets the fixed ones.
const offline = syncedModels("codex", [{ id: "gpt-6.1-sol" }, { id: "gpt-new" }], {}, synced);
assert.deepEqual(offline[0].thinkingOptions, synced[0].thinkingOptions);
assert.deepEqual(offline[1].thinkingOptions?.map((o) => o.id), ["low", "medium", "high", "xhigh"]);

// The [1m] suffix coming or going keeps label, default and the other fields of the entry;
// a generated label follows the new id.
const moved = syncedModels("claude", [{ id: "claude-sonnet-4-6", contextWindow: 200_000 }, { id: "claude-haiku-5-5", contextWindow: 1_000_000 }], {}, [
  { id: "claude-sonnet-4-6[1m]", label: "Sonnet mio", isDefault: true, description: "x" } as any,
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
]);
assert.deepEqual(moved.map((m) => [m.id, m.label, Boolean(m.isDefault)]), [
  ["claude-sonnet-4-6", "Sonnet mio", true],
  ["claude-haiku-5-5[1m]", "Haiku 5.5 · 1M", false],
]);
assert.equal((moved[0] as any).description, "x");
// A model without reasoning loses its levels; levels of a model the catalog says nothing about stay.
const plain = syncedModels("codex", [{ id: "gpt-6.1-sol", efforts: [] }, { id: "gpt-new", efforts: [] }], {}, synced);
assert.deepEqual(plain.map((m) => m.thinkingOptions), [undefined, undefined]);
console.log("ok");
