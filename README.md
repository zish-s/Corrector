# Corrector

> A Socratic DSA coach that lives beside your coding session. When you get stuck, it reads the screen and asks the next question instead of handing over the answer.

**Status: Milestone 1.** The repo now contains a working Manifest V3 side panel, local screen-capture plumbing, an enforced Socratic contract with tests, a per-topic personalisation model, a demo session that shows the whole loop, and a real hand-drawn on-page note renderer with a local preview. There are no model calls yet.

![Corrector's red-pen note anchored to a line in a mock code editor](docs/assets/overlay-demo.png)

*The on-page layer: a Socratic note with a hand-drawn arrow, anchored to the exact token. The wording asks; it does not hand over the fix. See [docs/VISUAL.md](docs/VISUAL.md).*

## The loop

1. You solve a problem on LeetCode, HackerRank, or your own practice page.
2. You write an approach and get stuck somewhere in the middle.
3. You click the Corrector icon (or press `Ctrl+Shift+Y`). The side panel opens beside the page.
4. `Read this screen` captures the visible tab locally, so you do not have to paste your code.
5. Corrector asks **one grounded question at a time**. A small red-pen note appears next to the relevant line, with a hand-drawn arrow pointing at the exact token. Your answer changes the next question. It never hands over the full solution.
6. When your approach is correct, it states the measured verdict — **optimal** or **brute force** — and then asks the improvement question, for example: *"Your code scans the array once for every element — what would let you skip the repeat scan?"*

In Milestone 1 the screenshot is shown back to you, but it is not parsed yet. The two-sum demo problem stands in for intake and exercises the same Socratic ladder and personalisation rules. Gemma turns the screenshot into `{problem_statement, language, code, error_text, spoken_question}` in Milestone 4.

## What works today

- **MV3 extension** with a side panel, toolbar-action opening, and the `Ctrl+Shift+Y` / `Cmd+Shift+Y` shortcut.
- **Screen capture** through `chrome.tabs.captureVisibleTab` with `activeTab`. The screenshot stays in the side panel's memory in M1.
- **On-page annotation renderer**: a Shadow DOM note with a hand-drawn red arrow, anchored to the smallest visible element containing the target text. The preview mocks Striver's two-pane layout; live site adapters arrive in M3. See [docs/VISUAL.md](docs/VISUAL.md).
- **Socratic contract as code** (`packages/core`):
  - at most two questions per response;
  - no code block on the nudge or concept rung;
  - every response ends with a question;
  - no full solution without an explicit ask after pseudocode;
  - a repeated question is rejected.
- **Regeneration guard**: `enforcePolicy` rejects a failing draft, asks the model to regenerate, and falls back to a grounded question if it still fails.
- **Hint ladder**: nudge → concept → pseudocode → solution, with the starting rung set by level and the full solution gated behind an explicit ask.
- **Answer handling**: correct, partly right, wrong (counterexample question), and "I don't know" (move one rung, never repeat).
- **Level per topic** with deterministic auto-adjust (three fast solves with only the first hint → level up; two struggles in a row → level down), manual override, and a "resume auto-adjust" path.
- **Mistake journal** and **preferred question type**, so the next prompt can prefer the question type that unlocked you before.
- **Three answer styles** (beginner / intermediate / advanced) in the system-prompt builder and the demo hints.
- **Optimality verdict** in the demo: the measured brute-force evidence is stated plainly, followed by a Socratic improvement question.

## Quick start

Requires Node 20+ and Chrome/Edge 116+.

```bash
npm install
npm run build
```

Load the extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `apps/extension/dist`.
4. Open any normal `http(s)` tab, then click the Corrector toolbar icon or press `Ctrl+Shift+Y`.
5. In the side panel, click **See the hand-drawn on-page note style →** to open the local overlay preview (or open `apps/extension/dist/overlay-demo.html` directly).

The shortcut can be changed at `chrome://extensions/shortcuts`.

`npm run dev` rebuilds the extension on change. Reload the extension card in `chrome://extensions` after each rebuild.

### “Could not read this tab”

`activeTab` is temporary. It is granted when you click the Corrector toolbar icon **on the coding tab**, and Chrome revokes it when that tab reloads or navigates.

If you see “Chrome did not grant access to this tab”:

1. Open the normal `http(s)` coding page you want to capture.
2. Click the Corrector toolbar icon on that tab. Do not open the side panel from Chrome’s side-panel menu, and do not switch tabs after clicking.
3. Press **Read this screen** again.

After a rebuild, reload the extension card before testing. `chrome://`, the New Tab page, and the Chrome Web Store cannot be captured.

## Verify

```bash
npm run verify   # typecheck + 41 unit tests + production build
npm test
npm run typecheck
```

The tests cover the Socratic checks, regeneration and fallback, ladder transitions, answer handling, per-topic auto-adjust, the mistake journal, and the prompt contract.

## What is intentionally not built yet

- **Milestone 2:** the React + Vite practice website, FastAPI skeleton, and first DigitalOcean deployment.
- **Milestone 3:** reading the problem and code from the practice page, then one real site, and wiring the on-page note to a live anchor.
- **Milestone 4:** Gemma 4 intake through the Gemini API (screenshot/voice → structured JSON, including the anchor).
- **Milestones 5–8:** execution, the open reasoning model on a GPU Droplet, persistence, and measured complexity.
- **Milestones 9–13:** the full animated visual-spec library, dashboard, voice, LoRA training, benchmark, and DEV write-up.

The current verdict is demo data. The real verdict will come from the runner and static analysis, never from the model's opinion alone.

## Architecture at a glance

```text
┌──────────────────────────── Browser ────────────────────────────┐
│  Coding site (LeetCode / HackerRank / practice page)            │
│        │ screenshot + visible code                              │
│        ▼                                                        │
│  MV3 side panel ── Socratic contract (core) ── local profile    │
│        │                    │                                   │
└────────┼────────────────────┼───────────────────────────────────┘
         │ HTTPS              │ facts: traceback, failing case,
         ▼                    │ measured growth, detected pattern
   FastAPI backend ◄──────────┘
         │
         ├── Gemma 4 via Gemini API  (multimodal intake only)
         ├── open reasoning model on a DigitalOcean GPU Droplet (vLLM)
         └── sandboxed runner (Pyodide in the browser, Piston/Judge0 on the droplet)
```

The extension never holds an API key. Profile and journal stay local; only the current request's context leaves the browser. The target design, model split, and trust boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Socratic method and personalisation are code

This is the part that must not drift into a generic "explain my code" chatbot:

- [docs/SOCRATIC.md](docs/SOCRATIC.md) — the 14 rules, how each one is enforced, the ladder state machine, answer handling, and the exact checks.
- [docs/PERSONALISATION.md](docs/PERSONALISATION.md) — level per topic, hint style, starting rung, auto-adjust thresholds, journal, and what the prompt receives.
- [docs/VISUAL.md](docs/VISUAL.md) — the red-pen on-page note, placement, anchoring, accessibility, and prior art.
- [`packages/core/src/policy.ts`](packages/core/src/policy.ts) — the checks and regeneration guard.
- [`packages/core/src/ladder.ts`](packages/core/src/ladder.ts) — the hint ladder.
- [`packages/core/src/profile.ts`](packages/core/src/profile.ts) — per-topic stats and auto-adjust.
- [`packages/core/src/prompts.ts`](packages/core/src/prompts.ts) — the system prompt that encodes the rules.

## Repo layout

```text
apps/
  extension/        MV3 side panel (Vite + React + TypeScript)
  web/              practice website (Milestone 2)
packages/
  core/             Socratic contract, ladder, profile, prompts, demo fixtures
services/
  api/              FastAPI backend (Milestone 2)
docs/               product, Socratic contract, personalisation, architecture, visual, privacy
training/           teacher-generated data and LoRA adapters (Milestone 12)
benchmark/          model comparison and Socratic quality benchmark (Milestone 13)
scripts/            icon generation
```

## Permissions and privacy

Milestone 1 requests two permissions:

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the coach beside the page. |
| `activeTab` | Capture the tab only after you invoke Corrector on it. |

There is **no** `<all_urls>` host permission, no content script, and no network call in M1. The screenshot is held in React state and is not written to disk or uploaded. See [docs/PRIVACY.md](docs/PRIVACY.md) for the full data map and what changes when Gemma intake ships.

## Roadmap

- [x] **M1** Repo skeleton, license, config, MV3 side panel, shortcut, Socratic contract, per-topic profile, demo loop, and the red-pen overlay renderer with a preview.
- [ ] **M2** Practice website with Monaco + FastAPI skeleton on a DigitalOcean Droplet.
- [ ] **M3** Read the problem and code from the practice page, then one real site.
- [ ] **M4** Gemma 4 intake (screenshot/voice → structured JSON) with tests.
- [ ] **M5** Pyodide execution, runner, and error capture.
- [ ] **M6** Open reasoning model on the GPU Droplet with vLLM and a basic hint prompt.
- [ ] **M7** IndexedDB profile, three level styles, hint ladder wired end to end.
- [ ] **M8** Complexity measurement and the optimal-vs-brute-force verdict.
- [ ] **M9** Animated pop-ups: visual spec schema, five components, mascot.
- [ ] **M10** Mistake journal, edge-case prompts, pattern tags, dashboard.
- [ ] **M11** Voice, explain-aloud mode, speech output.
- [ ] **M12** Teacher-generated data, LoRA adapters, adapter serving.
- [ ] **M13** Evaluation, demo, DEV write-up.

## License

MIT. See [LICENSE](LICENSE).
