# Corrector — M2–M4 working prototype

**Status: submission-ready prototype. Last updated 26 October 2026.**

![Corrector's practice studio with a red-pen Socratic note anchored to MaxLen](assets/prototype.png)

## The idea in one sentence

**Corrector is a Socratic DSA coach that sits beside your code, points at the exact line
where your reasoning breaks, and asks one grounded question instead of handing you the
answer.**

Most coding assistants optimise for speed-to-answer. Corrector optimises for the moment
after the answer: can you explain why the line works, what it guarantees, and which input
would break it? The model is not allowed to skip that moment.

The prototype has three entry points:

1. **Practice studio.** An original Monaco editor with two buggy starter programs. The
   coach reads the editor, detects the structural mistake, and places a red-pen question
   on the exact token.
2. **Live page.** The MV3 side panel reads the active coding tab through
   `activeTab + scripting`, sends the visible code to the same deterministic coach, and
   injects the note directly into the page.
3. **Gemma 4 intake.** When a page has no readable editor, the learner can capture the
   visible tab and send that one screenshot to the FastAPI backend. Gemma 4 extracts the
   problem, language, code, and anchor line as strict JSON. The Socratic question itself
   is still produced by the local coach.

## What is real in this build

| Layer | What works | Honest boundary |
| --- | --- | --- |
| MV3 extension | Side panel, toolbar action, `Ctrl+Shift+Y`, `activeTab` capture, `scripting` page reads, on-page overlay | Chrome/Edge only; no persistent content script |
| Practice studio | React + local Monaco, two original problems, C++/Python, live red-pen note, profile and level controls | No code execution or judge yet |
| Live page reader | MAIN-world extractor for the practice bridge, Monaco, CodeMirror, textarea, `<pre>`, plus LeetCode statement heuristics | LeetCode DOM changes; it is a prototype adapter, not a guaranteed integration |
| Socratic contract | Every draft is checked for question count, code blocks on early rungs, ending question, premature solution, and repeated questions | Checks run locally in this prototype; server-side generation is deferred |
| Animated explainers | The note includes a small animated SVG: moving window, hash-map lookup, stack push/pop, or pointer | One explainer per hint; it illustrates the question, not a full animation library |
| Static verdict | `assessSolution` labels a readable approach as likely optimal, brute force, or not measurable yet, with evidence and an improvement question | Static structure only; it does not execute code or measure growth |
| Personalisation | Per-topic level, auto-adjust, manual override, journal, preferred question type | In memory; persistence is deferred |
| Voice question | The practice studio uses the browser Web Speech API to transcribe a spoken question, then sends the transcript as text | Gemma does not receive raw audio; a dedicated audio model is future work |
| Gemma 4 intake | FastAPI endpoint, strict schema, one repair attempt, image validation, text-only local fallback | A real screenshot call needs a fresh server-side `GEMINI_API_KEY`; no key was committed |
| Privacy | Screenshot stays in panel memory until the learner presses Gemma intake; keys are backend-only | The backend and Gemini API are third parties in the image path |

## Why Gemma is intake, not the tutor

The design deliberately splits two jobs:

```text
screenshot ──► Gemma 4 (vision) ──► strict intake JSON
                                      │
                                      ├── problem statement
                                      ├── language
                                      ├── visible code
                                      └── anchor line / token
                                      │
                                      ▼
                         deterministic Socratic coach
                         (checks the draft before display)
                                      │
                                      ▼
                         one question + red-pen note
```

Gemma is excellent at **reading a messy screen**. It is not asked to decide the next
pedagogical move, and it is never asked for the fix. That keeps the Socratic contract
testable and makes the intake step replaceable. The current coach is local and
deterministic; the open-weight reasoning model and server-side generation are M6.

## The five checks the learner can see

Every hint is passed through `packages/core/src/policy.ts` before display:

1. At most two questions in one turn.
2. No fenced code block on the nudge or concept rung.
3. The turn ends with a question.
4. No full solution without an explicit ask after the scaffold.
5. A question that was already asked is rejected.

The practice studio and side panel show the check strip next to the hint. The screenshot
above shows all five green.

## The red-pen layer

The overlay is shared by the practice studio and the extension:

- it prefers a 1-based Monaco/CodeMirror/Ace line;
- if there is no line, it finds the smallest visible element containing the anchor text;
- it draws a hand-drawn arrow and a dashed highlight in a Shadow DOM host;
- it tracks scroll and resize, dismisses with `Esc` or `×`, and respects reduced motion;
- the note is a question, not the reference product's direct correction.

The visual manner is borrowed from the red-pen interaction people already understand. The
pedagogy is deliberately different: the pen asks, it does not lecture.

## Run it

### Prerequisites

- Node.js 20+ (tested on Node 24)
- Python 3.11+ (tested on 3.14)
- Chrome or Edge 116+

### 1. Install and build

```bash
npm install
npm run build
```

### 2. Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `apps/extension/dist`.
4. Open the practice studio at `http://localhost:5173`, then click the Corrector toolbar
   icon **on that tab** (or press `Ctrl+Shift+Y`).

`activeTab` is temporary. Invoke Corrector on the coding tab; do not open the side panel
from Chrome's side-panel menu.

### 3. Start the practice studio

```bash
npm run dev:web
```

Open `http://localhost:5173`. Click **Ask Corrector**. The default problem is the
Longest Substring starter with a missing `int` on line 5. The note should point at
`MaxLen`.

Add `?demo=1` for a screenshot-friendly auto-ask:
`http://localhost:5173/?demo=1`.

### 4. Start the backend (Gemma intake)

```bash
cd services/api
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Put a fresh key from Google AI Studio in .env:
# GEMINI_API_KEY=...
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

The extension's manifest allows `http://localhost:8787/*` and
`http://127.0.0.1:8787/*`. The backend's CORS allows the Vite origin and
`chrome-extension://*`.

With no key, the backend still serves:

- `GET /health` with `gemmaConfigured: false`;
- `POST /v1/intake` for **text only**, using the labelled local fallback.

Image-only intake returns `503` with a clear message. The practice studio's
**Use the editor as text** button demonstrates the fallback; the screenshot path is the
real Gemma path once a key is configured.

### 5. Try the Gemma path

1. Open a coding page in a normal tab.
2. Click Corrector **on that tab**.
3. Press **Read this screen instead**.
4. Press **Read this screen with Gemma 4**.
5. Gemma returns the structured intake; the panel shows the title, language, line count,
   anchor, and confidence.
6. Press **Use extracted code** to run the local Socratic question over it.

The key is read only by the backend. It is never bundled into the extension, and no key is
present in this repository.

## Demo script (about 2 minutes)

1. Open `http://localhost:5173/?demo=1`. The coach points at `MaxLen` and asks:
   *"What type should MaxLen be, and why?"* Point out the five green checks.
2. Press **I don't know**. The ladder moves one rung smaller and the question changes.
3. Press **Just tell me**. The next rung is more explicit and counts as a hint. At the
   scaffold, an explicit ask reveals the full solution — which still ends with a question.
4. Open the extension on a coding tab. Press **Read the code on this page**. The same
   question and red-pen note appear on the live page.
5. Press **Read this screen instead**, then **Read this screen with Gemma 4**. Show the
   structured intake if a key is configured; otherwise show the text fallback and say
   clearly that the image path needs a key.

## Verify

```bash
npm run verify
cd services/api && .venv/Scripts/python -m pytest -q   # Windows
# or: .venv/bin/python -m pytest -q                    # macOS/Linux
```

Current local evidence:

- `npm run typecheck`: core, overlay, extension, web pass.
- `npm test`: 47 unit tests (including 6 live-coach tests) pass.
- `npm run build`: extension and web production builds pass.
- `services/api`: 10 tests pass.
- Manual: text fallback returned `anchor.line = 5`, `anchor.text = "MaxLen"`; the
  practice studio rendered the red-pen note with its animated explainer, showed the static
  verdict, and passed all five checks.

## What is deliberately not in this prototype

- **No code execution / judge.** The starter bugs are curated; the app does not run them.
- **No server-side reasoning model.** The local coach uses detector-specific banks and
  policy checks. M6 replaces the banks with an open-weight model on a GPU Droplet.
- **No persistence.** Reloading resets the profile and journal; IndexedDB is M7.
- **No voice.** Gemma 4 image/text intake is wired; audio is not. Browser speech
  recognition or a separate audio model is future work.
- **No universal site adapter.** The live reader is best on the practice studio and
  Monaco/CodeMirror pages; LeetCode is experimental and subject to DOM changes.
- **No public problem archive.** The practice statements are original; third-party
  statements are read only for the current session, not stored or republished.
- **No commitment that Gemma 4's exact model ID will stay stable.** Verify the model ID in
  Google AI Studio before recording a demo.

## Why this fits the hackathon brief

- **Best Use of Gemma 4:** Gemma is the multimodal intake layer, called server-side with a
  strict JSON schema, image validation, and a repair attempt. The UI labels what Gemma did
  and keeps the tutoring decision separate.
- **Best Open-Source AI Project:** the contract, ladder, profile, overlay, practice studio,
  backend, and tests are in the repo under MIT. The open-weight reasoning model is the
  next milestone, not a claim about this one.
- **A real problem:** learners do not need another answer generator; they need the next
  question at the right moment, attached to the right line.

## Repo map for this prototype

```text
apps/extension/          MV3 side panel, capture, live page reader, Gemma bridge
apps/web/                React + Monaco practice studio, local coach, intake UI
packages/core/           Socratic policy, ladder, profile, live detectors, tests
packages/overlay/        shared red-pen renderer with line anchoring
services/api/            FastAPI + Gemma 4 intake + local text fallback + tests
docs/                    product, Socratic contract, privacy, visual, this prototype
```

## Next steps after the prototype

1. Replace detector banks with the open-weight reasoning model (M6).
2. Add Pyodide execution and a failing-case trace (M5).
3. Measure complexity instead of asserting it (M8).
4. Persist the profile and journal in IndexedDB (M7).
5. Harden the LeetCode adapter and record both success and failure cases.
6. Add a consent-gated evaluation set and the Socratic quality benchmark (M13).
