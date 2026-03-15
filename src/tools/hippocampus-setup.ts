/**
 * Agent-callable setup tool — enables conversational onboarding.
 *
 * Uses `parameters` (not `inputSchema`) to match the OpenClaw tool API
 * contract used by lossless-claw and other plugins.
 */
import { discoverAgent, discoverAllAgents, buildPreview } from "../setup/wizard.js";
import { generateCompanionConfig } from "../setup/config-generator.js";
import type { DiscoveredAgent, SourceSelection, SynthesisPreview } from "../setup/wizard.js";
import { DEFAULT_OUTPUT_SECTIONS, KNOWN_OUTPUT_SECTIONS, resolveAgentConfig, type HippocampusConfig } from "../config.js";

export interface SetupToolContext {
  workspaceDir?: string;
  agentId?: string;
}

export interface SetupToolParams {
  action: "discover" | "discover_all" | "preview" | "activate";
  agentId?: string;
  workspaceDir?: string;
  instanceRoot?: string;
  additionalSources?: { id: string; path: string; label: string; whatToExtract?: string; windowed: boolean }[];
  domainFraming?: string;
  outputSections?: string[];
  cronSchedule?: string;
}

export interface SetupToolResult {
  action: string;
  discovery?: DiscoveredAgent;
  discoveries?: DiscoveredAgent[];
  preview?: SynthesisPreview;
  availableSections?: Record<string, string>;
  activation?: {
    success: boolean;
    configFilePath?: string;
    cronSetupInstructions?: string;
    message: string;
  };
  error?: { message: string };
}

/**
 * Create the hippocampus_setup tool definition for registerTool.
 */
export function createSetupTool(ctx: SetupToolContext, pluginConfig?: HippocampusConfig) {
  return {
    name: "hippocampus_setup",
    description:
      "Set up the Hippocampus plugin. " +
      "Use action='discover' to scan a single agent's workspace. " +
      "Use action='discover_all' with instanceRoot to scan all agents in an OpenClaw instance. " +
      "Use action='preview' to see what the hippocampus will produce. " +
      "Use action='activate' to generate the companion config file and get cron setup instructions. " +
      "If agentId and workspaceDir are omitted, defaults to the current agent.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["discover", "discover_all", "preview", "activate"],
          description: "The setup step to execute",
        },
        agentId: {
          type: "string",
          description: "The agent ID to set up (defaults to current agent)",
        },
        workspaceDir: {
          type: "string",
          description: "The agent's workspace directory path (defaults to current workspace)",
        },
        instanceRoot: {
          type: "string",
          description: "OpenClaw instance root (e.g., ~/.openclaw/) — required for discover_all",
        },
        additionalSources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              path: { type: "string" },
              label: { type: "string" },
              whatToExtract: { type: "string" },
              windowed: { type: "boolean" },
            },
            required: ["id", "path", "label"],
          },
          description: "Additional source directories/files for the synthesis to read",
        },
        domainFraming: {
          type: "string",
          description: "One-liner describing what matters most for this agent's role",
        },
        outputSections: {
          type: "array",
          items: { type: "string" },
          description: "Sections to include in HIPPOCAMPUS.md output",
        },
        cronSchedule: {
          type: "string",
          description: "Cron schedule for daily synthesis (default: '0 4 * * *')",
        },
      },
      required: ["action"],
    },
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const typedParams = params as unknown as SetupToolParams;
      const result = await executeSetup(typedParams, ctx, pluginConfig);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

async function executeSetup(
  params: SetupToolParams,
  ctx: SetupToolContext,
  pluginConfig?: HippocampusConfig,
): Promise<SetupToolResult> {
  const agentId = params.agentId ?? ctx.agentId;
  const workspaceDir = params.workspaceDir ?? ctx.workspaceDir;

  switch (params.action) {
    case "discover": {
      if (!agentId || !workspaceDir) {
        return {
          action: "discover",
          availableSections: KNOWN_OUTPUT_SECTIONS,
          error: {
            message: "agentId and workspaceDir are required for discovery. " +
              "If calling from your own session, these should be auto-detected.",
          },
        };
      }
      const discovery = discoverAgent(agentId, workspaceDir);
      return {
        action: "discover",
        discovery,
        availableSections: KNOWN_OUTPUT_SECTIONS,
      };
    }

    case "discover_all": {
      const instanceRoot = params.instanceRoot;
      if (!instanceRoot) {
        return {
          action: "discover_all",
          error: {
            message: "instanceRoot is required for discover_all (e.g., '~/.openclaw/')",
          },
        };
      }
      const discoveries = discoverAllAgents(instanceRoot);
      return {
        action: "discover_all",
        discoveries,
        availableSections: KNOWN_OUTPUT_SECTIONS,
      };
    }

    case "preview": {
      if (!agentId || !workspaceDir) {
        return {
          action: "preview",
          error: {
            message: "agentId and workspaceDir are required for preview",
          },
        };
      }
      const agent = discoverAgent(agentId, workspaceDir);
      const sourceSelection: SourceSelection = {
        agentId,
        additionalSources: (params.additionalSources ?? []).map((s) => ({
          ...s,
          windowed: s.windowed ?? true,
        })),
        domainFraming: params.domainFraming,
      };
      const preview = buildPreview(
        agent,
        sourceSelection,
        params.outputSections ?? DEFAULT_OUTPUT_SECTIONS,
        params.cronSchedule ?? "0 4 * * *",
      );
      return { action: "preview", preview };
    }

    case "activate": {
      if (!agentId || !workspaceDir) {
        return {
          action: "activate",
          error: {
            message: "agentId and workspaceDir are required for activation",
          },
        };
      }

      const agent = discoverAgent(agentId, workspaceDir);
      const resolvedConfig = pluginConfig
        ? resolveAgentConfig(pluginConfig, agentId)
        : {
            enabled: true,
            rollingWindowDays: 14,
            targetSizeChars: { min: 3000, max: 5000 },
            domainFraming: params.domainFraming,
            sources: [
              { id: "memory", path: "memory/", label: "Session memory", whatToExtract: "Sessions, decisions, learnings, commitments", windowed: true },
              ...(params.additionalSources ?? []).map((s) => ({
                ...s,
                windowed: s.windowed ?? true,
              })),
            ],
            outputSections: params.outputSections ?? DEFAULT_OUTPUT_SECTIONS,
            synthesisPrompt: undefined,
          };

      if (params.domainFraming) {
        resolvedConfig.domainFraming = params.domainFraming;
      }
      if (params.additionalSources && params.additionalSources.length > 0) {
        const hasMemory = resolvedConfig.sources.some((s) => s.id === "memory");
        const memorySources = hasMemory ? resolvedConfig.sources.filter((s) => s.id === "memory") : [{ id: "memory", path: "memory/", label: "Session memory", whatToExtract: "Sessions, decisions, learnings, commitments", windowed: true }];
        resolvedConfig.sources = [
          ...memorySources,
          ...params.additionalSources.map((s) => ({ ...s, windowed: s.windowed ?? true })),
        ];
      }
      if (params.outputSections) {
        resolvedConfig.outputSections = params.outputSections;
      }

      const { path: configPath } = generateCompanionConfig(
        workspaceDir,
        agentId,
        agent.role,
        resolvedConfig,
      );

      const schedule = params.cronSchedule ?? "0 4 * * *";
      const cronInstructions = [
        `To complete setup, create a cron job:`,
        ``,
        `  openclaw cron add \\`,
        `    --agent ${agentId} \\`,
        `    --schedule "${schedule}" \\`,
        `    --name "hippocampus-sync-${agentId}" \\`,
        `    --prompt "Run the hippocampus-sync skill"`,
      ].join("\n");

      return {
        action: "activate",
        activation: {
          success: true,
          configFilePath: configPath,
          cronSetupInstructions: cronInstructions,
          message: `Companion config written to ${configPath}. Create the cron job to start daily synthesis.`,
        },
      };
    }

    default:
      return {
        action: params.action,
        error: {
          message: `Unknown action: ${params.action}. Use 'discover', 'discover_all', 'preview', or 'activate'.`,
        },
      };
  }
}
