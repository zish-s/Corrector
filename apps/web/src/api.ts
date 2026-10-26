export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export interface IntakeAnchor {
  line?: number;
  text?: string;
  reason?: string;
}

export interface IntakeResult {
  provider: string;
  model?: string;
  title?: string;
  problemStatement?: string;
  language?: string;
  code?: string;
  errorText?: string;
  spokenQuestion?: string;
  anchor?: IntakeAnchor;
  confidence?: number;
  notes?: string;
}

export interface IntakeRequest {
  imageDataUrl?: string;
  text?: string;
  spokenQuestion?: string;
  sourceUrl?: string;
}

interface IntakeResponse {
  ok?: boolean;
  result?: IntakeResult;
  detail?: string;
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] ?? "image/png", base64: match[2] ?? "" };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function runIntake(input: IntakeRequest): Promise<IntakeResult> {
  const payload: Record<string, string> = {};
  if (input.text?.trim()) payload.text = input.text.trim();
  if (input.spokenQuestion?.trim()) payload.spokenQuestion = input.spokenQuestion.trim();
  if (input.sourceUrl?.trim()) payload.sourceUrl = input.sourceUrl.trim();

  if (input.imageDataUrl) {
    const image = splitDataUrl(input.imageDataUrl);
    if (!image) throw new Error("The screenshot is not a valid base64 image.");
    payload.imageBase64 = image.base64;
    payload.mimeType = image.mimeType;
  }

  if (!payload.imageBase64 && !payload.text && !payload.spokenQuestion) {
    throw new Error("Add a screenshot or a short description first.");
  }

  const response = await fetch(`${API_URL}/v1/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const body = (await response.json()) as IntakeResponse | IntakeResult;
  if ("ok" in body && body.ok === false) {
    throw new Error(body.detail ?? "The intake service could not read this input.");
  }
  if ("result" in body && body.result) return body.result;
  return body as IntakeResult;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}
