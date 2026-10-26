export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const RUNGS = ["nudge", "concept", "pseudocode", "solution"] as const;
export type Rung = (typeof RUNGS)[number];

export const QUESTION_TYPES = [
  "clarify",
  "assumption",
  "example",
  "consequence",
  "alternative",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ANSWER_KINDS = ["correct", "partly_right", "wrong", "dont_know"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export const MISTAKE_TYPES = [
  "off_by_one",
  "missing_empty_case",
  "missing_duplicate_case",
  "wrong_initialization",
  "wrong_data_structure",
  "complexity",
  "logic",
  "other",
] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];

export type Tone = "encouraging" | "facts";
export type HintLanguage = "en" | "hi";

export interface FailingCase {
  input: string;
  expected: string;
  actual: string;
}

export interface MeasuredFact {
  maxN: number;
  seconds: number;
  growth:
    | "constant"
    | "logarithmic"
    | "linear"
    | "linearithmic"
    | "quadratic"
    | "cubic"
    | "exponential"
    | "unknown";
  nestedLoops?: boolean;
  note?: string;
}

/** Facts measured or extracted by deterministic tools. The model may explain
 * these; it must never invent them. */
export interface GroundingFacts {
  topic: string;
  problem?: string;
  language?: string;
  code?: string;
  traceback?: string;
  failingCase?: FailingCase;
  measured?: MeasuredFact;
  detectedPattern?: string;
  optimalPattern?: string;
}

export interface HintDraft {
  rung: Rung;
  text: string;
  questionTypes?: QuestionType[];
  /** True only when this text actually contains the full solution. */
  fullSolution?: boolean;
}

export interface PolicyContext {
  level: Level;
  rung: Rung;
  /** True only after the learner explicitly asks once they are on pseudocode. */
  explicitSolutionRequest?: boolean;
  /** Questions already asked on this problem. Used to avoid repeats. */
  askedQuestions?: string[];
  maxQuestions?: number;
  facts: GroundingFacts;
}

export type PolicyCheckId =
  | "max_questions"
  | "no_code_block"
  | "ends_with_question"
  | "no_full_solution"
  | "fresh_question";

export interface PolicyCheck {
  id: PolicyCheckId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PolicyFailure {
  id: PolicyCheckId;
  instruction: string;
}

export interface PolicyReport {
  ok: boolean;
  checks: PolicyCheck[];
  failures: PolicyFailure[];
}

export interface GuardedHint {
  draft: HintDraft;
  report: PolicyReport;
  regenerations: number;
  usedFallback: boolean;
}

export type Regenerate = (failures: PolicyFailure[], attempt: number) => Promise<HintDraft>;

export interface LadderState {
  rung: Rung;
  /** Includes the first hint shown. */
  hintsUsed: number;
  escapeHatches: number;
  /** "I don't know" count on the current point; reset after a direct explanation. */
  stuckOnPoint: number;
  askedQuestions: string[];
  solved: boolean;
  solutionRevealed: boolean;
}

export interface AdvanceInput {
  /** "Just tell me" always reveals the next rung and counts as a hint. */
  escapeHatch?: boolean;
  /** Explicit ask once already on the pseudocode rung. */
  explicitSolution?: boolean;
}

export interface AdvanceResult {
  state: LadderState;
  changed: boolean;
  blocked: boolean;
  reason: "advanced" | "blocked_solution" | "already_at_end" | "solved";
}

export type AnswerMove =
  | "confirm"
  | "probe_missing"
  | "counterexample"
  | "step_down"
  | "explain_directly";

export interface AnswerResult {
  state: LadderState;
  move: AnswerMove;
  rung: Rung;
  instruction: string;
}

export interface JournalEntry {
  id: string;
  problem: string;
  topic: string;
  pattern?: string;
  mistakeType: MistakeType;
  unlockedBy?: QuestionType;
  hintsUsed: number;
  solved: boolean;
  createdAt: string;
}

export interface TopicStats {
  topic: string;
  level: Level;
  attempts: number;
  solved: number;
  hintsUsed: number;
  /** Consecutive solves that needed only the first hint (the nudge at
   * intermediate/advanced, the concept hint at beginner). */
  fastSolves: number;
  /** Consecutive attempts that needed pseudocode or got stuck twice. */
  struggleStreak: number;
  /** When true, deterministic auto-adjustment leaves this topic alone. */
  manualOverride: boolean;
  unlockedBy: Partial<Record<QuestionType, number>>;
  journal: JournalEntry[];
}

export interface LearnerSettings {
  tone: Tone;
  language: HintLanguage;
  quietMode: boolean;
  reducedMotion: boolean;
}

export interface LearnerProfile {
  version: 1;
  defaultLevel: Level;
  topics: Record<string, TopicStats>;
  settings: LearnerSettings;
}

export interface AttemptJournalInput {
  problem: string;
  pattern?: string;
  mistakeType: MistakeType;
  unlockedBy?: QuestionType;
}

export interface AttemptInput {
  topic: string;
  solved: boolean;
  hintsUsed: number;
  rungsUsed: Rung[];
  answers: AnswerKind[];
  usedEscapeHatch: boolean;
  questionTypeThatUnlocked?: QuestionType;
  journal?: AttemptJournalInput;
  now?: string;
}

export interface LevelChange {
  topic: string;
  from: Level;
  to: Level;
  reason: "fast_solves" | "repeated_struggle";
  message: string;
}

export interface AttemptResult {
  profile: LearnerProfile;
  stats: TopicStats;
  change?: LevelChange;
}
