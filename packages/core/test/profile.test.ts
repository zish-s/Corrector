import { describe, expect, it } from "vitest";
import {
  averageHints,
  clearTopicOverride,
  createProfile,
  ensureTopic,
  getTopicStats,
  preferredQuestionType,
  recordAttempt,
  setTopicLevel,
} from "../src/profile.js";
import type { AttemptInput } from "../src/types.js";

function attempt(overrides: Partial<AttemptInput> = {}): AttemptInput {
  return {
    topic: "arrays",
    solved: true,
    hintsUsed: 1,
    rungsUsed: ["nudge"],
    answers: [],
    usedEscapeHatch: false,
    now: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("level per topic", () => {
  it("creates topics at the profile default level", () => {
    const profile = ensureTopic(createProfile("intermediate"), "dp");
    expect(getTopicStats(profile, "dp").level).toBe("intermediate");
  });

  it("keeps topics independent", () => {
    let profile = ensureTopic(createProfile("beginner"), "arrays");
    profile = ensureTopic(profile, "dp");
    profile = setTopicLevel(profile, "dp", "advanced");
    expect(getTopicStats(profile, "arrays").level).toBe("beginner");
    expect(getTopicStats(profile, "dp").level).toBe("advanced");
    expect(getTopicStats(profile, "dp").manualOverride).toBe(true);
  });
});

describe("auto-adjustment", () => {
  it("levels up after three fast solves with only the first hint", () => {
    let profile = ensureTopic(createProfile("beginner"), "arrays");
    for (let index = 0; index < 2; index += 1) {
      const result = recordAttempt(profile, attempt());
      profile = result.profile;
      expect(result.change).toBeUndefined();
    }
    const third = recordAttempt(profile, attempt());
    expect(third.change?.from).toBe("beginner");
    expect(third.change?.to).toBe("intermediate");
    expect(third.change?.reason).toBe("fast_solves");
    expect(third.stats.fastSolves).toBe(0);
    expect(getTopicStats(third.profile, "arrays").level).toBe("intermediate");
  });

  it("lets a beginner level up with only the first concept hint", () => {
    let profile = ensureTopic(createProfile("beginner"), "arrays");
    for (let index = 0; index < 2; index += 1) {
      profile = recordAttempt(
        profile,
        attempt({ rungsUsed: ["concept"] }),
      ).profile;
    }
    const third = recordAttempt(profile, attempt({ rungsUsed: ["concept"] }));
    expect(third.change?.to).toBe("intermediate");
    expect(third.change?.reason).toBe("fast_solves");
  });

  it("does not level up when the learner needed more than the first hint", () => {
    let profile = ensureTopic(createProfile("beginner"), "arrays");
    for (let index = 0; index < 5; index += 1) {
      profile = recordAttempt(
        profile,
        attempt({ hintsUsed: 2, rungsUsed: ["concept"] }),
      ).profile;
    }
    expect(getTopicStats(profile, "arrays").level).toBe("beginner");
  });

  it("levels down after two struggles in a row", () => {
    let profile = ensureTopic(createProfile("intermediate"), "arrays");
    const first = recordAttempt(
      profile,
      attempt({ solved: false, hintsUsed: 2, rungsUsed: ["pseudocode"] }),
    );
    expect(first.change).toBeUndefined();
    const second = recordAttempt(
      first.profile,
      attempt({ solved: false, hintsUsed: 2, rungsUsed: ["pseudocode"] }),
    );
    expect(second.change?.to).toBe("beginner");
    expect(second.change?.reason).toBe("repeated_struggle");
  });

  it("respects a manual override", () => {
    let profile = setTopicLevel(
      ensureTopic(createProfile("beginner"), "arrays"),
      "arrays",
      "beginner",
      true,
    );
    for (let index = 0; index < 4; index += 1) {
      const result = recordAttempt(profile, attempt());
      expect(result.change).toBeUndefined();
      profile = result.profile;
    }
    expect(getTopicStats(profile, "arrays").level).toBe("beginner");
    profile = clearTopicOverride(profile, "arrays");
    expect(getTopicStats(profile, "arrays").manualOverride).toBe(false);
  });
});

describe("mistake journal", () => {
  it("logs entries and prefers the question type that unlocked the learner", () => {
    let profile = ensureTopic(createProfile("beginner"), "arrays");
    profile = recordAttempt(
      profile,
      attempt({
        hintsUsed: 2,
        rungsUsed: ["nudge", "concept"],
        journal: {
          problem: "Two Sum",
          pattern: "hashmap",
          mistakeType: "missing_duplicate_case",
          unlockedBy: "example",
        },
      }),
    ).profile;
    profile = recordAttempt(
      profile,
      attempt({
        journal: {
          problem: "Binary Search",
          pattern: "binary search",
          mistakeType: "off_by_one",
          unlockedBy: "example",
        },
      }),
    ).profile;
    profile = recordAttempt(
      profile,
      attempt({
        journal: {
          problem: "Merge Intervals",
          pattern: "sorting",
          mistakeType: "logic",
          unlockedBy: "assumption",
        },
      }),
    ).profile;

    const stats = getTopicStats(profile, "arrays");
    expect(stats.journal).toHaveLength(3);
    expect(stats.journal[0]?.problem).toBe("Merge Intervals");
    expect(preferredQuestionType(stats)).toBe("example");
    expect(stats.unlockedBy.example).toBe(2);
  });

  it("computes an average hint count", () => {
    expect(averageHints({ ...ensureTopic(createProfile(), "arrays").topics.arrays!, attempts: 2, hintsUsed: 5 })).toBe(2.5);
    expect(averageHints({ ...ensureTopic(createProfile(), "arrays").topics.arrays!, attempts: 0, hintsUsed: 0 })).toBe(0);
  });
});
