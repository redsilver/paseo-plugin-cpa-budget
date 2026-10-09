import type { PluginServerContext } from "@getpaseo/plugin/server";
import { budgetStatus } from "./server/budget";
import { syncModels } from "./server/models";
import { budgetRpc } from "./shared/budget";
import { syncModelsRpc } from "./shared/models";

export default function contribute(server: PluginServerContext) {
  server.handle(budgetRpc, budgetStatus);
  server.handle(syncModelsRpc, syncModels);
  return () => {};
}
