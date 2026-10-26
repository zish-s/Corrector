# benchmark — model comparison and Socratic quality

**Status: Milestone 13 placeholder.**

The benchmark answers two questions:

1. Which open-weight model should serve the coach?
2. Does the product actually teach, or does it merely produce plausible text?

## Rows

| Metric | How it is measured |
| --- | --- |
| **Socratic quality** | Human rubric, 1–5, against the 14 rules: diagnosis, restraint, question quality, level fit. The headline row. |
| **Spoiler rate** | % of hints that reveal the full solution or the named fix before the explicit ask. |
| **Level adherence** | Beginner: 4–6 sentences + analogy + example; intermediate: 2–3 reasoning sentences; advanced: one terse question. |
| **Question freshness** | Repeats per session; normalized question match. |
| **Diagnosis accuracy** | Does the first question identify the actual bug/failing case? Human-labelled set. |
| **Optimality accuracy** | Measured verdict vs the expected pattern; runner + static analysis. |
| **Latency** | p50/p95 time to first token and full hint. |
| **Cost** | GPU seconds / tokens per hint. |

## Test set

- Buggy solutions across the main patterns, with a known failing case and an expected bug class.
- The same solution at all three levels (side-by-side outputs and animations).
- At least one "brute force but correct" case to test the optimality verdict.
- At least one "wrong and confident" case to test the counterexample question.
- A "stuck twice" transcript to test the direct-explanation exception.

## Outputs

- A reproducible table of model candidates and adapter versions.
- The human rubric and the raw scores.
- A short report: what won, what failed, and what we would change.
- The demo's "same bug, three levels" comparison.

## Non-goals

- A leaderboard for its own sake.
- Claiming statistical significance from a tiny sample.
- Scoring only code correctness; a model that spoils the answer loses.

See `docs/SOCRATIC.md` for the rubric source.
