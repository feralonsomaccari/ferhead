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

const syncIconFromStorage = () => {
  chrome.storage.local.get(["profiles", "activeProfileId", "headerEntries", "checkboxes"], (result) => {
    if (Array.isArray(result.profiles)) {
      const profiles: Array<{ id: number; headerEntries: Array<{ checked?: boolean }> }> = result.profiles;
      const active = profiles.find((p) => p.id === result.activeProfileId) ?? profiles[0];
      setIcon(!!active?.headerEntries?.some((entry) => entry?.checked));
      return;
    }

    if (Array.isArray(result.headerEntries)) {
      const entries: Array<{ checked?: boolean }> = result.headerEntries;
      setIcon(entries.some((entry) => entry?.checked));
      return;
    }

    const checkboxes: Record<string, { checked: boolean } | undefined> =
      result.checkboxes ?? {};
    setIcon(Object.keys(checkboxes).some((key) => checkboxes[key]?.checked));
  });
};

chrome.runtime.onStartup.addListener(syncIconFromStorage);
chrome.runtime.onInstalled.addListener(syncIconFromStorage);

syncIconFromStorage();

const buildHeaderRule = (entry: {
  id: number;
  name: string;
  value: string;
}): chrome.declarativeNetRequest.Rule => ({
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

chrome.runtime.onMessage.addListener(
  (message: {
    addHeader?: boolean;
    id: number;
    header: string;
    value: string;
    isAnyChecked: boolean;
    replaceAllRules?: boolean;
    entries?: Array<{ id: number; checked: boolean; name: string; value: string }>;
  }) => {
    if (message.replaceAllRules) {
      chrome.declarativeNetRequest.getDynamicRules((liveRules) => {
        const removeRuleIds = liveRules.map((rule) => rule.id);
        const addRules = (message.entries ?? [])
          .filter((entry) => entry.checked && entry.name && entry.value)
          .map(buildHeaderRule);

        chrome.declarativeNetRequest.updateDynamicRules(
          { removeRuleIds, addRules },
          () => {
            setIcon(message.isAnyChecked);
          },
        );
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
            addRules: [buildHeaderRule({ id: message.id, name: message.header, value: message.value })],
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
