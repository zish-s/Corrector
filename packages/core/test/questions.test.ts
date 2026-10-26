import { describe, expect, it } from "vitest";
import {
  countQuestions,
  endsWithQuestion,
  lastQuestion,
  normalizeQuestion,
  stripNonProse,
} from "../src/questions.js";

describe("question counting", () => {
  it("counts prose question marks", () => {
    expect(countQuestions("What is the invariant? Why does it hold?")).toBe(2);
    expect(countQuestions("What is the invariant?")).toBe(1);
    expect(countQuestions("No question here.")).toBe(0);
  });

  it("does not count question marks inside code, inline code, or URLs", () => {
    const text = [
      "Look at `nums[i]?` and this URL https://example.com/a?b=1.",
      "```python",
      "x = target? 1 : 0",
      "```",
      "What does the failing case return?",
    ].join("\n");
    expect(countQuestions(text)).toBe(1);
  });

  it("ignores indented code lines", () => {
    expect(countQuestions("    if (x) return y? 1 : 2\nWhat changed?")).toBe(1);
  });
});

describe("question endings", () => {
  it("accepts a trailing question with quotes or brackets", () => {
    expect(endsWithQuestion("Which pointer moves?")).toBe(true);
    expect(endsWithQuestion('Which pointer moves?"')).toBe(true);
    expect(endsWithQuestion("(A or B)?")).toBe(true);
  });

  it("rejects statements and trailing code", () => {
    expect(endsWithQuestion("The pointer moves left.")).toBe(false);
    expect(endsWithQuestion("Which pointer moves?\n```\nx\n```")).toBe(false);
  });

  it("extracts the final question only", () => {
    expect(lastQuestion("First? Second one?")).toBe("Second one?");
    expect(lastQuestion("No question here.")).toBeNull();
  });
});

describe("normalizeQuestion", () => {
  it("ignores casing and punctuation", () => {
    expect(normalizeQuestion("  Which POINTER moves? ")).toBe("which pointer moves");
    expect(normalizeQuestion("Which pointer moves")).toBe("which pointer moves");
  });

  it("keeps non-Latin letters", () => {
    expect(normalizeQuestion("कौन सा पॉइंटर आगे बढ़ेगा?")).toContain("कौन");
  });
});

describe("stripNonProse", () => {
  it("keeps prose intact", () => {
    expect(stripNonProse("What is the invariant?")).toContain("invariant");
  });
});
