export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  headers.set("Accept", "application/json");
  // Prevent Next.js App Router from returning RSC flight data instead of JSON
  headers.set("RSC", "0");
  headers.set("Next-Router-Prefetch", "0");
  headers.set("Next-Router-State-Tree", "");
  headers.set("X-Requested-With", "XMLHttpRequest");

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
  });
}

function isLikelyNonJsonBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return false;
  }
  // RSC flight payloads, HTML, or plain-text error bodies
  return (
    trimmed.startsWith("<!") ||
    trimmed.startsWith("0:") ||
    trimmed.startsWith("1:") ||
    /^[A-Za-z0-9_$]{8,}/.test(trimmed)
  );
}

export async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    return {} as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const looksLikeJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (!looksLikeJson || isLikelyNonJsonBody(text)) {
    throw new Error(
      `Unexpected server response (${response.status}). Please refresh and try again.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Invalid server response (${response.status}). Please refresh and try again.`,
    );
  }
}

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init);
  const data = await parseApiJson<T & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

export async function apiMutation(input: string, init?: RequestInit): Promise<void> {
  const response = await apiFetch(input, init);

  if (response.ok) {
    return;
  }

  try {
    const data = await parseApiJson<{ error?: string }>(response);
    throw new Error(data.error || `Request failed (${response.status})`);
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("Request failed")) {
      throw error;
    }
    throw new Error(`Request failed (${response.status})`);
  }
}
