#!/usr/bin/env npx tsx

/**
 * @fileoverview CLI entrypoint that scores a `.studies/` study folder's primary `study-*.md` file against the 16-item Study Quality checklist and prints a human-readable report or JSON envelope.
 *
 * This file owns argv parsing, lexically-latest study discovery under `.studies` for `--latest`, regex and structural heuristics per checklist row, weighted scoring with required-only finalization gating, and stdout/stderr output with non-zero `process.exit` on missing paths or read failures.
 * Flow: parse flags -> resolve study directory -> read `study-*.md` -> derive metadata and per-item checks -> emit plain text or `--json`.
 *
 * @testing CLI: npx tsx skills/study/scripts/check-study-completeness.ts --latest
 * @testing CLI: npx tsx skills/study/scripts/check-study-completeness.ts --study .studies/2026-05-22-example-study/ --json
 * @testing CLI manual: from repo root, run `--latest --json`, open the markdown under JSON `metadata.path`, and confirm each `checklist[].checked` value matches visible sections before trusting `canFinalize` for handoff to finalize tooling.
 *
 * @see skills/study/scripts/finalize-study.ts - Companion finalize script suggested in success output once required checklist rows pass and the study is ready to close out.
 * @see skills/study/SKILL.md - study skill guidance defining study artifacts, checklist intent, and downstream routing expectations this checker automates.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository file-overview contract governing audited `@fileoverview`, `@testing`, `@see`, and `@documentation` metadata on TypeScript scripts.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename, dirname } from "path";
import { argv } from "process";

// ============================================================================
// Types
// ============================================================================

/**
 * One row in the 16-item Study Quality checklist used for weighted scoring.
 *
 * @remarks
 * `required` gates finalization; `weight` contributes to aggregate and required-only subtotals.
 */
interface ChecklistItem {
  number: number;
  name: string;
  description: string;
  required: boolean;
  checked: boolean;
  weight: number;
}

/**
 * Parsed display metadata tying a study folder to its title and routing slug.
 *
 * @remarks
 * `tier` here is a headline heuristic from `guessTier`; report output may re-tier from scores.
 */
interface StudyMetadata {
  title: string;
  path: string;
  slug: string;
  tier: string;
}

/**
 * Full scoring envelope returned for JSON output and mirrored in human-readable reports.
 *
 * @remarks
 * `canFinalize` compares required-item weights only; optional checklist rows do not block it.
 */
interface CompletenessReport {
  metadata: StudyMetadata;
  checklist: ChecklistItem[];
  score: number;
  maxScore: number;
  tier: string;
  canFinalize: boolean;
}

// ============================================================================
// Checklist Definition
// ============================================================================

const CHECKLIST_ITEMS: Omit<ChecklistItem, "checked">[] = [
  { number: 1, name: "Objective clarity", description: "One clear decision or problem statement", required: true, weight: 2 },
  { number: 2, name: "Scope boundaries", description: "In-scope and out-of-scope listed", required: true, weight: 2 },
  { number: 3, name: "Current state documented", description: "Existing architecture/behavior with file paths", required: true, weight: 2 },
  { number: 4, name: "Option set complete", description: "At least two viable options when feasible", required: true, weight: 2 },
  { number: 5, name: "Tradeoffs quantified", description: "Each tradeoff has complexity/risk/cost/timeline impact", required: true, weight: 2 },
  { number: 6, name: "Recommendation grounded", description: "Chosen option has explicit evidence backing", required: true, weight: 2 },
  { number: 7, name: "Evidence anchored", description: "Every claim has file paths, commands, or test results", required: true, weight: 2 },
  { number: 8, name: "Migration plan exists", description: "Phase sequence, compatibility strategy, fallback", required: true, weight: 1 },
  { number: 9, name: "Risks documented", description: "Failure modes with safeguards or mitigations", required: true, weight: 1 },
  { number: 10, name: "Validation strategy", description: "Commands, tests, expected pass/fail signals", required: true, weight: 1 },
  { number: 11, name: "Open questions decision-ready", description: "Each has options, consequences, blocking impact", required: true, weight: 2 },
  { number: 12, name: "Post-study proposals", description: "At least 3 context-adapted SCREAMING_SNAKE_CASE actions", required: true, weight: 2 },
  { number: 13, name: "Cross-skill routing", description: "Next skill identified and outputs prepared", required: false, weight: 1 },
  { number: 14, name: "Appendixes complete", description: "File inventory, references, validation outputs", required: false, weight: 1 },
  { number: 15, name: "No contradictions", description: "Options, tradeoffs, recommendation internally consistent", required: true, weight: 1 },
  { number: 16, name: "Published", description: "Study folder committed and pushed", required: true, weight: 1 },
];

// ============================================================================
// Parser
// ============================================================================

/**
 * Derives title, slug, and heuristic study tier from markdown body and study directory path.
 *
 * @remarks
 * `PURITY:` String parsing only; does not read the filesystem beyond interpreting `studyPath` text.
 */
function extractMetadata(content: string, studyPath: string): StudyMetadata {
  const titleMatch = content.match(/^#\s+Study:\s*(.+)/m);
  const slugMatch = studyPath.match(/\.studies\/[\d-]+-(.+?)\//);
  
  return {
    title: titleMatch?.[1]?.trim() || "Untitled Study",
    path: studyPath,
    slug: slugMatch?.[1]?.trim() || basename(dirname(studyPath)),
    tier: guessTier(content),
  };
}

/**
 * Classifies rough study depth from word count and presence of appendix, risk, and migration cues.
 *
 * @remarks
 * `PURITY:` Heuristic over `content` only; independent of checklist-weighted tier in `checkStudy`.
 */
function guessTier(content: string): string {
  const wordCount = content.split(/\s+/).length;
  const hasAppendixes = /appendix|##\s+Appendix/i.test(content);
  const hasRisks = /##\s+Risks|Risks.*and.*Mitigations/i.test(content);
  const hasMigration = /##\s+Migration|Migration.*Plan/i.test(content);
  
  if (wordCount > 3000 && hasAppendixes && hasRisks && hasMigration) return "Deep";
  if (wordCount > 1000) return "Standard";
  return "Minimal";
}

/**
 * Applies checklist-specific regex and structural heuristics to the study markdown body.
 *
 * @remarks
 * Item 16 is always treated unchecked here because publish state is not verified in this pass.
 */
function checkItem(content: string, item: Omit<ChecklistItem, "checked">): boolean {
  switch (item.number) {
    case 1: return /^#.*Study:.*\n/m.test(content) && content.match(/^#.*Study:.*\n/m)?.[0].length > 10;
    case 2: return /##\s*Scope|Scope.*Constraints|In-scope.*Out-of-scope/s.test(content);
    case 3: return /##\s*Current\s+State|Current\s+State|Current\s+Architecture/s.test(content);
    case 4: return /##\s*Option|Option\s+Set|\n-.*Option|\n\*{1,2}.*Option/im.test(content);
    case 5: return /##\s*Tradeoff|Tradeoff.*Analysis|complexity|risk|migration\s+cost/i.test(content);
    case 6: return /##\s*Recommendation|Recommendation.*why|Chosen.*option/i.test(content);
    case 7: return /\.\w+\/|`[^`]+`|\w+\.\w{2,4}/.test(content) && !/example\.com/i.test(content);
    case 8: return /##\s*Migration|Migration.*Plan|Phase.*sequence|fallback/i.test(content);
    case 9: return /##\s*Risks|Risks.*Mitigations|failure\s+modes/i.test(content);
    case 10: return /##\s*Validation|Validation.*Strategy|test.*command|expected.*pass/i.test(content);
    case 11: return /##\s*Open\s+Questions|open.*question|blocking.*impact/i.test(content);
    case 12: return /[A-Z_]+_|\n-.*[A-Z_]+/.test(content);
    case 13: return /plan|decisions|step-by-step|research-online|explain/i.test(content);
    case 14: return /appendix|##\s+Appendix|appendix-0\d-|file.*inventory/i.test(content);
    case 15: return !/contradict|inconsisten/i.test(content) || !content.includes("CONTRADICTION");
    case 16: return false; // Assumed not committed yet
    default: return false;
  }
}

// ============================================================================
// Main
// ============================================================================

/**
 * Locates the lexically latest study directory under `.studies` that contains a `study-*.md` file.
 *
 * @remarks
 * `I/O:` Synchronous reads of `.studies` and immediate children; returns null on missing access.
 */
function findLatestStudy(): string | null {
  try {
    const studiesDir = ".studies";
    const dirs = readdirSync(studiesDir)
      .filter(d => statSync(join(studiesDir, d)).isDirectory())
      .sort()
      .reverse();
    
    for (const dir of dirs) {
      const studyFile = join(studiesDir, dir, readdirSync(join(studiesDir, dir))
        .find(f => f.startsWith("study-") && f.endsWith(".md")));
      if (studyFile) return dirname(studyFile);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Loads the primary study markdown, scores checklist coverage, and prints JSON or CLI output.
 *
 * @remarks
 * `I/O:` Reads study files from disk, writes to stdout/stderr, and calls `process.exit` on failure.
 */
function checkStudy(studyPath: string, json: boolean = false): void {
  try {
    const mainStudyFile = join(studyPath, readdirSync(studyPath)
      .find(f => f.startsWith("study-") && f.endsWith(".md")));
    
    if (!mainStudyFile || !existsSync(mainStudyFile)) {
      console.error(`\n❌ No study file found in: ${studyPath}`);
      process.exit(1);
    }
    
    const content = readFileSync(mainStudyFile, "utf-8");
    const metadata = extractMetadata(content, studyPath);
    
    const checklist = CHECKLIST_ITEMS.map(item => ({
      ...item,
      checked: checkItem(content, item),
    }));
    
    const score = checklist.reduce((sum, item) => 
      item.checked ? sum + item.weight : sum, 0);
    const maxScore = checklist.reduce((sum, item) => sum + item.weight, 0);
    
    const requiredItems = checklist.filter(i => i.required);
    const requiredScore = requiredItems.reduce((sum, item) => 
      item.checked ? sum + item.weight : sum, 0);
    const requiredMax = requiredItems.reduce((sum, item) => sum + item.weight, 0);
    
    const canFinalize = requiredScore === requiredMax;
    
    const tier = score >= 28 ? "Deep" : score >= 22 ? "Standard" : "Minimal";

    const report: CompletenessReport = {
      metadata,
      checklist,
      score,
      maxScore,
      tier,
      canFinalize,
    };

    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Human-readable output
    console.log("\n📋 Study Completeness Report");
    console.log("═".repeat(60));
    console.log(`\n📄 ${metadata.title}`);
    console.log(`   Path: ${studyPath}`);
    console.log(`   Slug: ${metadata.slug}`);
    
    console.log(`\n📊 Score: ${score}/${maxScore} (${((score/maxScore)*100).toFixed(0)}%)`);
    console.log(`   Required items: ${requiredScore}/${requiredMax}`);
    console.log(`   Quality tier: ${tier}`);
    
    console.log(`\n${canFinalize ? "✅" : "⚠️"} Finalizable: ${canFinalize ? "YES" : "NEEDS WORK"}`);
    
    console.log("\n📝 Checklist:");
    for (const item of checklist) {
      const icon = item.checked ? "✅" : item.required ? "❌" : "⚠️";
      console.log(`   ${icon} [${item.number}] ${item.name}`);
    }
    
    console.log("\n" + "═".repeat(60));
    
    if (!canFinalize) {
      console.log("\n⚠️ Study needs work before finalizing.");
      const failedItems = checklist.filter(i => !i.checked && i.required);
      if (failedItems.length > 0) {
        console.log("\nMissing required items:");
        failedItems.forEach(i => console.log(`   - ${i.name}`));
      }
    } else {
      console.log("\n✅ Study is complete and ready to finalize.");
      console.log("\nNext step:");
      console.log("   npx tsx skills/study/scripts/finalize-study.ts \\");
      console.log(`     --study-dir "${studyPath.replace(basename(studyPath), "")}"`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error reading study: ${studyPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// CLI
const args = argv.slice(2);
const studyArg = args.find(a => a === "--study" || a === "-s");
const latestArg = args.includes("--latest");
const jsonArg = args.includes("--json");

if (!studyArg && !latestArg) {
  console.log("Usage: check-study-completeness.ts --study <path> | --latest [--json]");
  console.log("\nExamples:");
  console.log("  npx tsx check-study-completeness.ts --study .studies/2026-05-19-test/");
  console.log("  npx tsx check-study-completeness.ts --latest");
  console.log("  npx tsx check-study-completeness.ts --latest --json");
  process.exit(1);
}

let studyPath: string | null = null;

if (latestArg) {
  studyPath = findLatestStudy();
  if (!studyPath) {
    console.error("❌ No study found in .studies/ directory.");
    process.exit(1);
  }
  console.log(`📍 Using latest study: ${studyPath}`);
} else if (studyArg) {
  const studyIndex = args.indexOf(studyArg);
  studyPath = args[studyIndex + 1];
  if (!studyPath) {
    console.error("❌ Missing study path after --study");
    process.exit(1);
  }
}

checkStudy(studyPath!, jsonArg);
