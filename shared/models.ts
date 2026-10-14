import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Refreshes the model list of every provider opted in with env CPA_MODELS=auto.
export const syncModelsRpc = defineRpc({
  name: "models.sync",
  input: z.object({}),
  output: z.object({ changed: z.array(z.string()) }),
});

export type Family = "claude" | "codex";
type ThinkingOption = { id: string; label: string; isDefault?: boolean };
export type ProfileModel = { id: string; label: string; isDefault?: boolean; thinkingOptions?: ThinkingOption[] };
// The key's cpa-key-billing routing rule: allowed (empty = all) and denied models.
export type Routing = { models?: string[]; denied_models?: string[] };

// A model of the server's catalog: context window and effort levels when the server tells them.
export type ServedModel = { id: string; created?: number; contextWindow?: number; efforts?: string[]; defaultEffort?: string };

// Paseo knows Claude's effort levels on its own, not those of a custom Codex model: they come from
// the server's Codex catalog, these only when it has none for the model.
const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"];
const EFFORT_LABELS: Record<string, string> = { xhigh: "XHigh" };

// <base>/v1/models whether the base URL is the Anthropic one (…/api) or the OpenAI one (…/api/v1).
export function modelsUrl(base: string): string {
  const root = base.replace(/\/+$/, "");
  return root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
}

const baseId = (id: string) => id.slice(id.lastIndexOf("/") + 1);
const listed = (list: string[] | undefined, id: string) =>
  (list ?? []).some((m) => [id, baseId(id)].some((x) => m.toLowerCase() === x.toLowerCase()));
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// The server's effort levels with its default, else medium.
function effortOptions({ efforts, defaultEffort }: ServedModel): ThinkingOption[] {
  const ids = efforts?.length ? efforts : CODEX_EFFORTS;
  const preferred = ids.includes(defaultEffort ?? "") ? defaultEffort : "medium";
  return ids.map((id) => ({ id, label: EFFORT_LABELS[id] ?? cap(id), ...(id === preferred ? { isDefault: true } : {}) }));
}

// 1M context in Claude Code takes the [1m] suffix. Without the server's context window: every
// undated Claude model (4.6 and later, Haiku 5.5 included) but Haiku 4.x.
const longContext = ({ id, contextWindow }: ServedModel) =>
  contextWindow === undefined ? !/haiku-4/i.test(id) : contextWindow >= 1_000_000;

// Chat models of the family that the key may use; dated snapshots and image models left out.
function usable(family: Family, id: string, routing: Routing): boolean {
  const base = baseId(id);
  const chat = family === "claude" ? base.startsWith("claude-") : base.startsWith("gpt-") && !base.startsWith("gpt-image");
  const allowed = !routing.models?.length || listed(routing.models, id);
  return chat && !/-\d{8}$/.test(base) && allowed && !listed(routing.denied_models, id);
}

// "claude-opus-5-5[1m]" → "Opus 5.5 · 1M", "lavoro/gpt-6.1-sol" → "GPT-6.1 Sol · lavoro".
export function modelLabel(id: string): string {
  const slash = id.lastIndexOf("/");
  const base = id.slice(slash + 1).replace(/\[1m\]$/, "");
  const parts = base.replace(/^(claude|gpt)-/, "").split("-");
  const name = base.startsWith("gpt-")
    ? [`GPT-${parts[0]}`, ...parts.slice(1).map(cap)].join(" ")
    : [parts.filter((p) => !/^\d+$/.test(p)).map(cap).join(" "), parts.filter((p) => /^\d+$/.test(p)).join(".")].join(" ").trim();
  return [name, slash >= 0 ? id.slice(0, slash) : "", id.endsWith("[1m]") ? "1M" : ""].filter(Boolean).join(" · ");
}

// The provider's model list from the server's, newest first. Entries already configured keep
// their label and default, so a hand edit survives the next sync; effort levels follow the server.
export function syncedModels(
  family: Family,
  served: ServedModel[],
  routing: Routing,
  current: ProfileModel[] = [],
): ProfileModel[] {
  const kept = new Map(current.map((m) => [m.id, m]));
  const models = served
    .filter((m) => usable(family, m.id, routing))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m): ProfileModel => {
      const id = family === "claude" && longContext(m) ? `${m.id}[1m]` : m.id;
      const old = kept.get(id);
      return {
        id,
        label: old?.label ?? modelLabel(id),
        ...(old?.isDefault ? { isDefault: true } : {}),
        ...(family === "codex" ? { thinkingOptions: effortOptions(m) } : {}),
      };
    });
  if (models.some((m) => m.isDefault)) return models;
  // Haiku is the newest Claude often enough, but it is no default for coding.
  const first = Math.max(0, models.findIndex((m) => !/haiku/i.test(m.id)));
  return models.map((m, i) => (i === first ? { ...m, isDefault: true } : m));
}
