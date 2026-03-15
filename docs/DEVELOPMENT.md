# Development Guide

Hippocampus is a plugin for [OpenClaw](https://github.com/openclaw/openclaw) that gives agents rolling context synthesis. If you're here, you're either contributing or building your own OpenClaw plugin — either way, this guide covers the architecture, patterns, and gotchas.

## Project Structure

```
hippocampus/
├── index.ts                           # Plugin entry — hooks, tools, CLI registration
├── package.json                       # npm package config
├── openclaw.plugin.json               # Plugin manifest (config schema, UI hints, skill paths)
├── tsconfig.json
├── src/
│   ├── config.ts                      # Config types, defaults, resolution (zero-config + per-agent)
│   ├── context-injection.ts           # before_prompt_build hook (mtime-cached file reads)
│   ├── graduation.ts                  # MEMORY.md promotion (section-aware, dedup, size guard)
│   ├── cli/
│   │   └── hippocampus-cli.ts         # CLI: status, sources, graduate
│   ├── setup/
│   │   ├── wizard.ts                  # Agent/instance discovery + preview logic
│   │   └── config-generator.ts        # Generates hippocampus-sync.config.md per agent
│   └── tools/
│       ├── hippocampus-setup.ts       # Agent tool: discover → preview → activate
│       └── hippocampus-graduate.ts    # Agent tool: promote to MEMORY.md
├── skills/
│   └── hippocampus-sync/
│       └── SKILL.md                   # Companion cron skill (8-step synthesis)
├── test/                              # Vitest test suite
└── docs/                              # Development and testing docs
```

## Key Design Decisions

### Hippocampus is NOT a ContextEngine

It uses `before_prompt_build` hooks to inject content, NOT `registerContextEngine()`. This means it works alongside lossless-claw or any other context engine without conflict.

### Config resolution uses api.pluginConfig

Following the lossless-claw pattern, `register()` reads config from `api.pluginConfig` (the SDK's parsed output from `configSchema.parse()`), not from manual traversal of `api.config.plugins.entries`.

### Sources are additive

When an agent specifies custom sources, `memory/` is always included as the first source unless the agent explicitly defines a source with `id: "memory"`. This prevents users from accidentally losing their primary data source.

### The synthesis is an LLM skill, not deterministic code

The `hippocampus-sync` companion skill is a markdown file that the LLM follows as instructions. The plugin's job is to make sources available and configuration accessible — the LLM does the actual synthesis. This is the same pattern used across all OpenClaw cron skills.

### Companion config file pattern

Per-agent configuration (domain framing, source table, output sections) is rendered into `hippocampus-sync.config.md` in the agent's workspace. The skill reads this file at Step 0. This avoids template engines, works with OpenClaw's existing skill resolution, and is human-editable.

## Local Development

### Setup

```bash
git clone https://github.com/comicsansbestfont/hippocampus.git
cd hippocampus
npm install
```

### Running tests

```bash
npm test                    # Run all 47 tests
npx vitest --watch          # Watch mode
npx vitest run test/config  # Run specific suite
```

### Type checking

```bash
npx tsc --noEmit
```

### Linking to a dev OpenClaw instance

```bash
openclaw --dev plugins install --link /path/to/hippocampus
openclaw --dev gateway run
```

See [TESTING.md](./TESTING.md) for full end-to-end test instructions.

### Making changes

1. Edit source files
2. Run `npm test` to verify
3. Restart the dev gateway (`Ctrl+C` then `openclaw --dev gateway run`) — the `--link` flag means it reads your source directly

## Adding a New Output Section

1. Add the section ID and description to `KNOWN_OUTPUT_SECTIONS` in `src/config.ts`
2. Add handling guidance in `skills/hippocampus-sync/SKILL.md` under the output template
3. Update the config generator in `src/setup/config-generator.ts` if the section needs special rendering

## Adding a New Tool

1. Create `src/tools/hippocampus-<name>.ts` following the pattern in existing tools
2. Export a `create<Name>Tool()` factory function
3. Register in `index.ts` via `api.registerTool((ctx) => create<Name>Tool(...))`
4. Add tests in `test/<name>.test.ts`

## Publishing

```bash
# Verify everything passes
npm test
npx tsc --noEmit

# Dry run
npm pack --dry-run

# Publish
npm publish
```
