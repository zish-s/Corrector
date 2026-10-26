# Decisions

Short architecture decision records. Each one has a context, the decision, and the consequence we accept.

## ADR-001 — Browser extension, not a desktop app

**Context:** The learner already solves on LeetCode, HackerRank, or Striver's sheet. A separate desktop app would require copying code into it and would lose the visual context.

**Decision:** Build a Manifest V3 extension for Chrome/Edge, with a companion practice website.

**Consequence:** We inherit the extension permission model, MV3 service-worker lifecycle, and per-site DOM differences. That is the price of meeting the learner where they already are.

## ADR-002 — Side panel, not a popup

**Context:** A popup closes when the learner clicks back into the editor, which breaks the hint ladder and the answer flow.

**Decision:** Use `chrome.sidePanel` as the primary UI, opened by the action or `Ctrl+Shift+Y`.

**Consequence:** The panel persists beside the page. On browsers/versions where `sidePanel.open` is unavailable, we fall back to a normal extension tab.

## ADR-003 — Plain Vite multi-entry, not CRXJS (for M1)

**Context:** CRXJS is convenient, but it adds a layer between Vite and the MV3 manifest and has had version churn.

**Decision:** Use a plain Vite build with explicit entries for the side panel, the overlay demo, and the background service worker. The manifest is copied from `public/`.

**Consequence:** We own the entry wiring. The build is small and predictable. Revisit CRXJS only if HMR becomes a significant cost.

## ADR-004 — The Socratic contract lives in `@corrector/core`

**Context:** A prompt-only contract drifts. The same rules must apply in the extension, the website, the benchmark, and future clients.

**Decision:** Put the checks, ladder, profile, and prompt builder in a shared TypeScript package with unit tests. The UI calls the same functions.

**Consequence:** Policy changes require a code change and tests, not just a prompt edit. That is intentional: the contract is a product invariant.

## ADR-005 — Check on the client now, add a server pass later

**Context:** The learner should never see a contract-breaking draft. Client-side checks are immediate and visible; server-side checks are harder to bypass.

**Decision:** Run `checkHint` in the client for M1 and keep `enforcePolicy` ready for the backend. M6 adds a second model pass on the server.

**Consequence:** The client check is mechanical (question count, code fences, endings, repeats) and cannot catch a semantic spoiler. The benchmark and the second pass cover that gap. We say so in the UI.

## ADR-006 — On-demand injection with `activeTab`, not a persistent content script

**Context:** A content script on `<all_urls>` at install time is a large permission ask for a tool that only needs the page when the learner asks for help.

**Decision:** Use `activeTab` + `scripting` to inject the overlay on demand, after the learner invokes Corrector.

**Consequence:** No install-time host access. The trade-off is more activation/cleanup work: navigation revokes `activeTab`, iframes need frame targeting, and SPA route changes need re-anchoring. We handle those in M3.

## ADR-007 — Shadow DOM overlay, not an iframe

**Context:** The note must not be distorted by the host page and must not break it. An iframe isolates styles but loses the host's fonts and adds coordinate translation.

**Decision:** Render the note in a Shadow DOM host appended to `document.documentElement`.

**Consequence:** Fonts and positioning are in the page's coordinate space. Shadow DOM is not a security boundary, but it is sufficient for style isolation. We declare our own box model and use text nodes, not HTML.

## ADR-008 — The red-pen note is a question, not a correction

**Context:** The visual reference says "Hey, you forgot to define `int`". That is a direct correction, which violates the Socratic contract.

**Decision:** Borrow the visual language (red pen, paper note, hand-drawn arrow, exact line) but keep the content a question: "What type should `MaxLen` be, and why?"

**Consequence:** The note may feel less immediately satisfying than a correction, but it preserves the learning loop. Direct explanations only happen after two failures on the same point, per the contract.

## ADR-009 — Gemma 4 is intake only; the reasoning model is separate

**Context:** The hackathon asks for genuine Gemma 4 use and an open-source AI core. One model cannot be both the best multimodal intake and the best hostable code reasoner.

**Decision:** Use Gemma 4 via the Gemini API for screenshot/voice → structured JSON. Use an open-weight coding model on a DigitalOcean GPU Droplet via vLLM for the Socratic reasoning. Use DeepSeek V4 only as the teacher for training data.

**Consequence:** Two services and a routing layer. The intake JSON is testable and replaceable; the reasoning model is swappable through an OpenAI-compatible config. We must keep the boundary honest in the UI and the write-up.

## ADR-010 — Deterministic level auto-adjust, no ML

**Context:** The level should be inspectable and predictable. A model deciding the learner's level is hard to debug and easy to manipulate.

**Decision:** Use fixed rules: three consecutive fast solves → level up; two consecutive struggles → level down. Manual override pauses the rules. A "fast solve" means solved with only the first hint and no escape hatch; at beginner the first hint is the concept rung, so the rule works there too.

**Consequence:** The rules are coarse. They can be replaced later without touching the prompt or UI. The learner can always override.

## ADR-011 — The full solution still ends with a question

**Context:** Rule 4 says every response ends with a question. Rule 7 says the full solution is allowed only after an explicit ask after pseudocode. These can appear to conflict.

**Decision:** The solution response contains the code block, then one short question about an invariant, edge case, or test. The explicit ask unlocks the code, not the end of the dialogue.

**Consequence:** The solution is not a dead end; it feeds the next attempt. The check strip allows the code block at the solution rung and still enforces the ending question.

## ADR-012 — Demo fixtures are labelled, and M1 does not persist

**Context:** A hackathon demo needs a reliable script. Fake data that looks real is a credibility risk.

**Decision:** Ship a clearly labelled Two Sum demo with a real off-by-one bug and measured quadratic growth. The profile is demo data. Nothing persists in M1.

**Consequence:** The demo is reproducible and honest. IndexedDB and real attempts arrive in M7. The UI calls the profile "demo" and explains the fake attempt logging.

## ADR-013 — Screenshot stays local in M1; M4 uploads with disclosure

**Context:** Screenshots can contain private code, personal data, or third-party problem statements.

**Decision:** M1 captures the visible tab but keeps the image in panel memory. M4 sends it to our backend and then to Gemma only after the learner asks for a hint, with a clear "what leaves the browser" note.

**Consequence:** The visual capture path is proven early without a privacy claim we cannot keep. The upload path needs consent, retention rules, and a delete control before it ships.

## ADR-014 — MIT license

**Context:** The project is entering an open-source AI category. The license must be clear and permissive.

**Decision:** MIT for our code. Model and adapter licenses are checked separately before publication.

**Consequence:** Others can reuse the code. We must not relicense a base model or adapter that is not compatible, and we must attribute datasets and prior work.

## ADR-015 — No API keys in the extension or the repo

**Context:** The extension is inspectable; a key shipped in it is public. A key in the repo is public even after deletion.

**Decision:** Keys live only in backend environment variables or the deployment secret store. The extension calls our backend. `.env` is gitignored; `.env.example` has names only. Never paste a key into chat, an issue, or a commit.

**Consequence:** The backend is a required hop for model calls. That is also where rate limits, logging policy, and model routing live. A leaked key must be revoked and rotated, not just removed from the latest commit.

## ADR-016 — One milestone at a time

**Context:** The full product spans intake, execution, hosting, animation, voice, training, and evaluation. Building it all at once would produce a shallow demo.

**Decision:** Build and verify one milestone at a time; wait for the learner's "done" before starting the next.

**Consequence:** The repo always has a working slice. Later milestones can change earlier decisions, but only with a written reason.

## ADR-017 — Verify model facts at build time

**Context:** Model names, sizes, licenses, and API capabilities change. A confident wrong claim is worse than a verified one.

**Decision:** Before each integration, re-check the Gemma 4 model ID and modalities, the chosen open-weight model's license and vLLM/LoRA support, and the GPU Droplet availability.

**Consequence:** Some documentation is intentionally hedged ("candidate", "verify"). The final write-up will state what was actually run.
