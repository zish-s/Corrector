# Corrector — product plan

**One sentence:** Corrector is a browser extension that sits beside your DSA session, looks at the screen when you get stuck, and uses a Socratic hint ladder plus a per-topic learner profile to help you repair your own approach — then tells you whether it was optimal or brute force.

This is not a desktop app. It is a Manifest V3 browser extension (Chrome/Edge) with a companion practice website.

## The loop

1. You are solving a problem on LeetCode, HackerRank, or the practice site.
2. You write an approach and get stuck — an error, a wrong answer, or you are not sure.
3. You click the extension on the site. It captures the visible screen, so you do not paste anything.
4. Intake turns the screenshot (and optionally a voice note) into structured JSON: problem, language, code, error, spoken question.
5. Deterministic tools add facts the model must not guess: the real traceback, a failing test case, the measured growth curve, the detected pattern.
6. Corrector asks the first Socratic question, grounded in those facts. Your answer changes the next question. It never hands over the full solution.
7. When your approach is correct, it states the measured verdict — optimal or brute force — plainly. If it is brute force, it asks the improvement question that leads you toward the better data structure or technique.
8. The process repeats until you get it right. The hint ladder moves only when you ask.

## What makes it different

- **It asks, it does not answer.** A wrong approach is diagnosed with questions, not a corrected code block.
- **It is personalised per topic.** You can be beginner at DP and advanced at arrays. The starting rung, sentence count, and amount of explanation follow that topic's level.
- **It knows your history.** The mistake journal records the pattern and mistake type, plus which question type unlocked you. That type is preferred next time.
- **It does not guess optimality.** The runner measures growth and static analysis detects patterns. The model explains the measured facts and asks the improvement question.
- **The full solution is an escape hatch, not the default.** "Just tell me" always works, counts as a hint, and feeds the level auto-adjust. It never feels like a failure.
- **It points at the line.** A small red-pen note with a hand-drawn arrow appears on the page, anchored to the exact token. It borrows the warmth of a teacher's margin note without becoming a compiler error or a solution dump. See [VISUAL.md](VISUAL.md).

## Components

1. **Extension (MV3)**
   - The side panel shows the ladder and hints.
   - The service worker handles the shortcut, `captureVisibleTab` with `activeTab`, and later the API calls.
   - A page adapter reads the problem and code from the practice page first, then one real site. It is injected on demand with `activeTab`; there is no persistent content script on every page.
   - An offscreen document or extension page records the microphone.
   - The red-pen note renders in a Shadow DOM overlay so the host site's CSS cannot break it; a separate animation library adds the richer visual specs later.
2. **Website (React + Vite)**
   - A practice page with Monaco and a few built-in problems (also the safe demo).
   - A dashboard for the profile, mistake journal, pattern counts, and weekly redo list.
3. **Backend (FastAPI, small DigitalOcean Droplet)**
   - Holds the Gemini API key and calls Gemma and the reasoning model.
   - Talks to the code runner. No user code runs on the API host.
4. **GPU Droplet**
   - Serves the open reasoning model with vLLM (LoRA adapters).
   - Hosts the open-source runner (Piston or Judge0) with time and memory limits.

## Model architecture: two models, two jobs

- **Gemma 4 = multimodal intake only, through the Gemini API.** Vision reads the screenshot; voice turns a spoken note into text. It returns structured JSON: `{problem_statement, language, code, error_text, spoken_question}`. This step stays visible in the UI ("Gemma read this") so its role is real, not decorative.
- **Reasoning model = the best open-weight coding model that fits the DigitalOcean GPU Droplet.** Candidates to compare and verify on the model cards: Qwen3-Coder (≈30B total / 3.3B active) and JetBrains Mellum2 (12B / 2.5B, Apache 2.0). DeepSeek V4 (MIT) is too large to host; it is the **teacher** that writes training data.
- Backends are swappable through an OpenAI-compatible endpoint config. Ollama is the local fallback.

## Deterministic tools (the model must use these)

- **Code execution:** Python in the browser via Pyodide in a Web Worker; other languages go to a self-hosted Piston or Judge0 runner with isolation and limits.
- **Complexity measurement:** run the code on growing inputs (`n = 10^2, 10^3, 10^4, ...`), fit the growth curve, and combine it with static analysis (`ast` for Python, `tree-sitter` for other languages, nested-loop detection). This decides optimal vs brute force.
- **Pattern detector:** tag the technique (two pointers, sliding window, hashmap, DP, etc.).
- The model writes the explanation from these facts. It is never the sole judge of optimality.

## Personalisation (the heart)

1. **Level per topic, not one global level.** Example: `{topic: "dp", level: "beginner", solved: 3, hints_used_avg: 2.4}`.
2. **Hint style by level**
   - Beginner: more explanatory, analogy, tiny worked example, 4–6 friendly sentences, full animation.
   - Intermediate: reasoning in 2–3 sentences, short animation.
   - Advanced: one line pointing at the direction, at most a tiny icon or flash.
3. **Hint ladder at every level:** nudge → concept → pseudocode. Show the next rung only when asked.
4. **Auto-adjust with simple rules (no ML):** three fast solves in a topic, using only the first hint, → level up; needing pseudocode or getting stuck repeatedly → level down. Always show a message and allow a dropdown override.
5. **Mistake journal:** problem, pattern, mistake type, and the question type that unlocked you. Retrieve relevant past mistakes into the prompt.
6. **Settings:** tone (encouraging or facts) and hint language (English or Hindi).

The full rules and implementation mapping are in [PERSONALISATION.md](PERSONALISATION.md).

## Socratic method (source of truth)

The complete 14-rule contract is in [SOCRATIC.md](SOCRATIC.md). In brief:

- Ask first, tell later. State a fact directly only when asked, or after two failures on the same point.
- Diagnose with one grounded question that exposes the mental model.
- One question per turn (two at most); end with the question.
- Nudge, concept, and pseudocode rungs are phrased as questions; pseudocode is a scaffold with blanks.
- Full solution only after an explicit ask following pseudocode.
- Correct / partly right / wrong / "I don't know" each produce a different next move.
- Every response is checked against the contract and regenerated if it fails.

## On-page note: the red pen

The visual layer is not a chat window that covers the editor. It is a small paper note — a red border, a handwriting font, a slight tilt — with a hand-drawn arrow pointing at the exact line or token. The reference is a teacher leaning over your shoulder.

- **It asks, it does not correct.** The reference's "you forgot to define `int`" becomes "What type should `MaxLen` be, and why?" The note obeys the same Socratic contract as the side panel.
- **One note at a time.** The rest queue; the learner dismisses with `Esc` or `×`.
- **It never blocks typing.** Only the note card accepts clicks. The arrow and highlight are decorative and `pointer-events: none`.
- **It appears when asked.** No unsolicited annotation on every keystroke. An opt-in live mode can come later.
- **It falls back gracefully.** If the anchor is not on the page, the hint stays in the side panel and the screenshot crop carries the arrow.

The renderer lives in `apps/extension/src/overlay/annotation.ts`. M1 ships the real renderer and a local mock page; live anchoring on Striver/LeetCode and Gemma-supplied anchors arrive in M3–M4. The design, placement, accessibility, and prior art are in [VISUAL.md](VISUAL.md).

## Animated drawing pop-ups

The model never writes raw SVG. It returns a small JSON visual spec, for example:

```json
{
  "type": "array_pointers",
  "array": [2, 7, 11, 15],
  "pointers": [{ "name": "i", "at": 0 }, { "name": "j", "at": 3 }],
  "steps": []
}
```

Our component library renders it. Start with five components: array with moving pointers, hashmap lookup, stack push/pop, linked list/tree traversal, and a loop-count visual for time complexity. Validate every spec against a JSON schema and fall back to plain text if invalid. Hand-drawn look with Rough.js, smooth motion with Motion/GSAP, a small mascot reaction (thinking, nudge, celebration), daily streak, solve celebration, optional break reminder. Respect `prefers-reduced-motion` and add quiet mode.

## Simple extras

- Edge-case prompts before submit ("what if the input is empty, or has duplicates?").
- Pattern tag after solving, with a count of how often you use each pattern.
- Weekly "redo these" list from the mistake journal.
- Explain-aloud mode: push-to-talk, you explain your plan, the AI probes the gaps like a mock interviewer. Gemma handles audio input; replies use browser speech synthesis (or Piper on the backend). Keep faster-whisper as a fallback.

## Self-trainable, in three tiers

1. **Profile + retrieval (no training).** Inject level, topic stats, and relevant past mistakes into every prompt. This delivers most of the personalisation.
2. **LoRA level adapters.** Use the teacher model to write hints at all three levels for many buggy solutions, then train three small adapters (beginner, intermediate, advanced) on the base model with Unsloth or PEFT + TRL. Train on a DigitalOcean GPU Droplet, shut it down, serve with vLLM, swap adapters per request.
3. **Learn from me (stretch).** Log each hint with whether you solved afterwards and thumbs up/down; periodically retrain or use DPO on good/bad pairs.

Be honest in the write-up: fine-tuning on one person's data teaches style, not knowledge of their weaknesses. Real personalisation comes from tier 1; adapters add the level-appropriate voice.

## Suggested stack

- Extension: TypeScript, Vite + React (plain MV3 for M1), side panel.
- Website: React + Vite, Monaco.
- Backend: Python FastAPI.
- Models: Gemini API (Gemma 4); vLLM on a DigitalOcean GPU Droplet.
- Runner: Pyodide, plus Piston or Judge0.
- Analysis: Python `ast`, `tree-sitter`.
- Animations: Rough.js, Motion/GSAP, Lottie.
- Storage: IndexedDB in the extension.
- Tests: Vitest, pytest.

## Build order

1. Repo skeleton, license, config; MV3 extension with side panel + shortcut; Socratic contract, per-topic profile, demo loop, and the red-pen overlay renderer with a local preview. **Done.**
2. Website practice page with Monaco; FastAPI skeleton on a DigitalOcean Droplet.
3. Content script: read problem and code from the practice page, then one real site.
4. Gemma 4 intake (screenshot/voice → structured JSON), with tests.
5. Code execution (Pyodide, then runner) and error capture.
6. Reasoning model on the GPU Droplet with vLLM and a basic hint prompt.
7. Local profile + three level styles + hint ladder end to end.
8. Complexity measurement and optimal vs brute-force verdict.
9. Animated pop-ups: spec schema, five components, mascot.
10. Mistake journal, edge-case prompts, pattern tags, dashboard.
11. Voice (push-to-talk, explain-aloud, speech output).
12. Training pipeline: teacher-generated data, LoRA adapters, serving.
13. Evaluation, demo, write-up.

One milestone at a time; wait for the learner's "done" before starting the next.

## Guardrails

- Never give the full solution unless explicitly asked after the pseudocode rung.
- User code runs only inside the browser worker or the runner sandbox, with limits; never on the backend host.
- No API keys in the extension or the repo; use environment variables and `.env.example`.
- Request minimal extension permissions, and state clearly what leaves the browser (screenshots and code go to Gemma and the backend) and what stays local (profile and journal).
- Read the page only to help with your own session; do not store or republish problem statements from third-party sites.
- Keep the on-page note to one question at a time; never let the visual layer become a solution dump.
- Be honest about the limits of complexity estimates and of the model.

## Deliverables

- Public repo with README, architecture diagram, install steps, and an open-source license.
- Published adapters, training script, and hint dataset.
- A benchmark: the same buggy solution at all three levels (side-by-side outputs and animations), plus accuracy and latency for the model candidates.
- A 2-minute demo script and a screenshot of the red-pen note anchored to a real line.
- A DEV post outline: what I built, demo, code, how it works, and why open models matter here (privacy of my code, self-hosting, reusable adapters).

## Facts to verify before building each integration

- The exact Gemma 4 model ID and vision/audio capabilities available through the Gemini API at build time.
- The current vLLM and PEFT LoRA compatibility for the chosen base model.
- DigitalOcean GPU Droplet sizes, pricing, and available regions for the chosen model.
- The license of every open-weight model before publishing an adapter or claiming open-source compliance.
