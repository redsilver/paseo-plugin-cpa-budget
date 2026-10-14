import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const FIRST_MS = 60_000;
const EVERY_MS = 6 * 60 * 60_000;

// The paseo CLI of the app running this plugin (macOS bundle, Windows install), else the one on PATH.
function paseoBin(): string {
  const exe = process.execPath;
  const app = exe.match(/^(.*?\.app)\//)?.[1];
  const candidates = [
    app && join(app, "Contents", "Resources", "bin", "paseo"),
    join(dirname(exe), "resources", "bin", "paseo.cmd"),
    join(dirname(exe), "resources", "bin", "paseo"),
  ];
  return candidates.find((c): c is string => Boolean(c) && existsSync(c!)) ?? "paseo";
}

// Asks the daemon to update this plugin from its Git source to the remote's HEAD; a directory
// install is skipped by Paseo itself. Detached: the update restarts this process.
// ponytail: CLI output is dropped; `paseo plugin update cpa-budget --check` shows what is pending.
function update() {
  const bin = paseoBin();
  const windows = process.platform === "win32";
  const child = spawn(windows ? `"${bin}"` : bin, ["plugin", "update", "cpa-budget", "--yes"], {
    detached: true,
    stdio: "ignore",
    shell: windows, // a .cmd needs a shell
    windowsHide: true,
  });
  child.on("error", (error) => console.error(`cpa-budget: self-update failed: ${String(error)}`));
  child.unref();
}

export function scheduleUpdates(): () => void {
  const first = setTimeout(update, FIRST_MS);
  const every = setInterval(update, EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
