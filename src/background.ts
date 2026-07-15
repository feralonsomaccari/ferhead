// Toolbar densities: 16 (1x), 24 (1.5x), 32 (2x). The 48/128 assets are for the
// manifest "icons" block (extensions page / store), not this slot.
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

const setIcon = (isAnyChecked: boolean) => {
  chrome.action.setIcon({ path: isAnyChecked ? ENABLED_ICONS : DISABLED_ICONS });
};

// The icon lives in browser UI state and is not persisted, so it resets to the
// manifest default whenever the service worker starts. Dynamic rules DO persist,
// so without this the icon can read "disabled" while rules are still injecting.
const syncIconFromStorage = () => {
  chrome.storage.local.get(["checkboxes"], (result) => {
    const checkboxes: Record<string, { checked: boolean } | undefined> =
      result.checkboxes ?? {};
    setIcon(Object.keys(checkboxes).some((key) => checkboxes[key]?.checked));
  });
};

chrome.runtime.onStartup.addListener(syncIconFromStorage);
chrome.runtime.onInstalled.addListener(syncIconFromStorage);

// The worker also unloads after ~30s idle; re-running at top level covers every
// respawn, not just startup/install.
syncIconFromStorage();

chrome.runtime.onMessage.addListener(
  (message: {
    addHeader?: boolean;
    id: number;
    header: string;
    value: string;
    isAnyChecked: boolean;
  }) => {

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
          chrome.declarativeNetRequest.updateDynamicRules(
            {
              addRules: [],
              removeRuleIds: [message.id],
            },
            () => {
              console.log("Header rule removed (incomplete row).");
            },
          );
          return;
        }

        // Enable the rule
        chrome.declarativeNetRequest.updateDynamicRules(
          {
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
                      operation:
                        chrome.declarativeNetRequest.HeaderOperation.SET,
                      value: message.value,
                    },
                    // Add Cache-Control to prevent caching
                    {
                      header: "Cache-Control",
                      operation:
                        chrome.declarativeNetRequest.HeaderOperation.SET,
                      value: "no-cache, no-store, must-revalidate",
                    },
                    {
                      header: "Pragma",
                      operation:
                        chrome.declarativeNetRequest.HeaderOperation.SET,
                      value: "no-cache",
                    },
                    {
                      header: "Expires",
                      operation:
                        chrome.declarativeNetRequest.HeaderOperation.SET,
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
          },
          () => {
            console.log("Header rule added.");
          },
        );
      } else {
        // Disable the rule
        chrome.declarativeNetRequest.updateDynamicRules(
          {
            addRules: [],
            removeRuleIds: [message.id],
          },
          () => {
            console.log("Header rule removed.");
          },
        );
      }
    }
  },
);

chrome.commands.onCommand.addListener((command) => {
  if (command === "do-something") {
    console.log("F2 pressed");
    // Add your desired action here
  }
});
