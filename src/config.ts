/**
 * Hippocampus plugin configuration.
 *
 * Resolves per-agent config by merging agent-specific overrides
 * with top-level defaults. Single-agent setups work with zero config.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface HippocampusSource {
  id: string;
  path: string;
  label?: string;
  /** Guidance for the synthesis skill on what to look for in this source */
  whatToExtract?: string;
  /** If true, only files within the rolling window are read. Default: true */
  windowed?: boolean;
}

export interface TargetSize {
  min: number;
  max: number;
}

export interface SynthesisConfig {
  outputSections: string[];
  domainFraming?: string;
}

export interface GraduationConfig {
  enabled: boolean;
  persistenceDaysThreshold: number;
  autoSuggest: boolean;
  maxMemorySizeChars: number;
}

export interface ContextInjectionConfig {
  enabled: boolean;
  priority: number;
  excludeAgents: string[];
}

export interface AgentConfig {
  enabled: boolean;
  rollingWindowDays: number;
  targetSizeChars: TargetSize;
  domainFraming?: string;
  sources: HippocampusSource[];
  outputSections: string[];
  synthesisPrompt?: string;
}

export interface HippocampusConfig {
  enabled: boolean;
  rollingWindowDays: number;
  targetSizeChars: TargetSize;
  contextInjection: ContextInjectionConfig;
  synthesis: SynthesisConfig;
  agents: Record<string, Partial<AgentConfig>>;
  graduation: GraduationConfig;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_OUTPUT_SECTIONS = [
  "top_of_mind",
  "open_threads",
  "commitments",
  "recent_sessions",
];

export const KNOWN_OUTPUT_SECTIONS: Record<string, string> = {
  top_of_mind: "3-5 highest-priority items, rewritten fresh every sync",
  open_threads: "Active work streams, persist until explicitly resolved",
  commitments: "Owed actions in both directions, persist until checked off",
  recent_sessions: "Rolling table of conversations within the window",
};

const DEFAULT_SOURCES: HippocampusSource[] = [
  { id: "memory", path: "memory/", label: "Session memory", whatToExtract: "Sessions, decisions, learnings, commitments", windowed: true },
];

const DEFAULT_CONFIG: HippocampusConfig = {
  enabled: true,
  rollingWindowDays: 14,
  targetSizeChars: { min: 3000, max: 5000 },
  contextInjection: {
    enabled: true,
    priority: 50,
    excludeAgents: [],
  },
  synthesis: {
    outputSections: DEFAULT_OUTPUT_SECTIONS,
  },
  agents: {},
  graduation: {
    enabled: true,
    persistenceDaysThreshold: 14,
    autoSuggest: true,
    maxMemorySizeChars: 15000,
  },
};

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Parse raw plugin config into a resolved HippocampusConfig.
 * Missing fields fall back to defaults.
 */
export function resolveConfig(raw?: Record<string, unknown> | null): HippocampusConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    rollingWindowDays: resolveInt(raw.rollingWindowDays, DEFAULT_CONFIG.rollingWindowDays, 3, 90),
    targetSizeChars: resolveTargetSize(raw.targetSizeChars),
    contextInjection: resolveContextInjection(raw.contextInjection),
    synthesis: resolveSynthesis(raw.synthesis),
    agents: resolveAgentsMap(raw.agents),
    graduation: resolveGraduation(raw.graduation),
  };
}

/**
 * Resolve config for a specific agent by merging agent-level overrides
 * with top-level defaults. Agent sources are ADDITIVE — memory/ is always
 * included as the first source unless explicitly excluded.
 */
export function resolveAgentConfig(config: HippocampusConfig, agentId: string): AgentConfig {
  const agentOverride = config.agents[agentId] ?? {};

  // Agent sources are additive: always include memory/ as first source,
  // then add any agent-specific sources
  const agentSources = agentOverride.sources ?? [];
  const hasMemorySource = agentSources.some((s) => s.id === "memory");
  const mergedSources = hasMemorySource
    ? agentSources
    : [...DEFAULT_SOURCES, ...agentSources];

  return {
    enabled: agentOverride.enabled ?? config.enabled,
    rollingWindowDays: agentOverride.rollingWindowDays ?? config.rollingWindowDays,
    targetSizeChars: agentOverride.targetSizeChars ?? config.targetSizeChars,
    domainFraming: agentOverride.domainFraming ?? config.synthesis.domainFraming,
    sources: mergedSources,
    outputSections: agentOverride.outputSections ?? config.synthesis.outputSections,
    synthesisPrompt: agentOverride.synthesisPrompt,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function resolveTargetSize(value: unknown): TargetSize {
  const defaults = DEFAULT_CONFIG.targetSizeChars;
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  const min = typeof raw.min === "number" ? raw.min : defaults.min;
  const max = typeof raw.max === "number" ? raw.max : defaults.max;
  // Validate min <= max, fall back to defaults if invalid
  if (min > max) return defaults;
  return { min, max };
}

function resolveContextInjection(value: unknown): ContextInjectionConfig {
  const defaults = DEFAULT_CONFIG.contextInjection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    priority: typeof raw.priority === "number" ? raw.priority : defaults.priority,
    excludeAgents: Array.isArray(raw.excludeAgents) ? raw.excludeAgents.filter((s): s is string => typeof s === "string") : defaults.excludeAgents,
  };
}

function resolveSynthesis(value: unknown): SynthesisConfig {
  const defaults = DEFAULT_CONFIG.synthesis;
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    outputSections: Array.isArray(raw.outputSections) ? raw.outputSections.filter((s): s is string => typeof s === "string") : defaults.outputSections,
    domainFraming: typeof raw.domainFraming === "string" ? raw.domainFraming : undefined,
  };
}

function resolveAgentsMap(value: unknown): Record<string, Partial<AgentConfig>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: Record<string, Partial<AgentConfig>> = {};
  for (const [agentId, agentRaw] of Object.entries(raw)) {
    if (!agentRaw || typeof agentRaw !== "object" || Array.isArray(agentRaw)) continue;
    const a = agentRaw as Record<string, unknown>;
    result[agentId] = {
      ...(typeof a.enabled === "boolean" ? { enabled: a.enabled } : {}),
      ...(typeof a.rollingWindowDays === "number" ? { rollingWindowDays: a.rollingWindowDays } : {}),
      ...(a.targetSizeChars ? { targetSizeChars: resolveTargetSize(a.targetSizeChars) } : {}),
      ...(typeof a.domainFraming === "string" ? { domainFraming: a.domainFraming } : {}),
      ...(Array.isArray(a.sources) ? { sources: resolveSources(a.sources) } : {}),
      ...(Array.isArray(a.outputSections) ? { outputSections: a.outputSections.filter((s): s is string => typeof s === "string") } : {}),
      ...(typeof a.synthesisPrompt === "string" ? { synthesisPrompt: a.synthesisPrompt } : {}),
    };
  }
  return result;
}

function resolveSources(value: unknown[]): HippocampusSource[] {
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
    .filter((s) => typeof s.id === "string" && typeof s.path === "string")
    .map((s) => ({
      id: s.id as string,
      path: s.path as string,
      label: typeof s.label === "string" ? s.label : undefined,
      whatToExtract: typeof s.whatToExtract === "string" ? s.whatToExtract : undefined,
      windowed: typeof s.windowed === "boolean" ? s.windowed : true,
    }));
}

function resolveGraduation(value: unknown): GraduationConfig {
  const defaults = DEFAULT_CONFIG.graduation;
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    persistenceDaysThreshold: resolveInt(raw.persistenceDaysThreshold, defaults.persistenceDaysThreshold, 7, 60),
    autoSuggest: typeof raw.autoSuggest === "boolean" ? raw.autoSuggest : defaults.autoSuggest,
    maxMemorySizeChars: typeof raw.maxMemorySizeChars === "number" ? raw.maxMemorySizeChars : defaults.maxMemorySizeChars,
  };
}
