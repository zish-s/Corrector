/**
 * Corrector MV3 service worker (Milestones 1–4 prototype).
 *
 * Responsibilities:
 * - open the side panel from the action click (which also grants activeTab);
 * - capture the visible tab locally;
 * - read the active page's code/problem through chrome.scripting;
 * - inject the shared red-pen annotation renderer;
 * - proxy screenshot intake to the FastAPI backend, which holds the Gemma key.
 *
 * The extension never holds a model key and never uploads a screenshot unless the
 * learner presses the Gemma intake button.
 */

import { showAnnotation, type AnnotationPayload } from "@corrector/overlay";

const OPEN_COMMAND = "open-side-panel";
const CAPTURE_MESSAGE = "corrector:capture-screen";
const READ_PAGE_MESSAGE = "corrector:read-page";
const SHOW_ANNOTATION_MESSAGE = "corrector:show-annotation";
const GEMMA_INTAKE_MESSAGE = "corrector:gemma-intake";
const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787"
).replace(/\/$/, "");

interface CaptureRequest {
  type: typeof CAPTURE_MESSAGE;
}

interface ReadPageRequest {
  type: typeof READ_PAGE_MESSAGE;
}

interface ShowAnnotationRequest {
  type: typeof SHOW_ANNOTATION_MESSAGE;
  payload: AnnotationPayload;
}

interface GemmaIntakeRequest {
  type: typeof GEMMA_INTAKE_MESSAGE;
  imageDataUrl?: string;
  text?: string;
  spokenQuestion?: string;
  sourceUrl?: string;
}

interface PageSnapshot {
  title: string;
  url: string;
  language: string;
  code: string;
  statement?: string;
  source: string;
  lineCount: number;
}

interface ReadPageResponse {
  ok: boolean;
  page?: PageSnapshot;
  error?: string;
}

type AnyRequest =
  | CaptureRequest
  | ReadPageRequest
  | ShowAnnotationRequest
  | GemmaIntakeRequest;

function isMessage<T extends AnyRequest["type"]>(
  message: unknown,
  type: T,
): message is Extract<AnyRequest, { type: T }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === type
  );
}

function friendlyCaptureError(error: string): string {
  if (/all_urls|activeTab|permission/i.test(error)) {
    return "Chrome did not grant access to this tab. Open the coding page, click the Corrector toolbar icon on that tab, then press Read this screen again.";
  }
  return error;
}

function friendlyScriptError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Cannot access|activeTab|permission|Missing host permission/i.test(message)) {
    return "Chrome did not grant access to this tab. Open the coding page, click the Corrector toolbar icon on that tab, then try again.";
  }
  return message;
}

async function openSidePanel(tab?: chrome.tabs.Tab): Promise<void> {
  const target =
    tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

  try {
    // Prefer a tab-scoped panel. Opening it from the action click is the
    // user gesture that grants activeTab for capture and scripting.
    if (typeof target?.id === "number") {
      await chrome.sidePanel.open({ tabId: target.id });
      return;
    }
    if (typeof target?.windowId === "number") {
      await chrome.sidePanel.open({ windowId: target.windowId });
      return;
    }
  } catch (error) {
    console.warn("Corrector: sidePanel.open failed; opening a tab instead.", error);
  }

  await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
}

async function disableAutomaticPanelOpening(): Promise<void> {
  try {
    // The built-in action-click behavior opens the panel but does not reliably
    // grant activeTab. Handle the click ourselves instead.
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    console.warn("Corrector: could not set the panel behavior.", error);
  }
}

// Also run at worker startup so an older install that enabled the automatic
// action behavior is corrected before the next click.
void disableAutomaticPanelOpening();

chrome.runtime.onInstalled.addListener(() => {
  void disableAutomaticPanelOpening();
});

chrome.runtime.onStartup.addListener(() => {
  void disableAutomaticPanelOpening();
});

chrome.action.onClicked.addListener((tab) => {
  void openSidePanel(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === OPEN_COMMAND) {
    void openSidePanel();
  }
});

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Runs in the page's MAIN world. It must be self-contained because Chrome
 * serializes this function into the tab.
 */
function extractPageContext(): PageSnapshot | null {
  interface Bridge {
    getContext?: () => PageSnapshot;
  }
  const bridge = (window as unknown as { __CORRECTOR_PAGE__?: Bridge })
    .__CORRECTOR_PAGE__;
  if (bridge && typeof bridge.getContext === "function") {
    try {
      const context = bridge.getContext();
      if (context?.code) return context;
    } catch {
      // Fall through to the generic adapters.
    }
  }

  const host = location.hostname;
  const isLeetCode = host.includes("leetcode");
  const title =
    document.querySelector("h1")?.textContent?.trim() ||
    document.title.replace(/\s*[-|]\s*LeetCode.*$/i, "").trim() ||
    "Untitled page";

  let statement = "";
  const statementNodes = [
    '[data-track-load="description_content"]',
    '[data-cy="question-content"]',
    '[class*="question-content"]',
    '[class*="description"]',
    "article",
  ];
  for (const selector of statementNodes) {
    const node = document.querySelector<HTMLElement>(selector);
    const text = node?.innerText?.trim();
    if (text && text.length > 40) {
      statement = text.slice(0, 12000);
      break;
    }
  }

  let code = "";
  let language = "";
  let source = isLeetCode ? "leetcode" : "generic";

  const monaco = (
    window as unknown as {
      monaco?: {
        editor?: {
          getModels?: () => Array<{
            getValue?: () => string;
            getLanguageId?: () => string;
            uri?: { path?: string };
          }>;
        };
      };
    }
  ).monaco;
  const models = monaco?.editor?.getModels?.() ?? [];
  const model =
    models.find((item) =>
      /\.(?:cpp|cc|cxx|py|java|js|ts|go|rs|rb|cs)$/i.test(item.uri?.path ?? ""),
    ) ?? models[0];
  if (model?.getValue) {
    code = model.getValue();
    language = model.getLanguageId?.() ?? "";
  }

  if (!code) {
    const monacoLines = document.querySelector<HTMLElement>(
      ".monaco-editor .view-lines",
    );
    if (monacoLines?.innerText?.trim()) {
      code = monacoLines.innerText;
      language = "text";
      source = isLeetCode ? "leetcode" : "monaco-dom";
    }
  }

  if (!code) {
    const cm = document.querySelector<HTMLElement>(".cm-content");
    if (cm?.innerText?.trim()) {
      code = cm.innerText;
      language = "text";
      source = "codemirror";
    }
  }

  if (!code) {
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea?.value?.trim()) {
      code = textarea.value;
      language = "text";
      source = "textarea";
    }
  }

  if (!code) {
    const pre = document.querySelector<HTMLElement>("pre code, pre");
    if (pre?.innerText?.trim()) {
      code = pre.innerText;
      language = "text";
      source = "pre";
    }
  }

  if (!code.trim()) return null;

  return {
    title,
    url: location.href,
    language: language || "text",
    code,
    statement,
    source,
    lineCount: code.split(/\r?\n/).length,
  };
}

async function readActivePage(): Promise<ReadPageResponse> {
  const tab = await activeTab();
  if (!tab?.id) return { ok: false, error: "There is no active tab to read." };

  const execute = async (allFrames: boolean) => {
    return chrome.scripting.executeScript({
      target: { tabId: tab.id!, ...(allFrames ? { allFrames: true } : {}) },
      world: "MAIN",
      func: extractPageContext,
    });
  };

  try {
    let results: chrome.scripting.InjectionResult<unknown>[] = [];
    try {
      results = await execute(true);
    } catch {
      results = await execute(false);
    }

    const pages = results
      .map((result) => result.result as PageSnapshot | null)
      .filter((page): page is PageSnapshot => Boolean(page?.code?.trim()));
    pages.sort((a, b) => b.code.length - a.code.length);
    const page = pages[0];
    if (!page) {
      return {
        ok: false,
        error:
          "No code editor was found on this page. Open the practice studio or a coding tab with a visible editor, then try again.",
      };
    }
    return { ok: true, page };
  } catch (error) {
    return { ok: false, error: friendlyScriptError(error) };
  }
}

async function annotateActivePage(
  payload: AnnotationPayload,
): Promise<{ ok: boolean; error?: string }> {
  const tab = await activeTab();
  if (!tab?.id) return { ok: false, error: "There is no active tab to annotate." };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showAnnotation,
      args: [payload],
    });
    const result = results[0]?.result as { ok: boolean; reason?: string } | undefined;
    if (!result?.ok) {
      return {
        ok: false,
        error:
          result?.reason === "anchor_not_found"
            ? "The note could not find that line. Click in the editor and try again, or use the practice studio where the line is exposed."
            : "The note could not be placed on this page.",
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyScriptError(error) };
  }
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] ?? "image/png", base64: match[2] ?? "" };
}

async function gemmaIntake(request: GemmaIntakeRequest): Promise<{
  ok: boolean;
  result?: unknown;
  error?: string;
}> {
  const payload: Record<string, string> = {};
  if (request.imageDataUrl) {
    const image = splitDataUrl(request.imageDataUrl);
    if (!image) return { ok: false, error: "The screenshot was not valid image data." };
    payload.imageBase64 = image.base64;
    payload.mimeType = image.mimeType;
  }
  if (request.text?.trim()) payload.text = request.text.trim();
  if (request.spokenQuestion?.trim()) payload.spokenQuestion = request.spokenQuestion.trim();
  if (request.sourceUrl?.trim()) payload.sourceUrl = request.sourceUrl.trim();

  if (!payload.imageBase64 && !payload.text && !payload.spokenQuestion) {
    return { ok: false, error: "Capture a screen or add code first." };
  }

  try {
    const response = await fetch(`${API_URL}/v1/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let detail = `Backend returned HTTP ${response.status}.`;
      try {
        const body = (await response.json()) as { detail?: string };
        detail = body.detail ?? detail;
      } catch {
        // Keep the status message.
      }
      return { ok: false, error: detail };
    }
    const result = await response.json();
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Could not reach the backend at ${API_URL}. Start services/api and try again. (${message})`,
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isMessage(message, CAPTURE_MESSAGE)) {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      const error = chrome.runtime.lastError?.message;
      if (error || !dataUrl) {
        sendResponse({
          ok: false,
          error: friendlyCaptureError(
            error ?? "Chrome did not return a screenshot for this tab.",
          ),
        });
        return;
      }
      sendResponse({
        ok: true,
        dataUrl,
        capturedAt: new Date().toISOString(),
      });
    });
    return true;
  }

  if (isMessage(message, READ_PAGE_MESSAGE)) {
    void readActivePage().then(sendResponse);
    return true;
  }

  if (isMessage(message, SHOW_ANNOTATION_MESSAGE)) {
    void annotateActivePage(message.payload).then(sendResponse);
    return true;
  }

  if (isMessage(message, GEMMA_INTAKE_MESSAGE)) {
    void gemmaIntake(message).then(sendResponse);
    return true;
  }

  return false;
});
