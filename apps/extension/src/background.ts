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

function friendlyCaptureError(error: string): string {
  if (/all_urls|activeTab|permission/i.test(error)) {
    return "Chrome did not grant access to this tab. Open the coding page, click the Corrector toolbar icon on that tab, then press Read this screen again.";
  }
  return error;
}

async function openSidePanel(tab?: chrome.tabs.Tab): Promise<void> {
  const target =
    tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

  try {
    // Prefer a tab-scoped panel. Opening it from the action click is the
    // user gesture that grants activeTab for the screenshot.
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
});
