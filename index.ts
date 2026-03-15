/**
 * Hippocampus — Three-layer working memory plugin for OpenClaw.
 *
 * Gives agents a rolling 14-day context synthesis (HIPPOCAMPUS.md) that
 * bridges daily session notes and permanent curated memory. Agents wake
 * up knowing what's happening, what's blocked, and what's owed.
 *
 * Layers:
 *   1. Daily notes     — memory/YYYY-MM-DD.md (written by agents during sessions)
 *   2. HIPPOCAMPUS.md  — rolling synthesis (auto-generated daily by cron skill)
 *   3. MEMORY.md       — permanent knowledge (manually graduated from hippocampus)
 *
 * Integration points:
 *   - before_prompt_build hook: injects HIPPOCAMPUS.md into every session
 *   - hippocampus_setup tool: conversational onboarding wizard
 *   - hippocampus_graduate tool: promote items to permanent memory
 *   - hippocampus-sync skill: companion cron skill for daily synthesis
 *   - CLI: openclaw hippocampus status/sources/graduate
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig, type HippocampusConfig } from "./src/config.js";
import { createContextInjectionHandler } from "./src/context-injection.js";
import { createSetupTool } from "./src/tools/hippocampus-setup.js";
import { createGraduateTool } from "./src/tools/hippocampus-graduate.js";
import { registerHippocampusCli } from "./src/cli/hippocampus-cli.js";

const hippocampusPlugin = {
  id: "hippocampus",
  name: "Hippocampus",
  description:
    "Three-layer working memory: daily notes, rolling synthesis, permanent knowledge graduation",

  configSchema: {
    parse(value: unknown) {
      const raw =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return resolveConfig(raw);
    },
  },

  register(api: OpenClawPluginApi) {
    // Use api.pluginConfig — the SDK's parsed config from configSchema.parse()
    const config = (api as unknown as { pluginConfig?: unknown }).pluginConfig as HippocampusConfig | undefined
      ?? resolveConfig({});

    if (!config.enabled) {
      api.logger.info("[hippocampus] Plugin disabled via config");
      return;
    }

    // ── Hook: Inject HIPPOCAMPUS.md into every session ──────────────────
    const injectionHandler = createContextInjectionHandler(config, api.logger);
    api.on(
      "before_prompt_build",
      (event, ctx) => injectionHandler(event, ctx),
      { priority: config.contextInjection.priority },
    );

    // ── Tool: Setup wizard (conversational onboarding) ──────────────────
    api.registerTool((ctx) => createSetupTool({
      workspaceDir: ctx.workspaceDir,
      agentId: ctx.agentId,
    }, config));

    // ── Tool: Graduate to permanent memory ──────────────────────────────
    api.registerTool((ctx) => {
      const tool = createGraduateTool(config);
      return {
        ...tool,
        execute: async (_id: string, params: { content: string; source?: string }) =>
          tool.execute(_id, params, { workspaceDir: ctx.workspaceDir }),
      };
    });

    // ── CLI: openclaw hippocampus <subcommand> ──────────────────────────
    api.registerCli(
      registerHippocampusCli(api as unknown as { config: unknown; logger: { info: (msg: string) => void } }, config),
      { commands: ["hippocampus"] },
    );

    api.logger.info(
      `[hippocampus] Plugin loaded (injection=${config.contextInjection.enabled}, ` +
      `window=${config.rollingWindowDays}d, agents=${Object.keys(config.agents).length} configured)`,
    );
  },
};

export default hippocampusPlugin;
