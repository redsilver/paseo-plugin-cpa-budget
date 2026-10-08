# cpa-budget — Paseo plugin

Shows, in every [Paseo](https://paseo.sh) agent, how much of its API key budget is left when the agent's provider goes through a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) proxy with the [cpa-key-billing](https://github.com/4pii4/cpa-plugin-key-billing) plugin.

- A composer pill per agent: the used share of each quota window (`5h 12% · sett 3%`), or when the exhausted one resets (`Esaurito fino alle 17:18`).
- Tap it for the plan name and, per window, a progress bar, spent and limit in USD, what is left and when it resets.
- Refreshes every minute. Hidden when the key has no plan, the provider has no CPA key, or the proxy has no cpa-key-billing.

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
