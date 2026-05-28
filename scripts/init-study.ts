#!/usr/bin/env -S npx tsx

/**
 * @fileoverview CLI scaffold for the `study/SKILL.md` skill that creates
 * timestamped `.studies/` folders with slug/title metadata and default appendix stubs.
 *
 * Accepts optional `--timestamp` overrides so agents can start evidence capture immediately.
 * Flow: parse args -> build directory tree -> write main study markdown -> write appendix stubs.
 *
 * @example
 * ```bash
 * npx tsx skills/study/scripts/init-study.ts --slug my-study --title "My Study"
 * ```
 *
 * @testing CLI: rerun `npm run file-overview-standards:target-brief -- --file skills/study/scripts/init-study.ts` from the repo root after editing this file.
 * @see skills/study/scripts/finalize-study.ts - Study finalizer that stages and optionally commits the scaffold created here.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Parsed CLI contract for `init-study`, including resolved paths and optional timestamp override.
 */
type CliArgs = {
  slug: string;
  title: string;
  root: string;
  timestamp?: string;
  dryRun: boolean;
};

const DEFAULT_APPENDIX_FILES = [
  "appendix-01-file-inventory.md",
  "appendix-02-references.md",
  "appendix-03-validation-and-tests.md",
  "appendix-04-log-excerpts.md",
  "appendix-05-charts-and-matrices.md",
] as const;

/**
 * Normalizes a study slug for stable folder and filename segments.
 *
 * @remarks Collapses non-alphanumeric runs to single hyphens and trims edge punctuation.
 */
function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Formats a local timestamp for study directory naming (`YYYY-MM-DD-HHmmss`).
 *
 * @remarks Uses the host timezone via `Date` getters; matches folder naming in this CLI.
 */
function formatTimestampLocal(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Parses `process.argv`-style tokens into structured CLI options.
 *
 * @remarks Throws when `--slug` is missing or empty after normalization. Title defaults from slug.
 */
function parseArgs(argv: string[]): CliArgs {
  const defaults = {
    root: process.cwd(),
    dryRun: false,
    slug: "",
    title: "",
  };

  const parsed = { ...defaults, timestamp: undefined as string | undefined };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (current === "--slug") {
      parsed.slug = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (current.startsWith("--slug=")) {
      parsed.slug = current.slice("--slug=".length);
      continue;
    }

    if (current === "--title") {
      parsed.title = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (current.startsWith("--title=")) {
      parsed.title = current.slice("--title=".length);
      continue;
    }

    if (current === "--root") {
      parsed.root = argv[i + 1] ?? defaults.root;
      i += 1;
      continue;
    }

    if (current.startsWith("--root=")) {
      parsed.root = current.slice("--root=".length);
      continue;
    }

    if (current === "--timestamp") {
      parsed.timestamp = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (current.startsWith("--timestamp=")) {
      parsed.timestamp = current.slice("--timestamp=".length);
    }
  }

  const normalizedSlug = normalizeSlug(parsed.slug);
  if (!normalizedSlug) {
    throw new Error("Missing required --slug value.");
  }

  const finalTitle =
    parsed.title.trim().length > 0
      ? parsed.title.trim()
      : `Study: ${normalizedSlug.replace(/-/g, " ")}`;

  return {
    slug: normalizedSlug,
    title: finalTitle,
    root: path.resolve(parsed.root),
    timestamp:
      parsed.timestamp && parsed.timestamp.trim().length > 0
        ? parsed.timestamp.trim()
        : undefined,
    dryRun: parsed.dryRun,
  };
}

/**
 * Generates the default markdown template for a new study, including YAML frontmatter and
 * section headings.
 */
function buildMainStudyContent(options: {
  title: string;
  slug: string;
  createdDate: string;
}): string {
  return `---
title: ${options.title}
slug: ${options.slug}
created_at: ${options.createdDate}
status: draft
---

# ${options.title}

## Objective

## Scope and Constraints

## Current State

## Option Set

## Tradeoff Analysis

## Recommendation

## Migration and Rollout Plan

## Risks and Mitigations

## Validation Strategy

## Open Questions

### Open Question 1: <short title>

- **Question:** <full unresolved question or decision statement>
- **Why It Is Open:** <what evidence, ambiguity, dependency, or constraint keeps this unresolved>
- **Options:**
  - **Option A:** <first viable answer>
  - **Option B:** <second viable answer>
- **Consequences By Option:**
  - **Option A:** <what follows if this answer is chosen>
  - **Option B:** <what follows if this answer is chosen>
- **Current Recommendation / Default:** <recommended path, or state that no safe default exists>
- **Blocking Impact:** <what is blocked until this is answered, and what can continue in parallel>

Repeat the subsection above for each unresolved question. If there are no unresolved questions, replace
this section with: \`No unresolved open questions.\`

## Post-Study Proposals

- \`DECIDE_OPEN_QUESTIONS\`: Resolve the remaining user-choice questions through \`decisions\` before implementation proceeds.
- \`WRITE_IMPLEMENTATION_PLAN\`: Write an executable implementation plan derived from the recommendation.
- \`DEEPEN_STUDY_FINDINGS\`: Deepen analysis in the most relevant findings-driven direction based on the study.
- \`RESEARCH_ONLINE_BEST_PRACTICES\`: Research online best practices, known solutions, and design patterns for this topic.

## Appendix Index

- appendix-01-file-inventory.md
- appendix-02-references.md
- appendix-03-validation-and-tests.md
- appendix-04-log-excerpts.md
- appendix-05-charts-and-matrices.md
`;
}

/**
 * Builds the initial markdown body for a numbered appendix stub file.
 *
 * @remarks Derives the H1 title from the basename by swapping hyphens for spaces.
 */
function buildAppendixContent(fileName: string): string {
  const appendixTitle = fileName.replace(/\.md$/, "").replace(/-/g, " ");

  return `# ${appendixTitle}

## Notes

`;
}

/**
 * Ensures a directory exists on disk, creating parents as needed.
 *
 * @remarks Synchronous `fs.mkdirSync` with `recursive: true`; no error when already present.
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Writes a file only when it does not already exist.
 *
 * @remarks Throws if the target path already exists to prevent accidental overwrites.
 */
function writeFileIfMissing(options: {
  filePath: string;
  content: string;
  dryRun: boolean;
}): void {
  if (fs.existsSync(options.filePath)) {
    throw new Error(`Refusing to overwrite existing file: ${options.filePath}`);
  }

  if (options.dryRun) {
    return;
  }

  fs.writeFileSync(options.filePath, options.content, "utf8");
}

/**
 * CLI entrypoint: scaffolds the study tree and emits JSON paths for downstream tooling.
 *
 * @remarks Refuses existing study folders and duplicate files; honors `--dry-run` for writes only.
 */
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const timestamp = args.timestamp ?? formatTimestampLocal(new Date());
  const studyDirName = `${timestamp}-${args.slug}`;
  const studiesRoot = path.join(args.root, ".studies");
  const studyDir = path.join(studiesRoot, studyDirName);
  const firecrawlDir = path.join(studyDir, "firecrawl");
  const firecrawlRawDir = path.join(firecrawlDir, "raw");
  const firecrawlReportsDir = path.join(firecrawlDir, "reports");
  const mainStudyPath = path.join(studyDir, `study-${args.slug}.md`);

  const dateOnly = timestamp.slice(0, 10);

  if (fs.existsSync(studyDir)) {
    throw new Error(`Study folder already exists: ${studyDir}`);
  }

  if (!args.dryRun) {
    ensureDir(studyDir);
    ensureDir(firecrawlRawDir);
    ensureDir(firecrawlReportsDir);
  }

  writeFileIfMissing({
    filePath: mainStudyPath,
    content: buildMainStudyContent({
      title: args.title,
      slug: args.slug,
      createdDate: dateOnly,
    }),
    dryRun: args.dryRun,
  });

  for (const appendixFile of DEFAULT_APPENDIX_FILES) {
    writeFileIfMissing({
      filePath: path.join(studyDir, appendixFile),
      content: buildAppendixContent(appendixFile),
      dryRun: args.dryRun,
    });
  }

  const output = {
    dryRun: args.dryRun,
    studiesRoot,
    studyDir,
    firecrawlDir,
    firecrawlRawDir,
    firecrawlReportsDir,
    mainStudyPath,
    appendixes: DEFAULT_APPENDIX_FILES.map((appendix) =>
      path.join(studyDir, appendix),
    ),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
