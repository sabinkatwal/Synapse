export async function getStoredValue(key, fallback = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}

export async function setStoredValue(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
