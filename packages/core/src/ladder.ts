import { lastQuestion, normalizeQuestion } from "./questions.js";
import {
  RUNGS,
  type AdvanceInput,
  type AdvanceResult,
  type AnswerKind,
  type AnswerResult,
  type LadderState,
  type Level,
  type Rung,
} from "./types.js";

export const STARTING_RUNG: Record<Level, Rung> = {
  beginner: "concept",
  intermediate: "nudge",
  advanced: "nudge",
};

export function startLadder(level: Level): LadderState {
  return {
    rung: STARTING_RUNG[level],
    hintsUsed: 1,
    escapeHatches: 0,
    stuckOnPoint: 0,
    askedQuestions: [],
    solved: false,
    solutionRevealed: false,
  };
}

export function nextRung(rung: Rung): Rung | null {
  const index = RUNGS.indexOf(rung);
  if (index < 0 || index === RUNGS.length - 1) return null;
  return RUNGS[index + 1] ?? null;
}

/** Show the next rung only when the learner asks. The solution rung additionally
 * requires an explicit ask (the "Just tell me" button counts). */
export function advanceLadder(state: LadderState, input: AdvanceInput = {}): AdvanceResult {
  if (state.solved) {
    return { state, changed: false, blocked: false, reason: "solved" };
  }
  const next = nextRung(state.rung);
  if (!next) {
    return { state, changed: false, blocked: false, reason: "already_at_end" };
  }
  const explicit = input.explicitSolution === true || input.escapeHatch === true;
  if (next === "solution" && !explicit) {
    return { state, changed: false, blocked: true, reason: "blocked_solution" };
  }

  return {
    state: {
      ...state,
      rung: next,
      hintsUsed: state.hintsUsed + 1,
      escapeHatches: state.escapeHatches + (input.escapeHatch ? 1 : 0),
      stuckOnPoint: 0,
      solutionRevealed: state.solutionRevealed || next === "solution",
    },
    changed: true,
    blocked: false,
    reason: "advanced",
  };
}

export function rememberQuestion(state: LadderState, text: string): LadderState {
  const question = lastQuestion(text);
  if (!question) return state;
  const normalized = normalizeQuestion(question);
  if (!normalized) return state;
  if (state.askedQuestions.some((asked) => normalizeQuestion(asked) === normalized)) {
    return state;
  }
  return {
    ...state,
    askedQuestions: [...state.askedQuestions, question].slice(-20),
  };
}

export function recordAnswer(state: LadderState, kind: AnswerKind): AnswerResult {
  switch (kind) {
    case "correct":
      return {
        state: { ...state, stuckOnPoint: 0 },
        move: "confirm",
        rung: state.rung,
        instruction: "Confirm in a few words, then ask for the next step in the same response.",
      };
    case "partly_right":
      return {
        state,
        move: "probe_missing",
        rung: state.rung,
        instruction: "Name the part that is right, then ask only about the missing part.",
      };
    case "wrong":
      return {
        state,
        move: "counterexample",
        rung: state.rung,
        instruction: "Use a failing test case as a question. Do not restate the whole approach.",
      };
    case "dont_know": {
      const stuck = state.stuckOnPoint + 1;
      if (stuck >= 2) {
        return {
          state: { ...state, stuckOnPoint: 0 },
          move: "explain_directly",
          rung: state.rung,
          instruction:
            "Explain this point directly in 2-3 sentences, then end with one short check question. Never repeat the earlier question.",
        };
      }
      const candidate = nextRung(state.rung);
      const canStepDown = candidate !== null && candidate !== "solution";
      return {
        state: {
          ...state,
          rung: canStepDown ? candidate : state.rung,
          hintsUsed: state.hintsUsed + (canStepDown ? 1 : 0),
          stuckOnPoint: stuck,
        },
        move: "step_down",
        rung: canStepDown ? candidate : state.rung,
        instruction: canStepDown
          ? "Move one rung more explicit. Ask a different question; never repeat the one that failed."
          : "Stay on pseudocode and simplify the question. The full solution still needs an explicit request.",
      };
    }
  }
}
