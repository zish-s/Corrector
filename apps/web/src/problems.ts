export type Language = "cpp" | "python";
export type ProblemId = "longest-substring" | "two-sum";

export interface Example {
  input: string;
  output: string;
  note?: string;
}

export interface Problem {
  id: ProblemId;
  title: string;
  topic: string;
  difficulty: "Easy" | "Medium";
  tags: string[];
  statement: string;
  examples: Example[];
  constraints: string[];
  starter: Record<Language, string>;
  sampleFailure: string;
}

export const LANGUAGE_LABEL: Record<Language, string> = {
  cpp: "C++",
  python: "Python",
};

export const PROBLEMS: Record<ProblemId, Problem> = {
  "longest-substring": {
    id: "longest-substring",
    title: "Longest Substring Without Repeating Characters",
    topic: "strings",
    difficulty: "Medium",
    tags: ["sliding window", "hash map", "strings"],
    statement:
      "Given a string s, return the length of the longest contiguous substring in which no character appears twice. A substring must be contiguous; a subsequence is not enough.",
    examples: [
      {
        input: 's = "abca"',
        output: "3",
        note: 'The longest windows are "abc" and "bca".',
      },
      {
        input: 's = "bbbbb"',
        output: "1",
        note: 'Every longer window repeats "b".',
      },
      {
        input: 's = "pwwkew"',
        output: "3",
        note: '"wke" is a substring; "pwke" is only a subsequence.',
      },
    ],
    constraints: [
      "0 <= s.length <= 100,000",
      "s contains printable ASCII characters",
      "Aim for O(n) time; the starter is not optimal.",
    ],
    starter: {
      cpp: [
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
      python: [
        "def longest_substring(s):",
        "    best = 0",
        "    for i in range(len(s)):",
        "        seen = set()",
        "        for j in range(i, len(s) - 1):",
        "            if s[j] in seen:",
        "                break",
        "            seen.add(s[j])",
        "            best = max(best, j - i + 1)",
        "    return best",
      ].join("\n"),
    },
    sampleFailure: 'Starter on "abc" returns 2; the last character is never checked.',
  },
  "two-sum": {
    id: "two-sum",
    title: "Two Sum",
    topic: "arrays",
    difficulty: "Easy",
    tags: ["arrays", "hash map", "pair lookup"],
    statement:
      "Given an integer array nums and an integer target, return the indices of two distinct positions whose values add up to target. Exactly one answer may exist; return an empty array when no pair works.",
    examples: [
      {
        input: "nums = [2, 7, 11, 15], target = 9",
        output: "[0, 1]",
        note: "nums[0] + nums[1] = 9.",
      },
      {
        input: "nums = [3, 3], target = 6",
        output: "[0, 1]",
        note: "The two equal values are different positions.",
      },
      {
        input: "nums = [1, 2], target = 4",
        output: "[]",
        note: "No pair reaches the target.",
      },
    ],
    constraints: [
      "2 <= nums.length <= 100,000",
      "Each index may be used at most once",
      "Aim for O(n) time; the starter is O(n²).",
    ],
    starter: {
      cpp: [
        "class Solution {",
        "public:",
        "    vector<int> twoSum(vector<int>& nums, int target) {",
        "        for (int i = 0; i < (int)nums.size(); i++) {",
        "            for (int j = i + 1; j < (int)nums.size() - 1; j++) {",
        "                if (nums[i] + nums[j] == target) {",
        "                    return {i, j};",
        "                }",
        "            }",
        "        }",
        "        return {};",
        "    }",
        "};",
      ].join("\n"),
      python: [
        "def two_sum(nums, target):",
        "    for i in range(len(nums)):",
        "        for j in range(i + 1, len(nums) - 1):",
        "            if nums[i] + nums[j] == target:",
        "                return [i, j]",
        "    return []",
      ].join("\n"),
    },
    sampleFailure:
      "Starter on nums = [3, 3], target = 6 returns []; the inner loop stops one position early.",
  },
};

export function otherProblem(id: ProblemId): ProblemId {
  return id === "two-sum" ? "longest-substring" : "two-sum";
}
