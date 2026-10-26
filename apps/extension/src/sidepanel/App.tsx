import { useMemo, useState } from "react";
import {
  TWO_SUM_SCENARIO,
  TWO_SUM_VERDICT,
  advanceLadder,
  averageHints,
  buildFallbackQuestion,
  checkHint,
  clearTopicOverride,
  createDemoProfile,
  demoDirectExplanation,
  demoFollowUp,
  demoHint,
  preferredQuestionType,
  recordAnswer,
  recordAttempt,
  rememberQuestion,
  setTopicLevel,
  startLadder,
  type AnswerKind,
  type HintDraft,
  type LadderState,
  type LearnerProfile,
  type Level,
  type QuestionType,
} from "@corrector/core";
import {
  LEVEL_LABEL,
  LadderView,
  PolicyChecks,
  ProfileCard,
  QUESTION_TYPE_LABEL,
  RUNG_LABEL,
  RichText,
} from "./components";

const TOPIC = "arrays";
const FACTS = TWO_SUM_SCENARIO.facts;
const VERDICT_DRAFT: HintDraft = {
  rung: "concept",
  text: TWO_SUM_VERDICT.improvementQuestion,
  questionTypes: ["consequence"],
};

const ANSWER_OPTIONS: ReadonlyArray<{ kind: AnswerKind; label: string; sub: string }> = [
  { kind: "correct", label: "Correct", sub: "I found it" },
  { kind: "partly_right", label: "Partly right", sub: "I am close" },
  { kind: "wrong", label: "Wrong", sub: "That does not hold" },
  { kind: "dont_know", label: "I don't know", sub: "Give me a smaller one" },
];

type Mode = "idle" | "session";

type CaptureState =
  | { status: "idle" }
  | { status: "capturing" }
  | { status: "ready"; dataUrl: string; capturedAt: string }
  | { status: "error"; error: string };

interface CaptureResponse {
  ok: boolean;
  dataUrl?: string;
  error?: string;
  capturedAt?: string;
}

interface Session {
  ladder: LadderState;
  draft: HintDraft;
  followUpIndex: number;
  answers: AnswerKind[];
}

function createSession(level: Level): Session {
  const ladder = startLadder(level);
  return {
    ladder,
    draft: demoHint(level, ladder.rung),
    followUpIndex: 0,
    answers: [],
  };
}

export default function App() {
  const [profile, setProfile] = useState<LearnerProfile>(() => createDemoProfile());
  const stats = profile.topics[TOPIC]!;
  const level = stats.level;
  const [session, setSession] = useState<Session>(() => createSession(level));
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [capture, setCapture] = useState<CaptureState>({ status: "idle" });
  const [verdictVisible, setVerdictVisible] = useState(false);

  const { ladder, draft } = session;
  const lastAnswer = session.answers[session.answers.length - 1];
  const preferred = preferredQuestionType(stats);
  const latest = stats.journal[0];

  const report = useMemo(
    () =>
      checkHint(draft, {
        level,
        rung: draft.rung,
        explicitSolutionRequest: ladder.solutionRevealed,
        askedQuestions: ladder.askedQuestions,
        facts: FACTS,
      }),
    [draft, level, ladder.askedQuestions, ladder.solutionRevealed],
  );

  const verdictReport = useMemo(
    () =>
      checkHint(VERDICT_DRAFT, {
        level,
        rung: "concept",
        askedQuestions: ladder.askedQuestions,
        facts: FACTS,
      }),
    [level, ladder.askedQuestions],
  );

  async function handleCapture() {
    setCapture({ status: "capturing" });
    try {
      if (typeof chrome === "undefined") {
        throw new Error("Screen capture is available only inside the installed extension.");
      }
      const response = (await chrome.runtime.sendMessage({
        type: "corrector:capture-screen",
      })) as CaptureResponse;
      if (!response?.ok || !response.dataUrl) {
        setCapture({
          status: "error",
          error: response?.error ?? "Chrome did not return a screenshot for this tab.",
        });
        return;
      }
      setCapture({
        status: "ready",
        dataUrl: response.dataUrl,
        capturedAt: response.capturedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      setCapture({
        status: "error",
        error: error instanceof Error ? error.message : "Could not capture this tab.",
      });
    }
  }

  function handleStartDemo() {
    setMode("session");
    setVerdictVisible(false);
    setNotice(null);
    setSession(createSession(level));
  }

  function handleNewSession() {
    setMode("idle");
    setCapture({ status: "idle" });
    setVerdictVisible(false);
    setNotice(null);
    setSession(createSession(level));
  }

  function handleLevel(nextLevel: Level) {
    if (nextLevel === level) return;
    setProfile(setTopicLevel(profile, TOPIC, nextLevel));
    setSession(createSession(nextLevel));
    setNotice(null);
  }

  function handleResumeAuto() {
    const next = clearTopicOverride(profile, TOPIC);
    const nextLevel = next.topics[TOPIC]!.level;
    setProfile(next);
    setSession(createSession(nextLevel));
    setNotice("Auto-adjust is on again for arrays. It will move your level after repeated signals.");
  }

  function handleAdvance() {
    const result = advanceLadder(ladder, { escapeHatch: true });
    if (!result.changed) {
      setNotice("The ladder is already at its last rung.");
      return;
    }
    const withAsked = rememberQuestion(ladder, draft.text);
    setSession({
      ...session,
      ladder: { ...result.state, askedQuestions: withAsked.askedQuestions },
      draft: demoHint(level, result.state.rung),
      followUpIndex: 0,
    });
    setNotice(
      result.state.rung === "solution"
        ? "Full solution revealed after your explicit ask. It still ends with a question."
        : null,
    );
  }

  function handleAnswer(kind: AnswerKind) {
    const result = recordAnswer(ladder, kind);
    const withAsked = rememberQuestion(ladder, draft.text);

    let nextDraft: HintDraft;
    if (result.move === "explain_directly") {
      nextDraft = demoDirectExplanation(session.followUpIndex, result.rung);
    } else if (kind === "dont_know") {
      nextDraft =
        result.rung === ladder.rung
          ? {
              rung: result.rung,
              text: buildFallbackQuestion(FACTS),
              questionTypes: ["example"],
            }
          : demoHint(level, result.rung);
    } else {
      nextDraft = demoFollowUp(kind, session.followUpIndex, result.rung);
    }

    setSession({
      ...session,
      ladder: { ...result.state, askedQuestions: withAsked.askedQuestions },
      draft: nextDraft,
      followUpIndex: session.followUpIndex + 1,
      answers: [...session.answers, kind],
    });
    setNotice(
      result.move === "explain_directly"
        ? "You were stuck twice on the same point, so the tutor explained it directly. That is the one exception to questioning."
        : null,
    );
  }

  function handleMarkSolved() {
    const unlockedBy: QuestionType | undefined =
      lastAnswer === "correct" ? draft.questionTypes?.[0] : undefined;
    const result = recordAttempt(profile, {
      topic: TOPIC,
      solved: true,
      hintsUsed: ladder.hintsUsed,
      rungsUsed: [ladder.rung],
      answers: session.answers,
      usedEscapeHatch: ladder.escapeHatches > 0,
      questionTypeThatUnlocked: unlockedBy,
      journal: {
        problem: TWO_SUM_SCENARIO.title,
        pattern: "hashmap",
        mistakeType: "missing_duplicate_case",
        unlockedBy,
      },
      now: new Date().toISOString(),
    });

    setProfile(result.profile);
    setSession(createSession(result.profile.topics[TOPIC]!.level));
    setVerdictVisible(true);
    setNotice(
      result.change?.message ??
        `Logged on arrays: ${result.stats.solved}/${result.stats.attempts} solved · ${averageHints(result.stats)} hints on average.`,
    );
  }

  function handleReset() {
    const next = createDemoProfile();
    setProfile(next);
    setSession(createSession(next.topics[TOPIC]!.level));
    setNotice(null);
    setMode("idle");
    setCapture({ status: "idle" });
    setVerdictVisible(false);
  }

  const advanceLabel = ladder.solutionRevealed
    ? "Solution revealed"
    : draft.rung === "pseudocode"
      ? "Just tell me the solution"
      : "Just tell me";
  const advanceSub = ladder.solutionRevealed
    ? "the ladder ends here"
    : draft.rung === "pseudocode"
      ? "one explicit ask · full solution"
      : "reveals the next rung · counts as a hint";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ?
          </div>
          <div>
            <h1>Corrector</h1>
            <p>Socratic DSA coach</p>
          </div>
        </div>
        <span className="pill">
          <span className="dot" aria-hidden="true" /> local demo
        </span>
      </header>

      <p className="lede">
        Stay in your editor. When you are stuck, Corrector reads the screen and asks one
        grounded question at a time.
      </p>

      <main>
        {mode === "idle" ? (
          <section className="start-card" aria-labelledby="start-title">
            <span className="eyebrow">Start from your screen</span>
            <h2 id="start-title">Stuck halfway through an approach?</h2>
            <p className="start-copy">
              Open Corrector on the tab where you are solving. It reads what is already on
              screen instead of asking you to paste your code.
            </p>

            <ol className="loop-steps">
              <li>
                <span className="loop-number">1</span>
                <div>
                  <b>Solve where you already work</b>
                  <small>LeetCode, HackerRank, or your own editor.</small>
                </div>
              </li>
              <li>
                <span className="loop-number">2</span>
                <div>
                  <b>Click Corrector when you are stuck</b>
                  <small>No copying, no new tab, no full solution.</small>
                </div>
              </li>
              <li>
                <span className="loop-number">3</span>
                <div>
                  <b>Answer one grounded question at a time</b>
                  <small>The ladder moves only when you ask.</small>
                </div>
              </li>
            </ol>

            {capture.status === "ready" && (
              <>
                <div className="screen-frame">
                  <img
                    className="screen-preview"
                    src={capture.dataUrl}
                    alt="Screenshot of the active coding tab"
                  />
                </div>
                <p className="capture-note">
                  Captured {new Date(capture.capturedAt).toLocaleTimeString()} ·{" "}
                  {Math.round(capture.dataUrl.length / 1024)} KB · not uploaded.
                </p>
                <p className="capture-note">
                  This is the exact input Gemma turns into problem, code, and error JSON in
                  Milestone 4. For now the demo problem shows the hint loop.
                </p>
              </>
            )}

            {capture.status === "error" && (
              <div className="capture-error" role="alert">
                <b>Could not read this tab.</b>
                <p>{capture.error}</p>
                <p>
                  Open a normal http(s) coding tab, click the Corrector icon on that tab,
                  then press Read this screen. Chrome blocks chrome:// pages and tabs where
                  the extension was not invoked.
                </p>
              </div>
            )}

            <div className="start-actions">
              {capture.status === "ready" ? (
                <>
                  <button className="primary-button" type="button" onClick={handleStartDemo}>
                    <b>Open the Socratic loop</b>
                    <span>demo problem · Milestone 1</span>
                  </button>
                  <button className="link-button" type="button" onClick={handleCapture}>
                    capture again
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleCapture}
                    disabled={capture.status === "capturing"}
                  >
                    <b>
                      {capture.status === "capturing" ? "Reading the tab…" : "Read this screen"}
                    </b>
                    <span>capture the active tab locally</span>
                  </button>
                  <button className="link-button" type="button" onClick={handleStartDemo}>
                    try the demo problem first
                  </button>
                </>
              )}
            </div>

            <p className="capture-note">
              Chrome grants access only to the tab you invoked Corrector on. In Milestone 1
              the screenshot stays in this panel; Gemma intake is Milestone 4.
            </p>
            <a
              className="overlay-link"
              href="overlay-demo.html"
              target="_blank"
              rel="noreferrer"
            >
              See the hand-drawn on-page note style →
            </a>
          </section>
        ) : (
          <>
            <ProfileCard
              stats={stats}
              level={level}
              preferred={preferred}
              latest={latest}
              onLevel={handleLevel}
              onMarkSolved={handleMarkSolved}
              onResumeAuto={handleResumeAuto}
            />

            {notice && (
              <div className="notice" role="status">
                {notice}
              </div>
            )}

            {verdictVisible ? (
              <>
                <section className="verdict-card" aria-live="polite">
                  <div className="hint-head">
                    <span className="eyebrow">Measured verdict</span>
                    <span className="verdict-badge">brute force</span>
                  </div>
                  <h2>Correct, but not optimal.</h2>
                  <p className="verdict-evidence">{TWO_SUM_VERDICT.evidence}</p>
                  <p className="verdict-question">{TWO_SUM_VERDICT.improvementQuestion}</p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => setVerdictVisible(false)}
                  >
                    <b>Work on the optimal approach</b>
                    <span>back to the hint ladder</span>
                  </button>
                  <p className="checks-note">
                    The verdict comes from the runner and static checks, not from the model's
                    opinion. The improvement is still delivered as a question.
                  </p>
                </section>
                <PolicyChecks report={verdictReport} />
              </>
            ) : (
              <>
                <section className="session-card" aria-label="Current problem">
                  <div className="session-head">
                    <div>
                      <span className="eyebrow">Problem · {TWO_SUM_SCENARIO.title}</span>
                      <p className="facts-line">
                        fail [3, 3] → [] · 4.8 s at n = 100,000 · nested loops
                      </p>
                    </div>
                    <span className="hints-pill">
                      {ladder.hintsUsed} hint{ladder.hintsUsed === 1 ? "" : "s"}
                    </span>
                  </div>
                  <LadderView level={level} ladder={ladder} />
                </section>

                <section
                  className={`hint-card rung-${draft.rung}`}
                  key={draft.text.slice(0, 48)}
                  aria-live="polite"
                >
                  <div className="hint-head">
                    <span className="eyebrow">
                      {RUNG_LABEL[draft.rung]} ·{" "}
                      {draft.questionTypes?.[0]
                        ? QUESTION_TYPE_LABEL[draft.questionTypes[0]]
                        : "question"}
                    </span>
                    <span className="level-chip">{LEVEL_LABEL[level]}</span>
                  </div>

                  <RichText text={draft.text} />

                  {!report.ok && (
                    <div className="policy-warning">
                      This draft failed a Socratic check, so in production it would be
                      regenerated before you saw it.
                      <span>{report.failures.map((failure) => failure.id).join(" · ")}</span>
                    </div>
                  )}
                </section>

                <div className="answer-block">
                  <div className="answer-head">
                    <span>How did that land?</span>
                    <span>changes the next question</span>
                  </div>
                  <div className="answer-grid">
                    {ANSWER_OPTIONS.map((option) => (
                      <button
                        key={option.kind}
                        type="button"
                        className={`answer-button ${option.kind} ${
                          lastAnswer === option.kind ? "selected" : ""
                        }`}
                        onClick={() => handleAnswer(option.kind)}
                      >
                        <b>{option.label}</b>
                        <span>{option.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="primary-button"
                  type="button"
                  onClick={handleAdvance}
                  disabled={ladder.solutionRevealed}
                >
                  <b>{advanceLabel}</b>
                  <span>{advanceSub}</span>
                </button>

                <PolicyChecks report={report} />
              </>
            )}
          </>
        )}
      </main>

      <footer>
        <span>Milestone 1 · local demo</span>
        <span className="footer-actions">
          {mode === "session" && (
            <button className="link-button" type="button" onClick={handleNewSession}>
              new session
            </button>
          )}
          <button className="link-button" type="button" onClick={handleReset}>
            reset demo
          </button>
        </span>
        <p>
          No network calls. Screenshots stay in this panel. Only the{" "}
          <code>sidePanel</code> and <code>activeTab</code> permissions are requested; page
          access ends when the tab is navigated.
        </p>
      </footer>
    </div>
  );
}
