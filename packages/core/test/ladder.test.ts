import { describe, expect, it } from "vitest";
import {
  STARTING_RUNG,
  advanceLadder,
  nextRung,
  recordAnswer,
  rememberQuestion,
  startLadder,
} from "../src/ladder.js";

describe("hint ladder", () => {
  it("starts beginners at concept, intermediate and advanced at nudge", () => {
    expect(STARTING_RUNG.beginner).toBe("concept");
    expect(STARTING_RUNG.intermediate).toBe("nudge");
    expect(STARTING_RUNG.advanced).toBe("nudge");
    expect(startLadder("beginner").rung).toBe("concept");
  });

  it("only moves forward when asked, one rung at a time", () => {
    const start = startLadder("intermediate");
    const first = advanceLadder(start, { escapeHatch: true });
    expect(first.changed).toBe(true);
    expect(first.state.rung).toBe("concept");
    expect(first.state.hintsUsed).toBe(2);
    expect(first.state.escapeHatches).toBe(1);
  });

  it("blocks the solution until the learner explicitly asks after pseudocode", () => {
    const atPseudocode = { ...startLadder("advanced"), rung: "pseudocode" as const };
    const blocked = advanceLadder(atPseudocode);
    expect(blocked.blocked).toBe(true);
    expect(blocked.state.rung).toBe("pseudocode");

    const allowed = advanceLadder(atPseudocode, { explicitSolution: true });
    expect(allowed.changed).toBe(true);
    expect(allowed.state.rung).toBe("solution");
    expect(allowed.state.solutionRevealed).toBe(true);
  });

  it("counts the escape hatch as a hint and as an explicit ask at pseudocode", () => {
    const atPseudocode = { ...startLadder("intermediate"), rung: "pseudocode" as const };
    const result = advanceLadder(atPseudocode, { escapeHatch: true });
    expect(result.state.rung).toBe("solution");
    expect(result.state.hintsUsed).toBe(atPseudocode.hintsUsed + 1);
    expect(result.state.escapeHatches).toBe(1);
  });

  it("steps down one rung on I don't know, then explains directly on the second", () => {
    const start = { ...startLadder("beginner"), rung: "concept" as const };
    const first = recordAnswer(start, "dont_know");
    expect(first.move).toBe("step_down");
    expect(first.state.rung).toBe("pseudocode");
    expect(first.state.stuckOnPoint).toBe(1);

    const second = recordAnswer(first.state, "dont_know");
    expect(second.move).toBe("explain_directly");
    expect(second.state.rung).toBe("pseudocode");
    expect(second.state.stuckOnPoint).toBe(0);
  });

  it("never auto-reveals the solution on I don't know", () => {
    const atPseudocode = { ...startLadder("advanced"), rung: "pseudocode" as const };
    const result = recordAnswer(atPseudocode, "dont_know");
    expect(result.state.rung).toBe("pseudocode");
    expect(result.state.solutionRevealed).toBe(false);
  });

  it("uses a counterexample move for a wrong answer", () => {
    const result = recordAnswer(startLadder("intermediate"), "wrong");
    expect(result.move).toBe("counterexample");
    expect(result.instruction).toMatch(/failing test case/i);
  });

  it("remembers questions without duplicating them", () => {
    let state = startLadder("intermediate");
    state = rememberQuestion(state, "What repeats?");
    state = rememberQuestion(state, "What repeats?");
    state = rememberQuestion(state, "Which pointer moves?");
    expect(state.askedQuestions).toEqual(["What repeats?", "Which pointer moves?"]);
  });

  it("reports the last rung as the end of the ladder", () => {
    const atEnd = { ...startLadder("advanced"), rung: "solution" as const, solutionRevealed: true };
    expect(nextRung(atEnd.rung)).toBeNull();
    expect(advanceLadder(atEnd).reason).toBe("already_at_end");
  });
});
