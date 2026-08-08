const DEFAULT_SETTINGS = {
  enabled: true,
  disabledHosts: [],
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(current);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "xet:get-settings") {
    return false;
  }

  chrome.storage.local
    .get(DEFAULT_SETTINGS)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));

  return true;
});
