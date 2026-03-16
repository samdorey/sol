// Sol Firefox Bridge - Background Script
// Connects to the native messaging host and sends tab/history data to Sol.

const NATIVE_HOST = "sol_firefox_bridge";
let port = null;
let reconnectTimer = null;
let pendingHistoryRequests = new Map();

function connect() {
  try {
    port = browser.runtime.connectNative(NATIVE_HOST);
  } catch (e) {
    console.error("Sol bridge: failed to connect to native host:", e);
    scheduleReconnect();
    return;
  }

  port.onMessage.addListener(handleNativeMessage);
  port.onDisconnect.addListener(() => {
    console.warn("Sol bridge: native host disconnected");
    port = null;
    scheduleReconnect();
  });

  // Send full tab list on connection
  sendAllTabs();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function sendMessage(msg) {
  if (!port) return;
  try {
    port.postMessage(msg);
  } catch (e) {
    console.error("Sol bridge: failed to send message:", e);
  }
}

async function getAllTabs() {
  const tabs = await browser.tabs.query({});
  return tabs.map(tab => ({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || "",
    url: tab.url || "",
    active: tab.active,
    pinned: tab.pinned,
  }));
}

async function sendAllTabs() {
  const tabs = await getAllTabs();
  sendMessage({ type: "tabs_full", tabs });
}

function handleNativeMessage(msg) {
  if (msg.type === "history_request") {
    handleHistoryRequest(msg);
  } else if (msg.type === "activate_tab") {
    activateTab(msg.tabId, msg.windowId);
  }
}

async function handleHistoryRequest(msg) {
  const results = await browser.history.search({
    text: msg.query || "",
    maxResults: msg.maxResults || 20,
    startTime: msg.startTime || Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  sendMessage({
    type: "history_results",
    requestId: msg.requestId,
    results: results.map(item => ({
      id: item.id,
      title: item.title || "",
      url: item.url || "",
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
    })),
  });
}

async function activateTab(tabId, windowId) {
  try {
    if (windowId) {
      await browser.windows.update(windowId, { focused: true });
    }
    await browser.tabs.update(tabId, { active: true });
  } catch (e) {
    console.error("Sol bridge: failed to activate tab:", e);
  }
}

// Listen for tab changes and push updates
browser.tabs.onCreated.addListener(() => sendAllTabs());
browser.tabs.onRemoved.addListener(() => sendAllTabs());
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only resend on meaningful changes
  if (changeInfo.title || changeInfo.url || changeInfo.status === "complete") {
    sendAllTabs();
  }
});
browser.tabs.onActivated.addListener(() => sendAllTabs());

// Start connection
connect();
