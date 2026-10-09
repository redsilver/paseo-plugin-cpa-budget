import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProfileModel } from "../shared/models";

export type ProviderConfig = { extends?: string; env?: Record<string, string>; models?: ProfileModel[] };

// Paseo providers from ~/.paseo/config.json (agents.providers): the daemon's own view redacts the keys.
export async function readProviders(): Promise<Record<string, ProviderConfig>> {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const config = JSON.parse(await readFile(join(home, "config.json"), "utf8"));
  return config?.agents?.providers ?? {};
}

// The CPA key and base URL of a provider.
export function cpaAccess(provider: ProviderConfig | undefined) {
  const env = provider?.env ?? {};
  const key = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.CPA_API_KEY;
  const base = env.ANTHROPIC_BASE_URL || env.OPENAI_BASE_URL;
  return key && base ? { key, base } : null;
}
