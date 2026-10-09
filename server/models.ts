import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { isDeepStrictEqual } from "node:util";
import { type ProfileModel, modelsUrl, syncedModels } from "../shared/models";
import { cpaAccess, readProviders } from "./config";

// null when the CPA has no such resource (404) or the key is not tracked by it (401).
async function getJson(url: string, key: string): Promise<any> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 10_000);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, "User-Agent": "paseo-cpa-budget" },
    signal: timeout.signal,
  }).finally(() => clearTimeout(timer));
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export async function syncModels(_input: object, { paseo }: PluginHandlerContext) {
  const patch: Record<string, { models: ProfileModel[] }> = {};
  for (const [id, provider] of Object.entries(await readProviders())) {
    const family = provider.extends ?? id;
    const access = cpaAccess(provider);
    if (provider.env?.CPA_MODELS !== "auto" || !access || (family !== "claude" && family !== "codex")) continue;
    try {
      const served = (await getJson(modelsUrl(access.base), access.key))?.data ?? [];
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
