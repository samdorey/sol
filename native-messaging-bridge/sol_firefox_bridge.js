#!/usr/bin/env node
// Sol Firefox Native Messaging Bridge
//
// This shim is spawned by Firefox as a native messaging host.
// It reads length-prefixed JSON messages from stdin (Firefox extension),
// writes tab/history data to a JSON file that Sol reads,
// and listens on a Unix domain socket for requests from Sol (e.g., history queries).

const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");

const DATA_DIR = path.join(os.homedir(), ".sol");
const TABS_FILE = path.join(DATA_DIR, "firefox-tabs.json");
const SOCKET_PATH = path.join(DATA_DIR, "firefox-bridge.sock");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Native Messaging Protocol (stdin/stdout) ---

// Read a 4-byte little-endian length, then that many bytes of JSON
let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processInput();
});

function processInput() {
  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) break;
    const jsonStr = inputBuffer.slice(4, 4 + msgLen).toString("utf-8");
    inputBuffer = inputBuffer.slice(4 + msgLen);
    try {
      const msg = JSON.parse(jsonStr);
      handleExtensionMessage(msg);
    } catch (e) {
      // Ignore malformed messages
    }
  }
}

function sendToExtension(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.alloc(4 + Buffer.byteLength(json, "utf-8"));
  buf.writeUInt32LE(Buffer.byteLength(json, "utf-8"), 0);
  buf.write(json, 4, "utf-8");
  process.stdout.write(buf);
}

// --- Message Handling ---

let currentTabs = [];

function handleExtensionMessage(msg) {
  switch (msg.type) {
    case "tabs_full":
      currentTabs = msg.tabs || [];
      writeTabs();
      // Notify Sol via socket if connected
      broadcastToSolClients({ type: "tabs_updated" });
      break;

    case "history_results":
      // Forward history results to whichever Sol socket client requested them
      broadcastToSolClients({
        type: "history_results",
        requestId: msg.requestId,
        results: msg.results,
      });
      break;
  }
}

function writeTabs() {
  const data = JSON.stringify({ tabs: currentTabs, updatedAt: Date.now() });
  fs.writeFile(TABS_FILE, data, "utf-8", (err) => {
    if (err) {
      // Silently ignore write errors
    }
  });
}

// --- Unix Domain Socket Server (for Sol to connect) ---

const solClients = new Set();

// Clean up stale socket
try {
  fs.unlinkSync(SOCKET_PATH);
} catch (e) {
  // Ignore if not exists
}

const server = net.createServer((socket) => {
  solClients.add(socket);
  let clientBuffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    clientBuffer = Buffer.concat([clientBuffer, chunk]);
    // Same length-prefixed protocol
    while (clientBuffer.length >= 4) {
      const len = clientBuffer.readUInt32LE(0);
      if (clientBuffer.length < 4 + len) break;
      const jsonStr = clientBuffer.slice(4, 4 + len).toString("utf-8");
      clientBuffer = clientBuffer.slice(4 + len);
      try {
        const msg = JSON.parse(jsonStr);
        handleSolMessage(msg);
      } catch (e) {
        // Ignore malformed messages
      }
    }
  });

  socket.on("close", () => solClients.delete(socket));
  socket.on("error", () => solClients.delete(socket));
});

server.listen(SOCKET_PATH, () => {
  // Make socket accessible
  try {
    fs.chmodSync(SOCKET_PATH, 0o600);
  } catch (e) {
    // Ignore
  }
});

server.on("error", (e) => {
  // If socket is in use, the bridge is already running
  // Just act as a file writer via stdin/stdout
});

function broadcastToSolClients(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.alloc(4 + Buffer.byteLength(json, "utf-8"));
  buf.writeUInt32LE(Buffer.byteLength(json, "utf-8"), 0);
  buf.write(json, 4, "utf-8");
  for (const client of solClients) {
    try {
      client.write(buf);
    } catch (e) {
      solClients.delete(client);
    }
  }
}

function handleSolMessage(msg) {
  switch (msg.type) {
    case "history_request":
      // Forward to Firefox extension
      sendToExtension({
        type: "history_request",
        requestId: msg.requestId,
        query: msg.query,
        maxResults: msg.maxResults || 20,
      });
      break;

    case "activate_tab":
      // Forward to Firefox extension
      sendToExtension({
        type: "activate_tab",
        tabId: msg.tabId,
        windowId: msg.windowId,
      });
      break;
  }
}

// --- Cleanup ---

// Track whether we successfully started the server
let ownsSocket = false;
server.on("listening", () => {
  ownsSocket = true;
});

process.on("exit", () => {
  // Only delete the socket if we created it — avoids race with new instances
  if (ownsSocket) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch (e) {
      // Ignore
    }
  }
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// Keep the process alive
process.stdin.resume();
