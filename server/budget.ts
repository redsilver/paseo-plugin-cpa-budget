import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BudgetStatus, parseSubscription } from "../shared/budget";

type ProviderConfig = { env?: Record<string, string> };

// The CPA key and base URL of a Paseo provider, from ~/.paseo/config.json (agents.providers).
async function providerKey(provider: string) {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const config = JSON.parse(await readFile(join(home, "config.json"), "utf8"));
  const env = (config?.agents?.providers?.[provider] as ProviderConfig | undefined)?.env ?? {};
  const key = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.CPA_API_KEY;
  const base = env.ANTHROPIC_BASE_URL || env.OPENAI_BASE_URL;
  return key && base ? { key, origin: new URL(base).origin } : null;
}

export async function budgetStatus({ provider }: { provider: string }): Promise<BudgetStatus> {
  try {
    const found = await providerKey(provider);
    if (!found) return { state: "none", blocked: false, windows: [] };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 10_000);
    const response = await fetch(`${found.origin}/v0/resource/plugins/cpa-key-billing/subscription`, {
      headers: { Authorization: `Bearer ${found.key}`, "User-Agent": "paseo-cpa-budget" },
      signal: timeout.signal,
    }).finally(() => clearTimeout(timer));
    // 404: the CPA has no cpa-key-billing plugin; 401: the key is not tracked by it.
    if (response.status === 404 || response.status === 401) return { state: "none", blocked: false, windows: [] };
    if (!response.ok) return { state: "error", message: `HTTP ${response.status}`, blocked: false, windows: [] };
    return parseSubscription(await response.json());
  } catch (error) {
    return { state: "error", message: String(error), blocked: false, windows: [] };
  }
}
