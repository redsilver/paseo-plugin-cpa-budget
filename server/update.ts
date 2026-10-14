import { type ChildProcess, execFile, spawn } from "node:child_process";

const FIRST_MS = 60_000;
const EVERY_MS = 6 * 60 * 60_000;
const REPOSITORY = /\/paseo-plugin-cpa-budget(\.git)?\/?$/;

// The daemon gives its plugins the CLI path and home. On Windows the CLI is a .cmd, which runs only
// through a shell: there every argument is quoted, as paths may hold spaces.
const windows = process.platform === "win32";
const quote = (arg: string) => (windows ? `"${arg}"` : arg);
const cli = quote(process.env.PASEO_CLI || "paseo");
const home = process.env.PASEO_HOME ? ["--home", process.env.PASEO_HOME] : [];
const options = { shell: windows, windowsHide: true };

// Ids of the Git installations of this repository, whatever id they were installed under.
function gitInstalls(listing: string): string[] {
  const plugins = JSON.parse(listing);
  return (Array.isArray(plugins) ? plugins : [])
    .filter((p) => p?.installation?.identity?.kind === "git" && REPOSITORY.test(p.installation.identity.remote ?? ""))
    .map((p) => String(p.id));
}

// Asks the daemon to move each Git installation to the remote's HEAD; directory installs are left
// alone. Detached: the update restarts this process.
// ponytail: CLI output is dropped; `paseo plugin update <id> --check` shows what is pending.
export function scheduleUpdates(): () => void {
  let stopped = false;
  let listing: ChildProcess | undefined;
  const update = () => {
    const ls = ["plugin", "ls", "--json", ...home].map(quote);
    listing = execFile(cli, ls, { ...options, timeout: 30_000 }, (error, stdout) => {
      if (stopped) return;
      let ids: string[];
      try {
        if (error) throw error;
        ids = gitInstalls(stdout);
      } catch (failure) {
        return console.error(`cpa-budget: self-update check failed: ${String(failure)}`);
      }
      for (const id of ids) {
        const child = spawn(cli, ["plugin", "update", id, "--yes", ...home].map(quote), { ...options, detached: true, stdio: "ignore" });
        child.on("error", (failure) => console.error(`cpa-budget: self-update of ${id} failed: ${String(failure)}`));
        child.unref();
      }
    });
  };
  const first = setTimeout(update, FIRST_MS);
  const every = setInterval(update, EVERY_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(every);
    listing?.kill();
  };
}
