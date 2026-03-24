# Firefox Tab & History Search Setup

This guide explains how to set up Firefox integration with Sol, enabling you to search open Firefox tabs and browsing history directly from the Sol launcher.

## Architecture Overview

```
Firefox Extension  <-->  Native Messaging Bridge (Node.js)  <-->  Sol
     (tabs/history)        (stdin/stdout + Unix socket)          (reads JSON file)
```

The Firefox extension sends tab and history data through the native messaging protocol to a small Node.js bridge script. The bridge writes tab data to `~/.sol/firefox-tabs.json`, which Sol reads to show tabs in search results. History is queried on demand through the Unix socket.

## Prerequisites

- **macOS** (Sol is a macOS-only application)
- **Firefox** (version 91 or later)
- **Node.js** (version 14 or later) - needed to run the bridge script

## Installation Steps

### 1. Install the Native Messaging Bridge

Run the install script from the project root:

```bash
cd native-messaging-bridge
bash install.sh
```

This will:
- Copy the bridge script to `/usr/local/bin/sol_firefox_bridge.js`
- Create the native messaging host manifest at `~/Library/Application Support/Mozilla/NativeMessagingHosts/sol_firefox_bridge.json`
- Create the `~/.sol` data directory

### 2. Install the Firefox Extension

**For development/testing:**

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to the `firefox-extension/` directory in this project
5. Select `manifest.json`

**For permanent installation:**

Requires Firefox Developer Edition, ESR, or Nightly (regular Firefox does not allow unsigned extensions).

1. In Firefox, go to `about:config` and set `xpis.signatures.required` to `false`
2. Package the extension:
   ```bash
   cd firefox-extension
   zip -r sol-firefox-bridge.xpi manifest.json background.js
   ```
3. Go to `about:addons`, click the gear icon → "Install Add-on From File..."
4. Select the `.xpi` file

### 3. Enable in Sol

Firefox integration is enabled by default. You can toggle it in:

**Sol Settings > Show Firefox Tabs & History**

## How It Works

### Tab Search
- The Firefox extension sends the full list of open tabs whenever tabs are created, closed, or updated
- Tabs appear in Sol search results alongside apps, bookmarks, and other items
- Selecting a tab result switches focus to that tab in Firefox

### History Search
- When you type a search query (2+ characters), Sol requests matching history entries from Firefox
- History results appear alongside other search results
- Selecting a history result opens the URL in Firefox

### Result Ranking
All Firefox results (tabs and history) are integrated into Sol's unified search index. They are ranked alongside all other result types (apps, bookmarks, system commands, etc.) using the same relevance scoring algorithm. Items you select frequently will be boosted in future searches.

## Troubleshooting

### Firefox extension can't connect to native host

1. Verify the manifest exists:
   ```bash
   cat ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/sol_firefox_bridge.json
   ```

2. Verify the bridge script is executable:
   ```bash
   ls -la /usr/local/bin/sol_firefox_bridge.js
   ```

3. Verify Node.js is available:
   ```bash
   node --version
   ```

### No Firefox tabs appearing in Sol

1. Check that the extension is loaded (Firefox > about:addons)
2. Check that the data file is being written:
   ```bash
   cat ~/.sol/firefox-tabs.json
   ```
3. Check that "Show Firefox Tabs & History" is enabled in Sol Settings

### Tab switching not working

Tab activation requires the native messaging bridge to be running. If you select a tab and Firefox comes to the foreground but doesn't switch to the correct tab, ensure the bridge socket is active:

```bash
ls -la /tmp/sol-firefox-bridge.sock
```

## Uninstallation

```bash
# Remove the bridge script
sudo rm /usr/local/bin/sol_firefox_bridge.js

# Remove the native messaging manifest
rm ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/sol_firefox_bridge.json

# Remove data files
rm -rf ~/.sol/firefox-tabs.json

# Remove the socket (if present)
rm -f /tmp/sol-firefox-bridge.sock
```

Then remove the extension from Firefox via `about:addons`.
