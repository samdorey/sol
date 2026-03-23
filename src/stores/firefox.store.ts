import { makeAutoObservable, runInAction } from "mobx";
import { solNative } from "lib/SolNative";
import { Linking } from "react-native";
import type { IRootStore } from "store";
import { ItemType } from "./ui.store";

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
			// Activate whichever Firefox variant is running
			solNative.executeAppleScript(
				`try
					tell application "Firefox Developer Edition" to activate
				on error
					try
						tell application "Firefox" to activate
					end try
				end try`,
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

			// Query Firefox's places.sqlite directly — much faster than the extension API
			const username = solNative.userName();
			const profilesDir = `/Users/${username}/Library/Application Support/Firefox/Profiles`;
			const historyFile = `/Users/${username}/.sol/firefox-history.json`;
			const escapedQuery = query.replace(/'/g, "''").replace(/"/g, '\\"');

			const script = `/usr/bin/sqlite3 -json "$(ls -d '${profilesDir}'/*.default-release/places.sqlite 2>/dev/null | head -1)" "SELECT p.url, p.title, p.visit_count as visitCount, MAX(v.visit_date)/1000000 as lastVisitTime FROM moz_places p JOIN moz_historyvisits v ON v.place_id = p.id WHERE (p.title LIKE '%${escapedQuery}%' OR p.url LIKE '%${escapedQuery}%') AND p.visit_count > 0 GROUP BY p.url ORDER BY v.visit_date DESC LIMIT 30;" > "${historyFile}.tmp" 2>/dev/null && mv "${historyFile}.tmp" "${historyFile}" || echo '[]' > "${historyFile}"`;

			solNative.executeBashScript(script).then(() => {
				try {
					if (!solNative.exists(historyFile)) return;
					const content = solNative.readFile(historyFile);
					if (!content) return;
					const entries = JSON.parse(content);
					runInAction(() => {
						store.historyResults = (Array.isArray(entries) ? entries : []).map((e: any) => ({
							id: e.url,
							title: e.title || "",
							url: e.url || "",
							lastVisitTime: (e.lastVisitTime || 0) * 1000,
							visitCount: e.visitCount || 0,
						}));
					});
				} catch (e) {
					// Parse error, ignore
				}
			}).catch(() => {
				// sqlite3 not available or profile not found
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
