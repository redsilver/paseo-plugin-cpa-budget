# cpa-budget — Paseo plugin

Shows, in every [Paseo](https://paseo.sh) agent, how much of its API key budget is left when the agent's provider goes through a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) proxy with the [cpa-key-billing](https://github.com/4pii4/cpa-plugin-key-billing) plugin.

- A composer pill per agent: the used share of each quota window (`5h 12% · sett 3%`), or when the exhausted one resets (`Esaurito fino alle 17:18`).
- Tap it for the plan name and, per window, a progress bar, spent and limit in USD, what is left and when it resets.
- Refreshes every minute. Hidden when the key has no plan, the provider has no CPA key, or the proxy has no cpa-key-billing.
- Optionally keeps the provider's model list in step with the server, with a reasoning effort selector on every model.

The UI text is in Italian.

## How it works

The server side reads the agent provider's key and base URL from `~/.paseo/config.json` (or `$PASEO_HOME/config.json`), under `agents.providers.<id>.env`:

- key: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `CPA_API_KEY`;
- base URL: `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` (only its origin is used).

It then calls `GET <origin>/v0/resource/plugins/cpa-key-billing/subscription` with that key, the key holder's own view of cpa-key-billing. The key never reaches the client.

Example provider:

```json
{
  "agents": {
    "providers": {
      "claude-cpa": {
        "extends": "claude",
        "label": "Claude (CPA)",
        "env": {
          "ANTHROPIC_BASE_URL": "https://cpa.example.com",
          "ANTHROPIC_AUTH_TOKEN": "sk-…"
        }
      }
    }
  }
}
```

## Model list from the server

Add `"CPA_MODELS": "auto"` to a provider's `env` and the plugin replaces its `models` with what the key may use:

- the server's `/v1/models`, minus the models the key's cpa-key-billing routing rule allows or denies (`/v0/resource/plugins/cpa-key-billing/routing`);
- chat models of the provider's family only: `claude-*` for `extends: "claude"`, `gpt-*` without `gpt-image-*` for `extends: "codex"`; dated snapshots (`…-20250514`) are left out;
- newest first; Claude models get the `[1m]` suffix (1M context in Claude Code), except Haiku 4.x (200K); Codex models get the `low`/`medium`/`high`/`xhigh` effort levels, Paseo adds Claude's by itself;
- an entry already in the list keeps its label and `isDefault`, so a hand edit survives; without a default, the newest non-Haiku model becomes it.

The sync runs when a Paseo app connects and then every 5 minutes, and only writes when the list changed (a merge patch on `agents.providers.<id>.models`: the key is untouched). A new model therefore reaches the picker within 5 minutes of being listed or allowed on the server. An empty or failed answer leaves the list as it is; failures go to `paseo plugin logs cpa-budget`.

Example: one provider per family, configured once.

```json
"claude-team": {
  "extends": "claude",
  "label": "Claude (team)",
  "env": {
    "ANTHROPIC_BASE_URL": "https://cpa.example.com/api",
    "ANTHROPIC_AUTH_TOKEN": "sk-…",
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-5-5",
    "CPA_MODELS": "auto"
  }
},
"codex-team": {
  "extends": "codex",
  "label": "Codex (team)",
  "env": {
    "OPENAI_BASE_URL": "https://cpa.example.com/api/v1",
    "OPENAI_API_KEY": "sk-…",
    "CPA_MODELS": "auto"
  }
}
```

`ANTHROPIC_DEFAULT_HAIKU_MODEL` matters when the routing rule allows only some Haiku: Claude Code sends its background requests to Haiku 4.5 otherwise.

## Install

Requires Paseo 0.10.2 or later with plugins enabled, and a CPA with cpa-key-billing where the key is bound to a subscription plan with USD windows.

```sh
git clone https://github.com/redsilver/paseo-plugin-cpa-budget
cd paseo-plugin-cpa-budget
npm install
paseo plugin install "$PWD"
```

After a change: `npm run check` (self-check of the parsing and the pill text), `npm run typecheck`, then `paseo plugin reload cpa-budget`.

## License

MIT
