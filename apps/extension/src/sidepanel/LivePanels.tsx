import { assessSolution } from "@corrector/core";
import type {
  LadderState,
  Level,
  LiveHint,
  PageContext,
} from "@corrector/core";
import {
  LEVEL_LABEL,
  LadderView,
  PolicyChecks,
  RUNG_LABEL,
  RichText,
} from "./components";

export interface IntakeAnchor {
  line?: number;
  text?: string;
  reason?: string;
}

export interface IntakeResult {
  provider?: string;
  model?: string;
  title?: string;
  problemStatement?: string;
  language?: string;
  code?: string;
  errorText?: string;
  spokenQuestion?: string;
  anchor?: IntakeAnchor;
  confidence?: number;
  notes?: string;
}

export type IntakeState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; result: IntakeResult }
  | { status: "error"; error: string };

interface LiveViewProps {
  page: PageContext;
  hint: LiveHint;
  ladder: LadderState;
  level: Level;
  notice: string | null;
  onShowNote: () => void;
  onDontKnow: () => void;
  onJustTell: () => void;
  onAskAgain: () => void;
  onReadAgain: () => void;
  onBack: () => void;
}

export function LiveView({
  page,
  hint,
  ladder,
  level,
  notice,
  onShowNote,
  onDontKnow,
  onJustTell,
  onAskAgain,
  onReadAgain,
  onBack,
}: LiveViewProps) {
  const codeLines = page.code.split("\n");
  const preview = codeLines.slice(0, 9);
  const assessment = assessSolution(page);
  return (
    <div className="live-view">
      <section className="live-page-card">
        <div className="live-page-head">
          <div>
            <span className="eyebrow">
              Live page · {page.source ?? "generic"} · {page.language}
            </span>
            <h2>{page.title}</h2>
          </div>
          <span className="live-linecount">{codeLines.length} lines</span>
        </div>
        {page.statement && <p className="live-statement">{page.statement.slice(0, 320)}</p>}
        <pre className="live-code-preview">
          {preview.map((line, index) => (
            <span key={`line-${index}`} className={hint.anchor.line === index + 1 ? "focus" : ""}>
              <b>{String(index + 1).padStart(2, " ")}</b>
              {line || " "}
            </span>
          ))}
          {codeLines.length > preview.length && <span className="more">…</span>}
        </pre>
        <div className="live-actions">
          <button className="primary-button compact" type="button" onClick={onShowNote}>
            Point at the line
          </button>
          <button className="link-button" type="button" onClick={onReadAgain}>
            read page again
          </button>
          <button className="link-button" type="button" onClick={onBack}>
            back
          </button>
        </div>
      </section>

      <section className="session-card live-session" aria-label="Live coaching session">
        <div className="session-head">
          <div>
            <span className="eyebrow">Coaching · {page.title}</span>
            <p className="facts-line">
              anchor line {hint.anchor.line ?? "?"} · {hint.detector.replace("_", " ")}
            </p>
          </div>
          <span className="hints-pill">
            {ladder.hintsUsed} hint{ladder.hintsUsed === 1 ? "" : "s"}
          </span>
        </div>
        <LadderView level={level} ladder={ladder} />
      </section>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <section className={`hint-card rung-${hint.draft.rung}`} aria-live="polite">
        <div className="hint-head">
          <span className="eyebrow">
            {RUNG_LABEL[hint.draft.rung]} · {hint.tag}
          </span>
          <span className="level-chip">{LEVEL_LABEL[level]}</span>
        </div>
        <RichText text={hint.draft.text} />
      </section>

      <div className={`verdict-box ${assessment.verdict}`}>
        <div className="verdict-head">
          <span className="eyebrow">Static prototype verdict</span>
          <b>{assessment.label}</b>
        </div>
        <p className="verdict-complexity">
          {assessment.complexity} · {assessment.pattern}
        </p>
        <small>{assessment.evidence}</small>
        <p className="verdict-improvement">{assessment.improvement}</p>
      </div>

      <div className="answer-block">
        <div className="answer-head">
          <span>How did that land?</span>
          <span>changes the next question</span>
        </div>
        <div className="answer-grid live-answer-grid">
          <button className="answer-button dont_know" type="button" onClick={onDontKnow}>
            <b>I don’t know</b>
            <span>smaller question · never repeat</span>
          </button>
          <button className="answer-button correct" type="button" onClick={onAskAgain}>
            <b>Ask the next one</b>
            <span>same rung · fresh question</span>
          </button>
        </div>
      </div>

      <button
        className="primary-button"
        type="button"
        onClick={onJustTell}
        disabled={ladder.solutionRevealed}
      >
        <b>{ladder.solutionRevealed ? "Solution revealed" : "Just tell me"}</b>
        <span>
          {ladder.solutionRevealed
            ? "the ladder ends here"
            : "next rung · counts as a hint"}
        </span>
      </button>

      <PolicyChecks report={hint.report} />
    </div>
  );
}

interface IntakeCardProps {
  state: IntakeState;
  onRead: () => void;
  onUseCode: (result: IntakeResult) => void;
  disabled?: boolean;
}

export function IntakeCard({ state, onRead, onUseCode, disabled }: IntakeCardProps) {
  return (
    <section className="intake-card" aria-labelledby="intake-title">
      <div className="intake-head">
        <div>
          <span className="eyebrow">Gemma 4 · intake</span>
          <h2 id="intake-title">Read the screenshot</h2>
        </div>
        <span className="gemma-chip">Gemma 4</span>
      </div>
      <p className="intake-copy">
        The screenshot stays local until you press this button. The backend uses Gemma 4
        to extract the problem, code, and candidate line; it never returns the fix.
      </p>
      <button
        className="secondary-button"
        type="button"
        onClick={onRead}
        disabled={disabled || state.status === "reading"}
      >
        {state.status === "reading" ? "Gemma is reading…" : "Read this screen with Gemma 4"}
      </button>

      {state.status === "ready" && (
        <div className="intake-result">
          <div className="intake-result-head">
            <b>{state.result.title ?? "Untitled screen"}</b>
            <span>
              {state.result.provider ?? "gemma"} ·{" "}
              {Math.round((state.result.confidence ?? 0) * 100)}%
            </span>
          </div>
          <p>
            {state.result.language ?? "unknown"} ·{" "}
            {state.result.code ? `${state.result.code.split("\n").length} code lines` : "no code"}
          </p>
          {state.result.anchor?.text && (
            <p className="intake-anchor">
              anchor:{" "}
              <code>
                {state.result.anchor.line ? `line ${state.result.anchor.line}: ` : ""}
                {state.result.anchor.text}
              </code>
            </p>
          )}
          {state.result.code && (
            <button
              className="primary-button compact"
              type="button"
              onClick={() => onUseCode(state.result)}
            >
              Use extracted code
            </button>
          )}
          {state.result.notes && <p className="intake-note">{state.result.notes}</p>}
        </div>
      )}

      {state.status === "error" && (
        <div className="capture-error" role="alert">
          <b>Gemma intake unavailable.</b>
          <p>{state.error}</p>
          <p>
            Start <code>services/api</code> and put a fresh key in{" "}
            <code>services/api/.env</code>. The local demo and live page read still work.
          </p>
        </div>
      )}
    </section>
  );
}
