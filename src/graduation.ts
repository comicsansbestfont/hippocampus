/**
 * Graduation — promotes durable patterns from HIPPOCAMPUS.md to MEMORY.md.
 *
 * Items that persist in the hippocampus across multiple synthesis cycles
 * are candidates for permanent memory. Graduation appends to MEMORY.md
 * under a dedicated section with source reference and timestamp.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GraduationConfig } from "./config.js";

export interface GraduationEntry {
  content: string;
  source?: string;
  timestamp?: string;
}

const GRADUATION_SECTION = "## Graduated from Hippocampus";

/**
 * Graduate an item from hippocampus to permanent memory.
 * Appends to a dedicated section in MEMORY.md.
 */
export function graduateToMemory(
  workspaceDir: string,
  entry: GraduationEntry,
  graduationConfig?: GraduationConfig,
): { success: boolean; message: string } {
  const memoryPath = join(workspaceDir, "MEMORY.md");
  const timestamp = entry.timestamp ?? new Date().toISOString().split("T")[0];
  const source = entry.source ?? "hippocampus";
  const contentTrimmed = entry.content.trim();

  if (!contentTrimmed) {
    return { success: false, message: "Cannot graduate empty content." };
  }

  const formattedEntry = `- ${contentTrimmed} *(graduated ${timestamp} from ${source})*`;

  if (existsSync(memoryPath)) {
    const existing = readFileSync(memoryPath, "utf-8");

    // Size guard — warn if MEMORY.md is getting too large
    const maxSize = graduationConfig?.maxMemorySizeChars ?? 15000;
    if (existing.length > maxSize) {
      return {
        success: false,
        message: `MEMORY.md is ${existing.length} chars (limit: ${maxSize}). Review and prune before graduating more items.`,
      };
    }

    // Line-level duplicate check (not substring)
    const existingLines = existing.split("\n").map((l) => l.trim());
    if (existingLines.some((line) => line.includes(contentTrimmed))) {
      return {
        success: false,
        message: `Duplicate: "${contentTrimmed.substring(0, 60)}..." already exists in MEMORY.md`,
      };
    }

    // Append under the graduation section
    if (existing.includes(GRADUATION_SECTION)) {
      // Find the section and append after it
      const sectionIdx = existing.indexOf(GRADUATION_SECTION);
      const afterSection = existing.indexOf("\n", sectionIdx) + 1;
      const updated = existing.slice(0, afterSection) + formattedEntry + "\n" + existing.slice(afterSection);
      writeFileSync(memoryPath, updated, "utf-8");
    } else {
      // Add the section at the end
      const addition = `\n${GRADUATION_SECTION}\n${formattedEntry}\n`;
      writeFileSync(memoryPath, existing.trimEnd() + "\n" + addition, "utf-8");
    }
  } else {
    // Create MEMORY.md with a header and graduation section
    const content = [
      "# MEMORY.md",
      "",
      "> Permanent curated knowledge. Items graduated from HIPPOCAMPUS.md when patterns prove durable.",
      "",
      GRADUATION_SECTION,
      formattedEntry,
      "",
    ].join("\n");
    writeFileSync(memoryPath, content, "utf-8");
  }

  return {
    success: true,
    message: `Graduated to MEMORY.md: "${contentTrimmed.substring(0, 60)}..."`,
  };
}
