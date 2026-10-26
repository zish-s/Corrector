import { createProfile, createTopicStats } from "./profile.js";
import type {
  AnswerKind,
  GroundingFacts,
  HintDraft,
  LearnerProfile,
  Level,
  QuestionType,
  Rung,
} from "./types.js";

export type DemoFollowUp = Omit<HintDraft, "rung">;

export interface DemoScenario {
  id: string;
  title: string;
  topic: string;
  facts: GroundingFacts;
  hints: Record<Level, Record<Rung, HintDraft>>;
  followUps: Record<Exclude<AnswerKind, "dont_know">, DemoFollowUp[]>;
  directExplanations: DemoFollowUp[];
}

function hint(
  rung: Rung,
  text: string,
  questionTypes: QuestionType[],
  fullSolution = false,
): HintDraft {
  return { rung, text, questionTypes, fullSolution };
}

const SOLUTION_CODE = [
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

function solution(intro: string): HintDraft {
  return hint(
    "solution",
    `${intro}\n\n${SOLUTION_CODE}\n\nWhich edge case would you test first to prove the early return is safe?`,
    ["example", "consequence"],
    true,
  );
}

export const TWO_SUM_SCENARIO: DemoScenario = {
  id: "two-sum",
  title: "Two Sum",
  topic: "arrays",
  facts: {
    topic: "arrays",
    problem:
      "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Each input has exactly one answer, and you may not use the same element twice.",
    language: "python",
    code: [
      "def two_sum(nums, target):",
      "    for i in range(len(nums)):",
      "        for j in range(i + 1, len(nums) - 1):",
      "            if nums[i] + nums[j] == target:",
      "                return [i, j]",
      "    return []",
    ].join("\n"),
    failingCase: {
      input: "nums = [3, 3], target = 6",
      expected: "[0, 1]",
      actual: "[]",
    },
    measured: {
      maxN: 100000,
      seconds: 4.8,
      growth: "quadratic",
      nestedLoops: true,
    },
    detectedPattern: "nested loops / brute-force pair scan",
    optimalPattern: "hashmap from value to index, one pass",
  },
  hints: {
    beginner: {
      nudge: hint(
        "nudge",
        "You already check every earlier number for each new number. Picture reading 7 in [2, 7, 11, 15] with target 9: which single fact about the numbers before it would make that check unnecessary?",
        ["assumption", "alternative"],
      ),
      concept: hint(
        "concept",
        "Think of the numbers you have already read as a bag you keep searching. A hashmap is like a labelled drawer: you can ask for one exact value without emptying the bag again. In [2, 7, 11, 15] with target 9, after reading 2 you are really looking for 7. Which would you rather do next: A) scan every earlier number again, or B) ask the drawer whether 7 is already there?",
        ["alternative", "example"],
      ),
      pseudocode: hint(
        "pseudocode",
        "Let's fill the scaffold one blank at a time. 1) Create a map from ___ to ___. 2) For each number x, compute need = target − x. 3) If need is already in the map, return ___ and the current index. 4) Otherwise store the current number and index. Blank 1 first: what should the map remember about each number you have already seen?",
        ["clarify"],
      ),
      solution: solution(
        "Here is the one-pass version you asked for after the scaffold. Read the order of the two map operations before you run it.",
      ),
    },
    intermediate: {
      nudge: hint(
        "nudge",
        "The measured run at n = 100,000 takes 4.8 s and the nested-loop check fires — what is the inner loop re-asking that it could answer from memory?",
        ["consequence", "assumption"],
      ),
      concept: hint(
        "concept",
        "Your nested loop performs the same lookup once per pair, so the measured work grows quadratically. The inner loop only needs to know whether a value has already appeared. Which structure answers that question in constant time?",
        ["alternative", "assumption"],
      ),
      pseudocode: hint(
        "pseudocode",
        "Scaffold: one pass; compute the complement; look it up; store the current index. What should the map hold so the lookup is O(1)?",
        ["clarify", "assumption"],
      ),
      solution: solution("The one-pass version you asked for:"),
    },
    advanced: {
      nudge: hint("nudge", "What repeats in the inner loop?", ["clarify"]),
      concept: hint(
        "concept",
        "A hashmap collapses the inner scan. Which value would you key it on?",
        ["assumption"],
      ),
      pseudocode: hint(
        "pseudocode",
        "Scaffold: map value → index, one pass, check the complement before inserting. Why must the check come before the insert?",
        ["consequence", "clarify"],
      ),
      solution: solution("One-pass version:"),
    },
  },
  followUps: {
    correct: [
      {
        text: "Yes — remembering what you have seen is the missing piece. When you read a new number, which value should you look up first?",
        questionTypes: ["clarify"],
      },
      {
        text: "Exactly. Now test the order: in [3, 3] with target 6, what happens if you store the current number before checking the map?",
        questionTypes: ["example", "consequence"],
      },
      {
        text: "Right. What should the map store for each number so the answer can return indices rather than values?",
        questionTypes: ["clarify"],
      },
    ],
    partly_right: [
      {
        text: "You have half of it. Which part is still fuzzy: what to store as the key, or when to check the map?",
        questionTypes: ["clarify", "alternative"],
      },
      {
        text: "Close — your idea remembers numbers. Does it also remember where each number was seen?",
        questionTypes: ["assumption"],
      },
      {
        text: "You are circling it. Which operation inside the loop is still doing a full scan?",
        questionTypes: ["clarify"],
      },
    ],
    wrong: [
      {
        text: "Use the failing case [3, 3] with target 6: your code returns []. Which element does the second 3 need to find?",
        questionTypes: ["example", "consequence"],
      },
      {
        text: "The measured run at n = 100,000 takes 4.8 s. Which work is repeated for every pair?",
        questionTypes: ["consequence"],
      },
      {
        text: "Trace [2, 7, 11, 15] at target 9: after reading 7, which earlier value must the code still remember?",
        questionTypes: ["example"],
      },
    ],
  },
  directExplanations: [
    {
      text: "The map lookup must happen before you store the current number; otherwise [3, 3] lets an element match itself. Which line would you move to fix that?",
      questionTypes: ["example", "consequence"],
    },
    {
      text: "You are checking the array again instead of checking memory. The missing idea is a map from value to index, read before you write. What would you store for 3 on the first visit?",
      questionTypes: ["example"],
    },
  ],
};

export const TWO_SUM_VERDICT = {
  verdict: "brute_force" as const,
  evidence: "nested loops detected · 4.8 s at n = 100,000 · quadratic growth",
  improvementQuestion:
    "Your code scans the array once for every element — what would let you skip the repeat scan?",
};

export function demoHint(level: Level, rung: Rung): HintDraft {
  return TWO_SUM_SCENARIO.hints[level][rung];
}

export function demoFollowUp(
  kind: Exclude<AnswerKind, "dont_know">,
  index: number,
  rung: Rung,
): HintDraft {
  const items = TWO_SUM_SCENARIO.followUps[kind];
  const item = items[index % items.length] ?? items[0]!;
  return { ...item, rung };
}

export function demoDirectExplanation(index: number, rung: Rung): HintDraft {
  const items = TWO_SUM_SCENARIO.directExplanations;
  const item = items[index % items.length] ?? items[0]!;
  return { ...item, rung };
}

/** Demo-only profile so the personalisation UI has something truthful to show
 * before IndexedDB and the backend exist. This is not learner data. */
export function createDemoProfile(): LearnerProfile {
  const profile = createProfile("beginner");
  const arrays = {
    ...createTopicStats("arrays", "beginner"),
    attempts: 4,
    solved: 3,
    hintsUsed: 7,
    fastSolves: 0,
    struggleStreak: 0,
    unlockedBy: { example: 3, assumption: 1 },
    journal: [
      {
        id: "demo-entry-1",
        problem: "Two Sum",
        topic: "arrays",
        pattern: "hashmap",
        mistakeType: "missing_duplicate_case" as const,
        unlockedBy: "example" as const,
        hintsUsed: 2,
        solved: true,
        createdAt: "2026-10-24T18:20:00.000Z",
      },
      {
        id: "demo-entry-2",
        problem: "Binary Search",
        topic: "arrays",
        pattern: "binary search",
        mistakeType: "off_by_one" as const,
        unlockedBy: "assumption" as const,
        hintsUsed: 3,
        solved: false,
        createdAt: "2026-10-22T09:05:00.000Z",
      },
    ],
  };

  return {
    ...profile,
    topics: { arrays },
  };
}
