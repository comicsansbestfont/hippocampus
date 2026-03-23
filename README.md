# Hippocampus

![Hippocampus — Your agents forget between sessions. This fixes that.](docs/gallery/01-hero.png)

**Your agents forget between sessions. This fixes that.**

Every time an OpenClaw agent starts a new session, it wakes up blank. No memory of yesterday's conversations, open threads, or promises made. You've seen it: the same questions re-asked, context re-explained, commitments quietly dropped.

Hippocampus gives your agents a rolling briefing that's automatically injected into every session. No tool calls, no manual loading — your agent just *knows*.

```bash
openclaw plugins install @sacheeperera/hippocampus
```

---

## Before and After

**Without Hippocampus:**
> *"What were we working on?"*
> *"Can you remind me of the status?"*
> *"I don't have context on that conversation..."*

**With Hippocampus:**
> Your agent opens every session already briefed — what's top of mind, what threads are open, what commitments are outstanding, and what happened in recent sessions.

---

## How It Works

Three memory layers, working together:

```
Daily Notes           HIPPOCAMPUS.md          MEMORY.md
(raw session logs) -> (14-day rolling       -> (permanent curated
                       synthesis, auto-        knowledge, graduated
                       injected every          when patterns prove
                       session)                durable)
```

1. **Daily notes** — `memory/YYYY-MM-DD.md` files your agents already write
2. **HIPPOCAMPUS.md** — A daily cron synthesizes your agent's recent notes into a rolling briefing. Automatically loaded into every session via `prependSystemContext`.
3. **MEMORY.md** — When a pattern persists across multiple cycles, promote it to permanent memory with the `hippocampus_graduate` tool.

The synthesis is the key part. It doesn't dump raw logs — it *synthesizes*. The output reads like an ops briefing: what's hot, what's stuck, what's owed, what just happened.

---

## Quick Start

### 1. Install

```bash
openclaw plugins install @sacheeperera/hippocampus
```

Zero config required for single-agent setups. The plugin activates immediately:
- HIPPOCAMPUS.md injected into every session
- Setup and graduation tools registered
- The `hippocampus-sync` companion skill available for cron

### 2. Set up the daily synthesis

Ask your agent:

> *"Set up hippocampus for me"*

The setup wizard scans your workspace, shows you what the synthesis will cover, and generates configuration. Works via Telegram, Slack, or any channel.

Or via CLI:

```bash
openclaw hippocampus setup
```

Or add the cron job directly:

```bash
openclaw cron add \
  --agent main \
  --schedule "0 4 * * *" \
  --name "hippocampus-sync" \
  --prompt "Run the hippocampus-sync skill"
```

### 3. Done

Your agent now wakes up every session with full rolling context.

---

## What Gets Synthesized

The daily synthesis produces these sections:

| Section | What it captures |
|---------|-----------------|
| **Top of Mind** | 3-5 highest-priority items, rewritten every sync |
| **Open Threads** | Active work streams, persists until resolved |
| **Commitments** | Who owes what to whom, with staleness flags |
| **Recent Sessions** | Rolling conversation log from the last 14 days |

You can add custom sections per agent (e.g., `cron_health` for a platform engineer, `pipeline_status` for a sales agent).

---

## Multi-Agent Setup

Running multiple agents? Configure each one's synthesis independently:

```json
{
  "plugins": {
    "entries": {
      "hippocampus": {
        "config": {
          "agents": {
            "cyclawps": {
              "domainFraming": "Platform-centric. Lead with system health and infrastructure state.",
              "sources": [
                {
                  "id": "health",
                  "path": "artifacts/reports/health-check/",
                  "label": "Health reports",
                  "whatToExtract": "System state, uptime, errors",
                  "windowed": true
                }
              ],
              "outputSections": ["top_of_mind", "open_threads", "commitments", "recent_sessions", "cron_health"]
            },
            "bobo": {
              "domainFraming": "Strategy-focused. Lead with pipeline health, client relationships, and decisions pending.",
              "sources": [
                { "id": "charter", "path": "CHARTER.md", "label": "Strategic charter", "whatToExtract": "Current priorities and goal progress", "windowed": false }
              ]
            }
          }
        }
      }
    }
  }
}
```

Agent sources are **additive** — `memory/` is always included. Additional sources are appended alongside it.

Each agent gets a `hippocampus-sync.config.md` companion file in their workspace — human-readable, directly editable — controlling domain framing, source tables, and output sections.

<details>
<summary><strong>Full configuration reference</strong></summary>

```json
{
  "plugins": {
    "entries": {
      "hippocampus": {
        "config": {
          "enabled": true,
          "rollingWindowDays": 14,
          "targetSizeChars": { "min": 3000, "max": 5000 },
          "contextInjection": {
            "enabled": true,
            "priority": 50,
            "excludeAgents": []
          },
          "synthesis": {
            "outputSections": ["top_of_mind", "open_threads", "commitments", "recent_sessions"],
            "domainFraming": "General-purpose working memory"
          },
          "graduation": {
            "enabled": true,
            "persistenceDaysThreshold": 14,
            "autoSuggest": true,
            "maxMemorySizeChars": 15000
          },
          "agents": {}
        }
      }
    }
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `rollingWindowDays` | 14 | Days of history the synthesis considers |
| `targetSizeChars` | 3000-5000 | Size budget for HIPPOCAMPUS.md |
| `contextInjection.priority` | 50 | Higher = earlier in context window |
| `contextInjection.excludeAgents` | [] | Agent IDs to skip injection for |
| `graduation.persistenceDaysThreshold` | 14 | Days a pattern must persist before suggesting graduation |
| `graduation.maxMemorySizeChars` | 15000 | Size guard for MEMORY.md |

</details>

---

## Agent Tools

| Tool | What it does |
|------|-------------|
| `hippocampus_setup` | Scans your workspace, previews what the synthesis will produce, and generates configuration. Works conversationally — just tell your agent *"set up hippocampus."* |
| `hippocampus_graduate` | Promotes a durable learning from the rolling synthesis to permanent MEMORY.md. Deduplicates automatically. |

---

## Coexistence

Hippocampus works alongside other OpenClaw plugins without conflict:

- **lossless-claw** — Hippocampus is not a context engine. It uses `before_prompt_build` hooks, which lossless-claw respects during context assembly.
- **memory-core** — Hippocampus writes standard markdown files. memory-core indexes them automatically.
- **Any plugin** — No conflicts. Reads and writes markdown in agent workspaces only.

---

## Development

```bash
git clone https://github.com/comicsansbestfont/hippocampus.git
cd hippocampus && npm install
npm test              # 47 tests
npx tsc --noEmit      # type check
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the contributor guide and [docs/TESTING.md](docs/TESTING.md) for end-to-end testing with a dev OpenClaw instance.

---

## Background

Built by [Sachee Perera](https://github.com/comicsansbestfont). Battle-tested on a 13-agent, 4-business-unit OpenClaw instance running in production.

The three-layer memory pattern emerged from running autonomous agents across GTM advisory, e-commerce, content, and platform engineering — where dropped context means dropped revenue.

## License

MIT
