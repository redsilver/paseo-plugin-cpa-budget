import type {
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { BudgetPopover } from "./client/popover";
import { budgetRpc, pillLabel } from "./shared/budget";

const REFRESH_MS = 60_000;
const MIN_GAP_MS = 15_000;

// One composer pill per agent with the budget left on its provider's CPA key.
export default function contribute(client: PluginClientContext) {
  const pills = new Map<
    string,
    { reg: PluginButtonRegistration; provider: string }
  >();
  const labels = new Map<string, string | null>();
  const fetchedAt = new Map<string, number>();
  const lifetime = new AbortController();
  let stopped = false;

  const apply = (provider: string) => {
    const label = labels.get(provider) ?? null;
    for (const pill of pills.values()) {
      // Paseo rejects an empty label: keep the last one while hidden.
      if (pill.provider === provider)
        pill.reg.update(
          label === null ? { visible: false } : { visible: true, label },
        );
    }
  };

  const refresh = async (provider: string, force = false) => {
    const last = fetchedAt.get(provider) ?? 0;
    if (!force && Date.now() - last < MIN_GAP_MS) return apply(provider);
    fetchedAt.set(provider, Date.now());
    try {
      labels.set(
        provider,
        pillLabel(await client.rpc(budgetRpc, { provider })),
      );
    } catch (error) {
      console.error("cpa-budget refresh failed", error);
    }
    if (!stopped) apply(provider);
  };

  const register = (agent: {
    id: string;
    workspaceId?: string | null;
    provider?: string | null;
  }) => {
    if (stopped || !agent.workspaceId || !agent.provider) return;
    const existing = pills.get(agent.id);
    if (existing?.provider === agent.provider)
      return void refresh(agent.provider);
    existing?.reg.remove();
    let reg: PluginButtonRegistration;
    try {
      reg = client.addComposerPill({
        id: "cpa-budget",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: {
          title: "Budget della chiave CPA",
          icon: "Gauge",
          label: "Budget",
          visible: false,
          behavior: { kind: "popover", Content: BudgetPopover },
        },
      });
    } catch (error) {
      // One rejected pill must not stop the others.
      return console.error("cpa-budget: pill rejected", agent.id, error);
    }
    pills.set(agent.id, { reg, provider: agent.provider });
    void refresh(agent.provider);
  };

  const remove = (agentId: string) => {
    pills.get(agentId)?.reg.remove();
    pills.delete(agentId);
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const pill of pills.values()) pill.reg.remove();
          pills.clear();
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") remove(update.agentId);
          else register(update.agent);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!stopped)
        console.error("cpa-budget: agent observation failed", error);
    });

  const timer = setInterval(() => {
    for (const provider of new Set([...pills.values()].map((p) => p.provider)))
      void refresh(provider, true);
  }, REFRESH_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    lifetime.abort();
    for (const pill of pills.values()) pill.reg.remove();
    pills.clear();
  };
}
