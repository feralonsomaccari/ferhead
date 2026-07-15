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
    chrome.storage.local.get(["checkboxes"], (result) => {
        var _a;
        const checkboxes = (_a = result.checkboxes) !== null && _a !== void 0 ? _a : {};
        setIcon(Object.keys(checkboxes).some((key) => { var _a; return (_a = checkboxes[key]) === null || _a === void 0 ? void 0 : _a.checked; }));
    });
};
chrome.runtime.onStartup.addListener(syncIconFromStorage);
chrome.runtime.onInstalled.addListener(syncIconFromStorage);
syncIconFromStorage();
chrome.runtime.onMessage.addListener((message) => {
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
                addRules: [
                    {
                        id: message.id,
                        priority: message.id,
                        action: {
                            type: chrome.declarativeNetRequest.RuleActionType
                                .MODIFY_HEADERS,
                            requestHeaders: [
                                {
                                    header: message.header,
                                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                                    value: message.value,
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
                    },
                ],
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
