import {
  LEVELS,
  QUESTION_TYPES,
  type AttemptInput,
  type AttemptResult,
  type JournalEntry,
  type LearnerProfile,
  type Level,
  type LevelChange,
  type QuestionType,
  type TopicStats,
} from "./types.js";

export const FAST_SOLVES_TO_LEVEL_UP = 3;
export const STRUGGLES_TO_LEVEL_DOWN = 2;

export function createTopicStats(topic: string, level: Level): TopicStats {
  return {
    topic,
    level,
    attempts: 0,
    solved: 0,
    hintsUsed: 0,
    fastSolves: 0,
    struggleStreak: 0,
    manualOverride: false,
    unlockedBy: {},
    journal: [],
  };
}

export function createProfile(defaultLevel: Level = "beginner"): LearnerProfile {
  return {
    version: 1,
    defaultLevel,
    topics: {},
    settings: {
      tone: "encouraging",
      language: "en",
      quietMode: false,
      reducedMotion: false,
    },
  };
}

export function ensureTopic(profile: LearnerProfile, topic: string): LearnerProfile {
  if (profile.topics[topic]) return profile;
  return {
    ...profile,
    topics: {
      ...profile.topics,
      [topic]: createTopicStats(topic, profile.defaultLevel),
    },
  };
}

export function getTopicStats(profile: LearnerProfile, topic: string): TopicStats {
  return profile.topics[topic] ?? createTopicStats(topic, profile.defaultLevel);
}

export function setTopicLevel(
  profile: LearnerProfile,
  topic: string,
  level: Level,
  manualOverride = true,
): LearnerProfile {
  const ensured = ensureTopic(profile, topic);
  const current = ensured.topics[topic]!;
  return {
    ...ensured,
    topics: {
      ...ensured.topics,
      [topic]: { ...current, level, manualOverride },
    },
  };
}

export function clearTopicOverride(profile: LearnerProfile, topic: string): LearnerProfile {
  const ensured = ensureTopic(profile, topic);
  const current = ensured.topics[topic]!;
  return {
    ...ensured,
    topics: {
      ...ensured.topics,
      [topic]: { ...current, manualOverride: false },
    },
  };
}

function levelUp(level: Level): Level | null {
  const index = LEVELS.indexOf(level);
  return index < LEVELS.length - 1 ? LEVELS[index + 1]! : null;
}

function levelDown(level: Level): Level | null {
  const index = LEVELS.indexOf(level);
  return index > 0 ? LEVELS[index - 1]! : null;
}

function changeMessage(
  tone: LearnerProfile["settings"]["tone"],
  direction: "up" | "down",
  topic: string,
  from: Level,
  to: Level,
): string {
  if (tone === "facts") {
    return `Level changed on ${topic}: ${from} → ${to}.`;
  }
  if (direction === "up") {
    return `Three clean solves with only a nudge on ${topic} — moving you up to ${to}. You can override this any time.`;
  }
  return `You reached for pseudocode twice in a row on ${topic} — stepping back to ${to} for a bit. That is not a failure; we will rebuild the pattern.`;
}

export function preferredQuestionType(stats: TopicStats): QuestionType | undefined {
  let best: QuestionType | undefined;
  let bestCount = 0;
  for (const type of QUESTION_TYPES) {
    const count = stats.unlockedBy[type] ?? 0;
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

export function averageHints(stats: TopicStats): number {
  if (stats.attempts === 0) return 0;
  return Math.round((stats.hintsUsed / stats.attempts) * 10) / 10;
}

export function buildProfileSummary(stats: TopicStats): string {
  const preferred = preferredQuestionType(stats);
  const recent = stats.journal
    .slice(0, 3)
    .map((entry) => `${entry.problem} (${entry.mistakeType})`)
    .join("; ");
  return [
    `topic: ${stats.topic}`,
    `level: ${stats.level}`,
    `solved: ${stats.solved}/${stats.attempts}`,
    `avg hints: ${averageHints(stats)}`,
    `fast solves: ${stats.fastSolves}/${FAST_SOLVES_TO_LEVEL_UP}`,
    `preferred unlock question: ${preferred ?? "not enough data"}`,
    `recent mistakes: ${recent || "none logged"}`,
  ].join(" · ");
}

/** Deterministic, inspectable auto-adjustment. No model decides the level. */
export function recordAttempt(profile: LearnerProfile, attempt: AttemptInput): AttemptResult {
  const ensured = ensureTopic(profile, attempt.topic);
  const base = ensured.topics[attempt.topic]!;
  // A "fast solve" means the learner needed only the first hint and no escape
  // hatch. At beginner the first hint is the concept rung, so requiring a
  // literal nudge here would make level-up impossible for beginners.
  const fastSolve =
    attempt.solved &&
    attempt.hintsUsed <= 1 &&
    !attempt.usedEscapeHatch &&
    !attempt.rungsUsed.includes("solution");
  const struggled =
    attempt.usedEscapeHatch ||
    attempt.rungsUsed.includes("pseudocode") ||
    attempt.rungsUsed.includes("solution") ||
    attempt.answers.filter((answer) => answer === "dont_know").length >= 2;

  const unlockedBy = attempt.journal?.unlockedBy ?? attempt.questionTypeThatUnlocked;
  const stats: TopicStats = {
    ...base,
    attempts: base.attempts + 1,
    solved: base.solved + (attempt.solved ? 1 : 0),
    hintsUsed: base.hintsUsed + attempt.hintsUsed,
    fastSolves: base.fastSolves,
    struggleStreak: base.struggleStreak,
    unlockedBy: { ...base.unlockedBy },
    journal: [...base.journal],
  };

  if (fastSolve) {
    stats.fastSolves += 1;
  } else {
    stats.fastSolves = 0;
  }

  if (struggled) {
    stats.struggleStreak += 1;
  } else if (attempt.solved) {
    stats.struggleStreak = 0;
  }

  if (unlockedBy) {
    stats.unlockedBy[unlockedBy] = (stats.unlockedBy[unlockedBy] ?? 0) + 1;
  }

  if (attempt.journal) {
    const createdAt = attempt.now ?? new Date().toISOString();
    const entry: JournalEntry = {
      id: `${createdAt}-${stats.journal.length}`,
      problem: attempt.journal.problem,
      topic: attempt.topic,
      pattern: attempt.journal.pattern,
      mistakeType: attempt.journal.mistakeType,
      unlockedBy: attempt.journal.unlockedBy ?? attempt.questionTypeThatUnlocked,
      hintsUsed: attempt.hintsUsed,
      solved: attempt.solved,
      createdAt,
    };
    stats.journal = [entry, ...stats.journal].slice(0, 50);
  }

  let change: LevelChange | undefined;
  if (!stats.manualOverride) {
    if (stats.fastSolves >= FAST_SOLVES_TO_LEVEL_UP) {
      const to = levelUp(stats.level);
      if (to) {
        change = {
          topic: stats.topic,
          from: stats.level,
          to,
          reason: "fast_solves",
          message: changeMessage(ensured.settings.tone, "up", stats.topic, stats.level, to),
        };
        stats.level = to;
      }
      stats.fastSolves = 0;
      stats.struggleStreak = 0;
    } else if (stats.struggleStreak >= STRUGGLES_TO_LEVEL_DOWN) {
      const to = levelDown(stats.level);
      if (to) {
        change = {
          topic: stats.topic,
          from: stats.level,
          to,
          reason: "repeated_struggle",
          message: changeMessage(ensured.settings.tone, "down", stats.topic, stats.level, to),
        };
        stats.level = to;
      }
      stats.struggleStreak = 0;
      stats.fastSolves = 0;
    }
  }

  return {
    profile: {
      ...ensured,
      topics: { ...ensured.topics, [attempt.topic]: stats },
    },
    stats,
    change,
  };
}
