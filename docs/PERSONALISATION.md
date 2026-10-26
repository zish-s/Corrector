# Personalisation

The coach should feel like it knows **this learner, on this topic** — not like a generic model with a temperature setting.

Corrector does that with three layers:

1. a local, inspectable **per-topic profile** (the main mechanism);
2. **retrieval** of relevant past mistakes into the prompt;
3. optional **LoRA adapters** for level-appropriate voice (later).

Most of the benefit comes from layer 1. It is deterministic, testable, and easy to explain in the demo.

## Level is per topic, not global

A learner can be **beginner at dynamic programming** and **advanced at arrays** at the same time. A single global "difficulty" would either bore them in one topic or drown them in another.

```json
{
  "version": 1,
  "defaultLevel": "beginner",
  "topics": {
    "arrays": {
      "topic": "arrays",
      "level": "intermediate",
      "attempts": 11,
      "solved": 8,
      "hintsUsed": 19,
      "fastSolves": 1,
      "struggleStreak": 0,
      "manualOverride": false,
      "unlockedBy": { "example": 5, "assumption": 2 },
      "journal": []
    },
    "dp": {
      "topic": "dp",
      "level": "beginner",
      "attempts": 3,
      "solved": 1,
      "hintsUsed": 8,
      "fastSolves": 0,
      "struggleStreak": 1,
      "manualOverride": false,
      "unlockedBy": { "example": 1 },
      "journal": []
    }
  },
  "settings": {
    "tone": "encouraging",
    "language": "en",
    "quietMode": false,
    "reducedMotion": false
  }
}
```

A new topic inherits `defaultLevel` until it has its own history. The level is **passed to the model**; the model is never asked to guess it.

## Hint style by level

| Level | Starting rung | Style |
| --- | --- | --- |
| **Beginner** | `concept` | 4–6 short, gentle sentences. Explain the concept first, one everyday analogy, a tiny worked example with small numbers. Offer A/B choices when a decision has two clear options. After the answer, add one short explanation. Full animation. |
| **Intermediate** | `nudge` | 2–3 sentences. Name the reasoning — why it is slow, what changes — without writing code. One open question that makes the learner supply the missing reasoning. Short animation. |
| **Advanced** | `nudge` | One terse question, at most one short sentence of context. No analogy, no worked example, no step-by-step. At most a tiny icon or flash. |

These are encoded in `LEVEL_GUIDE` in [`packages/core/src/prompts.ts`](../packages/core/src/prompts.ts) and in the demo hint sets.

The rung is separate from the level. A beginner starts one rung more explicit, but still moves through the same ladder: nudge → concept → pseudocode → solution.

## Auto-adjustment

No model decides the level. The rules are deterministic and visible in [`packages/core/src/profile.ts`](../packages/core/src/profile.ts).

### Level up: three fast solves in a row

A **fast solve** is an attempt where:

- the learner solved it;
- they needed only the **first hint** (`hintsUsed <= 1`);
- they did not use the escape hatch;
- they did not reach the solution rung.

At intermediate and advanced the first hint is a nudge. At beginner it is a concept hint. Requiring a literal "nudge" would make level-up impossible for beginners, so "fast solve" means "only the starting hint" at any level. This preserves the intent of the rule — reward learners who need almost no help — while making it work at the beginner rung.

Three fast solves in a row → move up one level (`beginner → intermediate`, `intermediate → advanced`). The counter resets, and the UI says:

> Three clean solves with only a nudge on arrays — moving you up to intermediate. You can override this any time.

The message uses "nudge" at intermediate/advanced; the beginner path is described as a clean first-hint solve.

### Level down: two struggles in a row

A **struggle** is an attempt with any of:

- the escape hatch ("Just tell me");
- the pseudocode or solution rung;
- two or more "I don't know" answers.

Two consecutive struggles → move down one level. The UI says:

> You reached for pseudocode twice in a row on arrays — stepping back to beginner for a bit. That is not a failure; we will rebuild the pattern.

A solved attempt that is not a struggle resets the struggle streak. An unsolved attempt that is not a struggle leaves it unchanged.

### Manual override

Choosing a level from the dropdown sets `manualOverride: true`. Auto-adjust is paused for that topic. A **resume auto-adjust** link clears the flag. The current level is kept; future attempts can move it again.

The dropdown is always available, so the learner stays in control. The profile shows whether auto-adjust is on.

### Why these rules

They are simple enough to explain in one sentence, impossible to game with a single lucky attempt, and conservative: one bad day does not permanently demote anyone, and one easy problem does not promote them. They are also easy to replace with a better policy later without touching the prompt or the UI.

## Mistake journal

Every attempt can log:

| Field | Purpose |
| --- | --- |
| `problem` | Human-readable label for review. |
| `topic` | Keeps the entry in the right per-topic history. |
| `pattern` | Hashmap, two pointers, DP, etc. |
| `mistakeType` | Off-by-one, missing empty case, missing duplicate case, wrong initialisation, wrong data structure, complexity, logic, other. |
| `unlockedBy` | The question type that finally unlocked the learner: clarify, assumption, example, consequence, or alternative. |
| `hintsUsed` | How much help the attempt needed. |
| `solved` | Whether the learner finished it. |
| `createdAt` | Timestamp. |

Entries are newest-first and capped at 50 per topic. The profile summary shown to the model includes the level, solves, average hints, fast-solve count, preferred question type, and the last three mistakes.

### Preferred question type

`preferredQuestionType` counts how often each question type was the one that unlocked the learner. The highest count wins. Ties resolve in the declared `QUESTION_TYPES` order (clarify, assumption, example, consequence, alternative), so the result is deterministic.

The prompt receives both the summary and the preferred type. In the demo, `example` is preferred (3 unlocks), so a new attempt should lean toward a concrete failing example rather than an abstract question.

### Retrieval (next)

The full retrieval layer will embed the current problem and pick the most relevant past mistakes, not just the latest three. That is a later milestone; M1 already stores the fields needed to build it.

## What the model receives

`buildSocraticSystemPrompt` includes:

- the level and rung guides;
- the grounding facts (problem, code, traceback, failing case, measured growth, patterns);
- the per-topic profile summary and preferred question type;
- the questions already asked on this problem;
- the optimality verdict and evidence, when present;
- tone and language settings.

It does **not** receive the whole journal. It receives a short summary, which keeps the prompt small and the privacy surface clear.

## Settings

| Setting | Values | Effect |
| --- | --- | --- |
| Tone | `encouraging` / `facts` | Warm acknowledgement vs plain facts, no praise. |
| Language | `en` / `hi` | English or Hindi (Devanagari). Code identifiers, tracebacks, and measured numbers stay unchanged. |
| Quiet mode | boolean | No mascot reactions or celebrations. |
| Reduced motion | boolean | Respect the OS setting and avoid animation. |

The M1 demo exposes the level dropdown and the stats; the settings UI arrives with the full dashboard. The prompt builder already accepts tone and language.

## M1: what is real and what is demo

Real:

- the per-topic profile shape and rules;
- the level dropdown and manual override;
- auto-adjust on **Check my solution**;
- the journal, preferred question type, and profile summary;
- the level-specific hint text for all four rungs;
- the prompt builder.

Demo:

- the profile starts with four attempts and two journal entries, clearly labelled as demo data;
- clicking **Check my solution** always logs a solved Two Sum attempt, regardless of what the learner actually wrote;
- the journal's `unlockedBy` is inferred from the last answer only when it was "Correct";
- nothing is persisted. Reloading the side panel resets the demo.

Persistence (IndexedDB) is Milestone 7. The profile JSON is versioned (`version: 1`) so it can be migrated.

## Three tiers of "self-trainable"

1. **Profile + retrieval (no training).** This is what M1 starts. It delivers most of the personalisation.
2. **LoRA level adapters.** Use DeepSeek V4 as the teacher to write hints at all three levels for many buggy solutions; train three adapters on the open base model; serve with vLLM and swap the adapter per request. Training is Milestone 12.
3. **Learn from me (stretch).** Log each hint with whether the learner solved afterwards and thumbs up/down; periodically retrain or use DPO on good/bad pairs.

Be honest: fine-tuning on one learner's data teaches **style**, not knowledge of their weaknesses. The profile is what knows the weaknesses.

## Tests

```bash
npm test
```

[`packages/core/test/profile.test.ts`](../packages/core/test/profile.test.ts) covers:

- topics staying independent;
- beginner level-up with only the first concept hint;
- no level-up when more than the first hint was needed;
- level-down after two struggles;
- manual override;
- journal ordering and preferred question type;
- average hints.

The prompt tests assert that the profile summary and level/rung guides reach the system prompt.
