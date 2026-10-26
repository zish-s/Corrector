export interface AnnotationPayload {
  /** Text to find on the page. The smallest visible element containing it wins. */
  anchorText: string;
  /** 1-based editor line. Used first when the page exposes Monaco/CodeMirror/Ace. */
  line?: number;
  /** Short Socratic question shown in the note. */
  note: string;
  /** Small label above the note. */
  tag?: string;
  /** Pen colour. */
  accent?: string;
  /** Optional small animated explainer inside the note. */
  visual?: "window" | "hashmap" | "stack" | "pointer";
}

export interface AnnotationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Draw a hand-drawn note anchored to a line on the current page.
 *
 * IMPORTANT: this function is passed to chrome.scripting.executeScript({ func }),
 * so it must be completely self-contained. Do not reference module-level helpers,
 * constants, or imports from inside it: Chrome serializes the function source.
 */
export function showAnnotation(payload: AnnotationPayload): AnnotationResult {
  const HOST_ID = "corrector-annotation-host";
  const PAD = 14;
  const GAP = 34;
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 300;
  const accent = /^#[0-9a-f]{6}$/i.test(payload.accent ?? "")
    ? payload.accent!
    : "#e5484d";
  const tag = payload.tag ?? "Corrector";

  type Cleanup = () => void;
  const globalWindow = window as unknown as {
    __correctorAnnotationCleanup?: Cleanup;
  };
  globalWindow.__correctorAnnotationCleanup?.();
  document.getElementById(HOST_ID)?.remove();

  function findAnchor(text: string): HTMLElement | null {
    const needle = text.trim();
    const normalizedNeedle = needle.replace(/\s+/g, " ");

    function visible(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      if (rect.right < 0 || rect.left > window.innerWidth) return false;
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    }

    function contains(element: HTMLElement): boolean {
      const content = element.textContent;
      if (!content) return false;
      return (
        content.includes(needle) ||
        content.replace(/\s+/g, " ").includes(normalizedNeedle)
      );
    }

    if (typeof payload.line === "number" && payload.line > 0) {
      // Do not require the line to be on screen here: a small viewport or a
      // not-yet-painted Monaco can make the whole editor look visible while the
      // line is below the fold. The update loop hides the note when off screen.
      const editorLines = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".monaco-editor .view-line, .cm-line, .ace_line",
        ),
      );
      const lineNode = editorLines[payload.line - 1];
      if (lineNode) {
        if (!needle || contains(lineNode)) {
          const pieces = needle
            ? Array.from(lineNode.querySelectorAll<HTMLElement>("span")).filter(
                (element) => contains(element) && visible(element),
              )
            : [];
          const bestPiece = pieces.sort(
            (a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0),
          )[0];
          return bestPiece ?? lineNode;
        }
      }
    }

    if (!needle) return null;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("div, span, p, pre, code, td, li"),
    );
    let best: HTMLElement | null = null;
    let bestScore = -Infinity;

    for (const element of nodes) {
      if (element.id === HOST_ID) continue;
      if (!contains(element) || !visible(element)) continue;
      const content = element.textContent ?? "";

      const inEditor = element.closest(
        "[class*='monaco'], [class*='cm-editor'], [class*='ace_editor'], pre, code",
      )
        ? 1
        : 0;
      // Prefer a code editor, then the smallest element that still contains the
      // needle. In Monaco/CodeMirror this usually means the syntax span around
      // the token, which points the arrow at the exact word.
      const score = inEditor * 10000 - content.length;
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return best;
  }

  const foundAnchor = findAnchor(payload.anchorText);
  if (!foundAnchor) {
    return { ok: false, reason: "anchor_not_found" };
  }
  const anchor: HTMLElement = foundAnchor;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-corrector-overlay", "true");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:block;visibility:visible;opacity:1;";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .pen-layer {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      overflow: visible;
      pointer-events: none;
    }
    .pen-main, .pen-ghost, .pen-head {
      fill: none;
      stroke: ${accent};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .pen-main { stroke-width: 2.4; opacity: 0.92; }
    .pen-ghost { stroke-width: 1.1; opacity: 0.34; }
    .pen-head { stroke-width: 2.4; opacity: 0.92; }
    .highlight {
      position: fixed;
      border: 1.5px dashed ${accent}88;
      background: ${accent}12;
      border-radius: 4px;
      pointer-events: none;
    }
    .note {
      position: fixed;
      width: min(${MAX_WIDTH}px, calc(100vw - 28px));
      min-width: ${MIN_WIDTH}px;
      padding: 12px 13px 10px;
      border: 2px solid ${accent};
      border-radius: 16px 10px 18px 12px;
      background: #fffdf4;
      color: #2a1714;
      box-shadow:
        3px 4px 0 ${accent}2b,
        0 18px 44px rgba(15, 23, 42, 0.24);
      transform: rotate(-1.4deg);
      transform-origin: 50% 80%;
      pointer-events: auto;
      animation: corrector-pop 180ms ease-out both;
    }
    .tag {
      margin: 0 18px 6px 0;
      color: #b42318;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.12em;
      line-height: 1.3;
      text-transform: uppercase;
      opacity: 0.82;
    }
    .text {
      margin: 0;
      color: #2a1714;
      font-family: "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive, sans-serif;
      font-size: 15px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .text b {
      color: #b42318;
      font-weight: 800;
    }
    .close {
      position: absolute;
      top: 4px;
      right: 7px;
      padding: 2px 4px;
      border: 0;
      color: #b42318;
      background: transparent;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.72;
    }
    .close:hover { opacity: 1; }
    .foot {
      margin-top: 7px;
      color: #9a7770;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 9px;
      line-height: 1.3;
    }
    .mini {
      margin: 2px 0 8px;
      padding: 5px 6px;
      border: 1px solid ${accent}22;
      border-radius: 9px;
      background: ${accent}08;
    }
    .mini svg { display: block; width: 100%; height: 42px; overflow: visible; }
    .mini text {
      fill: #6b4a45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 8px;
    }
    .mini rect.cell { fill: #fff8e9; stroke: ${accent}55; stroke-width: 1; }
    .mini rect.hot { fill: ${accent}1c; stroke: ${accent}; }
    .mini g.mover { animation: mini-slide 2.6s ease-in-out infinite alternate; }
    .mini rect.map { animation: mini-pulse 1.4s ease-in-out infinite; }
    .mini g.stackbox { animation: mini-pop 2.4s ease-in-out infinite; }
    @keyframes mini-slide { from { transform: translateX(0); } to { transform: translateX(96px); } }
    @keyframes mini-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
    @keyframes mini-pop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @media (prefers-reduced-motion: reduce) {
      .mini g.mover, .mini rect.map, .mini g.stackbox { animation: none; }
    }
    @keyframes corrector-pop {
      from { opacity: 0; transform: scale(0.94) rotate(-1.4deg); }
      to { opacity: 1; transform: scale(1) rotate(-1.4deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .note { animation: none; }
    }
  `;

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("class", "pen-layer");
  svg.setAttribute("aria-hidden", "true");

  const ghostPath = document.createElementNS(svgNamespace, "path");
  ghostPath.setAttribute("class", "pen-ghost");
  const mainPath = document.createElementNS(svgNamespace, "path");
  mainPath.setAttribute("class", "pen-main");
  const arrowHead = document.createElementNS(svgNamespace, "path");
  arrowHead.setAttribute("class", "pen-head");
  svg.append(ghostPath, mainPath, arrowHead);

  const highlight = document.createElement("div");
  highlight.className = "highlight";

  const note = document.createElement("div");
  note.className = "note";
  note.setAttribute("role", "note");
  note.setAttribute("aria-live", "polite");

  const tagElement = document.createElement("div");
  tagElement.className = "tag";
  tagElement.textContent = tag;

  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss hint");
  close.textContent = "×";

  const text = document.createElement("p");
  text.className = "text";
  const parts = payload.note.split(payload.anchorText);
  if (parts.length > 1) {
    text.append(document.createTextNode(parts[0] ?? ""));
    const strong = document.createElement("b");
    strong.textContent = payload.anchorText;
    text.append(strong, document.createTextNode(parts.slice(1).join(payload.anchorText)));
  } else {
    text.textContent = payload.note;
  }

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent = "Esc to dismiss";

  let visualBox: HTMLDivElement | null = null;
  if (payload.visual) {
    visualBox = document.createElement("div");
    visualBox.className = "mini";
    visualBox.setAttribute("aria-hidden", "true");
    const cells = Array.from({ length: 7 }, (_, index) => {
      const x = 4 + index * 16;
      const hot = payload.visual === "hashmap" && (index === 2 || index === 5);
      return `<rect class="cell${hot ? " hot" : ""}" x="${x}" y="12" width="13" height="18" rx="3"/>`;
    }).join("");
    let scene = "";
    if (payload.visual === "window") {
      scene = `${cells}<g class="mover"><rect x="4" y="8" width="43" height="26" rx="5" fill="none" stroke="${accent}" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M8 38 L8 42 L43 42 L43 38" fill="none" stroke="${accent}" stroke-width="1.4"/></g>`;
    } else if (payload.visual === "hashmap") {
      scene = `${cells}<path d="M116 21 H136" stroke="${accent}" stroke-width="1.2" stroke-dasharray="3 2"/><rect class="map" x="138" y="7" width="38" height="28" rx="5" fill="none" stroke="${accent}" stroke-width="1.5"/><text x="145" y="25">key → i</text>`;
    } else if (payload.visual === "stack") {
      scene = `<g class="stackbox"><rect class="cell" x="42" y="24" width="46" height="13" rx="3"/><text x="49" y="34">push</text></g><g class="stackbox" style="animation-delay:0.35s"><rect class="cell" x="46" y="10" width="46" height="13" rx="3"/><text x="53" y="20">pop</text></g>`;
    } else {
      scene = `${cells}<g class="mover"><path d="M8 42 L8 34 L18 34" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round"/><path d="M14 30 L19 34 L14 38" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round"/></g>`;
    }
    visualBox.innerHTML = `<svg viewBox="0 0 180 46" role="img">${scene}</svg>`;
  }

  note.append(tagElement, close);
  if (visualBox) note.append(visualBox);
  note.append(text, foot);
  shadow.append(style, svg, highlight, note);
  document.documentElement.append(host);

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  let cleanedUp = false;
  let frame = 0;

  function update(): void {
    if (cleanedUp) return;
    if (!anchor.isConnected) {
      cleanup();
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const onScreen =
      rect.bottom > -40 &&
      rect.top < window.innerHeight + 40 &&
      rect.right > -40 &&
      rect.left < window.innerWidth + 40;

    if (!onScreen) {
      highlight.style.display = "none";
      note.style.display = "none";
      svg.style.display = "none";
      return;
    }
    highlight.style.display = "block";
    note.style.display = "block";
    svg.style.display = "block";

    highlight.style.left = `${Math.round(rect.left - 3)}px`;
    highlight.style.top = `${Math.round(rect.top - 2)}px`;
    highlight.style.width = `${Math.round(Math.max(rect.width + 6, 24))}px`;
    highlight.style.height = `${Math.round(Math.max(rect.height + 4, 18))}px`;

    const noteWidth = note.offsetWidth || MAX_WIDTH;
    const noteHeight = note.offsetHeight || 132;
    // Prefer above the line: it keeps the target line readable and gives the
    // arrow a clear, downward path like a teacher's margin note.
    let side: "above" | "right" | "left" | "below" = "above";
    let left = clamp(
      rect.left + rect.width * 0.45,
      PAD,
      Math.max(PAD, window.innerWidth - noteWidth - PAD),
    );
    let top = rect.top - noteHeight - 30;

    if (top < PAD) {
      side = "right";
      left = rect.right + GAP;
      top = rect.top - 46;
      if (left + noteWidth > window.innerWidth - PAD) {
        side = "left";
        left = rect.left - noteWidth - GAP;
      }
      if (left < PAD) {
        side = "below";
        left = clamp(
          rect.left,
          PAD,
          Math.max(PAD, window.innerWidth - noteWidth - PAD),
        );
        top = rect.bottom + 26;
      }
    }
    top = clamp(top, PAD, Math.max(PAD, window.innerHeight - noteHeight - PAD));

    note.style.left = `${Math.round(left)}px`;
    note.style.top = `${Math.round(top)}px`;

    let startX: number;
    let startY: number;
    if (side === "above") {
      startX = clamp(rect.left + rect.width * 0.5, left + 18, left + noteWidth - 18);
      startY = top + noteHeight - 2;
    } else if (side === "below") {
      startX = clamp(rect.left + rect.width * 0.7, left + 18, left + noteWidth - 18);
      startY = top;
    } else if (side === "right") {
      startX = left + 2;
      startY = top + Math.min(noteHeight * 0.72, 96);
    } else {
      startX = left + noteWidth - 2;
      startY = top + Math.min(noteHeight * 0.72, 96);
    }

    const endX = rect.left + Math.min(rect.width * 0.38, 94);
    const endY =
      side === "above"
        ? rect.top + Math.min(rect.height * 0.3, 8)
        : rect.top + rect.height * 0.56;
    const dx = endX - startX;
    const dy = endY - startY;
    const c1x = startX + dx * 0.42;
    const c1y = startY + dy * 0.02;
    const c2x = endX - dx * 0.22;
    const c2y = endY - dy * 0.62;

    mainPath.setAttribute(
      "d",
      `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`,
    );
    ghostPath.setAttribute(
      "d",
      `M ${(startX + 2).toFixed(1)} ${(startY - 2).toFixed(1)} C ${(c1x + 3).toFixed(1)} ${(c1y - 4).toFixed(1)}, ${(c2x - 2).toFixed(1)} ${(c2y + 3).toFixed(1)}, ${(endX - 1).toFixed(1)} ${(endY + 1).toFixed(1)}`,
    );

    const angle = Math.atan2(endY - c2y, endX - c2x);
    const headLength = 13;
    const spread = Math.PI * 0.82;
    const wingA = angle + spread;
    const wingB = angle - spread;
    arrowHead.setAttribute(
      "d",
      `M ${(endX + Math.cos(wingA) * headLength).toFixed(1)} ${(endY + Math.sin(wingA) * headLength).toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)} L ${(endX + Math.cos(wingB) * headLength).toFixed(1)} ${(endY + Math.sin(wingB) * headLength).toFixed(1)}`,
    );
  }

  function schedule(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") cleanup();
  }

  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("keydown", onKeyDown, true);
    note.removeEventListener("click", onNoteClick);
    close.removeEventListener("click", cleanup);
    host.remove();
    if (globalWindow.__correctorAnnotationCleanup === cleanup) {
      delete globalWindow.__correctorAnnotationCleanup;
    }
  }

  function onNoteClick(event: MouseEvent): void {
    if ((event.target as HTMLElement | null)?.closest(".close")) {
      event.preventDefault();
      cleanup();
    }
  }

  const observer = new ResizeObserver(schedule);
  observer.observe(anchor);
  observer.observe(note);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  document.addEventListener("keydown", onKeyDown, true);
  note.addEventListener("click", onNoteClick);
  close.addEventListener("click", cleanup);
  globalWindow.__correctorAnnotationCleanup = cleanup;

  update();
  schedule();
  return { ok: true };
}
