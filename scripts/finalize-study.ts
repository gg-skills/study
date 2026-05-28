#!/usr/bin/env -S npx tsx

/**
 * @fileoverview CLI finalizer for the `study/SKILL.md` skill that stages and
 * commits completed study directories under `.studies/`.
 *
 * Resolves `--latest` or an explicit study path, honors `--dry-run`, and shells to `git` for the
 * heavy lifting. Flow: resolve study path -> assert clean index -> stage study files -> commit ->
 * push.
 *
 * @example
 * ```bash
 * npx tsx skills/study/scripts/finalize-study.ts --latest
 * npx tsx skills/study/scripts/finalize-study.ts --study-dir 2026-04-30-my-study
 * ```
 *
 * @testing CLI: rerun `npm run file-overview-standards:target-brief -- --file skills/study/scripts/finalize-study.ts` from the repo root after editing this file.
 * @see skills/study/scripts/init-study.ts - Study scaffold command that creates the `.studies/` directories this finalizer publishes.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */


import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Parsed CLI flags for study selection, optional commit message override, and dry-run mode.
 */
type CliArgs = {
  studyDir?: string;
  latest: boolean;
  commitMessage?: string;
  dryRun: boolean;
};

/**
 * Parses argv for `--study-dir` or `--latest`, optional `--commit-message`, and `--dry-run`.
 *
 * @remarks Throws when neither `--study-dir` nor `--latest` yields a resolvable study target.
 */
function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {
    studyDir: undefined,
    latest: false,
    commitMessage: undefined,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (current === "--latest") {
      parsed.latest = true;
      continue;
    }

    if (current === "--study-dir") {
      parsed.studyDir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (current.startsWith("--study-dir=")) {
      parsed.studyDir = current.slice("--study-dir=".length);
      continue;
    }

    if (current === "--commit-message") {
      parsed.commitMessage = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (current.startsWith("--commit-message=")) {
      parsed.commitMessage = current.slice("--commit-message=".length);
    }
  }

  if (!parsed.latest && (!parsed.studyDir || parsed.studyDir.trim().length === 0)) {
    throw new Error("Provide --study-dir or use --latest.");
  }

  return parsed;
}

/**
 * Runs `git` with the given arguments under `cwd` and returns trimmed stdout.
 *
 * @remarks Subprocess uses shell-escaped args; non-zero exit throws via `execSync`.
 */
function runGitCommand(args: string[], cwd: string): string {
  return execSync(`git ${args.map(shellEscape).join(" ")}`, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Single-quotes a value for safe interpolation into a POSIX shell command string.
 */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Resolves the git repository root from the current working directory.
 */
function getRepoRoot(): string {
  return runGitCommand(["rev-parse", "--show-toplevel"], process.cwd());
}

/**
 * Lists immediate child directories under the studies root, sorted newest-first by name.
 *
 * @remarks Returns an empty list when the studies root path does not exist.
 */
function listStudyDirectories(studiesRoot: string): string[] {
  if (!fs.existsSync(studiesRoot)) {
    return [];
  }

  const entries = fs.readdirSync(studiesRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Resolves a study directory from `--latest` or an explicit path, validating it sits inside
 * `.studies/`.
 *
 * @remarks Throws if the path is outside `.studies/` or the directory does not exist.
 */
function resolveStudyPath(options: {
  repoRoot: string;
  studiesRoot: string;
  providedStudyDir?: string;
  latest: boolean;
}): { absolutePath: string; relativePath: string } {
  let relativePath = "";

  if (options.latest) {
    const candidates = listStudyDirectories(options.studiesRoot);
    if (candidates.length === 0) {
      throw new Error("No study directories found under .studies.");
    }
    relativePath = path.join(".studies", candidates[0]);
  } else {
    const provided = options.providedStudyDir ?? "";
    const normalized = provided.replace(/\\/g, "/");
    relativePath = normalized.startsWith("/")
      ? path.relative(options.repoRoot, normalized)
      : normalized;
  }

  const absolutePath = path.resolve(options.repoRoot, relativePath);
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedStudiesRoot = options.studiesRoot.replace(/\\/g, "/");

  if (!normalizedAbsolute.startsWith(`${normalizedStudiesRoot}/`)) {
    throw new Error("Study path must be inside .studies/.");
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Study directory not found: ${absolutePath}`);
  }

  return {
    absolutePath,
    relativePath: path.relative(options.repoRoot, absolutePath).replace(/\\/g, "/"),
  };
}

/**
 * Throws when the git index already contains staged changes.
 *
 * @remarks Prevents the finalizer from accidentally committing unrelated work-in-progress.
 */
function assertNoPreStagedChanges(repoRoot: string): void {
  const staged = runGitCommand(["diff", "--cached", "--name-only"], repoRoot)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (staged.length > 0) {
    throw new Error(
      "Refusing to finalize study because staged changes already exist. " +
        "Commit or unstage them first.",
    );
  }
}

/**
 * Orchestrates study finalization: resolve path, guard the index, stage/commit/push, emit JSON.
 *
 * @remarks When `dryRun` is set, skips `git add`/`commit`/`push` but still prints the outcome envelope.
 */
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  const studiesRoot = path.join(repoRoot, ".studies");
  const resolvedStudy = resolveStudyPath({
    repoRoot,
    studiesRoot,
    providedStudyDir: args.studyDir,
    latest: args.latest,
  });

  assertNoPreStagedChanges(repoRoot);

  const commitMessage =
    args.commitMessage && args.commitMessage.trim().length > 0
      ? args.commitMessage.trim()
      : `docs(study): publish ${path.basename(resolvedStudy.relativePath)}`;

  const branchName = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);

  if (!args.dryRun) {
    runGitCommand(["add", "--", resolvedStudy.relativePath], repoRoot);

    const stagedAfterAdd = runGitCommand(["diff", "--cached", "--name-only"], repoRoot)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (stagedAfterAdd.length === 0) {
      throw new Error("No study changes were staged. Nothing to commit.");
    }

    const hasOutsideScope = stagedAfterAdd.some(
      (filePath) =>
        !filePath.startsWith(`${resolvedStudy.relativePath}/`) &&
        filePath !== resolvedStudy.relativePath,
    );

    if (hasOutsideScope) {
      throw new Error("Staged files exceed study scope. Aborting commit.");
    }

    runGitCommand(["commit", "-m", commitMessage], repoRoot);
    runGitCommand(["push"], repoRoot);
  }

  const output = {
    dryRun: args.dryRun,
    repoRoot,
    branchName,
    studyDir: resolvedStudy.relativePath,
    commitMessage,
    pushed: !args.dryRun,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
