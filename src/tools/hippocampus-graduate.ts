/**
 * Agent-callable graduation tool — promotes items from HIPPOCAMPUS.md
 * to permanent MEMORY.md.
 *
 * Uses `parameters` (not `inputSchema`) to match the OpenClaw tool API.
 */
import { graduateToMemory } from "../graduation.js";
import type { HippocampusConfig } from "../config.js";

export function createGraduateTool(config: HippocampusConfig) {
  return {
    name: "hippocampus_graduate",
    description:
      "Graduate a durable pattern or learning from HIPPOCAMPUS.md to permanent MEMORY.md. " +
      "Use when a piece of context has proven important across multiple sessions and should " +
      "be remembered permanently, not just within the rolling window.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The knowledge to graduate to permanent memory",
        },
        source: {
          type: "string",
          description: "Where this knowledge came from (default: 'hippocampus')",
        },
      },
      required: ["content"],
    },
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      ctx: { workspaceDir?: string },
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const workspaceDir = ctx.workspaceDir;
      if (!workspaceDir) {
        return {
          content: [{ type: "text", text: "Error: No workspace directory available." }],
        };
      }

      const result = graduateToMemory(workspaceDir, {
        content: params.content as string,
        source: params.source as string | undefined,
      }, config.graduation);

      return {
        content: [{ type: "text", text: result.message }],
      };
    },
  };
}
