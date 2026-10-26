import { countQuestions, endsWithQuestion, lastQuestion, normalizeQuestion } from "./questions.js";
import type {
  GroundingFacts,
  GuardedHint,
  HintDraft,
  PolicyCheck,
  PolicyContext,
  PolicyFailure,
  PolicyReport,
  Regenerate,
} from "./types.js";

const MAX_QUESTIONS_DEFAULT = 2;

function hasCodeBlock(text: string): boolean {
  if (/```|~~~/u.test(text)) return true;
  return /^(?: {4}|\t)\S.*$/m.test(text);
}

export function checkHint(draft: HintDraft, ctx: PolicyContext): PolicyReport {
  const maxQuestions = ctx.maxQuestions ?? MAX_QUESTIONS_DEFAULT;
  const checks: PolicyCheck[] = [];

  const questionCount = countQuestions(draft.text);
  checks.push({
    id: "max_questions",
    label: "At most 2 questions",
    passed: questionCount <= maxQuestions,
    detail: `${questionCount}/${maxQuestions}`,
  });

  const codeBlock = hasCodeBlock(draft.text);
  const codeBlockAllowed = draft.rung !== "nudge" && draft.rung !== "concept";
  checks.push({
    id: "no_code_block",
    label: "No code block on nudge or concept",
    passed: codeBlockAllowed || !codeBlock,
    detail: codeBlock && !codeBlockAllowed ? `code block at ${draft.rung}` : "none",
  });

  const endsInQuestion = endsWithQuestion(draft.text);
  checks.push({
    id: "ends_with_question",
    label: "Ends with a question",
    passed: endsInQuestion,
    detail: endsInQuestion ? "yes" : "no",
  });

  const declaresFullSolution = draft.fullSolution === true || draft.rung === "solution";
  const solutionAllowed = draft.rung === "solution" && ctx.explicitSolutionRequest === true;
  checks.push({
    id: "no_full_solution",
    label: "No full solution unless asked",
    passed: !declaresFullSolution || solutionAllowed,
    detail: declaresFullSolution
      ? solutionAllowed
        ? "explicit request after pseudocode"
        : "blocked"
      : "not a full solution",
  });

  const finalQuestion = lastQuestion(draft.text);
  const asked = new Set((ctx.askedQuestions ?? []).map(normalizeQuestion));
  const fresh = finalQuestion !== null && !asked.has(normalizeQuestion(finalQuestion));
  checks.push({
    id: "fresh_question",
    label: "Does not repeat a question",
    passed: fresh,
    detail: finalQuestion === null ? "no question found" : fresh ? "new" : "repeat",
  });

  const failures: PolicyFailure[] = [];
  if (!checks[0]!.passed) {
    failures.push({
      id: "max_questions",
      instruction: `Use at most ${maxQuestions} question(s). Merge or drop the extras.`,
    });
  }
  if (!checks[1]!.passed) {
    failures.push({
      id: "no_code_block",
      instruction: "Remove the code block. At the nudge and concept rungs, ask about the code in prose.",
    });
  }
  if (!checks[2]!.passed) {
    failures.push({
      id: "ends_with_question",
      instruction: "End the message with one short question.",
    });
  }
  if (!checks[3]!.passed) {
    failures.push({
      id: "no_full_solution",
      instruction:
        "Do not reveal a full solution. Stay on the current rung; the solution needs an explicit request after pseudocode.",
    });
  }
  if (!checks[4]!.passed) {
    failures.push({
      id: "fresh_question",
      instruction: "Ask a different question from the ones already asked on this problem.",
    });
  }

  return { ok: failures.length === 0, checks, failures };
}

/** Last-resort grounded question used when regeneration cannot satisfy the
 * contract. It contains no code and always ends with a question. */
export function buildFallbackQuestion(facts: GroundingFacts): string {
  if (facts.failingCase) {
    return `Trace ${facts.failingCase.input}: what should the output be, and what does your code return instead?`;
  }
  if (facts.traceback) {
    return "Which line in the traceback runs first, and what value does it see there?";
  }
  if (facts.measured) {
    return `Your run at n = ${facts.measured.maxN.toLocaleString("en-US")} took ${facts.measured.seconds} s. Which part repeats as n grows?`;
  }
  if (facts.problem) {
    return "In one sentence, what should your approach guarantee for this problem?";
  }
  return "In one sentence, what should your approach guarantee for this case?";
}

export async function enforcePolicy(
  draft: HintDraft,
  ctx: PolicyContext,
  regenerate?: Regenerate,
  maxRegenerations = 2,
): Promise<GuardedHint> {
  let current = draft;
  let report = checkHint(current, ctx);
  let regenerations = 0;

  while (!report.ok && regenerate && regenerations < maxRegenerations) {
    regenerations += 1;
    current = await regenerate(report.failures, regenerations);
    report = checkHint(current, ctx);
  }

  let usedFallback = false;
  if (!report.ok) {
    usedFallback = true;
    current = {
      rung: ctx.rung,
      text: buildFallbackQuestion(ctx.facts),
      questionTypes: ["clarify"],
    };
    report = checkHint(current, ctx);
  }

  return { draft: current, report, regenerations, usedFallback };
}
