# Privacy and data map

Corrector handles code, screenshots, and mistakes — things learners are understandably
private about. This document says exactly what stays local, what leaves the browser, and
when.

**Prototype status (M2–M4):** the local practice loop and live page read make no network
call. The Gemma intake button is the only path that sends data out: one screenshot and the
optional spoken/text context go to the FastAPI backend, which forwards the image to the
Gemini API for Gemma 4 intake. There is no analytics, no telemetry, and no background
upload.

## Data map

| Data | Where it lives in this prototype | Leaves the browser? | Later |
| --- | --- | --- | --- |
| Screenshot of the active tab | React state in the side panel; lost when the panel closes | **Only when the learner presses the Gemma intake button** | Backend forwards it to Gemma for intake; no retention by default |
| Problem statement / visible code | Read from the active page into the panel's memory; not stored | **No, unless the learner presses Gemma intake and the code is in the screenshot** | The backend receives the intake JSON; no problem archive |
| Voice note | Not built | **No** | M11: recorded only while push-to-talk is held; a separate audio model is required because Gemma 4 supports images/text/video, not audio |
| Learner profile (level per topic, stats) | In memory in the practice studio / side panel | **No** | M7: IndexedDB locally, with export/delete |
| Mistake journal | In memory (demo data) | **No** | M7: IndexedDB locally |
| Hint requests / responses | Generated locally by `@corrector/core` | **No** | M6: sent to our backend; the backend calls the open-weight reasoning model |
| API keys | Backend `.env` only | **No** | Deployment secret store only |
| Usage logs | None | **No** | Metadata only by default (latency, check pass rate); no code/problem text without explicit consent |
| Training data | None | **No** | M12: only from learners who explicitly opt in, with a visible consent screen and a delete path |

## Permissions

| Permission | Why | Scope |
| --- | --- | --- |
| `sidePanel` | Show the coach beside the page. | The extension's own panel. |
| `activeTab` | Capture the visible tab and read the current page. | Only after the learner invokes Corrector on that tab. Navigating the tab revokes it. |
| `scripting` | Inject the page extractor and the red-pen overlay on demand. | Only the active tab, only after invocation. No install-time host access. |
| Host access to `localhost:8787` / `127.0.0.1:8787` | Call the local FastAPI intake endpoint. | Local backend only. Change this when deploying. |

There is **no** `<all_urls>` host permission at install time, no persistent content script
on every page, and no `tabs` permission for browsing history.

## What the screenshot does and does not contain

A screenshot of a coding tab can contain:

- the problem statement (often third-party content);
- the learner's code;
- test output and error messages;
- the learner's account name, streaks, or other UI;
- anything else visible in the tab.

In this prototype the image stays in the panel's memory until the learner presses
**Read this screen with Gemma 4**. The panel shows the image back so the capture path is
transparent.

The Gemma flow is:

1. The learner presses a button whose label says what will be sent: "Read this screen with
   Gemma 4."
2. The image goes to the FastAPI backend over HTTP on localhost in development (HTTPS in a
   deployment).
3. The backend sends it to the Gemini API for Gemma 4 intake.
4. The structured JSON comes back to the extension. The image is not written to disk by
   this prototype.
5. The learner can dismiss the panel; the screenshot is discarded with the panel state.

We do not upload on page load, on every keystroke, or in the background. One click, one
request.

## Code and third-party problem statements

- We read the page only to help with the learner's current session.
- We do not store or republish problem statements from LeetCode, HackerRank, Striver's
  sheet, or other third-party sites.
- We do not build a public problem archive from scraped content.
- The practice studio uses original statements and deliberately buggy starters; they are
  not copied from a judge.
- Site adapters respect the site's terms and the learner's own access. The extension does
  not bypass paywalls or logins.

## Profile and mistake journal

The profile is the most useful personalisation data and the most sensitive. In this
prototype it is in memory; M7 moves it to IndexedDB on the learner's device.

- Per-topic level, attempts, solves, hints, fast-solve count, struggle streak, manual
  override.
- Mistake journal: problem label, pattern, mistake type, the question type that unlocked
  the learner, hints used, solved, timestamp.
- Settings: tone, language, quiet mode, reduced motion.

The future model receives a short summary (level, stats, preferred question type, last
three mistakes) and the current problem. It does not receive the whole journal unless
retrieval adds a specific relevant entry. The summary is visible in the prompt builder and
documented in `docs/PERSONALISATION.md`.

Export and delete will be first-class controls, not a hidden settings page.

## API keys

- Keys are backend-only: `GEMINI_API_KEY`, `REASONING_API_KEY`, `RUNNER_TOKEN`.
- `.env` is gitignored; `.env.example` contains names, never values.
- The extension has no key and never calls Gemini or a GPU Droplet directly.
- A key pasted into chat, an issue, a screenshot, or a commit is exposed. Revoke and
  rotate it in the provider console; deleting the message or the commit is not enough.
  Treat any exposed key as compromised.

## Logging and analytics

This prototype has no analytics, no telemetry, and no error-reporting SDK. The backend
logs request metadata to its console (method, path, status). It does not write screenshots,
code, or problem text to disk.

For a hosted version, the default will remain metadata only:

- request latency;
- model name and version;
- whether the policy checks passed or failed;
- coarse error categories.

Code, problem text, screenshots, and journal entries are not logged by default. Any
training-data capture is opt-in, separate from using the product, and revocable.

## Model providers

The prototype uses:

- **Gemini API / Gemma 4** for multimodal intake, only when a key is configured and the
  learner presses the intake button.
- No reasoning-model call; the coach is local and deterministic in this build.

The target hosted version will add:

- an **open-weight reasoning model** on a GPU Droplet for hints;
- a **runner** (Pyodide, then self-hosted Piston/Judge0) for code execution.

The privacy page will name the subprocessors, link their policies, and state the retention
period. The extension will keep the one-line "what leaves the browser" notice at the point
of upload.

## What we will never do

- Sell learner data.
- Train on a learner's code without explicit consent.
- Publish a learner's problem statement or code.
- Put an API key in the extension bundle or the repo.
- Read pages in the background without the learner invoking Corrector.
- Claim "private" while uploading screenshots silently.

## Learner controls (target)

- See what is stored.
- Export the profile and journal as JSON.
- Delete a topic, a journal entry, or the whole profile.
- Turn off screenshot upload and use the text-only intake path.
- Turn off animations/quiet mode.
- Choose English or Hindi.
- Disconnect the backend and use a local Ollama fallback (developer mode).

## Contact

The repo is `https://github.com/zish-s/Corrector`. Open an issue for a privacy question or
a deletion request until a dedicated address is published.

## Changes

This document changes when M6 (reasoning model), M7 (persistence), M11 (voice), and M12
(training) ship. The README links the current version, and the extension shows the
disclosure at the point of upload.
