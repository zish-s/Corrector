# apps/web — practice website

**Status: Milestone 2 placeholder.**

The practice website is a controlled environment for the full loop: a Monaco editor, a few original DSA problems, the Socratic side panel, and the live on-page note. It is also the safe demo: no third-party DOM, no login, no rate limits.

## Planned scope for M2

- React + Vite + TypeScript, sharing `@corrector/core`.
- Monaco editor with a real line/column anchor for the overlay.
- A few original problems (including Two Sum) with visible examples and hidden tests.
- A "Run" button that executes Python in a Pyodide Web Worker.
- A "Get a hint" bridge: the page sends the problem, code, and current error to the extension side panel (or the panel is embedded in the page for the web demo).
- The on-page note uses the same `showAnnotation` renderer as the extension.
- A dashboard placeholder for the profile, journal, and level history.

## Non-goals for M2

- A public problem archive.
- Accounts, billing, or social features.
- Hosting user code on the API host.
- Copying third-party problem statements.

## Commands

Not scaffolded yet. The intended commands are `npm run dev`, `npm run build`, and `npm test` from the workspace root once the package exists.

## Acceptance (draft)

- [ ] Monaco loads a problem and the code persists in local state.
- [ ] Run executes Python in a worker and shows the traceback.
- [ ] Get a hint sends the code and facts to the panel and renders a policy-checked hint.
- [ ] The note anchors to the exact line/token in Monaco and survives scroll.
- [ ] The level and journal update locally after an attempt.

See `docs/MILESTONE-1.md` for the current slice and `docs/ARCHITECTURE.md` for the target.
