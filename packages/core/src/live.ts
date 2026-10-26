import { buildFallbackQuestion, checkHint } from "./policy.js";
import type {
  GroundingFacts,
  HintDraft,
  Level,
  PolicyReport,
  QuestionType,
  Rung,
} from "./types.js";

/** A page snapshot produced by the practice site or the extension adapter. */
export interface PageContext {
  title: string;
  url?: string;
  language: string;
  code: string;
  statement?: string;
  source?: "practice" | "leetcode" | "generic" | string;
  lineCount?: number;
}

export type LiveDetector =
  | "missing_type"
  | "nested_scan"
  | "map_order"
  | "loop_invariant"
  | "generic";

export interface LiveAnchor {
  /** Token or line fragment the overlay can find. */
  text: string;
  /** 1-based editor line, when known. */
  line?: number;
}

export type LiveVisual = "window" | "hashmap" | "stack" | "pointer";

export interface LiveHint {
  draft: HintDraft;
  /** Short question shown in the red-pen note. */
  note: string;
  tag: string;
  anchor: LiveAnchor;
  facts: GroundingFacts;
  report: PolicyReport;
  detector: LiveDetector;
  /** A small animated explainer shown inside the note. */
  visual: LiveVisual;
}

export interface LiveHintInput {
  page: PageContext;
  level: Level;
  rung: Rung;
  askedQuestions?: string[];
  explicitSolutionRequest?: boolean;
}

type ProblemKind = "two-sum" | "longest-substring" | "unknown";

interface Bank {
  note: string;
  tag: string;
  explain: Record<Level, string>;
  scaffold: Record<Level, string>;
  questions: Record<Level, readonly string[]>;
  solution: (language: string) => string;
  questionTypes: QuestionType[];
}

const TWO_SUM_PYTHON = [
  "```python",
  "def two_sum(nums, target):",
  "    seen = {}",
  "    for i, x in enumerate(nums):",
  "        need = target - x",
  "        if need in seen:",
  "            return [seen[need], i]",
  "        seen[x] = i",
  "    return []",
  "```",
].join("\n");

const TWO_SUM_CPP = [
  "```cpp",
  "vector<int> twoSum(vector<int>& nums, int target) {",
  "    unordered_map<int, int> seen;",
  "    for (int i = 0; i < (int)nums.size(); i++) {",
  "        int need = target - nums[i];",
  "        if (seen.count(need)) return {seen[need], i};",
  "        seen[nums[i]] = i;",
  "    }",
  "    return {};",
  "}",
  "```",
].join("\n");

const LONGEST_CPP = [
  "```cpp",
  "class Solution {",
  "public:",
  "    int lengthOfLongestSubstring(string s) {",
  "        int l = 0, r = 0, MaxLen = 0;",
  "        int count[256] = {0};",
  "        while (r < (int)s.size()) {",
  "            while (count[(unsigned char)s[r]] != 0) {",
  "                count[(unsigned char)s[l]]--;",
  "                l++;",
  "            }",
  "            count[(unsigned char)s[r]]++;",
  "            MaxLen = max(MaxLen, r - l + 1);",
  "            r++;",
  "        }",
  "        return MaxLen;",
  "    }",
  "};",
  "```",
].join("\n");

function twoSumSolution(language: string): string {
  return `${language.toLowerCase().includes("py") ? TWO_SUM_PYTHON : TWO_SUM_CPP}

Which edge case would you test first: an empty array or a pair of equal values?`;
}

function longestSolution(): string {
  return `${LONGEST_CPP}

Which input would you try first: an empty string or a string with every character distinct?`;
}

const BANKS: Record<LiveDetector, Bank> = {
  missing_type: {
    note: "What type should MaxLen be, and why?",
    tag: "Corrector · type check",
    questionTypes: ["consequence", "clarify"],
    explain: {
      beginner:
        "This line declares three names in one C++ statement, but the third name sits outside the type at the front. C++ does not infer a type from the value 0; every variable needs a declared type. Think of a row of three jars where only the first jar has a label: the others are still unlabelled. Writing `int a = 0, b = 0;` labels both jars as integers, while `a = 0, MaxLen = 0;` does not. The compiler stops at the unlabelled name because it cannot decide what MaxLen is allowed to hold.",
      intermediate:
        "The comma-separated declaration applies its one type only to the names before the first untyped name. MaxLen is therefore undeclared, and the literal 0 does not give the compiler a type.",
      advanced: "",
    },
    scaffold: {
      beginner:
        "Scaffold: declare the two window bounds and the best length explicitly, and give each one a starting value. First blank: what type should the best length have, and what is the largest value it could reach?",
      intermediate:
        "Scaffold: declare the window bounds and the best length. Which type and initial value belong on the best length, and why?",
      advanced: "Scaffold: name the type and initial value for the best length.",
    },
    questions: {
      beginner: [
        "Which type would let MaxLen hold the longest window, and why?",
        "What is the compiler missing before it can accept MaxLen on line 5?",
      ],
      intermediate: [
        "What type should MaxLen have, and what range must it hold?",
        "Which name in that declaration has no type?",
      ],
      advanced: ["What type belongs on MaxLen, and what decides it?"],
    },
    solution: longestSolution,
  },
  nested_scan: {
    note: "What is the inner loop re-checking that you could remember instead?",
    tag: "Corrector · repeated work",
    questionTypes: ["alternative", "example"],
    explain: {
      beginner:
        "Your outer loop chooses one number, and the inner loop scans the numbers after it. That means the code checks pair after pair instead of remembering anything. Think of looking for a friend in a crowd by walking the whole crowd once for every person. The missing idea is a small memory of what you have already seen, so the second number can be found without another scan.",
      intermediate:
        "The nested loops rescan the same suffix for every i, so the pair check is quadratic. The inner scan is only asking whether a needed value has already appeared.",
      advanced: "",
    },
    scaffold: {
      beginner:
        "Scaffold: one pass; compute the complement; look it up; store the current index. Blank one: what should the memory hold for each number you have already seen?",
      intermediate:
        "Scaffold: one pass, compute the complement, look it up, then store the current index. What should the memory key on so the lookup is constant time?",
      advanced: "Scaffold: one pass, complement lookup, then insert. Which value is the key?",
    },
    questions: {
      beginner: [
        "In [3, 3] with target 6, what does the second 3 need from the first 3, and what could remember it?",
        "Which earlier value would let the current number finish the pair without another scan?",
      ],
      intermediate: [
        "What does the inner loop recompute that a map could answer directly?",
        "In [3, 3] with target 6, what has to be remembered after the first 3?",
      ],
      advanced: ["What repeats in the inner loop?"],
    },
    solution: twoSumSolution,
  },
  map_order: {
    note: "What happens in [3, 3] if you store before you check?",
    tag: "Corrector · order check",
    questionTypes: ["consequence", "example"],
    explain: {
      beginner:
        "You have the right memory structure, but the order of the two operations decides whether it is correct. If the current number is stored before its complement is checked, the same element can match itself. Think of putting your own name in the guest list before checking whether you already have a plus-one. In [3, 3] with target 6, the first 3 must be remembered before the second 3 asks for it, but not before the first 3 asks.",
      intermediate:
        "The map is the right shape, but the check must happen before the insert. Otherwise the current index can satisfy its own complement.",
      advanced: "",
    },
    scaffold: {
      beginner:
        "Scaffold: compute the complement, check memory, return if found, then store the current number and index. Which operation must come first, and why?",
      intermediate:
        "Scaffold: complement, lookup, return, insert. Why must the lookup precede the insert?",
      advanced: "Scaffold: lookup before insert. Why?",
    },
    questions: {
      beginner: [
        "In [3, 3] with target 6, what happens if you store the first 3 before you check for a complement?",
        "Which line would you move so an element cannot match itself?",
      ],
      intermediate: [
        "Why does inserting before the lookup break the duplicate case?",
        "What small example exposes the ordering bug?",
      ],
      advanced: ["Why check before insert?"],
    },
    solution: twoSumSolution,
  },
  loop_invariant: {
    note: "What must stay true before every iteration of this loop?",
    tag: "Corrector · loop invariant",
    questionTypes: ["assumption", "consequence"],
    explain: {
      beginner:
        "A loop is a promise that is repeated: something about the variables should be true before each turn. If you cannot say that promise in one sentence, the update or the exit condition is usually where the bug hides. For a window, the promise might be that everything inside the window is valid. What promise does your loop need to keep?",
      intermediate:
        "The loop has an invariant, but it is implicit. Naming it separates the update from the exit condition and makes the bug easier to locate.",
      advanced: "",
    },
    scaffold: {
      beginner:
        "Scaffold: write the invariant, the update, and the exit condition. Which one sentence describes what is true before every iteration?",
      intermediate:
        "Scaffold: invariant, update, exit. What stays true before every iteration?",
      advanced: "Scaffold: invariant before update. What is it?",
    },
    questions: {
      beginner: [
        "What one sentence is true before every turn of this loop?",
        "Which variable would break that promise first if the input were empty?",
      ],
      intermediate: [
        "What invariant does the loop maintain, and where is it updated?",
        "Which line depends on the invariant being true?",
      ],
      advanced: ["What is the loop invariant?"],
    },
    solution: () =>
      "A full implementation depends on the problem, and I do not have enough grounded facts to write one safely. The shape is: state the invariant, update it, then prove the exit condition. Which invariant would you write first?",
  },
  generic: {
    note: "Which line would you change first, and what should stay true after it?",
    tag: "Corrector · next question",
    questionTypes: ["clarify", "assumption"],
    explain: {
      beginner:
        "Let's turn the code into a concrete promise. Pick one line that changes a value, then say what should be true immediately after that line. A useful question is whether the next line can rely on that promise. Start with the smallest example you can trace by hand.",
      intermediate:
        "Pick the line that changes the most important state and name the invariant it should preserve. The next question is whether the following line relies on that invariant.",
      advanced: "",
    },
    scaffold: {
      beginner:
        "Scaffold: choose one state change, write the promise after it, then write the smallest input that tests it. Which line changes the state you care about?",
      intermediate:
        "Scaffold: state change, invariant, smallest test. Which line is the hinge?",
      advanced: "Scaffold: state change, invariant, test. Which line is the hinge?",
    },
    questions: {
      beginner: [
        "Which line changes the value you care about, and what should be true right after it?",
        "What is the smallest input that would make that line behave differently than you expect?",
      ],
      intermediate: [
        "Which line is the hinge, and what invariant should it preserve?",
        "What small input would separate the intended behavior from the current behavior?",
      ],
      advanced: ["Which line is the hinge, and what invariant does it preserve?"],
    },
    solution: () =>
      "I do not have enough grounded facts to write a safe full solution for this page. The shape is: name the hinge, state its invariant, then test the smallest input that could break it. Which line would you test first?",
  },
};

const TWO_SUM_MARKERS = ["two sum", "two numbers", "pair sum"];
const LONGEST_MARKERS = ["longest substring", "without repeating", "sliding window"];

function detectProblem(page: PageContext): ProblemKind {
  const haystack = `${page.title}\n${page.statement ?? ""}`.toLowerCase();
  if (TWO_SUM_MARKERS.some((marker) => haystack.includes(marker))) return "two-sum";
  if (LONGEST_MARKERS.some((marker) => haystack.includes(marker))) {
    return "longest-substring";
  }
  return "unknown";
}

function isPython(language: string): boolean {
  return /py/i.test(language);
}

function lineIndex(lines: string[], pattern: RegExp, from = 0): number {
  for (let index = from; index < lines.length; index += 1) {
    if (pattern.test(lines[index] ?? "")) return index;
  }
  return -1;
}

function detectMissingType(
  lines: string[],
  language: string,
): { line: number; anchor: string } | null {
  if (isPython(language)) return null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(
      /\b(?:l|left)\s*=\s*0\s*,\s*(?:r|right)\s*=\s*0\s*,\s*([A-Za-z_]\w*)\s*=\s*0/,
    );
    if (!match) continue;
    if (
      /^\s*(?:int|long|size_t|auto|unsigned|const|static|var|let)\b/.test(line)
    ) {
      continue;
    }
    return { line: index, anchor: match[1] ?? "MaxLen" };
  }
  return null;
}

function detectNestedScan(
  lines: string[],
  problem: ProblemKind,
  code: string,
): { line: number; anchor: string } | null {
  if (problem !== "two-sum") return null;
  if (/\b(?:unordered_map|HashMap|dict|map<)\b/.test(code)) return null;
  const outer = lineIndex(lines, /^\s*for\b/);
  if (outer < 0) return null;
  const inner = lineIndex(lines, /^\s*for\b/, outer + 1);
  if (inner < 0) return null;
  return { line: inner, anchor: "for" };
}

function detectMapOrder(
  lines: string[],
  problem: ProblemKind,
  code: string,
): { line: number; anchor: string } | null {
  if (problem !== "two-sum") return null;
  if (!/\b(?:seen|lookup|index_of|hashmap|map)\b/i.test(code)) return null;
  const lookup = lineIndex(
    lines,
    /(?:need\s+in\s+seen|seen\s*\.\s*(?:find|count|contains)|if\s*\([^)]*seen)/i,
  );
  const insert = lineIndex(
    lines,
    /(?:seen\s*\[|seen\s*\.\s*(?:put|insert|set)|seen\s*\.\s*emplace)/i,
  );
  if (lookup < 0 || insert < 0 || lookup < insert) return null;
  return { line: insert, anchor: "seen" };
}

function detectLoop(lines: string[]): { line: number; anchor: string } | null {
  const loop = lineIndex(lines, /^\s*(?:for|while)\b/);
  if (loop < 0) return null;
  return { line: loop, anchor: "for" };
}

function firstAnchor(lines: string[]): LiveAnchor {
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (!line) continue;
    const identifier = line.match(/[A-Za-z_]\w{3,}/)?.[0];
    return {
      line: index + 1,
      text: identifier ?? line.slice(0, 32),
    };
  }
  return { text: "" };
}

function detectorFor(page: PageContext): {
  detector: LiveDetector;
  anchor: LiveAnchor;
  problem: ProblemKind;
} {
  const lines = page.code.replace(/\r\n/g, "\n").split("\n");
  const problem = detectProblem(page);

  const missingType = detectMissingType(lines, page.language);
  if (missingType) {
    return {
      detector: "missing_type",
      anchor: { line: missingType.line + 1, text: missingType.anchor },
      problem,
    };
  }

  const nested = detectNestedScan(lines, problem, page.code);
  if (nested) {
    return {
      detector: "nested_scan",
      anchor: { line: nested.line + 1, text: nested.anchor },
      problem,
    };
  }

  const order = detectMapOrder(lines, problem, page.code);
  if (order) {
    return {
      detector: "map_order",
      anchor: { line: order.line + 1, text: order.anchor },
      problem,
    };
  }

  const loop = detectLoop(lines);
  if (loop) {
    return {
      detector: "loop_invariant",
      anchor: { line: loop.line + 1, text: loop.anchor },
      problem,
    };
  }

  return { detector: "generic", anchor: firstAnchor(lines), problem };
}

function factsFor(page: PageContext, problem: ProblemKind): GroundingFacts {
  return {
    topic: problem === "two-sum" ? "arrays" : "strings",
    problem: page.statement || page.title,
    language: page.language,
    code: page.code,
    detectedPattern:
      problem === "two-sum"
        ? "pair lookup / scan"
        : problem === "longest-substring"
          ? "sliding window / substring"
          : undefined,
    optimalPattern:
      problem === "two-sum"
        ? "hashmap from value to index, one pass"
        : problem === "longest-substring"
          ? "sliding window with a last-seen index"
          : undefined,
  };
}

function pickQuestion(
  questions: readonly string[],
  askedQuestions: string[],
): string {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const asked = new Set(askedQuestions.map(normalize));
  const fresh = questions.find((question) => !asked.has(normalize(question)));
  if (fresh) return fresh;
  return "What is the smallest concrete input where this line behaves differently than you expect?";
}

function effectiveRung(input: LiveHintInput): Rung {
  if (input.rung === "solution" && input.explicitSolutionRequest !== true) {
    return "pseudocode";
  }
  return input.rung;
}

export function buildLiveHint(input: LiveHintInput): LiveHint {
  const { detector, anchor, problem } = detectorFor(input.page);
  const bank = BANKS[detector];
  const rung = effectiveRung(input);
  const question = pickQuestion(
    bank.questions[input.level] ?? bank.questions.intermediate,
    input.askedQuestions ?? [],
  );

  const body =
    rung === "nudge"
      ? ""
      : rung === "concept"
        ? bank.explain[input.level]
        : rung === "pseudocode"
          ? bank.scaffold[input.level]
          : bank.solution(input.page.language);

  const text =
    rung === "solution"
      ? body
      : [body, question].filter((part) => part.trim().length > 0).join(" ");

  const facts = factsFor(input.page, problem);
  const draft: HintDraft = {
    rung,
    text,
    questionTypes: bank.questionTypes,
    fullSolution: rung === "solution",
  };

  let report = checkHint(draft, {
    level: input.level,
    rung,
    explicitSolutionRequest: input.explicitSolutionRequest,
    askedQuestions: input.askedQuestions,
    facts,
  });

  if (!report.ok) {
    const fallback = buildFallbackQuestion(facts);
    draft.text = fallback;
    draft.fullSolution = false;
    report = checkHint(draft, {
      level: input.level,
      rung,
      explicitSolutionRequest: input.explicitSolutionRequest,
      askedQuestions: input.askedQuestions,
      facts,
    });
  }

  return {
    draft,
    note: bank.note,
    tag: bank.tag,
    anchor,
    facts,
    report,
    detector,
    visual:
      detector === "nested_scan" || detector === "map_order"
        ? "hashmap"
        : detector === "loop_invariant" || detector === "missing_type"
          ? "window"
          : detector === "generic"
            ? "stack"
            : "pointer",
  };
}

export type SolutionVerdict = "optimal" | "brute-force" | "not-yet" | "unclear";

export interface SolutionAssessment {
  verdict: SolutionVerdict;
  label: string;
  complexity: string;
  pattern: string;
  evidence: string;
  improvement: string;
}

/**
 * A static prototype verdict. It is deliberately conservative: it only claims a
 * verdict when the structure is unambiguous, and it never pretends to have run
 * the code. The runner replaces this in M5/M8.
 */
export function assessSolution(page: PageContext): SolutionAssessment {
  const lines = page.code.replace(/\r\n/g, "\n").split("\n");
  const problem = detectProblem(page);
  const missingType = detectMissingType(lines, page.language);
  const code = page.code.toLowerCase();
  const loopLines = lines.filter((line) => /^\s*(?:for|while)\b/.test(line));
  const nested = loopLines.length >= 2;
  const hasMap =
    /unordered_map|hashmap|dictionary|dict\b|seen\s*[\[.]|map</.test(code);

  if (missingType) {
    return {
      verdict: "not-yet",
      label: "Not measurable yet",
      complexity: "does not compile",
      pattern: "declaration error",
      evidence: `The flagged line declares ${missingType.anchor} without a type, so there is no program to measure yet.`,
      improvement: `What type should ${missingType.anchor} have before this can run?`,
    };
  }

  if (problem === "two-sum") {
    if (hasMap && !nested) {
      return {
        verdict: "optimal",
        label: "Likely optimal",
        complexity: "O(n) time · O(n) space",
        pattern: "one-pass hash map",
        evidence:
          "One pass, a complement lookup, and a map insert. No nested rescan is present.",
        improvement:
          "Which edge case would you test first: an empty array or a pair of equal values?",
      };
    }
    if (nested) {
      return {
        verdict: "brute-force",
        label: "Brute force",
        complexity: "O(n²) time · O(1) extra space",
        pattern: "nested pair scan",
        evidence:
          "Two nested loops check pairs; the inner loop rescans the suffix for every i.",
        improvement:
          "What could you remember after seeing each number so the second one does not need a rescan?",
      };
    }
  }

  if (problem === "longest-substring") {
    if (nested && !/\bwhile\b/.test(code)) {
      return {
        verdict: "brute-force",
        label: "Brute force",
        complexity: "O(n²) time · O(n) space",
        pattern: "nested substring scan",
        evidence:
          "The nested loops restart a scan for every starting position; repeated work grows with n².",
        improvement:
          "What could a moving window remember so you never restart the inner scan?",
      };
    }
    if (/\bwhile\b/.test(code) && /\bl\b|\bleft\b/.test(code) && !/\bfor\b/.test(code)) {
      return {
        verdict: "optimal",
        label: "Likely optimal",
        complexity: "O(n) time · O(1) or O(k) space",
        pattern: "sliding window",
        evidence:
          "A single moving window advances both bounds; each character enters and leaves the window at most once.",
        improvement:
          "Which input would you try first: an empty string or a string with every character distinct?",
      };
    }
  }

  return {
    verdict: "unclear",
    label: "Needs a closer look",
    complexity: "not classified",
    pattern: "unrecognised structure",
    evidence:
      "The prototype could not confirm an optimal or brute-force shape from this editor alone.",
    improvement:
      "Which line would you test first with the smallest failing input, and what should it guarantee?",
  };
}

/** Canonical local solutions used by the practice page's explicit-ask path. */
export const LIVE_SOLUTIONS = {
  twoSumPython: TWO_SUM_PYTHON,
  twoSumCpp: TWO_SUM_CPP,
  longestCpp: LONGEST_CPP,
} as const;
