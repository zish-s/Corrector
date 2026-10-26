/**
 * Corrector MV3 service worker (Milestone 1).
 *
 * Responsibilities: register the action, open the side panel from the keyboard
 * shortcut, and fall back to a normal tab when the Side Panel API refuses.
 * No network calls and no page reading in this milestone.
 */

const OPEN_COMMAND = "open-side-panel";
const CAPTURE_MESSAGE = "corrector:capture-screen";

interface CaptureRequest {
  type: typeof CAPTURE_MESSAGE;
}

function isCaptureRequest(message: unknown): message is CaptureRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === CAPTURE_MESSAGE
  );
}

async function openSidePanel(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = tab?.windowId;

  if (typeof windowId === "number") {
    try {
      await chrome.sidePanel.open({ windowId });
      return;
    } catch (error) {
      console.warn("Corrector: sidePanel.open failed; opening a tab instead.", error);
    }
  }

  await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
}

async function enableActionClick(): Promise<void> {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn("Corrector: could not enable action-click opening.", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void enableActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  void enableActionClick();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === OPEN_COMMAND) {
    void openSidePanel();
  }
});

/**
 * Capture the visible tab locally. The side panel never calls a network API and
 * the screenshot is held in memory only. Gemma intake is Milestone 4.
 *
 * activeTab is granted when the learner invokes Corrector on the tab (action
 * click or keyboard shortcut). Navigating that tab revokes it, so the panel
 * asks the learner to invoke Corrector again.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCaptureRequest(message)) return false;

  chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
    const error = chrome.runtime.lastError?.message;
    if (error || !dataUrl) {
      sendResponse({
        ok: false,
        error: error ?? "Chrome did not return a screenshot for this tab.",
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
});
