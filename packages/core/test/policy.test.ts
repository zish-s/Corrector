import { describe, expect, it } from "vitest";
import {
  buildFallbackQuestion,
  checkHint,
  enforcePolicy,
} from "../src/policy.js";
import {
  TWO_SUM_SCENARIO,
  TWO_SUM_VERDICT,
  demoDirectExplanation,
  demoFollowUp,
  demoHint,
} from "../src/demo.js";
import { LEVELS, RUNGS, type AnswerKind, type HintDraft, type PolicyContext } from "../src/types.js";

const facts = TWO_SUM_SCENARIO.facts;

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    level: "beginner",
    rung: "concept",
    facts,
    ...overrides,
  };
}

describe("Socratic policy checks", () => {
  it("passes every demo hint at every level and rung", () => {
    for (const level of LEVELS) {
      for (const rung of RUNGS) {
        const report = checkHint(demoHint(level, rung), {
          level,
          rung,
          facts,
          explicitSolutionRequest: rung === "solution",
          askedQuestions: [],
        });
        expect(
          report.failures.map((failure) => failure.id),
          `${level}/${rung}`,
        ).toEqual([]);
      }
    }
  });

  it("passes the demo follow-ups and direct explanations", () => {
    const kinds: Exclude<AnswerKind, "dont_know">[] = ["correct", "partly_right", "wrong"];
    for (const kind of kinds) {
      for (let index = 0; index < 3; index += 1) {
        const report = checkHint(demoFollowUp(kind, index, "nudge"), {
          level: "intermediate",
          rung: "nudge",
          facts,
        });
        expect(report.failures.map((failure) => failure.id), `${kind}/${index}`).toEqual([]);
      }
    }
    for (let index = 0; index < 2; index += 1) {
      const report = checkHint(demoDirectExplanation(index, "pseudocode"), {
        level: "intermediate",
        rung: "pseudocode",
        facts,
      });
      expect(report.failures.map((failure) => failure.id), `direct/${index}`).toEqual([]);
    }
  });

  it("rejects more than two questions", () => {
    const draft: HintDraft = {
      rung: "nudge",
      text: "What repeats? Where does it repeat? Why does that matter?",
    };
    const report = checkHint(draft, context());
    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.id)).toContain("max_questions");
  });

  it("rejects a code block on nudge and concept, but allows one at pseudocode", () => {
    const draft: HintDraft = {
      rung: "concept",
      text: "```python\nfor x in nums:\n    pass\n```\nWhat does this repeat?",
    };
    expect(checkHint(draft, context()).failures.map((failure) => failure.id)).toContain(
      "no_code_block",
    );
    expect(
      checkHint({ ...draft, rung: "pseudocode" }, context({ rung: "pseudocode" })).ok,
    ).toBe(true);
  });

  it("rejects a message that does not end with a question", () => {
    const report = checkHint(
      { rung: "concept", text: "The inner loop repeats the same lookup." },
      context(),
    );
    expect(report.failures.map((failure) => failure.id)).toContain("ends_with_question");
  });

  it("blocks a full solution without an explicit request", () => {
    const draft = demoHint("beginner", "solution");
    expect(checkHint(draft, context({ rung: "solution" })).failures.map((failure) => failure.id)).toContain(
      "no_full_solution",
    );
    expect(
      checkHint(draft, context({ rung: "solution", explicitSolutionRequest: true })).ok,
    ).toBe(true);
  });

  it("rejects a repeated question", () => {
    const report = checkHint(demoHint("advanced", "nudge"), context({
      level: "advanced",
      rung: "nudge",
      askedQuestions: ["What repeats in the inner loop?"],
    }));
    expect(report.failures.map((failure) => failure.id)).toContain("fresh_question");
  });

  it("keeps the measured optimality verdict question Socratic", () => {
    const report = checkHint(
      { rung: "concept", text: TWO_SUM_VERDICT.improvementQuestion },
      context(),
    );
    expect(report.failures).toEqual([]);
  });

  it("builds a grounded fallback question from the failing case", () => {
    const fallback = buildFallbackQuestion(facts);
    expect(fallback).toContain("[3, 3]");
    expect(fallback.endsWith("?")).toBe(true);
    expect(checkHint({ rung: "nudge", text: fallback }, context()).ok).toBe(true);
  });
});

describe("enforcePolicy", () => {
  it("regenerates a failing draft before showing it", async () => {
    const bad: HintDraft = { rung: "nudge", text: "The inner loop is slow." };
    const good = demoHint("intermediate", "nudge");
    const result = await enforcePolicy(bad, context({ level: "intermediate", rung: "nudge" }), async () => good);
    expect(result.regenerations).toBe(1);
    expect(result.usedFallback).toBe(false);
    expect(result.report.ok).toBe(true);
    expect(result.draft.text).toBe(good.text);
  });

  it("falls back to a safe grounded question if regeneration keeps failing", async () => {
    const bad: HintDraft = { rung: "nudge", text: "Nope." };
    const result = await enforcePolicy(bad, context(), async () => bad, 2);
    expect(result.regenerations).toBe(2);
    expect(result.usedFallback).toBe(true);
    expect(result.report.ok).toBe(true);
    expect(result.draft.text).toContain("[3, 3]");
  });
});
