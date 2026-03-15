/**
 * Setup wizard — dual-mode onboarding for Hippocampus.
 *
 * Works both as a CLI interactive wizard and as a step-based API
 * that agents can call conversationally. The same logic powers both.
 *
 * Flow:
 *   1. discover()      — scan a single agent workspace
 *   2. discoverAll()   — scan all agents in an OpenClaw instance
 *   3. configure()     — user selects sources per agent
 *   4. preview()       — show what the hippocampus will produce
 *   5. activate()      — write config + create cron jobs
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredAgent {
  agentId: string;
  role: string;
  workspaceDir: string;
  directories: DirectoryInfo[];
  rootFiles: FileInfo[];
  memoryFileCount: number;
  memoryFilesInWindow: number;
  hasExistingHippocampus: boolean;
  hasMemoryMd: boolean;
}

export interface DirectoryInfo {
  name: string;
  path: string;
  fileCount: number;
}

export interface FileInfo {
  name: string;
  path: string;
  sizeKb: number;
}

export interface SourceSelection {
  agentId: string;
  additionalSources: { id: string; path: string; label: string; whatToExtract?: string; windowed: boolean }[];
  domainFraming?: string;
}

export interface SynthesisPreview {
  agentId: string;
  role: string;
  sources: { id: string; path: string; label: string }[];
  outputSections: string[];
  estimatedSizeChars: number;
  cronSchedule: string;
}

export interface ActivationResult {
  agentId: string;
  configWritten: boolean;
  cronCreated: boolean;
  cronSchedule: string;
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * Scan an agent's workspace and return what exists.
 * No assumptions — just report what's there.
 */
export function discoverAgent(
  agentId: string,
  workspaceDir: string,
  rollingWindowDays: number = 14,
): DiscoveredAgent {
  const role = extractRole(workspaceDir);
  const directories = listDirectories(workspaceDir);
  const rootFiles = listRootFiles(workspaceDir);
  const { total, inWindow } = countMemoryFiles(workspaceDir, rollingWindowDays);

  return {
    agentId,
    role,
    workspaceDir,
    directories,
    rootFiles,
    memoryFileCount: total,
    memoryFilesInWindow: inWindow,
    hasExistingHippocampus: existsSync(join(workspaceDir, "HIPPOCAMPUS.md")),
    hasMemoryMd: existsSync(join(workspaceDir, "MEMORY.md")),
  };
}

/**
 * Discover all agents in an OpenClaw instance by reading openclaw.json
 * and scanning agent workspaces.
 */
export function discoverAllAgents(
  instanceRoot: string,
  rollingWindowDays: number = 14,
): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];

  // Try to read openclaw.json for registered agents
  const configPath = join(instanceRoot, "openclaw.json");
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const agentList = raw?.agents?.list;
      if (agentList && typeof agentList === "object") {
        for (const [agentId, agentDef] of Object.entries(agentList)) {
          const def = agentDef as Record<string, unknown>;
          const workspaceDir = typeof def.workspaceDir === "string"
            ? resolveHomePath(def.workspaceDir)
            : undefined;

          if (workspaceDir && existsSync(workspaceDir)) {
            agents.push(discoverAgent(agentId, workspaceDir, rollingWindowDays));
          }
        }
      }
    } catch {
      // Config unreadable — fall through to directory scanning
    }
  }

  // If config didn't yield agents, scan common directories
  if (agents.length === 0) {
    // Check workspace/ (main agent)
    const mainWorkspace = join(instanceRoot, "workspace");
    if (existsSync(mainWorkspace)) {
      agents.push(discoverAgent("main", mainWorkspace, rollingWindowDays));
    }

    // Check agents/*/ (cross-cutting agents)
    const agentsDir = join(instanceRoot, "agents");
    if (existsSync(agentsDir)) {
      scanAgentDirs(agentsDir, agents, rollingWindowDays);
    }

    // Check areas/*/ (BU agents)
    const areasDir = join(instanceRoot, "areas");
    if (existsSync(areasDir)) {
      try {
        for (const area of readdirSync(areasDir, { withFileTypes: true })) {
          if (!area.isDirectory()) continue;

          // Check area workspace (BU-level agent)
          const areaWorkspace = join(areasDir, area.name, "workspace");
          if (existsSync(areaWorkspace) && hasIdentityFiles(areaWorkspace)) {
            agents.push(discoverAgent(area.name, areaWorkspace, rollingWindowDays));
          }

          // Check area agents (per-agent workspaces)
          const areaAgentsDir = join(areasDir, area.name, "agents");
          if (existsSync(areaAgentsDir)) {
            scanAgentDirs(areaAgentsDir, agents, rollingWindowDays);
          }
        }
      } catch {
        // Permission issues — skip
      }
    }
  }

  return agents;
}

/**
 * Build a preview of what the synthesis will produce for an agent.
 */
export function buildPreview(
  agent: DiscoveredAgent,
  sourceSelection: SourceSelection,
  outputSections: string[],
  cronSchedule: string,
): SynthesisPreview {
  // Only include memory/ as default source if the agent actually has a memory/ dir
  const hasMemoryDir = agent.directories.some((d) => d.name === "memory");
  const defaultSources = hasMemoryDir
    ? [{ id: "memory", path: "memory/", label: `Session memory (${agent.memoryFilesInWindow} files in window)` }]
    : [];

  const sources = [
    ...defaultSources,
    ...sourceSelection.additionalSources.map((s) => ({
      id: s.id,
      path: s.path,
      label: s.label,
    })),
  ];

  const estimatedSizeChars = Math.min(
    5000,
    Math.max(2000, sources.length * 700 + outputSections.length * 400),
  );

  return {
    agentId: agent.agentId,
    role: agent.role,
    sources,
    outputSections,
    estimatedSizeChars,
    cronSchedule,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveHomePath(p: string): string {
  if (p.startsWith("~/")) {
    return join(process.env.HOME ?? "", p.slice(2));
  }
  return p;
}

function hasIdentityFiles(dir: string): boolean {
  return existsSync(join(dir, "SOUL.md")) || existsSync(join(dir, "IDENTITY.md"));
}

function scanAgentDirs(
  parentDir: string,
  agents: DiscoveredAgent[],
  rollingWindowDays: number,
): void {
  try {
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Check for workspace/ subdirectory
      const workspace = join(parentDir, entry.name, "workspace");
      if (existsSync(workspace) && hasIdentityFiles(workspace)) {
        agents.push(discoverAgent(entry.name, workspace, rollingWindowDays));
      }
    }
  } catch {
    // Permission issues — skip
  }
}

/**
 * Extract the agent's role from IDENTITY.md or SOUL.md.
 */
function extractRole(workspaceDir: string): string {
  for (const filename of ["IDENTITY.md", "SOUL.md"]) {
    const filePath = join(workspaceDir, filename);
    if (!existsSync(filePath)) continue;

    try {
      const content = readFileSync(filePath, "utf-8");

      const roleMatch = content.match(/\*\*Role:\*\*\s*(.+)/i)
        ?? content.match(/^##?\s+.*?[-–—]\s*(.+)/m)
        ?? content.match(/Role:\s*(.+)/i);

      if (roleMatch?.[1]) {
        return roleMatch[1].trim();
      }

      const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      if (lines.length > 0) {
        return lines[0].trim().substring(0, 100);
      }
    } catch {
      continue;
    }
  }

  return "Unknown role";
}

/**
 * List directories in the workspace root.
 */
function listDirectories(workspaceDir: string): DirectoryInfo[] {
  try {
    const entries = readdirSync(workspaceDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => {
        const dirPath = join(workspaceDir, e.name);
        let fileCount = 0;
        try {
          fileCount = readdirSync(dirPath).length;
        } catch {
          // Permission denied
        }
        return { name: e.name, path: dirPath, fileCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * List .md files in the workspace root.
 */
function listRootFiles(workspaceDir: string): FileInfo[] {
  try {
    const entries = readdirSync(workspaceDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("."))
      .map((e) => {
        const filePath = join(workspaceDir, e.name);
        let sizeKb = 0;
        try {
          sizeKb = Math.round(statSync(filePath).size / 1024 * 10) / 10;
        } catch {
          // Permission denied
        }
        return { name: e.name, path: filePath, sizeKb };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Count memory files total (date-formatted only) and within the rolling window.
 */
function countMemoryFiles(
  workspaceDir: string,
  windowDays: number,
): { total: number; inWindow: number } {
  const memoryDir = join(workspaceDir, "memory");
  if (!existsSync(memoryDir)) return { total: 0, inWindow: 0 };

  try {
    // Only count date-formatted .md files (YYYY-MM-DD*.md)
    const datePattern = /^(\d{4}-\d{2}-\d{2})/;
    const files = readdirSync(memoryDir)
      .filter((f) => f.endsWith(".md") && datePattern.test(f));
    const total = files.length;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const inWindow = files.filter((f) => {
      const dateMatch = f.match(datePattern);
      return dateMatch ? dateMatch[1] >= cutoffStr : false;
    }).length;

    return { total, inWindow };
  } catch {
    return { total: 0, inWindow: 0 };
  }
}
