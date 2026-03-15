import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { graduateToMemory } from "../src/graduation.js";

describe("graduateToMemory", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "hippocampus-test-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates MEMORY.md with header when it does not exist", () => {
    const result = graduateToMemory(workspaceDir, {
      content: "Always validate JSON before replacing config",
    });
    expect(result.success).toBe(true);

    const content = readFileSync(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("# MEMORY.md");
    expect(content).toContain("## Graduated from Hippocampus");
    expect(content).toContain("Always validate JSON before replacing config");
    expect(content).toContain("*(graduated");
  });

  it("appends under graduation section when it exists", () => {
    const existing = [
      "# MEMORY.md",
      "",
      "## Some Existing Section",
      "- existing content",
      "",
      "## Graduated from Hippocampus",
      "- first item *(graduated 2026-03-01 from hippocampus)*",
      "",
    ].join("\n");
    writeFileSync(join(workspaceDir, "MEMORY.md"), existing);

    const result = graduateToMemory(workspaceDir, {
      content: "New graduated item",
    });
    expect(result.success).toBe(true);

    const content = readFileSync(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("New graduated item");
    expect(content).toContain("first item");
  });

  it("adds graduation section when MEMORY.md exists but lacks it", () => {
    writeFileSync(join(workspaceDir, "MEMORY.md"), "# MEMORY.md\n\n- some content\n");

    const result = graduateToMemory(workspaceDir, {
      content: "Graduated item",
    });
    expect(result.success).toBe(true);

    const content = readFileSync(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("## Graduated from Hippocampus");
    expect(content).toContain("Graduated item");
    expect(content).toContain("some content");
  });

  it("detects duplicate content (line-level match)", () => {
    writeFileSync(
      join(workspaceDir, "MEMORY.md"),
      "# MEMORY.md\n\n- Always validate JSON *(graduated 2026-03-01 from hippocampus)*\n",
    );

    const result = graduateToMemory(workspaceDir, {
      content: "Always validate JSON",
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate");
  });

  it("does not false-positive on partial substring matches", () => {
    writeFileSync(
      join(workspaceDir, "MEMORY.md"),
      "# MEMORY.md\n\n- Kasun manages marketing\n",
    );

    const result = graduateToMemory(workspaceDir, {
      content: "Kasun manages marketing campaigns across all channels",
    });
    // This should NOT match because the full content is different
    // The line-level check looks for the trimmed content within each line
    // "Kasun manages marketing campaigns across all channels" is NOT contained
    // in "- Kasun manages marketing"
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = graduateToMemory(workspaceDir, { content: "" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("rejects whitespace-only content", () => {
    const result = graduateToMemory(workspaceDir, { content: "   \n  " });
    expect(result.success).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("includes custom source in graduation entry", () => {
    const result = graduateToMemory(workspaceDir, {
      content: "Important learning",
      source: "manual review",
    });
    expect(result.success).toBe(true);

    const content = readFileSync(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("from manual review");
  });

  it("includes custom timestamp", () => {
    const result = graduateToMemory(workspaceDir, {
      content: "Dated item",
      timestamp: "2026-01-15",
    });
    expect(result.success).toBe(true);

    const content = readFileSync(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("graduated 2026-01-15");
  });

  it("enforces size guard", () => {
    const largeContent = "x".repeat(16000);
    writeFileSync(join(workspaceDir, "MEMORY.md"), largeContent);

    const result = graduateToMemory(
      workspaceDir,
      { content: "New item" },
      { enabled: true, persistenceDaysThreshold: 14, autoSuggest: true, maxMemorySizeChars: 15000 },
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("16000");
    expect(result.message).toContain("15000");
  });
});
