/**
 * CLI commands for the Hippocampus plugin.
 *
 * Registered via api.registerCli(). Provides:
 *   - openclaw hippocampus status [--agent <id>]
 *   - openclaw hippocampus setup
 *   - openclaw hippocampus refresh [--agent <id>]
 *   - openclaw hippocampus graduate --agent <id> "<content>"
 *   - openclaw hippocampus sources [--agent <id>]
 */
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, resolveAgentConfig, KNOWN_OUTPUT_SECTIONS, type HippocampusConfig } from "../config.js";
import { discoverAgent, discoverAllAgents } from "../setup/wizard.js";
import { graduateToMemory } from "../graduation.js";

interface CliApi {
  config: unknown;
  logger: { info: (msg: string) => void };
}

/**
 * Register all hippocampus CLI commands.
 */
export function registerHippocampusCli(api: CliApi, config: HippocampusConfig) {
  return ({ program }: { program: { command: (...args: unknown[]) => unknown } }) => {
    const hippo = (program as { command: (name: string) => CmdChain }).command("hippocampus");

    // ── status ────────────────────────────────────────────────────────
    chainCommand(hippo, "status")
      .description("Show hippocampus status for one or all agents")
      .option("--agent <id>", "Specific agent ID")
      .option("--instance <path>", "OpenClaw instance root", "~/.openclaw")
      .action(async (opts: { agent?: string; instance: string }) => {
        const instanceRoot = resolvePath(opts.instance);

        if (opts.agent) {
          const agentConfig = resolveAgentWorkspace(instanceRoot, opts.agent);
          if (!agentConfig) {
            console.log(`Agent "${opts.agent}" not found in instance.`);
            return;
          }
          printAgentStatus(opts.agent, agentConfig.workspaceDir, config);
        } else {
          const agents = discoverAllAgents(instanceRoot);
          if (agents.length === 0) {
            console.log("No agents found. Specify --instance if not using ~/.openclaw");
            return;
          }
          console.log(`\nHippocampus Status — ${agents.length} agents\n`);
          for (const agent of agents) {
            printAgentStatus(agent.agentId, agent.workspaceDir, config);
          }
        }
      });

    // ── sources ───────────────────────────────────────────────────────
    chainCommand(hippo, "sources")
      .description("Show resolved sources for an agent")
      .option("--agent <id>", "Agent ID (required)")
      .option("--instance <path>", "OpenClaw instance root", "~/.openclaw")
      .action(async (opts: { agent?: string; instance: string }) => {
        if (!opts.agent) {
          console.log("--agent is required. Usage: openclaw hippocampus sources --agent <id>");
          return;
        }
        const agentCfg = resolveAgentConfig(config, opts.agent);
        console.log(`\nSources for ${opts.agent}:\n`);
        console.log("  #  ID              Path                                    Windowed  Extract");
        console.log("  ─  ──              ────                                    ────────  ───────");
        agentCfg.sources.forEach((s, i) => {
          const windowed = s.windowed !== false ? "yes" : "no";
          const extract = s.whatToExtract ?? "(default)";
          console.log(`  ${i + 1}  ${pad(s.id, 14)}  ${pad(s.path, 38)}  ${pad(windowed, 8)}  ${extract}`);
        });
        console.log(`\n  Rolling window: ${agentCfg.rollingWindowDays} days`);
        console.log(`  Target size: ${agentCfg.targetSizeChars.min}–${agentCfg.targetSizeChars.max} chars`);
        if (agentCfg.domainFraming) {
          console.log(`  Domain framing: ${agentCfg.domainFraming}`);
        }
        console.log();
      });

    // ── graduate ──────────────────────────────────────────────────────
    chainCommand(hippo, "graduate")
      .description("Graduate an item to permanent MEMORY.md")
      .option("--agent <id>", "Agent ID (required)")
      .option("--instance <path>", "OpenClaw instance root", "~/.openclaw")
      .argument("<content>", "The knowledge to graduate")
      .action(async (content: string, opts: { agent?: string; instance: string }) => {
        if (!opts.agent) {
          console.log("--agent is required. Usage: openclaw hippocampus graduate --agent <id> \"content\"");
          return;
        }
        const instanceRoot = resolvePath(opts.instance);
        const agentInfo = resolveAgentWorkspace(instanceRoot, opts.agent);
        if (!agentInfo) {
          console.log(`Agent "${opts.agent}" not found.`);
          return;
        }
        const result = graduateToMemory(agentInfo.workspaceDir, {
          content,
          source: "cli",
        }, config.graduation);
        console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      });
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Minimal type for commander-like chain
interface CmdChain {
  command: (name: string) => CmdChain;
  description: (desc: string) => CmdChain;
  option: (flags: string, desc: string, defaultVal?: string) => CmdChain;
  argument: (name: string, desc: string) => CmdChain;
  action: (fn: (...args: unknown[]) => void | Promise<void>) => CmdChain;
}

function chainCommand(parent: unknown, name: string): CmdChain {
  return (parent as CmdChain).command(name);
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return join(process.env.HOME ?? "", p.slice(2));
  }
  return p;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function resolveAgentWorkspace(
  instanceRoot: string,
  agentId: string,
): { workspaceDir: string } | undefined {
  const configPath = join(instanceRoot, "openclaw.json");
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const agentDef = raw?.agents?.list?.[agentId];
      if (agentDef?.workspaceDir) {
        const dir = resolvePath(agentDef.workspaceDir);
        if (existsSync(dir)) return { workspaceDir: dir };
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: scan common locations
  const candidates = [
    join(instanceRoot, "workspace"), // main agent
    join(instanceRoot, "agents", agentId, "workspace"),
  ];

  // Scan areas
  const areasDir = join(instanceRoot, "areas");
  if (existsSync(areasDir)) {
    try {
      for (const area of require("node:fs").readdirSync(areasDir, { withFileTypes: true })) {
        if (area.isDirectory()) {
          candidates.push(join(areasDir, area.name, "workspace"));
          candidates.push(join(areasDir, area.name, "agents", agentId, "workspace"));
        }
      }
    } catch {
      // Skip
    }
  }

  for (const dir of candidates) {
    if (existsSync(dir) && existsSync(join(dir, "SOUL.md")) || existsSync(join(dir, "IDENTITY.md"))) {
      return { workspaceDir: dir };
    }
  }

  return undefined;
}

function printAgentStatus(agentId: string, workspaceDir: string, config: HippocampusConfig): void {
  const hippocampusPath = join(workspaceDir, "HIPPOCAMPUS.md");
  const memoryMdPath = join(workspaceDir, "MEMORY.md");
  const agentCfg = resolveAgentConfig(config, agentId);

  const hasHippo = existsSync(hippocampusPath);
  const hasMemory = existsSync(memoryMdPath);

  let hippoAge = "—";
  let hippoSize = "—";
  if (hasHippo) {
    try {
      const stat = statSync(hippocampusPath);
      const ageMs = Date.now() - stat.mtimeMs;
      const ageHours = Math.round(ageMs / 1000 / 60 / 60);
      hippoAge = ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`;
      hippoSize = `${Math.round(stat.size / 1024 * 10) / 10}K`;
    } catch {
      // Skip
    }
  }

  const agent = discoverAgent(agentId, workspaceDir, agentCfg.rollingWindowDays);

  console.log(`  ${agentId}`);
  console.log(`    Role:          ${agent.role}`);
  console.log(`    HIPPOCAMPUS:   ${hasHippo ? `✓ ${hippoSize} (updated ${hippoAge})` : "✗ not yet created"}`);
  console.log(`    MEMORY.md:     ${hasMemory ? "✓" : "✗"}`);
  console.log(`    Memory files:  ${agent.memoryFilesInWindow} in window / ${agent.memoryFileCount} total`);
  console.log(`    Sources:       ${agentCfg.sources.length} configured`);
  console.log(`    Window:        ${agentCfg.rollingWindowDays}d`);
  console.log();
}
