import { makeAutoObservable, runInAction } from "mobx";
import { solNative } from "lib/SolNative";
import { Linking } from "react-native";
import type { IRootStore } from "store";
import { ItemType } from "./ui.store";
import { nanoid } from "nanoid";

const TABS_FILE_PATH = `${solNative.userName() ? `/Users/${solNative.userName()}` : "~"}/.sol/firefox-tabs.json`;
const SOCKET_PATH = `${solNative.userName() ? `/Users/${solNative.userName()}` : "~"}/.sol/firefox-bridge.sock`;

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
			// Write command to a temp file, then run a helper script to send it
			const json = JSON.stringify(msg);
			const username = solNative.userName();
			const cmdFile = `/Users/${username}/.sol/firefox-cmd.json`;
			const helperScript = `/Users/${username}/.sol/bin/sol_firefox_send.sh`;

			// Write the command JSON to a file, then execute the helper
			solNative.executeBashScript(
				`echo '${json.replace(/'/g, "'\\''")}' > "${cmdFile}" && /bin/bash "${helperScript}" "${cmdFile}" "${SOCKET_PATH}"`
			).catch(() => {
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

			const requestId = nanoid();

			// Send history request via the bridge
			store.sendBridgeCommand({
				type: "history_request",
				requestId,
				query,
				maxResults: 50,
			});

			// Poll for results file — the bridge writes history results to disk
			const username = solNative.userName();
			const historyFile = `/Users/${username}/.sol/firefox-history.json`;
			let attempts = 0;
			const poll = setInterval(() => {
				attempts++;
				if (attempts > 10) {
					clearInterval(poll);
					return;
				}
				try {
					if (!solNative.exists(historyFile)) return;
					const content = solNative.readFile(historyFile);
					if (!content) return;
					const data = JSON.parse(content);
					if (data.requestId === requestId) {
						clearInterval(poll);
						runInAction(() => {
							store.historyResults = data.results || [];
						});
					}
				} catch (e) {
					// File not ready yet, keep polling
				}
			}, 200);
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
