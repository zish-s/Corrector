import {
  LEVELS,
  FAST_SOLVES_TO_LEVEL_UP,
  RUNGS,
  STARTING_RUNG,
  averageHints,
  type HintDraft,
  type JournalEntry,
  type LadderState,
  type Level,
  type MistakeType,
  type PolicyReport,
  type QuestionType,
  type Rung,
  type TopicStats,
} from "@corrector/core";

export const RUNG_LABEL: Record<Rung, string> = {
  nudge: "Nudge",
  concept: "Concept",
  pseudocode: "Scaffold",
  solution: "Solution",
};

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  clarify: "clarify",
  assumption: "probe an assumption",
  example: "trace an example",
  consequence: "consequence",
  alternative: "alternative",
};

export const MISTAKE_LABEL: Record<MistakeType, string> = {
  off_by_one: "off-by-one",
  missing_empty_case: "missed an empty input",
  missing_duplicate_case: "missed a duplicate",
  wrong_initialization: "wrong initialization",
  wrong_data_structure: "wrong data structure",
  complexity: "complexity",
  logic: "logic",
  other: "other",
};

interface LadderViewProps {
  level: Level;
  ladder: LadderState;
}

export function LadderView({ level, ladder }: LadderViewProps) {
  const currentIndex = RUNGS.indexOf(ladder.rung);
  return (
    <div className="ladder" role="list" aria-label="Hint ladder">
      {RUNGS.map((rung, index) => {
        const status =
          index < currentIndex ? "done" : index === currentIndex ? "current" : "locked";
        return (
          <div
            className={`ladder-step ${status}`}
            key={rung}
            role="listitem"
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="ladder-dot" aria-hidden="true">
              {status === "done" ? "✓" : index + 1}
            </span>
            <span className="ladder-label">{RUNG_LABEL[rung]}</span>
            {STARTING_RUNG[level] === rung && <span className="start-mark">start</span>}
          </div>
        );
      })}
    </div>
  );
}

interface PolicyChecksProps {
  report: PolicyReport;
}

interface ProfileCardProps {
  stats: TopicStats;
  level: Level;
  preferred?: QuestionType;
  latest?: JournalEntry;
  onLevel: (level: Level) => void;
  onMarkSolved: () => void;
  onResumeAuto: () => void;
}

export function ProfileCard({
  stats,
  level,
  preferred,
  latest,
  onLevel,
  onMarkSolved,
  onResumeAuto,
}: ProfileCardProps) {
  return (
    <section className="profile-card" aria-labelledby="profile-title">
      <div className="profile-head">
        <div>
          <span className="eyebrow">Per-topic profile</span>
          <h2 id="profile-title">
            {stats.topic} <span className="level-badge">{level}</span>
          </h2>
        </div>
        <label className="level-select">
          <span className="sr-only">Level for {stats.topic}</span>
          <select
            value={level}
            onChange={(event) => onLevel(event.target.value as Level)}
            title="Level is stored per topic. Changing it turns off auto-adjust until you resume it."
          >
            {LEVELS.map((option) => (
              <option key={option} value={option}>
                {LEVEL_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stat-row">
        <Stat label="solved" value={String(stats.solved)} />
        <Stat label="avg hints" value={String(averageHints(stats))} />
        <Stat
          label="fast solves"
          value={`${stats.fastSolves}/${FAST_SOLVES_TO_LEVEL_UP}`}
        />
      </div>

      <div className="profile-meta">
        <span>
          preferred unlock{" "}
          <b>{preferred ? QUESTION_TYPE_LABEL[preferred] : "not enough data"}</b>
        </span>
        <span>{stats.manualOverride ? "manual override" : "auto-adjust on"}</span>
      </div>

      {latest && (
        <div className="journal-line">
          <span className="journal-dot" aria-hidden="true" />
          <span>
            Last miss: {latest.problem} · {MISTAKE_LABEL[latest.mistakeType]}
          </span>
          {latest.unlockedBy && (
            <span className="journal-unlock">
              unlocked by {QUESTION_TYPE_LABEL[latest.unlockedBy]}
            </span>
          )}
        </div>
      )}

      <div className="profile-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={onMarkSolved}
          title="Demo helper: logs this attempt against the deterministic level rules."
        >
          Check my solution (demo)
        </button>
        {stats.manualOverride ? (
          <button className="link-button" type="button" onClick={onResumeAuto}>
            resume auto-adjust
          </button>
        ) : (
          <span className="auto-note">level is inferred from attempts</span>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function PolicyChecks({ report }: PolicyChecksProps) {
  return (
    <section className="checks-card" aria-label="Socratic checks">
      <div className="checks-head">
        <span>Socratic checks</span>
        <span className={report.ok ? "pass" : "fail"}>
          {report.ok ? "passing" : "needs regeneration"}
        </span>
      </div>
      <ul className="checks-list">
        {report.checks.map((check) => (
          <li key={check.id} className={check.passed ? "ok" : "bad"}>
            <span className="check-icon" aria-hidden="true">
              {check.passed ? "✓" : "!"}
            </span>
            <span>{check.label}</span>
            <span className="check-detail">{check.detail}</span>
          </li>
        ))}
      </ul>
      <p className="checks-note">
        Every model response must pass these before you see it. This demo runs the same
        checks locally, then shows the draft.
      </p>
    </section>
  );
}

interface RichTextProps {
  text: string;
}

function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={`inline-${index}`}>{part.slice(1, -1)}</code>
        ) : (
          <span key={`text-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

/** Minimal renderer for prose + fenced code. The model never returns raw HTML. */
export function RichText({ text }: RichTextProps) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="rich-text">
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith("```")) {
          const code = part
            .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
            .replace(/```\s*$/, "");
          return (
            <pre key={`code-${index}`}>
              <code>{code}</code>
            </pre>
          );
        }
        return part
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph, paragraphIndex) => (
            <p key={`p-${index}-${paragraphIndex}`}>
              <InlineCode text={paragraph} />
            </p>
          ));
      })}
    </div>
  );
}

export type { HintDraft };
