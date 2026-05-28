# Study Outline Reference

Reusable section outline for `study-<slug>.md` inside `.studies/<timestamp>-<slug>/`.

## Main Study Sections

| # | Section | Purpose |
|---|---------|---------|
| 1 | Objective | Decision or problem the study addresses. |
| 2 | Scope and Constraints | In-scope vs out-of-scope, hard constraints. |
| 3 | Current State | Existing architecture/behavior with concrete file references. |
| 4 | Option Set | At least two viable options when feasible. |
| 5 | Tradeoff Analysis | Complexity, risk, migration cost, runtime impact, maintainability. |
| 6 | Recommendation | Chosen option and why. |
| 7 | Migration and Rollout Plan | Phase sequence, compatibility strategy, fallback plan. |
| 8 | Risks and Mitigations | Failure modes and safeguards. |
| 9 | Validation Strategy | Commands, tests, expected pass/fail signals. |
| 10 | Open Questions | One subsection per unresolved question; see the template below. |
| 11 | Post-Study Proposals | At least 3 context-adapted actions using `SCREAMING_SNAKE_CASE` names. |

## Open Question Subsection Template

```md
### Open Question N: <short title>

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
```

Guidance:

- Prefer at least 2 viable options. If only one realistic path exists, explain why alternatives are not viable.
- Consequences should be concrete: scope change, migration cost, validation burden, operational risk, user impact, timeline.
- Do not collapse materially different answers into one vague sentence.
- If the question is approval-dependent, state who must answer it.

## Appendix Files

| File | Purpose |
|------|---------|
| `appendix-01-file-inventory.md` | Touched and related files with one-line purpose notes. |
| `appendix-02-references.md` | Internal and external references; prefer primary sources. |
| `appendix-03-validation-and-tests.md` | Exact commands run, result summaries, failures, and interpretation. |
| `appendix-04-log-excerpts.md` | Concise excerpts with context, timestamps, and relevance. |
| `appendix-05-charts-and-matrices.md` | Dense tables, matrices, and mermaid diagrams. |

## Publish Rule

Commit and push the study folder immediately after completion.

```bash
npx tsx skills/study/scripts/finalize-study.ts \
  --study-dir ".studies/<timestamp>-<slug>"
```

Commit scope: only files under that study folder.
