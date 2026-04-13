const ACTIVE_ICON_PATH = 'assets/favicon/favicon-48.png';
const INACTIVE_ICON_PATH = 'assets/favicon/favicon-48_inactive.png';
const INSTAGRAM_ORIGIN = 'https://www.instagram.com';

function isInstagramRoute(tabUrl?: string): boolean {
    return tabUrl?.startsWith(INSTAGRAM_ORIGIN) ?? false;
}

function setInactiveAction(tabId: number): void {
    void chrome.action.setIcon({ path: INACTIVE_ICON_PATH, tabId });
    void chrome.action.setBadgeBackgroundColor({ color: '#6f849b', tabId });
    void chrome.action.setBadgeText({ text: '', tabId });
    void chrome.action.setBadgeTextColor({ color: '#fff', tabId });
    void chrome.action.disable(tabId);
}

function setActiveAction(tabId: number): void {
    void chrome.action.setIcon({ path: ACTIVE_ICON_PATH, tabId });
    void chrome.action.setBadgeText({ text: '', tabId });
    void chrome.action.enable(tabId);
}

function syncTabAction(tab?: chrome.tabs.Tab): void {
    if (tab?.id === undefined) {
        return;
    }

    if (tab.status === 'complete' && isInstagramRoute(tab.url)) {
        setActiveAction(tab.id);
        return;
    }

    setInactiveAction(tab.id);
}

function syncActiveTabAction(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        syncTabAction(tabs[0]);
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    switch (changeInfo.status) {
        case undefined: {
            break;
        }

        case 'unloaded':
        case 'loading': {
            setInactiveAction(tabId);
            break;
        }

        case 'complete': {
            if (isInstagramRoute(tab.url)) {
                setActiveAction(tabId);
            } else {
                setInactiveAction(tabId);
            }
            break;
        }

        default: {
            break;
        }
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, tab => {
        syncTabAction(tab);
    });
});

chrome.runtime.onInstalled.addListener(() => {
    syncActiveTabAction();
});

chrome.runtime.onStartup.addListener(() => {
    syncActiveTabAction();
});

chrome.action.onClicked.addListener(tab => {
    if (tab.id === undefined) {
        return;
    }

    void chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist.js'],
    });
});
