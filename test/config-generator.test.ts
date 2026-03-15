import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateCompanionConfig } from "../src/setup/config-generator.js";
import type { AgentConfig } from "../src/config.js";

describe("generateCompanionConfig", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "hippocampus-configgen-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  const defaultConfig: AgentConfig = {
    enabled: true,
    rollingWindowDays: 14,
    targetSizeChars: { min: 3000, max: 5000 },
    sources: [
      { id: "memory", path: "memory/", label: "Session memory", whatToExtract: "Sessions, decisions, learnings", windowed: true },
    ],
    outputSections: ["top_of_mind", "open_threads", "commitments", "recent_sessions"],
  };

  it("generates a valid config file", () => {
    const { path, content } = generateCompanionConfig(
      workspaceDir,
      "billy",
      "Growth Ops Analyst",
      defaultConfig,
    );

    expect(path).toBe(join(workspaceDir, "hippocampus-sync.config.md"));
    expect(content).toContain("# Hippocampus Sync Configuration — billy");
    expect(content).toContain("Growth Ops Analyst");

    // Verify it was written to disk
    const fromDisk = readFileSync(path, "utf-8");
    expect(fromDisk).toBe(content);
  });

  it("includes domain framing when provided", () => {
    const config: AgentConfig = {
      ...defaultConfig,
      domainFraming: "Market-and-product-centric. Focus on review acquisition and SEO.",
    };
    const { content } = generateCompanionConfig(workspaceDir, "billy", "Growth Ops Analyst", config);
    expect(content).toContain("Market-and-product-centric");
  });

  it("uses default framing when not provided", () => {
    const { content } = generateCompanionConfig(workspaceDir, "billy", "Growth Ops Analyst", defaultConfig);
    expect(content).toContain("general-purpose working memory");
    expect(content).toContain("Growth Ops Analyst");
  });

  it("includes source table", () => {
    const config: AgentConfig = {
      ...defaultConfig,
      sources: [
        { id: "memory", path: "memory/", label: "Session memory", whatToExtract: "Sessions and decisions", windowed: true },
        { id: "charter", path: "CHARTER.md", label: "Strategic charter", whatToExtract: "Goals and priorities", windowed: false },
      ],
    };
    const { content } = generateCompanionConfig(workspaceDir, "billy", "Growth Ops Analyst", config);
    expect(content).toContain("Session memory");
    expect(content).toContain("`memory/`");
    expect(content).toContain("Strategic charter");
    expect(content).toContain("`CHARTER.md`");
    expect(content).toContain("Goals and priorities");
  });

  it("includes settings", () => {
    const { content } = generateCompanionConfig(workspaceDir, "billy", "Growth Ops Analyst", defaultConfig);
    expect(content).toContain("14 days");
    expect(content).toContain("3000–5000 characters");
  });

  it("includes output sections with descriptions", () => {
    const { content } = generateCompanionConfig(workspaceDir, "billy", "Growth Ops Analyst", defaultConfig);
    expect(content).toContain("Top Of Mind");
    expect(content).toContain("Open Threads");
    expect(content).toContain("Commitments");
    expect(content).toContain("Recent Sessions");
  });

  it("handles custom output sections", () => {
    const config: AgentConfig = {
      ...defaultConfig,
      outputSections: ["top_of_mind", "platform_health", "cron_health"],
    };
    const { content } = generateCompanionConfig(workspaceDir, "cyclawps", "Platform Engineer", config);
    expect(content).toContain("Platform Health");
    expect(content).toContain("Cron Health");
    expect(content).toContain("Custom Section Guidance");
  });
});
