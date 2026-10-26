# The Socratic contract

This document is the source of truth for how Corrector talks to a learner. It is enforced in [`packages/core/src/policy.ts`](../packages/core/src/policy.ts) and [`packages/core/src/ladder.ts`](../packages/core/src/ladder.ts), not left to a prompt alone.

The goal is not to explain the answer. The goal is to make the learner find the flaw and repair their own mental model.

## The 14 rules

| # | Rule | What it means in practice | Enforced by |
| --- | --- | --- | --- |
| 1 | **Ask first, tell later.** | A hint is a question. A fact is stated directly only when the learner asks, or after two failures on the same point. | Prompt + review; `ends_with_question` |
| 2 | **Diagnose before hinting.** | The first question must expose the learner's mental model and must use the exact line, value, test case, or measured number from the facts. | Prompt + `buildFallbackQuestion` |
| 3 | **One question per turn, two at the absolute most.** | Do not stack a quiz. Merge or drop extras. | `max_questions` |
| 4 | **End the message with the question.** | The final sentence is the question the learner answers next. | `ends_with_question` |
| 5 | **No code block on the nudge or concept rung.** | Describe the code in prose. A code block is allowed only at pseudocode (as a scaffold, not runnable) or solution. | `no_code_block` |
| 6 | **Pseudocode is a scaffold with blanks.** | Show the steps; ask the learner to fill one blank at a time. Do not hand over runnable code. | Rung guide + `no_full_solution` |
| 7 | **Full solution only after an explicit ask after pseudocode.** | Reaching the solution rung requires the learner to be on pseudocode and to ask. | `advanceLadder` + `no_full_solution` |
| 8 | **"Just tell me" always advances one rung and counts as a hint.** | The escape hatch is never blocked. It increments `hintsUsed` and `escapeHatches`, and feeds the level auto-adjust. | `advanceLadder` |
| 9 | **Stuck twice on the same point → explain directly.** | On the second consecutive "I don't know" for the same point, give a 2–3 sentence direct explanation, then one short check question. This is the one intentional exception to questioning. | `recordAnswer` |
| 10 | **"I don't know" → move one rung more explicit and never repeat the question.** | Go from nudge → concept → pseudocode. Do not jump to the solution. Ask a different, smaller question. | `recordAnswer` + `fresh_question` |
| 11 | **A wrong answer → a counterexample question.** | Use a failing test case or a concrete trace. Do not restate the whole approach. | `recordAnswer` + demo follow-ups |
| 12 | **A correct answer → confirm briefly, then ask the next step.** | The next step is still a question in the same response. | `recordAnswer` |
| 13 | **A partly right answer → name the right part and probe only the missing part.** | Do not discard what the learner already knows. | `recordAnswer` |
| 14 | **Every response is checked before display; if it fails, regenerate, then fall back.** | The learner never sees a contract-breaking draft. | `checkHint` + `enforcePolicy` |

## The hint ladder

```text
nudge → concept → pseudocode → solution
```

- A **nudge** points at the faulty spot without naming the fix or the data structure.
- A **concept** narrows to the idea. It may name a class of structure, but not the implementation.
- **Pseudocode** is a scaffold with blanks. It is not runnable code.
- **Solution** is one complete solution in a single code block, allowed only after an explicit ask once pseudocode has been reached. It still ends with a question about an invariant, edge case, or test.

The ladder moves **only when the learner asks**. A wrong answer changes the question, not the rung. "I don't know" is the exception: it moves one rung more explicit so the learner is not trapped on a question they cannot answer.

### Starting rung

| Level | Starting rung |
| --- | --- |
| Beginner | `concept` |
| Intermediate | `nudge` |
| Advanced | `nudge` |

The first hint is counted in `hintsUsed` (the ladder starts at 1). "Just tell me" adds one more.

### Reaching the full solution

`advanceLadder` blocks the solution rung unless **both** are true:

1. the next rung is `solution` (the learner is already on `pseudocode`), and
2. `explicitSolution === true` or `escapeHatch === true`.

In the UI, the button reads **Just tell me** on nudge/concept and **Just tell me the solution** on pseudocode. The explicit ask is deliberate; it is not a failure. It counts as a hint and is recorded, so the profile can step the level down later if the learner keeps needing it.

## Reading the learner's answer

| Learner says | Move | What the next message does |
| --- | --- | --- |
| **Correct** | `confirm` | Confirms in a few words, then asks for the next step in the same response. |
| **Partly right** | `probe_missing` | Names the part that is right, then asks only about the missing part. |
| **Wrong** | `counterexample` | Asks a question built from a failing test case or a concrete trace. Does not restate the whole approach. |
| **I don't know** | `step_down` | Moves one rung more explicit and asks a different, smaller question. After two in a row on the same point, switches to `explain_directly`. |

The demo's failing case is `nums = [3, 3], target = 6`, expected `[0, 1]`, actual `[]`. That case is consistent with the demo's off-by-one loop bound and with the one-pass solution. It is not decorative.

## Automatic checks

`checkHint(draft, context)` returns a report with five checks:

| Check | Passes when | Failure instruction sent back to the model |
| --- | --- | --- |
| `max_questions` | The draft contains at most 2 question marks. | Merge or drop extra questions. |
| `no_code_block` | There is no fenced or indented code block on nudge/concept. | Remove the code block; ask in prose. |
| `ends_with_question` | The last sentence is a question. | End with one short question. |
| `no_full_solution` | The draft is not marked as a full solution, or the rung is solution **and** the explicit request is present. | Do not reveal the full solution. |
| `fresh_question` | The final question does not normalize to one already asked on this problem. | Ask a different question. |

`enforcePolicy` runs the checks, regenerates up to twice with the failure instructions, and then falls back to a grounded question built from the facts. The UI shows the check strip so the contract is visible, not just claimed.

### What the mechanical checks do not catch

The checks count question marks, detect fenced/indented code, and compare normalized questions. They do **not** understand semantics. A model could still hide a solution in prose, or write a question that gives the answer away.

That is why the system also relies on:

- the rung and level guides in the system prompt;
- a second model pass that reviews the draft against the contract (planned for Milestone 6);
- the benchmark's "Socratic quality" row, scored by humans against the rubric;
- test fixtures that assert the checks on every demo hint and follow-up.

The checks are a floor, not a proof. We say that plainly in the demo.

## The prompt

`buildSocraticSystemPrompt` includes:

- the prime directive and the non-negotiable response contract;
- the current level, rung, topic, and whether a full-solution request exists;
- the rung guide and level guide;
- the grounding facts as JSON (problem, language, code, traceback, failing case, measured growth, detected/optimal pattern);
- the local per-topic profile summary and preferred question type;
- the questions already asked, to avoid repeats;
- an optimality section when a measured verdict exists;
- the answer-reading table;
- tone and language settings.

The prompt tells the model to return only the message the UI will show: plain text, no preamble, no JSON, no headings, no tables.

## Optimality: state the verdict, ask the improvement

Optimality is **measured**, not guessed. The runner executes the code at growing input sizes, fits the growth curve, and static analysis detects nested loops and patterns. The model receives the measured verdict and evidence.

- If optimal: say so plainly, then ask a question that checks the invariant or edge case.
- If brute force: say so plainly, give the measured evidence, then **ask** what would remove the repeated work. Do not name the fix.

The M1 demo uses `TWO_SUM_VERDICT`:

> nested loops detected · 4.8 s at n = 100,000 · quadratic growth
>
> Your code scans the array once for every element — what would let you skip the repeat scan?

The verdict question passes all five checks. The real measurement pipeline is Milestone 8.

## Animated pop-ups

The Socratic text and the animation are one hint, not two. The model returns a small JSON visual spec (for example, an array with two pointers and steps); our component library renders it. The model never writes raw SVG. If the spec fails schema validation, fall back to the text only. Respect `prefers-reduced-motion` and quiet mode.

This is planned for Milestone 9. M1 ships text only.

## Explain-aloud mode (later)

Push-to-talk, the learner explains their plan, the coach probes the gaps like a mock interviewer. Gemma handles audio input; replies use browser speech synthesis (or Piper on the backend). The same ladder and checks apply. Planned for Milestone 11.

## Evaluation

The benchmark will compare model candidates on:

- correctness of the diagnosis;
- whether the hint actually helps without spoiling;
- level adherence (sentence count, analogy, terse advanced style);
- question quality and freshness;
- latency and cost.

The headline row is **Socratic quality**, scored by humans from 1–5 against the 14 rules. A model that scores well on code but spoils the answer loses.

## Tests

```bash
npm test
```

Relevant files:

- [`packages/core/test/policy.test.ts`](../packages/core/test/policy.test.ts)
- [`packages/core/test/ladder.test.ts`](../packages/core/test/ladder.test.ts)
- [`packages/core/test/questions.test.ts`](../packages/core/test/questions.test.ts)
- [`packages/core/test/prompts.test.ts`](../packages/core/test/prompts.test.ts)

The tests cover passing and failing drafts, regeneration, fallback, every ladder transition, the solution gate, repeated questions, direct explanation, and the system prompt.
