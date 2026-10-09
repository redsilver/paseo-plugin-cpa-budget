import { type BudgetStatus, parseSubscription } from "../shared/budget";
import { cpaAccess, readProviders } from "./config";

export async function budgetStatus({ provider }: { provider: string }): Promise<BudgetStatus> {
  try {
    const found = cpaAccess((await readProviders())[provider]);
    if (!found) return { state: "none", blocked: false, windows: [] };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 10_000);
    const response = await fetch(`${new URL(found.base).origin}/v0/resource/plugins/cpa-key-billing/subscription`, {
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
