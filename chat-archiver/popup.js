// Opens the side panel from a user click (required by chrome.sidePanel.open).
document.getElementById("openPanel").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch (err) {
    msg.textContent = `Could not open the side panel: ${err && err.message ? err.message : err}`;
  }
});
