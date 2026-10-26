import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceLadder,
  assessSolution,
  averageHints,
  buildLiveHint,
  createProfile,
  ensureTopic,
  getTopicStats,
  recordAnswer,
  recordAttempt,
  rememberQuestion,
  setTopicLevel,
  startLadder,
  type AnswerKind,
  type AttemptResult,
  type LearnerProfile,
  type Level,
  type LiveHint,
  type PageContext,
  type Rung,
  type TopicStats,
} from "@corrector/core";
import { showAnnotation } from "@corrector/overlay";
import { CodeEditor } from "./CodeEditor";
import {
  API_URL,
  readFileAsDataUrl,
  runIntake,
  type IntakeResult,
} from "./api";
import {
  LANGUAGE_LABEL,
  PROBLEMS,
  type Language,
  type ProblemId,
} from "./problems";

interface SpeechResultEvent {
  results: { 0: { 0: { transcript: string } } };
}

interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

declare global {
  interface Window {
    __CORRECTOR_PAGE__?: { getContext: () => PageContext };
    __correctorAnnotationCleanup?: () => void;
    SpeechRecognition?: new () => SpeechRecognizer;
    webkitSpeechRecognition?: new () => SpeechRecognizer;
  }
}

const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const RUNG_LABEL: Record<Rung, string> = {
  nudge: "Nudge",
  concept: "Concept",
  pseudocode: "Scaffold",
  solution: "Solution",
};

const RUNG_ORDER: Rung[] = ["nudge", "concept", "pseudocode", "solution"];

type IntakeState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; result: IntakeResult; preview?: string }
  | { status: "error"; error: string; preview?: string };

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

function RichText({ text }: { text: string }) {
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

function PolicyStrip({ hint }: { hint: LiveHint }) {
  return (
    <div className={`policy-strip ${hint.report.ok ? "ok" : "bad"}`}>
      <span className="policy-title">
        {hint.report.ok ? "Socratic checks passing" : "Would regenerate"}
      </span>
      <span className="policy-items">
        {hint.report.checks.map((check) => (
          <span key={check.id} className={check.passed ? "ok" : "bad"}>
            {check.passed ? "✓" : "!"} {check.label}
          </span>
        ))}
      </span>
    </div>
  );
}

function Ladder({ current }: { current: Rung }) {
  const currentIndex = RUNG_ORDER.indexOf(current);
  return (
    <div className="ladder-mini" aria-label="Hint ladder">
      {RUNG_ORDER.map((rung, index) => (
        <span
          key={rung}
          className={
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "locked"
          }
        >
          {RUNG_LABEL[rung]}
        </span>
      ))}
    </div>
  );
}

function topicForProblem(problemId: ProblemId): string {
  return PROBLEMS[problemId].topic;
}

function normalizeLanguage(language: string | undefined): Language | null {
  if (!language) return null;
  const value = language.toLowerCase();
  if (value.includes("cpp") || value.includes("c++") || value === "c") return "cpp";
  if (value.includes("py")) return "python";
  return null;
}

function problemFromTitle(title: string | undefined): ProblemId | null {
  const value = (title ?? "").toLowerCase();
  if (value.includes("two sum")) return "two-sum";
  if (value.includes("longest substring") || value.includes("without repeating")) {
    return "longest-substring";
  }
  return null;
}

function mistakeForHint(hint: LiveHint): "wrong_initialization" | "complexity" | "logic" | "other" {
  if (hint.detector === "missing_type") return "wrong_initialization";
  if (hint.detector === "nested_scan" || hint.detector === "map_order") {
    return "complexity";
  }
  if (hint.detector === "loop_invariant") return "logic";
  return "other";
}

export default function App() {
  const [problemId, setProblemId] = useState<ProblemId>("longest-substring");
  const [language, setLanguage] = useState<Language>("cpp");
  const problem = PROBLEMS[problemId];
  const [code, setCode] = useState(problem.starter[language]);
  const [profile, setProfile] = useState<LearnerProfile>(() =>
    ensureTopic(createProfile("beginner"), PROBLEMS["longest-substring"].topic),
  );
  const stats = getTopicStats(profile, problem.topic);
  const level = stats.level;

  const [ladder, setLadder] = useState(() => startLadder(level));
  const [hint, setHint] = useState<LiveHint | null>(null);
  const [answers, setAnswers] = useState<AnswerKind[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [autoNote, setAutoNote] = useState(true);
  const [intake, setIntake] = useState<IntakeState>({ status: "idle" });
  const [spokenQuestion, setSpokenQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const page = useMemo<PageContext>(
    () => ({
      title: problem.title,
      url: typeof window === "undefined" ? undefined : window.location.href,
      language,
      code,
      statement: problem.statement,
      source: "practice",
      lineCount: code.split("\n").length,
    }),
    [problem, language, code],
  );

  useEffect(() => {
    // A stable demo entry point for screenshots and judging: ?demo=1 asks the
    // first grounded question after Monaco has had a moment to lay out.
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    const timer = window.setTimeout(() => handleAsk(), 1200);
    return () => window.clearTimeout(timer);
    // The demo is intentionally a one-shot on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.__CORRECTOR_PAGE__ = {
      getContext: () => ({
        title: problem.title,
        url: window.location.href,
        language,
        code,
        statement: problem.statement,
        source: "practice",
        lineCount: code.split("\n").length,
      }),
    };
    return () => {
      delete window.__CORRECTOR_PAGE__;
    };
  }, [problem, language, code]);

  function clearNote(): void {
    window.__correctorAnnotationCleanup?.();
  }

  function showNote(next: LiveHint | null = hint, attempt = 0): void {
    if (!next) return;
    const result = showAnnotation({
      anchorText: next.anchor.text,
      line: next.anchor.line,
      note: next.note,
      tag: next.tag,
      accent: "#e5484d",
      visual: next.visual,
    });
    if (!result.ok) {
      // Monaco paints lines asynchronously; one short retry keeps the first
      // note from disappearing during a cold load.
      if (attempt < 2) {
        window.setTimeout(() => showNote(next, attempt + 1), 450);
        return;
      }
      setNotice(
        "The note could not find that line. Click once in the editor, then press “Show note” again.",
      );
    }
  }

  useEffect(() => {
    if (!hint || !autoNote) return;
    const timer = window.setTimeout(() => showNote(hint), 120);
    return () => window.clearTimeout(timer);
    // showNote is intentionally tied to the current hint and editor render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, autoNote]);

  useEffect(() => () => clearNote(), []);

  function resetSession(nextLevel: Level): void {
    clearNote();
    setLadder(startLadder(nextLevel));
    setHint(null);
    setAnswers([]);
    setSolved(false);
    setNotice(null);
  }

  function handleProblem(nextId: ProblemId): void {
    if (nextId === problemId) return;
    const nextProblem = PROBLEMS[nextId];
    const nextLevel = getTopicStats(profile, nextProblem.topic).level;
    setProblemId(nextId);
    setCode(nextProblem.starter[language]);
    resetSession(nextLevel);
  }

  function handleLanguage(nextLanguage: Language): void {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    setCode(problem.starter[nextLanguage]);
    resetSession(level);
  }

  function handleLevel(nextLevel: Level): void {
    if (nextLevel === level) return;
    setProfile(setTopicLevel(profile, problem.topic, nextLevel));
    resetSession(nextLevel);
  }

  function handleAsk(): void {
    const withAsked = hint ? rememberQuestion(ladder, hint.draft.text) : ladder;
    const nextLadder = {
      ...withAsked,
      hintsUsed: withAsked.hintsUsed + (hint ? 1 : 0),
    };
    const next = buildLiveHint({
      page,
      level,
      rung: withAsked.rung,
      askedQuestions: withAsked.askedQuestions,
      explicitSolutionRequest: withAsked.solutionRevealed,
    });
    setLadder(nextLadder);
    setHint(next);
    setSolved(false);
    setNotice(null);
  }

  function handleDontKnow(): void {
    if (!hint) {
      handleAsk();
      return;
    }
    const withAsked = rememberQuestion(ladder, hint.draft.text);
    const result = recordAnswer(withAsked, "dont_know");
    const direct = result.move === "explain_directly";
    const next = buildLiveHint({
      page,
      level: direct && level === "advanced" ? "intermediate" : level,
      rung: direct ? "concept" : result.rung,
      askedQuestions: result.state.askedQuestions,
      explicitSolutionRequest: false,
    });
    setLadder(result.state);
    setHint(next);
    setAnswers((current) => [...current, "dont_know"]);
    setNotice(
      direct
        ? "Two “I don’t know” answers on the same point: here is a direct explanation, then one check question."
        : "One rung more explicit. The question changed so you are not asked the same thing twice.",
    );
  }

  function handleJustTell(): void {
    const withAsked = hint ? rememberQuestion(ladder, hint.draft.text) : ladder;
    const result = advanceLadder(withAsked, { escapeHatch: true });
    if (!result.changed) {
      setNotice(result.reason === "already_at_end" ? "The ladder is already at its last rung." : null);
      return;
    }
    const next = buildLiveHint({
      page,
      level,
      rung: result.state.rung,
      askedQuestions: result.state.askedQuestions,
      explicitSolutionRequest: result.state.solutionRevealed,
    });
    setLadder(result.state);
    setHint(next);
    setNotice(
      result.state.rung === "solution"
        ? "The full solution was revealed because you explicitly asked at the scaffold rung. It still ends with a question."
        : "One rung more explicit. That counts as a hint.",
    );
  }

  function handleCorrect(): void {
    setAnswers((current) => [...current, "correct"]);
    setNotice("Good. The next question is still yours to ask — ask when you want the next step.");
  }

  function handleMarkSolved(): void {
    if (!hint) {
      setNotice("Ask for one question first; then this logs the attempt against the local profile.");
      return;
    }
    const result: AttemptResult = recordAttempt(profile, {
      topic: problem.topic,
      solved: true,
      hintsUsed: Math.max(1, ladder.hintsUsed),
      rungsUsed: [ladder.rung],
      answers,
      usedEscapeHatch: ladder.escapeHatches > 0,
      questionTypeThatUnlocked: hint.draft.questionTypes?.[0],
      journal: {
        problem: problem.title,
        pattern: problem.tags[0],
        mistakeType: mistakeForHint(hint),
        unlockedBy: hint.draft.questionTypes?.[0],
      },
      now: new Date().toISOString(),
    });
    setProfile(result.profile);
    setSolved(true);
    setNotice(
      result.change?.message ??
        `Logged ${problem.topic}: ${result.stats.solved}/${result.stats.attempts} solved · ${averageHints(
          result.stats,
        )} hints on average.`,
    );
    if (result.change) {
      setLadder(startLadder(result.stats.level));
      setHint(null);
      clearNote();
    }
  }

  function listenForQuestion(): void {
    const Recognizer = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognizer) {
      setNotice("This browser does not expose the Web Speech API. Type the question instead.");
      return;
    }
    const recognizer = new Recognizer();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setSpokenQuestion(transcript);
      setNotice("Voice note captured in the browser. Gemma receives the transcript as text.");
    };
    recognizer.onerror = () => {
      setListening(false);
      setNotice("Voice capture stopped. You can type the question instead.");
    };
    recognizer.onend = () => setListening(false);
    setListening(true);
    recognizer.start();
  }

  async function handleScreenshot(file: File | undefined): Promise<void> {
    if (!file) return;
    setIntake({ status: "reading" });
    try {
      const preview = await readFileAsDataUrl(file);
      const result = await runIntake({
        imageDataUrl: preview,
        sourceUrl: window.location.href,
        spokenQuestion:
          spokenQuestion ||
          "Read this coding screen and extract the problem, language, code, and the exact line I should look at. Do not solve it.",
      });
      setIntake({ status: "ready", result, preview });
    } catch (error) {
      setIntake({
        status: "error",
        error: error instanceof Error ? error.message : "Gemma intake failed.",
      });
    }
  }

  async function handleTextIntake(): Promise<void> {
    setIntake({ status: "reading" });
    try {
      const result = await runIntake({
        text: code,
        sourceUrl: window.location.href,
        spokenQuestion:
          spokenQuestion ||
          "Use the current editor text as intake. Extract the code and the exact line I should look at. Do not solve it.",
      });
      setIntake({ status: "ready", result });
    } catch (error) {
      setIntake({
        status: "error",
        error: error instanceof Error ? error.message : "Text intake failed.",
      });
    }
  }

  function loadIntakeCode(result: IntakeResult): void {
    if (!result.code?.trim()) return;
    const nextProblem = problemFromTitle(result.title);
    const nextLanguage = normalizeLanguage(result.language);
    if (nextProblem && nextProblem !== problemId) {
      setProblemId(nextProblem);
    }
    if (nextLanguage) setLanguage(nextLanguage);
    setCode(result.code);
    resetSession(getTopicStats(profile, nextProblem ? PROBLEMS[nextProblem].topic : problem.topic).level);
    const nextHint = buildLiveHint({
      page: {
        title: nextProblem ? PROBLEMS[nextProblem].title : result.title ?? problem.title,
        language: nextLanguage ?? language,
        code: result.code,
        statement: result.problemStatement ?? problem.statement,
        source: "gemma-intake",
        lineCount: result.code.split("\n").length,
      },
      level,
      rung: "concept",
      askedQuestions: [],
    });
    setHint(nextHint);
    setNotice("Extracted code loaded. Gemma is the reader here; the question comes from the local Socratic engine.");
  }

  const currentLevelStats: TopicStats = stats;
  const assessment = useMemo(() => assessSolution(page), [page]);
  const intakeReady = intake.status === "ready" ? intake.result : null;

  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ?
          </span>
          <div>
            <h1>Corrector</h1>
            <p>Practice studio · Socratic DSA coach</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="status-pill">
            <span className="status-dot" /> M2–M4 prototype
          </span>
          <a
            className="github-link"
            href="https://github.com/zish-s/Corrector"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <div className="studio">
        <aside className="panel problem-panel">
          <div className="panel-heading">
            <span className="eyebrow">Practice set</span>
            <select
              value={problemId}
              onChange={(event) => handleProblem(event.target.value as ProblemId)}
              aria-label="Choose a problem"
            >
              {Object.values(PROBLEMS).map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="problem-meta">
            <span className={problem.difficulty === "Easy" ? "chip easy" : "chip medium"}>
              {problem.difficulty}
            </span>
            {problem.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          <h2>{problem.title}</h2>
          <p className="problem-statement">{problem.statement}</p>

          <div className="examples">
            {problem.examples.map((example) => (
              <div className="example" key={example.input}>
                <div>
                  <span>Input</span>
                  <code>{example.input}</code>
                </div>
                <div>
                  <span>Output</span>
                  <code>{example.output}</code>
                </div>
                {example.note && <small>{example.note}</small>}
              </div>
            ))}
          </div>

          <div className="constraints">
            <span className="eyebrow">Constraints</span>
            <ul>
              {problem.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          </div>

          <div className="failure-card">
            <span className="eyebrow">Why the starter is interesting</span>
            <p>{problem.sampleFailure}</p>
          </div>
        </aside>

        <main className="workspace">
          <div className="editor-panel panel">
            <div className="editor-toolbar">
              <div className="editor-title">
                <span className="file-dot" />
                <b>solution.{language === "cpp" ? "cpp" : "py"}</b>
                <span className="restored">local only</span>
              </div>
              <div className="toolbar-actions">
                <div className="segmented" aria-label="Language">
                  {(["cpp", "python"] as Language[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={language === item ? "active" : ""}
                      onClick={() => handleLanguage(item)}
                    >
                      {LANGUAGE_LABEL[item]}
                    </button>
                  ))}
                </div>
                <button
                  className="ask-button"
                  type="button"
                  onClick={handleAsk}
                >
                  Ask Corrector
                </button>
              </div>
            </div>
            <CodeEditor value={code} language={language} onChange={setCode} />
            <div className="editor-footer">
              <span>
                {code.split("\n").length} lines · {LANGUAGE_LABEL[language]}
              </span>
              <label className="auto-note-toggle">
                <input
                  type="checkbox"
                  checked={autoNote}
                  onChange={(event) => {
                    setAutoNote(event.target.checked);
                    if (!event.target.checked) clearNote();
                  }}
                />
                auto-show note
              </label>
            </div>
          </div>

          <div className="under-editor">
            <div className="invite-card">
              <span className="eyebrow">The loop</span>
              <p>
                Ask first. Corrector points at the exact line and asks one grounded question.
                The full solution stays locked until you ask for it at the scaffold.
              </p>
            </div>
            <div className="profile-mini panel">
              <div className="profile-mini-head">
                <div>
                  <span className="eyebrow">Per-topic profile</span>
                  <b>{currentLevelStats.topic}</b>
                </div>
                <select
                  value={level}
                  onChange={(event) => handleLevel(event.target.value as Level)}
                  aria-label="Learner level"
                >
                  {(["beginner", "intermediate", "advanced"] as Level[]).map((item) => (
                    <option key={item} value={item}>
                      {LEVEL_LABEL[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="profile-stats">
                <span>
                  <b>{currentLevelStats.solved}</b> solved
                </span>
                <span>
                  <b>{averageHints(currentLevelStats)}</b> avg hints
                </span>
                <span>
                  <b>{currentLevelStats.fastSolves}</b>/3 fast
                </span>
              </div>
              <p className="profile-note">
                {currentLevelStats.manualOverride
                  ? "manual override is on for this topic"
                  : "auto-adjust on · level changes after repeated signals"}
              </p>
            </div>
          </div>

          <section className="intake-panel panel" aria-labelledby="intake-title">
            <div className="intake-head">
              <div>
                <span className="eyebrow">Gemma 4 · multimodal intake</span>
                <h2 id="intake-title">Read a screenshot, not a pasted problem.</h2>
              </div>
              <span className="gemma-badge">Gemma 4</span>
            </div>
            <p className="intake-copy">
              Upload a screenshot of any coding screen. The backend uses Gemma 4 to extract
              the problem, language, code, and a candidate line. The Socratic question is
              still produced locally, so the model never hands over the answer.
            </p>
            <div className="intake-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  void handleScreenshot(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={intake.status === "reading"}
              >
                {intake.status === "reading" ? "Reading with Gemma…" : "Choose a screenshot"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleTextIntake()}
                disabled={intake.status === "reading"}
                title="Sends the current editor text to the backend. Without a Gemma key it uses the local text-only fallback."
              >
                Use the editor as text
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={listenForQuestion}
                disabled={listening}
                title="Uses the browser's speech recognition. The transcript is sent as text; Gemma does not receive raw audio."
              >
                {listening ? "Listening…" : "Speak the question"}
              </button>
              <span className="api-note">
                backend <code>{API_URL}</code> · keys stay server-side · no key reads
                text only
              </span>
            </div>
            {spokenQuestion && (
              <p className="api-note">
                Voice transcript: <b>{spokenQuestion}</b> · sent as text, not raw audio
              </p>
            )}

            {intake.status === "ready" && (
              <div className="intake-result">
                <div className="intake-preview">
                  {intake.preview ? (
                    <img src={intake.preview} alt="Uploaded coding screenshot" />
                  ) : null}
                  <div>
                    <span className="eyebrow">Structured intake</span>
                    <b>{intake.result.title ?? "Untitled screen"}</b>
                    <p>
                      {intake.result.language ?? "unknown language"} ·{" "}
                      {intake.result.code
                        ? `${intake.result.code.split("\n").length} code lines`
                        : "no code extracted"}{" "}
                      · confidence {Math.round((intake.result.confidence ?? 0) * 100)}% ·{" "}
                      {intake.result.provider}
                    </p>
                  </div>
                </div>
                {intake.result.anchor?.text && (
                  <div className="intake-anchor">
                    <span>Gemma anchor</span>
                    <code>
                      {intake.result.anchor.line ? `line ${intake.result.anchor.line}: ` : ""}
                      {intake.result.anchor.text}
                    </code>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() =>
                        showAnnotation({
                          anchorText: intake.result.anchor?.text ?? "",
                          line: intake.result.anchor?.line,
                          note: hint?.note ?? "What should this line guarantee?",
                          tag: "Corrector · Gemma intake",
                        })
                      }
                    >
                      point at it
                    </button>
                  </div>
                )}
                {intake.result.code && (
                  <button
                    className="primary-button compact"
                    type="button"
                    onClick={() => loadIntakeCode(intake.result)}
                  >
                    Load extracted code and ask a question
                  </button>
                )}
                {intake.result.notes && <p className="intake-notes">{intake.result.notes}</p>}
              </div>
            )}

            {intake.status === "error" && (
              <div className="intake-error" role="alert">
                <b>Gemma intake is not available yet.</b>
                <p>{intake.error}</p>
                <p>
                  Start the FastAPI backend and put a fresh Google AI Studio key in
                  <code> services/api/.env</code>. With no key, use{" "}
                  <b>Use the editor as text</b> for the local text-only fallback; the local
                  Monaco loop still works without either.
                </p>
              </div>
            )}
          </section>
        </main>

        <aside className="coach panel">
          <div className="coach-head">
            <div>
              <span className="eyebrow">Socratic coach</span>
              <h2>{hint ? RUNG_LABEL[hint.draft.rung] : "Ask the next question"}</h2>
            </div>
            <span className={`level-chip ${level}`}>{LEVEL_LABEL[level]}</span>
          </div>

          <Ladder current={hint?.draft.rung ?? ladder.rung} />

          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}

          {!hint ? (
            <div className="coach-empty">
              <div className="empty-mark" aria-hidden="true">
                ?
              </div>
              <p>
                Read the starter, then ask. Corrector will find the line it wants to talk
                about and put a red-pen question beside it.
              </p>
              <button className="primary-button" type="button" onClick={handleAsk}>
                Ask one grounded question
              </button>
              <p className="coach-footnote">
                No full solution, no code block on the first two rungs, and at most two
                questions in one turn.
              </p>
            </div>
          ) : (
            <>
              <div className={`hint-card rung-${hint.draft.rung}`} aria-live="polite">
                <div className="hint-head">
                  <span className="eyebrow">
                    {RUNG_LABEL[hint.draft.rung]} · {hint.detector.replace("_", " ")}
                  </span>
                  <span className="anchor-pill">
                    {hint.anchor.line ? `line ${hint.anchor.line}` : "page anchor"}
                  </span>
                </div>
                <RichText text={hint.draft.text} />
                <button
                  className="show-note-button"
                  type="button"
                  onClick={() => showNote()}
                >
                  Show the red-pen note on the editor
                </button>
              </div>

              <PolicyStrip hint={hint} />

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

              <div className="answer-actions">
                <button className="answer-button dont-know" type="button" onClick={handleDontKnow}>
                  <b>I don’t know</b>
                  <span>one rung smaller · never repeat</span>
                </button>
                <button className="answer-button correct" type="button" onClick={handleCorrect}>
                  <b>That landed</b>
                  <span>ask the next step</span>
                </button>
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={handleJustTell}
                disabled={ladder.solutionRevealed}
              >
                <b>
                  {ladder.solutionRevealed
                    ? "Solution revealed"
                    : hint.draft.rung === "pseudocode"
                      ? "Just tell me the solution"
                      : "Just tell me"}
                </b>
                <span>
                  {ladder.solutionRevealed
                    ? "the ladder ends here"
                    : "next rung · counts as a hint"}
                </span>
              </button>

              <button
                className="ghost-button full"
                type="button"
                onClick={handleMarkSolved}
                title="Logs a solved attempt against the local per-topic profile."
              >
                {solved ? "Logged ✓" : "Mark solved and log the attempt"}
              </button>
            </>
          )}

          <div className="coach-bottom">
            <span>
              <b>why this line?</b>{" "}
              {hint
                ? hint.tag
                : "The detector reads structure, then the question is checked before display."}
            </span>
            <span className="privacy-line">
              Screenshots are local until you choose Gemma intake. The extension asks before
              reading a page.
            </span>
          </div>
        </aside>
      </div>

      <footer className="site-footer">
        <span>Corrector · MIT · M2–M4 prototype</span>
        <span>
          Built for Hacktoberfest Hack Day Delhi × SKILLOP DTU · open-weight AI at the core
        </span>
      </footer>
    </div>
  );
}


