chrome.runtime.onMessage.addListener((message: { addHeader?: boolean }) => {
  if (message.addHeader !== undefined) {
    if (message.addHeader) {
      // Enable the rule
      chrome.declarativeNetRequest.updateDynamicRules(
        {
          addRules: [
            {
              id: 1,
              priority: 1,
              action: {
                type: chrome.declarativeNetRequest.RuleActionType
                  .MODIFY_HEADERS,
                requestHeaders: [
                  {
                    header: "PEPE",
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: "true",
                  },
                ],
              },
              condition: {
                urlFilter: "*", // Matches all URLs
                resourceTypes: [
                  chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
                  chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
                  chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
                ],
              },
            },
          ],
          removeRuleIds: [], // No rules to remove
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
          removeRuleIds: [1], // Remove the rule with ID 1
        },
        () => {
          console.log("Header rule removed.");
        },
      );
    }
  }
});
