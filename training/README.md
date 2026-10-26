# training — teacher data and LoRA adapters

**Status: Milestone 12 placeholder.**

The training tier teaches the open reasoning model the **voice** of each level. It does not try to learn a single learner's weaknesses; that is the profile's job.

## Plan

1. **Seed set:** a few hundred buggy solutions across patterns (arrays, two pointers, sliding window, hashmap, stack, linked list, trees, graphs, DP), each with a problem statement and a known failing case.
2. **Teacher:** DeepSeek V4 writes hints at all three levels for each solution, following the Socratic contract. It is the teacher only; it is never served to learners.
3. **Filter:** run every draft through `checkHint` and a human spot-check. Drop drafts that spoil, repeat, or exceed the question limit.
4. **Adapters:** train three LoRA adapters (beginner, intermediate, advanced) on the chosen open base model with Unsloth or PEFT + TRL. Verify vLLM/PEFT compatibility before training.
5. **Serve:** vLLM serves the base model and swaps the adapter per request. Store adapter names/versions with each response for the benchmark.
6. **Evaluate:** compare base + prompt vs base + adapter on Socratic quality, spoiler rate, level adherence, latency, and cost.

## Data rules

- No learner data without explicit, revocable consent.
- No third-party problem statements in the published dataset.
- Record the license of every source and base model.
- Publish the adapter, training script, and a datasheet.
- Do not claim "trained on one person's data" teaches personalisation; it teaches style.

## Layout (planned)

```text
training/
├── data/           # generated JSONL, gitignored except .gitkeep
├── scripts/        # generate, filter, train, evaluate
├── configs/        # LoRA configs per level
└── out/            # adapters, gitignored
```

See `docs/PERSONALISATION.md` for the three tiers and `docs/SOCRATIC.md` for the contract the teacher must satisfy.
