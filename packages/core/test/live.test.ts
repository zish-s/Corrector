import { describe, expect, it } from "vitest";
import {
  buildLiveHint,
  checkHint,
  type Level,
  type PageContext,
  type Rung,
} from "../src/index.js";

const LONGEST: PageContext = {
  title: "Longest Substring Without Repeating Characters",
  language: "cpp",
  source: "practice",
  statement:
    "Given a string s, return the length of the longest substring that contains no repeated character.",
  code: [
    "class Solution {",
    "public:",
    "    int lengthOfLongestSubstring(string s) {",
    "        int arr[256] = {0};",
    "        l = 0, r = 0, MaxLen = 0;",
    "        while (r < s.size()) {",
    "            while (arr[s[r]] != 0) {",
    "                arr[s[l]]--;",
    "                l++;",
    "            }",
    "            arr[s[r]]++;",
    "            MaxLen = max(MaxLen, r - l + 1);",
    "            r++;",
    "        }",
    "        return MaxLen;",
    "    }",
    "};",
  ].join("\n"),
};

const TWO_SUM_PY: PageContext = {
  title: "Two Sum",
  language: "python",
  source: "practice",
  statement:
    "Given an array of integers and a target, return the indices of two values that add to the target.",
  code: [
    "def two_sum(nums, target):",
    "    for i in range(len(nums)):",
    "        for j in range(i + 1, len(nums) - 1):",
    "            if nums[i] + nums[j] == target:",
    "                return [i, j]",
    "    return []",
  ].join("\n"),
};

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const RUNGS: Rung[] = ["nudge", "concept", "pseudocode", "solution"];

describe("live page coaching", () => {
  it("finds the missing type and points at MaxLen on line 5", () => {
    const hint = buildLiveHint({
      page: LONGEST,
      level: "beginner",
      rung: "concept",
      askedQuestions: [],
    });

    expect(hint.detector).toBe("missing_type");
    expect(hint.anchor).toEqual({ line: 5, text: "MaxLen" });
    expect(hint.note).toBe("What type should MaxLen be, and why?");
    expect(hint.draft.rung).toBe("concept");
    expect(hint.draft.fullSolution).toBe(false);
    expect(hint.report.ok).toBe(true);
    expect(hint.draft.text).toContain("jar");
    expect(hint.draft.text.endsWith("?")).toBe(true);
  });

  it("uses one terse question for an advanced concept hint", () => {
    const hint = buildLiveHint({
      page: LONGEST,
      level: "advanced",
      rung: "concept",
      askedQuestions: [],
    });

    expect(hint.report.ok).toBe(true);
    expect(hint.draft.text).toBe("What type belongs on MaxLen, and what decides it?");
  });

  it("finds the nested scan and asks about repeated work", () => {
    const hint = buildLiveHint({
      page: TWO_SUM_PY,
      level: "intermediate",
      rung: "nudge",
      askedQuestions: [],
    });

    expect(hint.detector).toBe("nested_scan");
    expect(hint.anchor.line).toBe(3);
    expect(hint.report.ok).toBe(true);
    expect(hint.draft.text.endsWith("?")).toBe(true);
    expect(hint.draft.text).not.toContain("```");
  });

  it("moves to a fresh question when the first one was already asked", () => {
    const first = buildLiveHint({
      page: TWO_SUM_PY,
      level: "intermediate",
      rung: "nudge",
      askedQuestions: [],
    });
    const second = buildLiveHint({
      page: TWO_SUM_PY,
      level: "intermediate",
      rung: "nudge",
      askedQuestions: [first.draft.text],
    });

    expect(second.draft.text).not.toBe(first.draft.text);
    expect(second.report.ok).toBe(true);
  });

  it("keeps the full solution locked until an explicit ask", () => {
    const locked = buildLiveHint({
      page: TWO_SUM_PY,
      level: "beginner",
      rung: "solution",
      askedQuestions: [],
      explicitSolutionRequest: false,
    });
    expect(locked.draft.rung).toBe("pseudocode");
    expect(locked.draft.fullSolution).toBe(false);
    expect(locked.draft.text).not.toContain("```");

    const revealed = buildLiveHint({
      page: TWO_SUM_PY,
      level: "beginner",
      rung: "solution",
      askedQuestions: [],
      explicitSolutionRequest: true,
    });
    expect(revealed.draft.rung).toBe("solution");
    expect(revealed.draft.fullSolution).toBe(true);
    expect(revealed.draft.text).toContain("```python");
    expect(revealed.draft.text.endsWith("?")).toBe(true);
    expect(revealed.report.ok).toBe(true);
  });

  it("passes the policy checks across every level and rung", () => {
    for (const page of [LONGEST, TWO_SUM_PY]) {
      for (const level of LEVELS) {
        for (const rung of RUNGS) {
          const hint = buildLiveHint({
            page,
            level,
            rung,
            askedQuestions: [],
            explicitSolutionRequest: rung === "solution",
          });
          const report = checkHint(hint.draft, {
            level,
            rung: hint.draft.rung,
            explicitSolutionRequest: rung === "solution",
            facts: hint.facts,
            askedQuestions: [],
          });
          expect(report.ok, `${page.title} ${level} ${rung}`).toBe(true);
        }
      }
    }
  });
});
