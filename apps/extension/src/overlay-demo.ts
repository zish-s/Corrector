import "./overlay-demo.css";
import { showAnnotation } from "./overlay/annotation";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("overlay demo root missing");

root.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brandline">
        <div class="mark" aria-hidden="true">?</div>
        <div>
          <b>Striver SDE Sheet (Copy)</b>
          <small>Local preview · Corrector overlay renderer</small>
        </div>
      </div>
      <div class="top-actions">
        <button class="red-button" id="show-type" type="button">Show the forgotten-type hint</button>
        <button class="ghost-button" id="show-invariant" type="button">Show a loop-invariant hint</button>
        <button class="ghost-button" id="clear" type="button">Clear note</button>
      </div>
    </header>

    <div class="banner">
      <span class="dot" aria-hidden="true"></span>
      <span>
        <b>This is the real overlay renderer.</b> The anchor is fixed for this preview;
        site adapters and Gemma intake supply the exact line in M3–M4. The note asks a
        question, it does not hand over the fix.
      </span>
    </div>

    <div class="main">
      <section class="panel">
        <div class="panel-head">
          <div class="tabs"><b>Description</b><span>Note</span><span>Editorial</span><span>Solutions</span></div>
          <span>Medium</span>
        </div>
        <div class="problem">
          <h1>3. Longest Substring Without Repeating Characters</h1>
          <div class="meta">
            <span class="chip">Medium</span>
            <span class="chip">Sliding Window</span>
            <span class="chip">Hash Map</span>
          </div>
          <p>
            Given a string <code>s</code>, find the length of the longest substring
            without duplicate characters.
          </p>

          <div class="example">
            <h3>Example 1</h3>
            <pre>Input: s = "abcabcbb"
Output: 3
Explanation: The answer is "abc", with the length of 3.</pre>
            <small>Note that "bca" and "cab" are also correct answers.</small>
          </div>

          <div class="example">
            <h3>Example 2</h3>
            <pre>Input: s = "bbbbb"
Output: 1
Explanation: The answer is "b", with the length of 1.</pre>
          </div>

          <div class="example">
            <h3>Example 3</h3>
            <pre>Input: s = "pwwkew"
Output: 3
Explanation: The answer is "wke", with the length of 3.
Notice that "pwke" is a subsequence, not a substring.</pre>
          </div>
        </div>
      </section>

      <section class="panel editor-panel">
        <div class="editor-head">
          <div class="file"><b>Code</b><span>·</span><span>solution.cpp</span></div>
          <span class="lang">C++ · Auto</span>
        </div>
        <div class="editor" aria-label="Mock code editor">
          <div class="line"><span class="ln">1</span><code><span class="tok-key">class</span> <span class="tok-type">Solution</span> {</code></div>
          <div class="line"><span class="ln">2</span><code><span class="tok-key">public</span>:</code></div>
          <div class="line"><span class="ln">3</span><code>    <span class="tok-type">int</span> <span class="tok-fn">lengthOfLongestSubstring</span>(<span class="tok-type">string</span> s) {</code></div>
          <div class="line"><span class="ln">4</span><code>        <span class="tok-type">int</span> arr[<span class="tok-num">256</span>] = {<span class="tok-num">0</span>};</code></div>
          <div class="line"><span class="ln">5</span><code>        l = <span class="tok-num">0</span>, r = <span class="tok-num">0</span>, <span class="tok-var">MaxLen</span> = <span class="tok-num">0</span>;</code></div>
          <div class="line"><span class="ln">6</span><code>        <span class="tok-key">while</span> (r &lt; s.size()) {</code></div>
          <div class="line"><span class="ln">7</span><code>            <span class="tok-key">while</span> (arr[s[r]] != <span class="tok-num">0</span>) {</code></div>
          <div class="line"><span class="ln">8</span><code>                arr[s[l]]--;</code></div>
          <div class="line"><span class="ln">9</span><code>                l++;</code></div>
          <div class="line"><span class="ln">10</span><code>            }</code></div>
          <div class="line"><span class="ln">11</span><code>            arr[s[r]]++;</code></div>
          <div class="line"><span class="ln">12</span><code>            <span class="tok-var">MaxLen</span> = <span class="tok-fn">max</span>(<span class="tok-var">MaxLen</span>, r - l + <span class="tok-num">1</span>);</code></div>
          <div class="line"><span class="ln">13</span><code>            r++;</code></div>
          <div class="line"><span class="ln">14</span><code>        }</code></div>
          <div class="line"><span class="ln">15</span><code>        <span class="tok-key">return</span> <span class="tok-var">MaxLen</span>;</code></div>
          <div class="line"><span class="ln">16</span><code>    }</code></div>
          <div class="line"><span class="ln">17</span><code>};</code></div>
        </div>
        <div class="editor-foot">
          <span>Restored from local · no cloud save</span>
          <span>Ln 5, Col 24</span>
        </div>
      </section>
    </div>

    <section class="testpanel">
      <div class="panel-head"><span>Testcase</span><span>Test Result</span></div>
      <div class="empty">You must run your code first.</div>
    </section>

    <p class="status" id="status" role="status">
      The note appears automatically in this preview. In the product it appears when a
      hint is ready, after you ask.
    </p>
  </div>
`;

const statusQuery = root.querySelector<HTMLParagraphElement>("#status");
if (!statusQuery) throw new Error("status missing");
const status: HTMLParagraphElement = statusQuery;

function setStatus(message: string, bad = false): void {
  status.textContent = message;
  status.classList.toggle("bad", bad);
}

function showTypeNote(): void {
  const result = showAnnotation({
    anchorText: "MaxLen",
    note: "What type should MaxLen be, and why?",
    tag: "Corrector · type check",
  });
  if (result.ok) {
    setStatus("Note anchored to MaxLen on line 5. Press Esc or use Clear note to dismiss it.");
  } else {
    setStatus("Could not find the anchor text on this page. Try the demo page, not a live site yet.", true);
  }
}

function showInvariantNote(): void {
  const result = showAnnotation({
    anchorText: "while (r < s.size())",
    note: "What does this loop assume about the characters inside the window?",
    tag: "Corrector · loop invariant",
  });
  if (result.ok) {
    setStatus("Note anchored to the loop on line 6. It asks about the invariant, not the fix.");
  } else {
    setStatus("Could not find the loop anchor on this page.", true);
  }
}

function clearNote(): void {
  const globalWindow = window as unknown as {
    __correctorAnnotationCleanup?: () => void;
  };
  globalWindow.__correctorAnnotationCleanup?.();
  setStatus("Note cleared. Replay it with the red button.");
}

root.querySelector("#show-type")?.addEventListener("click", showTypeNote);
root.querySelector("#show-invariant")?.addEventListener("click", showInvariantNote);
root.querySelector("#clear")?.addEventListener("click", clearNote);

window.setTimeout(showTypeNote, 650);
