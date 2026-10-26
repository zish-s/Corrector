# Privacy and data map

Corrector handles code, screenshots, and mistakes — things learners are understandably private about. This document says exactly what stays local, what leaves the browser, and when.

**M1 status:** no network calls, no model calls, no analytics. The screenshot is held in the side panel's memory. The on-page note preview is a local extension page.

## Data map

| Data | Where it lives in M1 | Leaves the browser? | Later |
| --- | --- | --- | --- |
| Screenshot of the active tab | React state in the side panel; lost when the panel closes | **No** | M4: sent to our backend and Gemma only when the learner asks for a hint, with a visible disclosure. |
| Problem statement / visible code | Not read in M1 | **No** | M3: read from the current page for the session; M4: sent to the backend to generate the hint. Not stored or republished. |
| Voice note | Not built | **No** | M11: recorded only while push-to-talk is held; sent to Gemma for transcription; not stored by default. |
| Learner profile (level per topic, stats) | In memory (demo data) | **No** | M7: IndexedDB locally. Export/delete controls. |
| Mistake journal | In memory (demo data) | **No** | M7: IndexedDB locally. The prompt receives a short summary, not the whole journal. |
| Hint requests / responses | Not built | **No** | Sent to our backend; the backend calls the models. The extension never holds a model key. |
| API keys | None in the extension or repo | **No** | Backend environment variables or the deployment secret store only. |
| Usage logs | None | **No** | Metadata only by default (latency, check pass rate); no code/problem text without explicit consent. |
| Training data | None | **No** | M12: only from learners who explicitly opt in, with a visible consent screen and a delete path. |

## Permissions

| Permission | Why | Scope |
| --- | --- | --- |
| `sidePanel` | Show the coach beside the page. | The extension's own panel. |
| `activeTab` | Capture the visible tab and, later, inject the overlay. | Only after the learner invokes Corrector on that tab. Navigating the tab revokes it. |
| `scripting` (M3) | Inject the on-page note on demand. | Only the active tab, only after invocation. No install-time host access. |

There is **no** `<all_urls>` host permission at install time, no persistent content script on every page, and no `tabs` permission for browsing history.

## What the screenshot does and does not contain

A screenshot of a coding tab can contain:

- the problem statement (often third-party content);
- the learner's code;
- test output and error messages;
- the learner's account name, streaks, or other UI;
- anything else visible in the tab.

In M1 the image stays in the panel's memory. It is not written to disk, not sent to a server, and not logged. The panel shows the image back to the learner so the capture path is transparent.

When M4 ships, the flow will be:

1. The learner presses a button that says what will be sent: "Send this screen to Corrector to read the problem and code."
2. The image goes to our FastAPI backend over HTTPS.
3. The backend sends it to the Gemini API for Gemma 4 intake.
4. The structured JSON comes back; the image is not retained after the request unless the learner opts in to a saved session.
5. The learner can delete the session; the delete path is visible, not buried.

We will not upload on page load, on every keystroke, or in the background. The learner triggers intake.

## Code and third-party problem statements

- We read the page only to help with the learner's current session.
- We do not store or republish problem statements from LeetCode, HackerRank, Striver's sheet, or other third-party sites.
- We do not build a public problem archive from scraped content.
- The demo uses an original Two Sum statement and an original buggy solution; it is not copied from a judge.
- Site adapters will respect the site's terms and the learner's own access. The extension does not bypass paywalls or logins.

## Profile and mistake journal

The profile is the most useful personalisation data and the most sensitive. In M7 it will live in IndexedDB on the learner's device.

- Per-topic level, attempts, solves, hints, fast-solve count, struggle streak, manual override.
- Mistake journal: problem label, pattern, mistake type, the question type that unlocked the learner, hints used, solved, timestamp.
- Settings: tone, language, quiet mode, reduced motion.

The model receives a short summary (level, stats, preferred question type, last three mistakes) and the current problem. It does not receive the whole journal unless retrieval adds a specific relevant entry. The summary is visible in the prompt builder and documented in `docs/PERSONALISATION.md`.

Export and delete will be first-class controls, not a hidden settings page. A learner can clear a topic or the whole profile.

## API keys

- Keys are backend-only: `GEMINI_API_KEY`, `REASONING_API_KEY`, `RUNNER_TOKEN`.
- `.env` is gitignored; `.env.example` contains names, never values.
- The extension has no key and never calls Gemini or the GPU Droplet directly.
- A key pasted into chat, an issue, a screenshot, or a commit is exposed. Revoke and rotate it in the provider console; deleting the message or the commit is not enough. Treat any exposed key as compromised.

## Logging and analytics

M1 has no analytics, no telemetry, and no error-reporting SDK.

For the hosted version, the default is metadata only:

- request latency;
- model name and version;
- whether the policy checks passed or failed;
- coarse error categories.

Code, problem text, screenshots, and journal entries are not logged by default. Any training-data capture is opt-in, separate from using the product, and revocable.

## Model providers

When the hosted version is live, the backend will use:

- **Gemini API / Gemma 4** for multimodal intake;
- an **open-weight reasoning model** on our DigitalOcean GPU Droplet for hints;
- a **runner** (self-hosted Piston/Judge0) for code execution.

The privacy page will name the subprocessors, link their policies, and state the retention period. The extension will show a one-line "what leaves the browser" notice before the first upload.

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
- Turn off screenshot upload and use the side-panel paste flow instead.
- Turn off animations/quiet mode.
- Choose English or Hindi.
- Disconnect the backend and use a local Ollama fallback (developer mode).

## Contact

The repo is `https://github.com/zish-s/Corrector`. Open an issue for a privacy question or a deletion request until a dedicated address is published.

## Changes

This document will change when M4 (intake), M7 (persistence), M11 (voice), and M12 (training) ship. The README will link the current version, and the extension will show the disclosure at the point of upload.
