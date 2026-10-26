# The visual layer: a red pen, not a chatbot

![Corrector's on-page note anchored to MaxLen](assets/overlay-demo.png)

The reference is a teacher leaning over your shoulder with a red pen: a short note, a hand-drawn arrow, and the exact line it is talking about. Not a chat window that makes you copy your code into it.

This document is the visual contract for that layer. The M1 build includes the **real renderer** and a local preview page. Live site anchoring arrives with the page adapters in M3 and Gemma intake in M4.

## What the learner sees

1. They are solving on LeetCode, HackerRank, Striver's sheet, or our practice page.
2. They get stuck. They click Corrector (or press `Ctrl+Shift+Y`).
3. The side panel opens with the Socratic ladder.
4. When a hint is ready, a small paper note appears **on the page**, next to the relevant line, with a hand-drawn arrow pointing at the token.
5. The note asks one question. It does not hand over the fix.
6. The learner answers in the side panel, fixes the code, and the note can be dismissed with `Esc` or `×`.

The side panel is the conversation and history. The on-page note is the **pointing**. We do not duplicate a long explanation in both places.

```
┌───────────────────────────── coding site ─────────────────────────────┐
│  problem statement                 ┌───────────────────────────────┐  │
│                                    │  code editor                  │  │
│                                    │                               │  │
│                                    │   ┌─ Corrector note ───────┐  │  │
│                                    │   │ What type should       │  │  │
│                                    │   │ MaxLen be, and why?    │  │  │
│                                    │   └───────────╮────────────┘  │  │
│                                    │               ╰──────► MaxLen │  │
│                                    └───────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

## From the reference to the product

The reference is a Striver-style editor with a red handwritten note above it and a curved arrow pointing at `int l = 0, r = 0, MaxLen = 0;`. We keep the composition and change what the note says and how it behaves.

| Reference | Corrector |
| --- | --- |
| A red note floating above the editor. | A paper note placed above/right of the exact line, with a sketched border and a slight tilt. |
| “Hey, you forgot to define `int`.” | “What type should `MaxLen` be, and why?” The note is a question, per the Socratic contract. |
| A curved arrow toward the line. | A two-stroke hand-drawn arrow ending at the token, plus a dashed highlight. |
| A static screenshot. | A live overlay that re-anchors on scroll/resize, avoids covering the target line, and dismisses with `Esc`/`×`. |
| One annotation in the mock. | One note at a time in the product; the next hint queues. |
| No accessibility or isolation story. | Shadow DOM, text nodes (never HTML), `role="note"`, `aria-live`, reduced-motion support, and no focus stealing. |

The manner is borrowed. The teaching contract is not.

## Content rules

| Rule | Why |
| --- | --- |
| **The note is a question.** | The Socratic contract applies to the visual layer too. The reference's "you forgot `int`" becomes "What type should `MaxLen` be, and why?" |
| **Point at the smallest relevant token or line.** | The arrow is only useful if it lands on the exact place. A generic "check your code" note is noise. |
| **One note at a time.** | Stacked notes cover the editor. Queue the rest; show the next on dismiss. |
| **Never block typing.** | The page stays interactive. Only the note card accepts clicks; the SVG and highlight are `pointer-events: none`. |
| **Dismiss is obvious.** | `Esc`, a `×`, and clicking outside do not trap the learner. The note does not steal focus. |
| **It appears when asked.** | No unsolicited notes on every keystroke in M1. An opt-in "live lint" mode can come later, with a clear toggle. |
| **Short enough to read in two seconds.** | One question, one optional clause. The side panel has the rest. |

## The look

The goal is "a good teacher's red pen", not "a red error dialog".

| Token | Value |
| --- | --- |
| Pen / border | `#e5484d` (a warm red, not a screaming pure red) |
| Paper | `#fffdf4` (warm off-white) |
| Ink | `#2a1714` (warm near-black) |
| Label | `#b42318`, small caps, 9px |
| Handwriting font | `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive, sans-serif` |
| Body size | 15px / 1.45 |
| Note width | 240–300px, responsive |
| Border | 2px, asymmetric radii (`16px 10px 18px 12px`) |
| Rotation | `-1.4deg` |
| Shadow | offset red shadow + soft ambient shadow |
| Arrow | 2.4px main stroke + 1.1px ghost stroke, round caps, sketched arrowhead |
| Highlight | 1.5px dashed red box at 53% opacity + 7% red fill |
| Animation | note pops in 180ms; respects `prefers-reduced-motion` |

The handwritten **text** is deliberately restrained. We use a handwriting font for the note body, but the label, close button, and footer use the system sans-serif so they stay legible. The note is not a doodle everywhere; the arrow and border carry the metaphor.

## Anatomy and placement

```
        ┌─────────────────────────────┐
        │ CORRECTOR · TYPE CHECK    × │
        │ What type should MaxLen     │
        │ be, and why?                │
        │ Esc to dismiss              │
        └───────────────╮─────────────┘
                        │
                        ╰──────────────►  MaxLen = 0;
```

- **Placement preference:** above the line, right-aligned near the token; then right; then left; then below. Above-first keeps the target line readable and gives the arrow a natural downward path.
- **Clamping:** the note is kept 14px inside the viewport. If there is no room above, the algorithm falls back.
- **Scroll/resize:** the note and arrow re-anchor on scroll and resize; a `ResizeObserver` watches the anchor and the note.
- **Off-screen anchor:** the note hides until the line scrolls back into view. It does not follow the scrollbar.
- **Anchor element:** the smallest visible element containing the anchor text, preferring code editors (`[class*="monaco"]`, `[class*="cm-editor"]`, `[class*="ace_editor"]`, `pre`, `code`). In Monaco/CodeMirror this is usually the syntax span around the token.
- **Arrow geometry:** a cubic Bézier from the note edge to the token; the control points are biased so the arrow leaves the note gently and arrives horizontally at the line. The ghost stroke is offset by 1–4px for the hand-drawn feel.

## What is built in M1

- `apps/extension/src/overlay/annotation.ts` — the self-contained renderer. It creates a Shadow DOM host, finds the anchor, positions the note, draws the arrow, tracks scroll/resize, and cleans up on `Esc`/`×`.
- `apps/extension/overlay-demo.html` + `src/overlay-demo.ts` — a local mock of Striver's two-pane layout with the same renderer. It auto-shows a forgotten-type note and has buttons for a loop-invariant note and a reset.
- The side panel's **See the hand-drawn on-page note style →** link opens the preview.
- The renderer is written to be passed to `chrome.scripting.executeScript({ func: showAnnotation })` without module-scope references, so the same code can run on a live page when the adapter is ready.

What is **not** built:

- live site adapters and iframe handling;
- automatic line detection from the screenshot (Gemma returns an anchor in M4);
- a persistent content script (we will inject on demand with `activeTab` + `scripting`);
- the full animated visual-spec library (M9);
- the queue for multiple notes.

## Technical plan

### 1. Anchor

The useful payload is not "a note near the code"; it is an anchor:

```json
{
  "anchorText": "MaxLen",
  "line": 5,
  "column": 24,
  "endLine": 5,
  "endColumn": 30,
  "snippetHash": "sha256:…",
  "editor": "monaco"
}
```

- **Our practice page (M2):** Monaco decorations give exact line/column and a stable API.
- **Striver / LeetCode / HackerRank (M3):** a per-site adapter finds the editor element and the line element. Monaco (`[class*="view-line"]`), CodeMirror (`.cm-line`), and Ace (`.ace_line`) cover most editors. A generic text search is the last resort.
- **Iframes:** LeetCode and some sites put the editor in an iframe; the injected script must target the right frame (`allFrames` or a frame-specific injection).
- **SPA navigation:** URL changes do not reload the page; the injected layer must clean up and re-anchor on route changes. A `MutationObserver` or the site adapter's event handles this.
- **Fallback:** if the anchor cannot be found, show the hint in the side panel and, if we have a screenshot, crop the relevant region and draw the arrow on the image. Never fail silently.

### 2. Injection

Use **on-demand injection** with `activeTab` + `scripting`, not a content script on every page:

```
side panel → background → chrome.scripting.executeScript({
  target: { tabId: activeTab.id },
  func: showAnnotation,
  args: [payload]
})
```

- No `<all_urls>` host permission at install time.
- The injected script runs in Chrome's isolated world, but it can read the DOM and attach a Shadow DOM host.
- `activeTab` is granted when the learner invokes Corrector on the tab; navigating revokes it. The panel handles the error and asks them to invoke Corrector again.
- The script is idempotent: a second call removes the previous overlay and listeners.
- The service worker is ephemeral; no long-lived state lives there. The anchor and hint come from the side panel/profile, not a background global.

### 3. Isolation

- **Shadow DOM**, not an iframe. The host page's fonts are available in the shadow tree, and positioning is in the same coordinate space. An iframe would need its own font loading and coordinate translation.
- Declare every CSS property we rely on inside the shadow root; do not inherit the host page's styles. Host pages that use aggressive `all: initial` rules can still affect the host element, so the host uses inline positioning and the shadow content resets its own box model.
- No page CSS can style the note; no note CSS can leak into the page.
- The note text is inserted with `textContent`/text nodes, never `innerHTML`, so a model-generated string cannot inject markup.
- The host has a high `z-index`; only the card has `pointer-events: auto`.

### 4. Accessibility

- `role="note"`, `aria-live="polite"`.
- `Esc` and a labelled close button.
- No focus stealing; the learner keeps typing.
- High contrast: warm paper on dark code, red border, dark ink.
- The arrow is decorative; the note text carries the meaning. Color is not the only cue.
- `prefers-reduced-motion` disables the pop animation.
- The note can be dismissed without reading it; the same hint remains in the side panel.

### 5. Prior art and what we borrow

| Pattern | Precedent | What we borrow |
| --- | --- | --- |
| Inline, non-blocking suggestion | Grammarly, SonarLint, ESLint | The hint sits next to the text; the page remains usable. |
| Line-anchored comment | GitHub PR review, CodeRabbit, Figma comments | A note is attached to a line/token, not to a chat transcript. |
| Popover with an arrow | Driver.js, Shepherd.js, Floating UI | Placement flips to stay in the viewport; the arrow points at the target. |
| Editor decorations | Monaco `deltaDecorations`, CodeMirror decorations | Exact line/column anchors and viewport tracking. |
| Hand-drawn annotation | Rough.js, glyphed.js, Excalidraw | The red-pen feel; sketchy strokes and a paper note, used sparingly. |
| Zero-spoiler coach | DryRunBuddy, the Competitive Programming Hint Engine | The visual layer must not become a solution dump; the harness blocks code. |
| Inline extension UI | rabbitholes, PROOFER, Visqora | Shadow DOM, on-demand injection, and a small surface instead of a full app. |

The combination is the point: **the anchoring discipline of an editor decoration + the restraint of an inline linter + the warmth of a red pen.**

## What we deliberately avoid

- A full-screen modal or a chat bubble that covers the editor.
- A red squiggle that looks like a compiler error when the note is a hint, not a hard error.
- A note that says "you forgot `int`" and ends the thinking. The note asks; the learner answers.
- Auto-annotating every line. One note, one question, one next step.
- Confetti or mascot celebrations in the middle of a serious attempt. Celebration belongs after the solve, not on the hint.
- Reading or storing the page beyond the anchor and the code needed for the current hint.

## How to see it

```bash
npm run build
```

Load `apps/extension/dist` in `chrome://extensions`, open the side panel, and click **See the hand-drawn on-page note style →**. Or open `apps/extension/dist/overlay-demo.html` directly in a browser. The preview auto-shows the forgotten-type note after 650ms; the toolbar buttons replay it with a loop-invariant question or clear it.

The production path is:

- **M3:** page adapter returns a real anchor; inject the renderer on demand.
- **M4:** Gemma intake returns the line/token; the note text comes from the Socratic model.
- **M9:** replace the single note with a validated visual-spec library (array pointers, hashmap lookup, stack, tree traversal, loop counts) and the hand-drawn arrow variants.
