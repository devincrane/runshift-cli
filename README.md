# runshift

The control plane for agents, wherever they run.

## Install governance rules in 30 seconds

```bash
npx runshift init
```

relay reads your repository, identifies security gaps and agent failure patterns specific to your codebase, and installs governance rules that prevent AI agents from breaking things.

## What it does

1. **Scans your repo** — detects your stack, existing rules, migration files, environment variables (key names only)
2. **Calls relay** — sends context to runshift.ai, generates opinionated rules specific to your codebase
3. **Shows you everything** — findings, files to install, browser preview before anything is written
4. **Writes on confirmation** — you approve, relay commits

## Commands

| Command | Description |
|---------|-------------|
| `npx runshift init` | Install governance rules |
| `npx runshift init --dry-run` | Preview without writing |
| `npx runshift init --branch <name>` | Run on a new branch |
| `npx runshift remove` | Remove installed rules |

## Privacy

- No source code is sent to runshift.ai
- No secret values are ever read
- Only dependency names, folder structure, and env key names are sent
- Existing files written by humans are never overwritten
- Every file shown before writing — you confirm before anything changes

## Revert

Everything relay installs is committed with one message:

`chore: install runshift agent governance rules`

To undo everything instantly:

```bash
git revert HEAD
```

Or use the built-in remove command:

```bash
npx runshift remove
```

## Control plane

relay is the development layer of the runshift control plane.

[runshift.ai](https://runshift.ai) — production governance for AI agents.

---

MIT License · [github.com/devincrane/runshift-cli](https://github.com/devincrane/runshift-cli)
