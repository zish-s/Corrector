import { describe, expect, it } from "vitest";
import { buildSocraticSystemPrompt } from "../src/prompts.js";
import { createDemoProfile } from "../src/demo.js";

const stats = createDemoProfile().topics.arrays!;

describe("Socratic prompt", () => {
  it("encodes the hard contract and the current state", () => {
    const prompt = buildSocraticSystemPrompt({
      level: "beginner",
      rung: "concept",
      tone: "encouraging",
      language: "en",
      facts: {
        topic: "arrays",
        failingCase: { input: "[3, 3]", expected: "[0, 1]", actual: "[]" },
      },
      stats,
    });
    expect(prompt).toContain("Ask first, tell later");
    expect(prompt).toContain("NON-NEGOTIABLE RESPONSE CONTRACT");
    expect(prompt).toContain("Level: beginner");
    expect(prompt).toContain("Rung: concept");
    expect(prompt).toContain("[3, 3]");
    expect(prompt).toContain("topic: arrays");
    expect(prompt).toContain("preferred unlock question: example");
    expect(prompt).toContain("End the message with one short question");
  });

  it("injects measured optimality and the questions to avoid", () => {
    const prompt = buildSocraticSystemPrompt({
      level: "advanced",
      rung: "nudge",
      tone: "facts",
      language: "en",
      facts: { topic: "arrays", measured: { maxN: 100000, seconds: 4.8, growth: "quadratic" } },
      askedQuestions: ["What repeats in the inner loop?"],
      optimality: {
        verdict: "brute_force",
        evidence: "nested loops detected; n=100,000 took 4.8 s",
      },
    });
    expect(prompt).toContain("Verdict measured by tools: brute_force");
    expect(prompt).toContain("What repeats in the inner loop?");
    expect(prompt).toContain("Tone: plain facts");
  });

  it("switches the output language without translating identifiers", () => {
    const prompt = buildSocraticSystemPrompt({
      level: "intermediate",
      rung: "pseudocode",
      tone: "encouraging",
      language: "hi",
      facts: { topic: "dp", code: "def f(n): return n" },
    });
    expect(prompt).toContain("Hindi (Devanagari)");
    expect(prompt).toContain("def f(n): return n");
  });
});
