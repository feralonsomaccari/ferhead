"use strict";
const ENABLED_ICONS = {
    16: "../assets/enabled-16.png",
    48: "../assets/enabled-48.png",
    128: "../assets/enabled-128.png",
};
const DISABLED_ICONS = {
    16: "../assets/disabled-16.png",
    48: "../assets/disabled-48.png",
    128: "../assets/disabled-128.png",
};
const setIcon = (isAnyChecked) => {
    chrome.action.setIcon({ path: isAnyChecked ? ENABLED_ICONS : DISABLED_ICONS });
};
// The icon lives in browser UI state and is not persisted, so it resets to the
// manifest default whenever the service worker starts. Dynamic rules DO persist,
// so without this the icon can read "disabled" while rules are still injecting.
const syncIconFromStorage = () => {
    chrome.storage.local.get(["checkboxes"], (result) => {
        var _a;
        const checkboxes = (_a = result.checkboxes) !== null && _a !== void 0 ? _a : {};
        setIcon(Object.keys(checkboxes).some((key) => { var _a; return (_a = checkboxes[key]) === null || _a === void 0 ? void 0 : _a.checked; }));
    });
};
chrome.runtime.onStartup.addListener(syncIconFromStorage);
chrome.runtime.onInstalled.addListener(syncIconFromStorage);
// The worker also unloads after ~30s idle; re-running at top level covers every
// respawn, not just startup/install.
syncIconFromStorage();
chrome.runtime.onMessage.addListener((message) => {
    setIcon(message.isAnyChecked);
    if (message.addHeader !== undefined) {
        if (message.addHeader) {
            if (message.id === undefined || message.id === null) {
                return;
            }
            // Checked but incomplete (e.g. the value was cleared mid-edit). Drop the
            // rule rather than returning early, which would leave the previous
            // header injecting while the popup shows an empty field.
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
