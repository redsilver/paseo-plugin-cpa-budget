import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// One quota window of the cpa-key-billing plan bound to the provider's CPA key.
const window = z.object({
  name: z.string(),
  limitUsd: z.number(),
  usedUsd: z.number(),
  usedPercent: z.number(),
  endAt: z.string().nullable(),
  blocked: z.boolean(),
});

export const budgetStatus = z.object({
  // none: the provider has no CPA key, or the key has no plan (only metered).
  state: z.enum(["ok", "none", "error"]),
  message: z.string().optional(),
  plan: z.string().optional(),
  blocked: z.boolean(),
  windows: z.array(window),
});

export type BudgetStatus = z.infer<typeof budgetStatus>;

export const budgetRpc = defineRpc({
  name: "budget.status",
  input: z.object({ provider: z.string() }),
  output: budgetStatus,
});

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export function windowLabel(name: string): string {
  return /settiman|week|7/i.test(name) ? "sett" : name.replace(/\s*ore$/i, "h");
}

// Pill text: used share of each window, or when the exhausted one resets.
export function pillLabel(status: BudgetStatus): string | null {
  if (status.state !== "ok" || status.windows.length === 0) return null;
  const blocked = status.windows.find((w) => w.blocked);
  if (blocked) return blocked.endAt ? `Esaurito fino alle ${hhmm(blocked.endAt)}` : "Budget esaurito";
  return status.windows.map((w) => `${windowLabel(w.name)} ${Math.round(w.usedPercent)}%`).join(" · ");
}

// The plugin's subscription view, as returned by cpa-key-billing.
export function parseSubscription(body: unknown): BudgetStatus {
  const sub = (body as { subscription?: any })?.subscription;
  if (!sub || sub.unlimited) return { state: "none", blocked: false, windows: [] };
  const windows = (sub.windows ?? []).flatMap((w: any) => {
    const usd = (w.dimensions ?? []).find((d: any) => d.metric === "amount_usd");
    if (!usd) return [];
    return [{
      name: String(w.name ?? ""),
      limitUsd: Number(usd.limit),
      usedUsd: Number(usd.used),
      usedPercent: Number(usd.used_percent ?? 0),
      // A window not started yet has no end: it starts with the next request.
      endAt: w.started && w.end_at ? String(w.end_at) : null,
      blocked: Boolean(usd.blocked),
    }];
  });
  return { state: "ok", plan: sub.name || undefined, blocked: Boolean(sub.blocked), windows };
}
