import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { isDeepStrictEqual } from "node:util";
import { type Family, type ProfileModel, type ServedModel, modelsUrl, syncedModels } from "../shared/models";
import { cpaAccess, readProviders } from "./config";

// null when the CPA has no such resource (404) or the key is not tracked by it (401).
async function getJson(url: string, key: string, headers: Record<string, string> = {}): Promise<any> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 10_000);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, "User-Agent": "paseo-cpa-budget", ...headers },
    signal: timeout.signal,
  }).finally(() => clearTimeout(timer));
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// The server's models with their context window and effort levels. CPA answers /v1/models in the
// Anthropic format (created_at, max_input_tokens) when asked with anthropic-version, and with the
// Codex catalog (context_window, reasoning levels, no date) when asked with client_version.
async function servedModels(family: Family, url: string, key: string): Promise<ServedModel[]> {
  if (family === "claude") {
    const body = await getJson(url, key, { "anthropic-version": "2023-06-01" });
    // A partial list would drop the models of the next pages: better no sync at all.
    if (body?.has_more) throw new Error(`${url}: paginated answer`);
    return (Array.isArray(body?.data) ? body.data : [])
      // The Anthropic list also carries the GPT models under cloaked claude-… ids.
      .filter((m: any) => m.owned_by !== "openai")
      .map((m: any) => ({
        id: m.id,
        created: Date.parse(m.created_at) / 1000 || m.created,
        contextWindow: typeof m.max_input_tokens === "number" ? m.max_input_tokens : undefined,
      }));
  }
  const [list, catalog] = await Promise.all([
    getJson(url, key),
    getJson(`${url}?client_version=1.0.0`, key).catch(() => null), // effort levels are an extra
  ]);
  const entries = new Map<string, any>((Array.isArray(catalog?.models) ? catalog.models : []).map((m: any) => [m?.slug, m]));
  return (Array.isArray(list?.data) ? list.data : []).map((m: any) => {
    const entry = entries.get(m.id);
    const levels = entry?.supported_reasoning_levels;
    const efforts = Array.isArray(levels) ? levels.map((l: any) => text(l?.effort)).filter(Boolean) : [];
    return {
      id: m.id,
      created: m.created,
      // An empty list is a model without reasoning; a list with no usable level tells nothing.
      efforts: Array.isArray(levels) && (levels.length === 0 || efforts.length > 0) ? efforts : undefined,
      defaultEffort: text(entry?.default_reasoning_level) || undefined,
    };
  });
}

export async function syncModels(_input: object, { paseo }: PluginHandlerContext) {
  const patch: Record<string, { models: ProfileModel[] }> = {};
  for (const [id, provider] of Object.entries(await readProviders())) {
    const family = provider.extends ?? id;
    const access = cpaAccess(provider);
    if (provider.env?.CPA_MODELS !== "auto" || !access || (family !== "claude" && family !== "codex")) continue;
    try {
      const served = await servedModels(family, modelsUrl(access.base), access.key);
      const routing = (await getJson(`${new URL(access.base).origin}/v0/resource/plugins/cpa-key-billing/routing`, access.key)) ?? {};
      const models = syncedModels(family, served, routing, provider.models);
      // An empty answer must not wipe the model picker.
      if (models.length > 0 && !isDeepStrictEqual(models, provider.models)) patch[id] = { models };
    } catch (error) {
      console.error(`cpa-budget: model sync failed for ${id}: ${String(error)}`);
    }
  }
  // A merge patch: the provider's env, and so its key, stays as it is.
  if (Object.keys(patch).length > 0) await paseo.config.patch({ providers: patch });
  return { changed: Object.keys(patch) };
}
