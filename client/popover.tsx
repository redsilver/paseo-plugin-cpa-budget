import { type PluginButtonContentProps, useAgent, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { budgetRpc } from "../shared/budget";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function BudgetPopover(props: PluginButtonContentProps) {
  const { theme } = props;
  const agentId = props.context === "agent" ? props.agentId : "";
  const provider = useAgent(agentId, (agent) => agent.provider) ?? "";
  const fetchBudget = useRpc(budgetRpc);
  const { data, isLoading } = useQuery({
    queryKey: ["cpa-budget", provider],
    queryFn: () => fetchBudget({ provider }),
    enabled: provider !== "",
    refetchInterval: 30_000,
  });
  const styles = useMemo(
    () => ({
      box: { padding: 16, gap: 12, minWidth: 280, backgroundColor: theme.colors.surface0 },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      row: { gap: 4 },
      line: { flexDirection: "row" as const, justifyContent: "space-between" as const },
      text: { color: theme.colors.foreground, fontSize: 13 },
      track: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surface2 },
    }),
    [theme],
  );

  if (isLoading || !data) return <View style={styles.box}><Text style={styles.muted}>Lettura del budget…</Text></View>;
  if (data.state !== "ok") {
    const text = data.state === "none" ? "Questa chiave non ha un piano: nessun limite." : `Budget non disponibile: ${data.message}`;
    return <View style={styles.box}><Text style={styles.muted}>{text}</Text></View>;
  }
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{data.plan ?? "Budget"}</Text>
      {data.windows.map((w) => {
        const color = w.blocked ? theme.colors.statusDanger : w.usedPercent >= 80 ? theme.colors.statusWarning : theme.colors.statusSuccess;
        return (
          <View key={w.name} style={styles.row}>
            <View style={styles.line}>
              <Text style={styles.text}>{w.name}</Text>
              <Text style={styles.text}>
                ${w.usedUsd.toFixed(2)} / ${w.limitUsd.toFixed(2)}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, w.usedPercent)}%`, backgroundColor: color }} />
            </View>
            <Text style={styles.muted}>
              {w.blocked ? "Esaurito, " : `Restano $${(w.limitUsd - w.usedUsd).toFixed(2)}, `}
              {w.endAt ? `si azzera ${when(w.endAt)}` : "parte con la prossima richiesta"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
