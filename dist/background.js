"use strict";
const ENABLED_ICONS = {
    16: "../assets/enabled-16.png",
    24: "../assets/enabled-24.png",
    32: "../assets/enabled-32.png",
};
const DISABLED_ICONS = {
    16: "../assets/disabled-16.png",
    24: "../assets/disabled-24.png",
    32: "../assets/disabled-32.png",
};
const setIcon = (isAnyChecked) => {
    chrome.action.setIcon({ path: isAnyChecked ? ENABLED_ICONS : DISABLED_ICONS });
};
const syncIconFromStorage = () => {
    chrome.storage.local.get(["profiles", "activeProfileId", "headerEntries", "checkboxes"], (result) => {
        var _a, _b, _c;
        if (Array.isArray(result.profiles)) {
            const profiles = result.profiles;
            const active = (_a = profiles.find((p) => p.id === result.activeProfileId)) !== null && _a !== void 0 ? _a : profiles[0];
            setIcon(!!((_b = active === null || active === void 0 ? void 0 : active.headerEntries) === null || _b === void 0 ? void 0 : _b.some((entry) => entry === null || entry === void 0 ? void 0 : entry.checked)));
            return;
        }
        if (Array.isArray(result.headerEntries)) {
            const entries = result.headerEntries;
            setIcon(entries.some((entry) => entry === null || entry === void 0 ? void 0 : entry.checked));
            return;
        }
        const checkboxes = (_c = result.checkboxes) !== null && _c !== void 0 ? _c : {};
        setIcon(Object.keys(checkboxes).some((key) => { var _a; return (_a = checkboxes[key]) === null || _a === void 0 ? void 0 : _a.checked; }));
    });
};
chrome.runtime.onStartup.addListener(syncIconFromStorage);
chrome.runtime.onInstalled.addListener(syncIconFromStorage);
syncIconFromStorage();
const buildHeaderRule = (entry) => ({
    id: entry.id,
    priority: entry.id,
    action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
            {
                header: entry.name,
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: entry.value,
            },
            // Add Cache-Control to prevent caching
            {
                header: "Cache-Control",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: "no-cache, no-store, must-revalidate",
            },
            {
                header: "Pragma",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: "no-cache",
            },
            {
                header: "Expires",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: "0",
            },
        ],
    },
    condition: {
        urlFilter: "*",
        resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
        ],
    },
});
chrome.runtime.onMessage.addListener((message) => {
    if (message.replaceAllRules) {
        chrome.declarativeNetRequest.getDynamicRules((liveRules) => {
            var _a;
            const removeRuleIds = liveRules.map((rule) => rule.id);
            const addRules = ((_a = message.entries) !== null && _a !== void 0 ? _a : [])
                .filter((entry) => entry.checked && entry.name && entry.value)
                .map(buildHeaderRule);
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules }, () => {
                setIcon(message.isAnyChecked);
            });
        });
        return;
    }
    setIcon(message.isAnyChecked);
    if (message.addHeader !== undefined) {
        if (message.addHeader) {
            if (message.id === undefined || message.id === null) {
                return;
            }
            if (!message.header || !message.value) {
                chrome.declarativeNetRequest.updateDynamicRules({
                    addRules: [],
                    removeRuleIds: [message.id],
                }, () => {
                    console.log("Header rule removed (incomplete row).");
                });
                return;
            }
            // Enable the rule
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [buildHeaderRule({ id: message.id, name: message.header, value: message.value })],
                removeRuleIds: [message.id],
            }, () => {
                console.log("Header rule added.");
            });
        }
        else {
            // Disable the rule
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [],
                removeRuleIds: [message.id],
            }, () => {
                console.log("Header rule removed.");
            });
        }
    }
});
chrome.commands.onCommand.addListener((command) => {
    if (command === "do-something") {
        console.log("F2 pressed");
        // Add your desired action here
    }
});
