import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAgent, buildPreview } from "../src/setup/wizard.js";

describe("discoverAgent", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "hippocampus-wizard-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("discovers empty workspace", () => {
    const agent = discoverAgent("test", workspaceDir);
    expect(agent.agentId).toBe("test");
    expect(agent.role).toBe("Unknown role");
    expect(agent.directories).toEqual([]);
    expect(agent.rootFiles).toEqual([]);
    expect(agent.memoryFileCount).toBe(0);
    expect(agent.memoryFilesInWindow).toBe(0);
    expect(agent.hasExistingHippocampus).toBe(false);
    expect(agent.hasMemoryMd).toBe(false);
  });

  it("detects IDENTITY.md and extracts role", () => {
    writeFileSync(
      join(workspaceDir, "IDENTITY.md"),
      "# Agent Name\n\n**Role:** Platform Engineer\n**ID:** cyclawps\n",
    );
    const agent = discoverAgent("cyclawps", workspaceDir);
    expect(agent.role).toBe("Platform Engineer");
  });

  it("falls back to SOUL.md for role extraction", () => {
    writeFileSync(
      join(workspaceDir, "SOUL.md"),
      "# SOUL.md — Billy\n\n**Role:** Growth Ops Analyst\n",
    );
    const agent = discoverAgent("billy", workspaceDir);
    expect(agent.role).toBe("Growth Ops Analyst");
  });

  it("lists directories", () => {
    mkdirSync(join(workspaceDir, "memory"));
    mkdirSync(join(workspaceDir, "skills"));
    mkdirSync(join(workspaceDir, ".hidden"));

    const agent = discoverAgent("test", workspaceDir);
    const dirNames = agent.directories.map((d) => d.name);
    expect(dirNames).toContain("memory");
    expect(dirNames).toContain("skills");
    expect(dirNames).not.toContain(".hidden");
  });

  it("lists root .md files with size", () => {
    writeFileSync(join(workspaceDir, "SOUL.md"), "x".repeat(1024));
    writeFileSync(join(workspaceDir, "TOOLS.md"), "y".repeat(2048));
    writeFileSync(join(workspaceDir, "notes.txt"), "not markdown");

    const agent = discoverAgent("test", workspaceDir);
    const fileNames = agent.rootFiles.map((f) => f.name);
    expect(fileNames).toContain("SOUL.md");
    expect(fileNames).toContain("TOOLS.md");
    expect(fileNames).not.toContain("notes.txt");
    expect(agent.rootFiles.find((f) => f.name === "SOUL.md")!.sizeKb).toBeCloseTo(1.0, 0);
  });

  it("counts memory files correctly", () => {
    mkdirSync(join(workspaceDir, "memory"));

    const today = new Date();
    const recent = new Date(today);
    recent.setDate(recent.getDate() - 3);
    const old = new Date(today);
    old.setDate(old.getDate() - 20);

    const todayStr = today.toISOString().split("T")[0];
    const recentStr = recent.toISOString().split("T")[0];
    const oldStr = old.toISOString().split("T")[0];

    writeFileSync(join(workspaceDir, "memory", `${todayStr}.md`), "today");
    writeFileSync(join(workspaceDir, "memory", `${recentStr}-topic.md`), "recent");
    writeFileSync(join(workspaceDir, "memory", `${oldStr}.md`), "old");
    writeFileSync(join(workspaceDir, "memory", "README.md"), "not date-formatted");

    const agent = discoverAgent("test", workspaceDir, 14);
    expect(agent.memoryFileCount).toBe(3); // only date-formatted files
    expect(agent.memoryFilesInWindow).toBe(2); // today + recent
  });

  it("detects existing HIPPOCAMPUS.md and MEMORY.md", () => {
    writeFileSync(join(workspaceDir, "HIPPOCAMPUS.md"), "existing");
    writeFileSync(join(workspaceDir, "MEMORY.md"), "existing");

    const agent = discoverAgent("test", workspaceDir);
    expect(agent.hasExistingHippocampus).toBe(true);
    expect(agent.hasMemoryMd).toBe(true);
  });
});

describe("buildPreview", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "hippocampus-preview-"));
    mkdirSync(join(workspaceDir, "memory"));
    writeFileSync(join(workspaceDir, "memory", "2026-03-15.md"), "test");
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("includes memory/ when directory exists", () => {
    const agent = discoverAgent("test", workspaceDir);
    const preview = buildPreview(
      agent,
      { agentId: "test", additionalSources: [] },
      ["top_of_mind"],
      "0 4 * * *",
    );
    expect(preview.sources.some((s) => s.id === "memory")).toBe(true);
  });

  it("includes additional sources", () => {
    const agent = discoverAgent("test", workspaceDir);
    const preview = buildPreview(
      agent,
      {
        agentId: "test",
        additionalSources: [
          { id: "charter", path: "CHARTER.md", label: "Charter", windowed: false },
        ],
      },
      ["top_of_mind", "open_threads"],
      "0 4 * * *",
    );
    expect(preview.sources).toHaveLength(2);
    expect(preview.sources[1].id).toBe("charter");
    expect(preview.cronSchedule).toBe("0 4 * * *");
  });

  it("does not include memory/ when no memory dir exists", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "hippocampus-empty-"));
    const agent = discoverAgent("test", emptyDir);
    const preview = buildPreview(
      agent,
      { agentId: "test", additionalSources: [] },
      ["top_of_mind"],
      "0 4 * * *",
    );
    expect(preview.sources.some((s) => s.id === "memory")).toBe(false);
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
