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

// A model of the server's catalog: context window and effort levels when the server tells them
// (efforts undefined: not told; empty: a model without reasoning, stored as thinkingOptions: []).
// name: the server's display name, for the models modelLabel cannot read (Gemini, the cloaked ids).
export type ServedModel = { id: string; name?: string; created?: number; contextWindow?: number; efforts?: string[]; defaultEffort?: string };

// Paseo knows Claude's effort levels on its own, not those of a custom Codex model: they come from
// the server's Codex catalog, these only when it has none for the model.
const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"];
const EFFORT_LABELS: Record<string, string> = { xhigh: "XHigh" };

// <base>/v1/models whether the base URL is the Anthropic one (…/api) or the OpenAI one (…/api/v1).
export function modelsUrl(base: string): string {
  const root = base.replace(/\/+$/, "");
  return root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
}

// CPA lists in the Anthropic format, as claude-fable-5-dd-<id reversed>, every id that is not a
// plain claude-…: the account-prefixed Claude ones (personale/claude-opus-5-5) get their real id
// back, so that usable() can leave them out; the others (Gemini) keep the cloaked one CPA meant for it.
const CLOAK = "claude-fable-5-dd-";
export const uncloak = (id: string) => (id.startsWith(CLOAK) ? [...id.slice(CLOAK.length)].reverse().join("") : id);

const baseId = (id: string) => id.slice(id.lastIndexOf("/") + 1);
const listed = (list: string[] | undefined, id: string) =>
  (list ?? []).some((m) => [id, baseId(id)].some((x) => m.toLowerCase() === x.toLowerCase()));
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// The effort levels with the server's default, else medium, else the first.
function effortOptions(ids: string[], defaultEffort?: string): ThinkingOption[] {
  const preferred = [defaultEffort, "medium", ids[0]].find((e) => e && ids.includes(e));
  return ids.map((id) => ({ id, label: EFFORT_LABELS[id] ?? cap(id), ...(id === preferred ? { isDefault: true } : {}) }));
}

// 1M context in Claude Code takes the [1m] suffix. Without the server's context window: every
// undated Claude model (4.6 and later, Haiku 5.5 included) but Haiku 4.x.
const longContext = ({ id, contextWindow }: ServedModel) =>
  contextWindow === undefined ? !/haiku-4/i.test(id) : contextWindow >= 1_000_000;

// Chat models of the family that the key may use, rotation ones only: account-prefixed ids
// (personale/…), dated snapshots and image models left out (gpt-image-* answers only on
// /v1/images/*). Gemini reaches Claude Code under a cloaked claude-… id.
function usable(family: Family, id: string, routing: Routing): boolean {
  if (id.includes("/")) return false;
  const base = baseId(id);
  const chat = family === "claude" ? base.startsWith("claude-") : /^(gpt|gemini)-/.test(base) && !base.startsWith("gpt-image");
  const allowed = !routing.models?.length || listed(routing.models, id);
  return chat && !/-\d{8}$/.test(base) && allowed && !listed(routing.denied_models, id);
}

// "claude-opus-5-5[1m]" → "Opus 5.5 · 1M", "lavoro/gpt-6.1-sol" → "GPT-6.1 Sol · lavoro";
// the server's name, when given, in place of the one read from the id.
export function modelLabel(id: string, served?: string): string {
  const slash = id.lastIndexOf("/");
  const base = id.slice(slash + 1).replace(/\[1m\]$/, "");
  const parts = base.replace(/^(claude|gpt)-/, "").split("-");
  const name = served
    ? served
    : base.startsWith("gpt-")
    ? [`GPT-${parts[0]}`, ...parts.slice(1).map(cap)].join(" ")
    : [parts.filter((p) => !/^\d+$/.test(p)).map(cap).join(" "), parts.filter((p) => /^\d+$/.test(p)).join(".")].join(" ").trim();
  return [name, slash >= 0 ? id.slice(0, slash) : "", id.endsWith("[1m]") ? "1M" : ""].filter(Boolean).join(" · ");
}

// The provider's model list from the server's, newest first. Entries already configured keep their
// settings, also when the [1m] suffix comes or goes, so a hand edit survives the next sync; a
// generated label follows the id, and Codex effort levels follow the server whenever it lists them.
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
      const { thinkingOptions: oldEfforts, ...old } = kept.get(id) ?? kept.get(id === m.id ? `${m.id}[1m]` : m.id) ?? ({} as Partial<ProfileModel>);
      // Codex: the server's levels, [] for a model without reasoning (kept as such, so a later sync
      // without the catalog does not bring levels back); without them, the entry's own, else the fixed ones.
      const thinkingOptions =
        family !== "codex"
          ? oldEfforts
          : m.efforts
            ? m.efforts.length > 0 ? effortOptions(m.efforts, m.defaultEffort) : []
            : (oldEfforts ?? effortOptions(CODEX_EFFORTS));
      const generated = (x: string) => modelLabel(x, m.name);
      return {
        ...old,
        id,
        label: old.label && old.id && old.label !== generated(old.id) ? old.label : generated(id),
        ...(thinkingOptions ? { thinkingOptions } : {}),
      };
    });
  if (models.some((m) => m.isDefault)) return models;
  // Haiku is the newest Claude often enough, but it is no default for coding.
  const first = Math.max(0, models.findIndex((m) => !/haiku/i.test(m.id)));
  return models.map((m, i) => (i === first ? { ...m, isDefault: true } : m));
}
