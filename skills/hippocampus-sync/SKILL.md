---
name: hippocampus
description: Three-layer working memory for OpenClaw agents — daily notes → rolling synthesis → permanent knowledge. Plugin: github.com/comicsansbestfont/hippocampus
---

# Hippocampus Sync

Run daily via cron (recommended: 04:00 local time). Read the existing HIPPOCAMPUS.md, check source data for changes, and rewrite with a fresh synthesis.

HIPPOCAMPUS.md is your **working memory** — the rolling context layer that sits between raw daily notes (too granular) and permanent MEMORY.md (too compressed). It must be accurate, current, and within the configured size target.

## Step 0: Read Your Configuration

Check if `hippocampus-sync.config.md` exists in your workspace root. If it does, read it first — it contains your domain framing, source table, output sections, and writing quality guidance tailored to your role.

If no config file exists, use the defaults in this skill.

## Domain Framing

If your `hippocampus-sync.config.md` contains a domain framing section, follow it. It tells you what to optimise for — what matters most for your specific role.

If no framing exists, use this default:

> This is a general-purpose working memory synthesis. The primary question is: "What is this agent focused on, what's in flight, what's blocked, and what decisions are pending?"

## Step 1: Read Existing HIPPOCAMPUS.md

Read the current `HIPPOCAMPUS.md` in your workspace. This is your baseline — understand the current state, open threads, and commitments. If the file doesn't exist, you're seeding from scratch.

## Step 2: Read Source Data

Read your configured sources in order. Your `hippocampus-sync.config.md` contains the full source table with paths and extraction guidance.

**If no config file exists**, read these default sources:

| # | Source | Path | What to Extract |
|---|---|---|---|
| 1 | Existing HIPPOCAMPUS | `HIPPOCAMPUS.md` | Baseline: current threads, commitments, state |
| 2 | Session memory | `memory/YYYY-MM-DD*.md` | Sessions, decisions, learnings, commitments |

**How to determine the rolling window:** Calculate the date N days ago from today (default: 14 days). Only read files with date prefixes (`YYYY-MM-DD`) within that range. Use file names to filter — do not read every file in the directory.

**Date arithmetic:** Today's date minus the window days = the cutoff. For example, if today is 2026-03-15 and the window is 14 days, the cutoff is 2026-03-01. Read files with dates >= 2026-03-01.

**For each source, read in the order listed.** Earlier sources establish context; later sources update it. If two sources conflict on a factual claim, prefer the more recent one.

## Step 3: Rewrite Top of Mind

Rewrite this section **fresh every sync.** Do NOT carry forward yesterday's list — evaluate from scratch based on current source data.

Weight items by:
- **Impact**: How much does this affect the agent's primary mission?
- **Urgency**: Is there a deadline, time sensitivity, or aging decision?
- **Unresolved tension**: Is there a question asked but not answered? A decision someone owes?
- **Recency**: All else equal, more recent items rank higher.

Number them 1-5. Each item gets 1-2 lines: what it is, where it stands, what's unresolved or blocked.

**Every item must answer three questions: what is it, why does it matter, and what should happen next.**

## Step 4: Update Open Threads

Open threads **persist until explicitly resolved** — they are NOT subject to the rolling window. A thread started 20 days ago that's still active stays in the list.

For each thread: brief description, when it started, current state, next action needed.

Remove threads that are clearly resolved (completed, abandoned, or superseded).

## Step 5: Update Commitments

Track who owes what. Two categories:

**Commitments I owe:** things I committed to do. Mark `[x]` when done.

**Commitments owed to me:** things others (usually the operator) committed to decide or provide. Include days pending. Flag items over 14 days as stale.

Extract commitments from session memory — look for language like "I'll", "let's", "we need to", "you should", "please decide", "waiting on", action items, explicit requests, and implicit agreement.

## Step 6: Update Recent Sessions

A rolling table of conversations from within the window:

```
| Date | What Was Discussed | Key Outcome |
|---|---|---|
| Mar 15 | [topic] | [decision/action/unresolved] |
```

Keep entries to one line each. Drop entries older than the rolling window.

## Step 7: Write Updated HIPPOCAMPUS.md

Use the `write` tool to overwrite `HIPPOCAMPUS.md` in your workspace root with this structure:

```markdown
# HIPPOCAMPUS — [Your Name]
> [Window]-day rolling context. Updated daily or on demand.
> Last updated: YYYY-MM-DD HH:MM [timezone]

## Top of Mind
1. [item — what, why it matters, what's next]

## Open Threads
- [thread] — started [date] — [current state] — next: [action]

## Commitments
**I owe:**
- [ ] [commitment] — due [when]

**Owed to me:**
- [ ] [who] owes [what] — [N] days pending

## Recent Sessions ([window]d)
| Date | What Was Discussed | Key Outcome |
|---|---|---|
```

Your `hippocampus-sync.config.md` may specify additional sections beyond these four defaults. Include them in the order specified.

## Step 8: Verify

Re-read the written file and confirm:
- Top of Mind items reference real events from source data (no fabrication)
- Open Threads are genuinely unresolved (not items already completed)
- Commitments have actionable next steps and realistic timeframes
- Recent Sessions table has no entries older than the rolling window
- Total size is within the configured target (default: 3,000–5,000 characters)
- "Last updated" timestamp is accurate

If verification fails, fix the issue and rewrite.

## Writing Quality

The HIPPOCAMPUS must read like a briefing, not a log file. Every item should answer: **what is it, why does it matter, and what should happen next.**

**Good:**
> Migration is 3 days overdue — the operator committed to reviewing by Thursday. If no response by Friday, escalate to the weekly sync. The delay is blocking 2 downstream tasks.

**Bad:**
> Migration pending. Overdue.

**Anti-patterns to avoid:**
- Listing events without consequences ("3 sessions ran" — and what did they produce?)
- Generic next steps without triggers ("Monitor and follow up" — when? what triggers action?)
- Metrics without narrative ("14 memory files processed" — what changed as a result?)
- Treating all items with equal weight — significance weighting is the entire value of this document
- Vague references ("the project", "the issue") — use names, dates, and numbers

**Patterns to follow:**
- Name the consequence: what happens if this stays unresolved?
- Include conditional triggers: "if X by Y, then Z"
- Be specific with names, dates, and numbers
- State the recommendation, not just the situation

## Key Rules

1. **Never fabricate.** If a source doesn't mention something, don't invent it. "No data" is an acceptable entry.
2. **Top of Mind is rewritten every sync.** Don't carry forward — re-evaluate from current sources.
3. **Open Threads persist until resolved.** They survive beyond the rolling window.
4. **Commitments persist until checked off.** Stale commitments (14+ days) should be flagged explicitly.
5. **Stay within size budget.** Target the configured size range. If output exceeds the maximum, compress: shorter descriptions in Recent Sessions first, then Open Thread details. Never compress Top of Mind or Commitments.
6. **Timestamp the update.** Always include "Last updated" with date, time, and timezone.
7. **Be specific, not vague.** "Greg meeting rescheduled to Thursday" not "meeting rescheduled". Names, dates, numbers.

## Output

### HIPPOCAMPUS.md (primary output)
Overwrite `HIPPOCAMPUS.md` in workspace root using the `write` tool.

### Memory (optional)
If material changes detected (new threads, resolved items, significant state shifts), append a brief note to today's `memory/YYYY-MM-DD.md`:
```
## Hippocampus Sync
- [what changed since last sync]
```

### Channel Summary (if cron-delivered)
If this runs as a cron job with delivery, produce a 3-5 line summary of material changes only. If no material changes since last sync: reply with `NO_REPLY`.

---

## References

- [The Markdown](https://www.sachee.com.au/the-markdown) — Writing about agents, memory, and the operating layer
- [hippocampus.lovabo.com](https://hippocampus.lovabo.com) — Plugin homepage, docs, and gallery
- [GitHub](https://github.com/comicsansbestfont/hippocampus) — Source code and full plugin (npm: `@sacheeperera/hippocampus`)
