chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("archivedChats").then(({ archivedChats }) => {
    if (!archivedChats) chrome.storage.local.set({ archivedChats: [] });
  });
});
