// This file is relevant specifically for the Chrome extension portion of the tool.

const INSTAGRAM_URL = 'https://www.instagram.com';

const isInstagramRoute = tabUrl => {
    return tabUrl.indexOf(INSTAGRAM_URL) !== -1;
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    switch (changeInfo.status) {
        case 'unloaded':
        case 'loading':
            chrome.action.setBadgeBackgroundColor({ color: '#6f849b', tabId });
            chrome.action.setBadgeTextColor({ color: '#fff', tabId });
            // Avoid having it enabled during loading phase.
            chrome.action.disable(tabId);
            break;

        case 'complete':
            chrome.action.setBadgeText({ text: undefined, tabId }); // Clear badge
            if (isInstagramRoute(tab.url)) {
                chrome.action.setIcon({ path: 'assets/favicon/favicon-48.png', tabId });
                chrome.action.enable(tabId);
            }
            break;
    }
});

chrome.action.onClicked.addListener(tab => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist.js'],
    });
});
