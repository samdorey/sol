import { makeAutoObservable, runInAction } from "mobx";
import { solNative } from "lib/SolNative";
import { Linking } from "react-native";
import type { IRootStore } from "store";
import { ItemType } from "./ui.store";
import { nanoid } from "nanoid";

const TABS_FILE_PATH = `${solNative.userName() ? `/Users/${solNative.userName()}` : "~"}/.sol/firefox-tabs.json`;
const SOCKET_PATH = "/tmp/sol-firefox-bridge.sock";

export type FirefoxStore = ReturnType<typeof createFirefoxStore>;

interface FirefoxTab {
	id: number;
	windowId: number;
	title: string;
	url: string;
	active: boolean;
	pinned: boolean;
}

interface HistoryEntry {
	id: string;
	title: string;
	url: string;
	lastVisitTime: number;
	visitCount: number;
}

export const createFirefoxStore = (root: IRootStore) => {
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let folderWatcher: object | null = null;

	const store = makeAutoObservable({
		tabs: [] as FirefoxTab[],
		historyResults: [] as HistoryEntry[],
		isConnected: false,
		lastUpdated: 0,
		enabled: true,
		historyQuery: "",

		get tabItems(): Item[] {
			return store.tabs.map((tab): Item => ({
				id: `firefox_tab_${tab.id}`,
				name: tab.title || tab.url,
				subName: tab.url,
				type: ItemType.FIREFOX_TAB,
				url: tab.url,
				callback: () => {
					// Activate the tab in Firefox via AppleScript as a fallback,
					// and also try the socket bridge for direct tab activation
					store.activateTab(tab.id, tab.windowId);
				},
			}));
		},

		get historyItems(): Item[] {
			return store.historyResults.map((entry): Item => ({
				id: `firefox_history_${entry.id}`,
				name: entry.title || entry.url,
				subName: entry.url,
				type: ItemType.FIREFOX_HISTORY,
				url: entry.url,
				callback: () => {
					Linking.openURL(entry.url);
				},
			}));
		},

		activateTab(tabId: number, windowId: number) {
			// Use AppleScript to bring Firefox to front, then use the socket
			// to tell the extension to activate the specific tab
			solNative.executeAppleScript(
				`tell application "Firefox" to activate`,
			);

			// Also send activate_tab via the bridge socket
			// We write a command file that the bridge can pick up
			store.sendBridgeCommand({
				type: "activate_tab",
				tabId,
				windowId,
			});
		},

		sendBridgeCommand(msg: object) {
			// Write command to a file the bridge reads, or use executeBashScript
			// to send via the Unix socket
			const json = JSON.stringify(msg);
			const script = `echo '${json.replace(/'/g, "'\\''")}' | nc -U -w1 "${SOCKET_PATH}" 2>/dev/null || true`;
			solNative.executeBashScript(script).catch(() => {
				// Bridge not available, ignore
			});
		},

		loadTabs() {
			try {
				const username = solNative.userName();
				const tabsPath = `/Users/${username}/.sol/firefox-tabs.json`;
				if (!solNative.exists(tabsPath)) {
					return;
				}
				const content = solNative.readFile(tabsPath);
				if (!content) return;

				const data = JSON.parse(content);
				runInAction(() => {
					store.tabs = data.tabs || [];
					store.lastUpdated = data.updatedAt || 0;
					store.isConnected = true;
				});
			} catch (e) {
				// File doesn't exist or is malformed, ignore
			}
		},

		requestHistory(query: string) {
			if (!query || query.length < 2) {
				runInAction(() => {
					store.historyResults = [];
					store.historyQuery = "";
				});
				return;
			}

			store.historyQuery = query;

			// Send history request through bridge via bash
			const requestId = nanoid();
			const msg = JSON.stringify({
				type: "history_request",
				requestId,
				query,
				maxResults: 10,
			});

			// Use the length-prefixed protocol over the socket
			const script = `node -e "
				const net = require('net');
				const msg = '${msg.replace(/'/g, "\\'")}';
				const buf = Buffer.alloc(4 + Buffer.byteLength(msg));
				buf.writeUInt32LE(Buffer.byteLength(msg), 0);
				buf.write(msg, 4);
				const sock = net.connect('${SOCKET_PATH}');
				sock.on('connect', () => { sock.write(buf); });
				let respBuf = Buffer.alloc(0);
				sock.on('data', (chunk) => {
					respBuf = Buffer.concat([respBuf, chunk]);
					if (respBuf.length >= 4) {
						const len = respBuf.readUInt32LE(0);
						if (respBuf.length >= 4 + len) {
							process.stdout.write(respBuf.slice(4, 4 + len));
							sock.end();
						}
					}
				});
				sock.on('error', () => process.exit(0));
				setTimeout(() => process.exit(0), 2000);
			" 2>/dev/null || echo '{}'`;

			solNative
				.executeBashScript(script)
				.then(() => {
					// Results come back asynchronously; for now rely on file-based approach
				})
				.catch(() => {
					// Bridge not available
				});
		},

		startPolling() {
			// Load tabs immediately
			store.loadTabs();

			// Set up file watcher on the .sol directory
			try {
				const username = solNative.userName();
				const solDir = `/Users/${username}/.sol`;
				if (solNative.exists(solDir)) {
					folderWatcher = solNative.createFolderWatcher(
						solDir,
						(changedPath, changeType) => {
							if (changedPath.includes("firefox-tabs")) {
								store.loadTabs();
							}
						},
					);
				}
			} catch (e) {
				// Folder watcher not available, fall back to polling
			}

			// Also poll every 2 seconds as a fallback
			pollTimer = setInterval(() => {
				store.loadTabs();
			}, 2000);
		},

		stopPolling() {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			folderWatcher = null;
		},

		cleanUp() {
			store.stopPolling();
		},
	});

	// Start polling when the store is created
	store.startPolling();

	return store;
};
