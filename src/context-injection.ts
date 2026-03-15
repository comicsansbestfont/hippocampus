/**
 * Context injection — loads HIPPOCAMPUS.md into every agent session
 * via the before_prompt_build hook.
 *
 * Two modes:
 *   1. Normal: HIPPOCAMPUS.md exists → inject it as prependSystemContext
 *   2. First run: No HIPPOCAMPUS.md → inject onboarding hint so the agent
 *      introduces itself and offers to run setup
 *
 * Uses prependSystemContext for provider prompt caching benefits.
 * Includes stat-based file cache to avoid redundant reads.
 */
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { HippocampusConfig } from "./config.js";

export interface ContextInjectionContext {
  workspaceDir?: string;
  agentId?: string;
  sessionKey?: string;
}

// Per-workspace file cache to avoid redundant reads
const fileCache = new Map<string, { content: string; mtimeMs: number }>();

// Track which workspaces have shown the onboarding hint this session
// (so we don't repeat it on every turn within the SAME session, but DO show it on new sessions)
const onboardingShownThisSession = new Set<string>();

const ONBOARDING_HINT = `
[HIPPOCAMPUS PLUGIN — SETUP REQUIRED]

IMPORTANT: The Hippocampus working memory plugin is installed but not configured yet. You MUST mention this to the user in your first response.

Tell the user:
"I have the Hippocampus working memory plugin installed. It gives me a rolling context summary so I wake up each session already knowing what's happening. It's not set up yet — would you like me to run the setup? I'll scan your workspace and show you what it will do."

If they agree, call the hippocampus_setup tool with action "discover" to scan their workspace.
`.trim();

/**
 * Build the before_prompt_build handler that injects HIPPOCAMPUS.md
 * or an onboarding hint on first run.
 */
export function createContextInjectionHandler(config: HippocampusConfig, logger?: { info: (msg: string) => void }) {
  return (
    _event: unknown,
    ctx: ContextInjectionContext,
  ): { prependSystemContext?: string } | undefined => {
    if (!config.contextInjection.enabled) return undefined;

    const workspaceDir = ctx.workspaceDir;
    logger?.info(`[hippocampus] before_prompt_build fired — workspaceDir=${workspaceDir ?? "UNDEFINED"}, agentId=${ctx.agentId ?? "UNDEFINED"}, ctx keys: ${Object.keys(ctx as Record<string, unknown>).join(", ")}`);
    if (!workspaceDir) return undefined;

    // Check agent exclusion
    const agentId = ctx.agentId ?? "";
    if (config.contextInjection.excludeAgents.includes(agentId)) {
      return undefined;
    }

    const hippocampusPath = join(workspaceDir, "HIPPOCAMPUS.md");

    // Try to read existing HIPPOCAMPUS.md (with mtime cache)
    try {
      const stat = statSync(hippocampusPath);
      const cached = fileCache.get(hippocampusPath);

      if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.content ? { prependSystemContext: cached.content } : undefined;
      }

      const content = readFileSync(hippocampusPath, "utf-8").trim();
      fileCache.set(hippocampusPath, { content, mtimeMs: stat.mtimeMs });

      if (!content) {
        // File exists but is empty — treat as first run
        return injectOnboardingHint(workspaceDir, ctx.sessionKey);
      }

      // Clear onboarding flag once hippocampus exists
      onboardingShownThisSession.delete(workspaceDir);
      return { prependSystemContext: content };
    } catch {
      // File doesn't exist — first run, inject onboarding hint
      const hint = injectOnboardingHint(workspaceDir, ctx.sessionKey);
      logger?.info(`[hippocampus] No HIPPOCAMPUS.md found — onboarding hint ${hint ? "INJECTED" : "SKIPPED (already shown this session)"}`);
      return hint;
    }
  };
}

function injectOnboardingHint(
  workspaceDir: string,
  sessionKey?: string,
): { prependSystemContext: string } | undefined {
  // Track by workspace+session so we don't repeat within the same session
  // but DO show on each new session until setup is complete
  const key = `${workspaceDir}:${sessionKey ?? "unknown"}`;
  if (onboardingShownThisSession.has(key)) {
    return undefined;
  }
  onboardingShownThisSession.add(key);
  return { prependSystemContext: ONBOARDING_HINT };
}
