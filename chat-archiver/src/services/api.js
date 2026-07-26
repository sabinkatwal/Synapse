const API_BASE_URL = "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const { authToken } = await chrome.storage.local.get("authToken");
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : payload.detail || "Request failed");
  }

  return payload;
}

export const api = {
  register: (email, password) => request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  getChats: () => request("/chats"),
  getChat: (id) => request(`/chats/${id}`),
  createChat: (chat) => request("/chats", { method: "POST", body: JSON.stringify(chat) }),
  updateChat: (id, data) => request(`/chats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteChat: (id) => request(`/chats/${id}`, { method: "DELETE" }),
};
