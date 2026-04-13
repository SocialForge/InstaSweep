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

chrome.action.onClicked.addListener(tab => {
    if (tab.id === undefined) {
        return;
    }

    void chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist.js'],
    });
});
