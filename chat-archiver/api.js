// SYNAPSE - shared API helper.
// Loaded by the side panel (<script src="api.js">) and by the service worker (importScripts).
// Handles: auth header, generous timeout for Render cold starts, "server waking up"
// callbacks, one retry on network failure, and 401 -> clear token.

const SYNAPSE_API_BASE = "https://synapse-wqm8.onrender.com";
const SYNAPSE_TIMEOUT_MS = 60000; // Render free tier can take ~30-60s to wake
const SYNAPSE_WAKING_AFTER_MS = 4000; // show "waking up" if a request is slower than this

class SynapseApiError extends Error {
  constructor(message, { status = 0, code = "HTTP" } = {}) {
    super(message);
    this.name = "SynapseApiError";
    this.status = status;
    this.code = code; // "AUTH" | "NETWORK" | "TIMEOUT" | "HTTP"
  }
}

function synapseSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function synapseErrorMessage(text, status) {
  if (!text) return `Request failed: ${status}`;
  try {
    const data = JSON.parse(text);
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
    }
  } catch (_) {
    /* not JSON */
  }
  return text.slice(0, 300);
}

/**
 * @param {string} path  e.g. "/chats"
 * @param {RequestInit & {noAuth?: boolean}} options
 * @param {{onWaking?: Function, onAwake?: Function}} hooks
 */
async function synapseFetch(path, options = {}, hooks = {}) {
  const { noAuth, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const idempotent = method === "GET" || method === "DELETE";

  const { authToken } = await chrome.storage.local.get("authToken");
  const headers = {
    "Content-Type": "application/json",
    ...(authToken && !noAuth ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(fetchOptions.headers || {}),
  };

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const hardTimer = setTimeout(() => controller.abort(), SYNAPSE_TIMEOUT_MS);
    let waking = false;
    const wakeTimer = setTimeout(() => {
      waking = true;
      if (hooks.onWaking) hooks.onWaking();
    }, SYNAPSE_WAKING_AFTER_MS);
    const settle = () => {
      clearTimeout(hardTimer);
      clearTimeout(wakeTimer);
      if (waking && hooks.onAwake) hooks.onAwake();
    };

    try {
      const res = await fetch(`${SYNAPSE_API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
      settle();

      if (res.status === 401 && authToken && !noAuth) {
        await chrome.storage.local.remove(["authToken", "userEmail"]);
        throw new SynapseApiError("Session expired. Please log in again.", {
          status: 401,
          code: "AUTH",
        });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SynapseApiError(synapseErrorMessage(text, res.status), {
          status: res.status,
        });
      }
      if (res.status === 204) return null;
      return await res.json();
    } catch (err) {
      settle();
      if (err instanceof SynapseApiError) throw err;
      lastErr = err;
      const timedOut = err && err.name === "AbortError";
      // Retry once on network failure. Do not blindly retry a timed-out POST
      // (the server may have processed it, which would create a duplicate).
      if (attempt === 0 && (!timedOut || idempotent)) {
        await synapseSleep(1500);
        continue;
      }
      break;
    }
  }

  const timedOut = lastErr && lastErr.name === "AbortError";
  throw new SynapseApiError(
    timedOut
      ? "The server took too long to respond (it may still be waking up). Try again in a moment."
      : `Could not reach the SYNAPSE server at ${SYNAPSE_API_BASE}. Check your connection and try again.`,
    { code: timedOut ? "TIMEOUT" : "NETWORK" }
  );
}
