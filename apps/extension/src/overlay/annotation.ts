export interface AnnotationPayload {
  /** Text to find on the page. The smallest visible element containing it wins. */
  anchorText: string;
  /** Short Socratic question shown in the note. */
  note: string;
  /** Small label above the note. */
  tag?: string;
  /** Pen colour. */
  accent?: string;
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
    if (!needle) return null;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("div, span, p, pre, code, td, li"),
    );
    let best: HTMLElement | null = null;
    let bestScore = -Infinity;

    for (const element of nodes) {
      if (element.id === HOST_ID) continue;
      const content = element.textContent;
      if (!content || !content.includes(needle)) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (rect.right < 0 || rect.left > window.innerWidth) continue;

      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }

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

  note.append(tagElement, close, text, foot);
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
