import type { PluginServerContext } from "@getpaseo/plugin/server";
import { budgetStatus } from "./server/budget";
import { budgetRpc } from "./shared/budget";

export default function contribute(server: PluginServerContext) {
  server.handle(budgetRpc, budgetStatus);
  return () => {};
}
