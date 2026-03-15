import { describe, it, expect } from "vitest";
import { resolveConfig, resolveAgentConfig, DEFAULT_OUTPUT_SECTIONS } from "../src/config.js";

describe("resolveConfig", () => {
  it("produces valid defaults with empty input", () => {
    const config = resolveConfig({});
    expect(config.enabled).toBe(true);
    expect(config.rollingWindowDays).toBe(14);
    expect(config.targetSizeChars).toEqual({ min: 3000, max: 5000 });
    expect(config.contextInjection.enabled).toBe(true);
    expect(config.contextInjection.priority).toBe(50);
    expect(config.contextInjection.excludeAgents).toEqual([]);
    expect(config.synthesis.outputSections).toEqual(DEFAULT_OUTPUT_SECTIONS);
    expect(config.agents).toEqual({});
    expect(config.graduation.enabled).toBe(true);
    expect(config.graduation.persistenceDaysThreshold).toBe(14);
    expect(config.graduation.autoSuggest).toBe(true);
    expect(config.graduation.maxMemorySizeChars).toBe(15000);
  });

  it("produces valid defaults with undefined input", () => {
    const config = resolveConfig();
    expect(config.enabled).toBe(true);
    expect(config.rollingWindowDays).toBe(14);
  });

  it("respects overrides", () => {
    const config = resolveConfig({
      enabled: false,
      rollingWindowDays: 7,
      targetSizeChars: { min: 2000, max: 4000 },
    });
    expect(config.enabled).toBe(false);
    expect(config.rollingWindowDays).toBe(7);
    expect(config.targetSizeChars).toEqual({ min: 2000, max: 4000 });
  });

  it("clamps rollingWindowDays to valid range", () => {
    expect(resolveConfig({ rollingWindowDays: 1 }).rollingWindowDays).toBe(3);
    expect(resolveConfig({ rollingWindowDays: 200 }).rollingWindowDays).toBe(90);
    expect(resolveConfig({ rollingWindowDays: 30 }).rollingWindowDays).toBe(30);
  });

  it("rejects non-integer rollingWindowDays", () => {
    expect(resolveConfig({ rollingWindowDays: 7.5 }).rollingWindowDays).toBe(14);
    expect(resolveConfig({ rollingWindowDays: "7" }).rollingWindowDays).toBe(14);
  });

  it("falls back to defaults when targetSizeChars min > max", () => {
    const config = resolveConfig({ targetSizeChars: { min: 8000, max: 3000 } });
    expect(config.targetSizeChars).toEqual({ min: 3000, max: 5000 });
  });

  it("handles malformed targetSizeChars", () => {
    expect(resolveConfig({ targetSizeChars: "invalid" }).targetSizeChars).toEqual({ min: 3000, max: 5000 });
    expect(resolveConfig({ targetSizeChars: null }).targetSizeChars).toEqual({ min: 3000, max: 5000 });
    expect(resolveConfig({ targetSizeChars: [] }).targetSizeChars).toEqual({ min: 3000, max: 5000 });
  });

  it("parses contextInjection overrides", () => {
    const config = resolveConfig({
      contextInjection: {
        enabled: false,
        priority: 80,
        excludeAgents: ["steve", "kasun"],
      },
    });
    expect(config.contextInjection.enabled).toBe(false);
    expect(config.contextInjection.priority).toBe(80);
    expect(config.contextInjection.excludeAgents).toEqual(["steve", "kasun"]);
  });

  it("filters non-string excludeAgents", () => {
    const config = resolveConfig({
      contextInjection: { excludeAgents: ["valid", 123, null, "also-valid"] },
    });
    expect(config.contextInjection.excludeAgents).toEqual(["valid", "also-valid"]);
  });

  it("parses synthesis config", () => {
    const config = resolveConfig({
      synthesis: {
        outputSections: ["top_of_mind", "custom_section"],
        domainFraming: "Platform-centric analysis",
      },
    });
    expect(config.synthesis.outputSections).toEqual(["top_of_mind", "custom_section"]);
    expect(config.synthesis.domainFraming).toBe("Platform-centric analysis");
  });

  it("parses graduation config", () => {
    const config = resolveConfig({
      graduation: {
        enabled: false,
        persistenceDaysThreshold: 30,
        autoSuggest: false,
        maxMemorySizeChars: 20000,
      },
    });
    expect(config.graduation.enabled).toBe(false);
    expect(config.graduation.persistenceDaysThreshold).toBe(30);
    expect(config.graduation.autoSuggest).toBe(false);
    expect(config.graduation.maxMemorySizeChars).toBe(20000);
  });

  it("clamps graduation threshold", () => {
    expect(resolveConfig({ graduation: { persistenceDaysThreshold: 3 } }).graduation.persistenceDaysThreshold).toBe(7);
    expect(resolveConfig({ graduation: { persistenceDaysThreshold: 100 } }).graduation.persistenceDaysThreshold).toBe(60);
  });

  it("parses per-agent config", () => {
    const config = resolveConfig({
      agents: {
        cyclawps: {
          domainFraming: "Platform engineer",
          rollingWindowDays: 7,
          sources: [
            { id: "health", path: "reports/health/", label: "Health reports", windowed: true },
          ],
        },
      },
    });
    expect(config.agents.cyclawps).toBeDefined();
    expect(config.agents.cyclawps.domainFraming).toBe("Platform engineer");
    expect(config.agents.cyclawps.rollingWindowDays).toBe(7);
    expect(config.agents.cyclawps.sources).toHaveLength(1);
    expect(config.agents.cyclawps.sources![0].id).toBe("health");
  });

  it("filters malformed sources", () => {
    const config = resolveConfig({
      agents: {
        test: {
          sources: [
            { id: "valid", path: "/some/path" },
            { id: 123, path: "/bad" },
            { path: "/missing-id" },
            "not-an-object",
            null,
          ],
        },
      },
    });
    expect(config.agents.test.sources).toHaveLength(1);
    expect(config.agents.test.sources![0].id).toBe("valid");
  });

  it("parses whatToExtract on sources", () => {
    const config = resolveConfig({
      agents: {
        billy: {
          sources: [
            { id: "charter", path: "CHARTER.md", whatToExtract: "Strategic priorities" },
          ],
        },
      },
    });
    expect(config.agents.billy.sources![0].whatToExtract).toBe("Strategic priorities");
  });

  it("handles completely invalid input gracefully", () => {
    expect(() => resolveConfig(null as unknown as Record<string, unknown>)).not.toThrow();
    expect(() => resolveConfig(undefined as unknown as Record<string, unknown>)).not.toThrow();
    expect(() => resolveConfig(42 as unknown as Record<string, unknown>)).not.toThrow();
  });
});

describe("resolveAgentConfig", () => {
  const baseConfig = resolveConfig({
    rollingWindowDays: 14,
    synthesis: {
      outputSections: ["top_of_mind", "open_threads"],
      domainFraming: "General purpose",
    },
  });

  it("returns defaults for unknown agent", () => {
    const agent = resolveAgentConfig(baseConfig, "unknown");
    expect(agent.enabled).toBe(true);
    expect(agent.rollingWindowDays).toBe(14);
    expect(agent.domainFraming).toBe("General purpose");
    expect(agent.outputSections).toEqual(["top_of_mind", "open_threads"]);
    // Should include default memory/ source
    expect(agent.sources).toHaveLength(1);
    expect(agent.sources[0].id).toBe("memory");
  });

  it("merges agent overrides with defaults", () => {
    const config = resolveConfig({
      ...baseConfig,
      agents: {
        cyclawps: {
          rollingWindowDays: 7,
          domainFraming: "Platform-centric",
        },
      },
    });
    const agent = resolveAgentConfig(config, "cyclawps");
    expect(agent.rollingWindowDays).toBe(7);
    expect(agent.domainFraming).toBe("Platform-centric");
    // Non-overridden fields fall through
    expect(agent.enabled).toBe(true);
    expect(agent.outputSections).toEqual(["top_of_mind", "open_threads"]);
  });

  it("makes sources additive — memory/ always included", () => {
    const config = resolveConfig({
      agents: {
        billy: {
          sources: [
            { id: "charter", path: "CHARTER.md" },
          ],
        },
      },
    });
    const agent = resolveAgentConfig(config, "billy");
    // Should have memory/ + charter
    expect(agent.sources).toHaveLength(2);
    expect(agent.sources[0].id).toBe("memory");
    expect(agent.sources[1].id).toBe("charter");
  });

  it("does not duplicate memory/ if agent explicitly includes it", () => {
    const config = resolveConfig({
      agents: {
        billy: {
          sources: [
            { id: "memory", path: "memory/", label: "Custom memory" },
            { id: "charter", path: "CHARTER.md" },
          ],
        },
      },
    });
    const agent = resolveAgentConfig(config, "billy");
    expect(agent.sources).toHaveLength(2);
    expect(agent.sources[0].id).toBe("memory");
    expect(agent.sources[0].label).toBe("Custom memory");
  });
});
