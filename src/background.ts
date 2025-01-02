chrome.runtime.onMessage.addListener((message: { addHeader?: boolean, id: number, header: string, value: string }) => {

  if (message.addHeader !== undefined) {
    if (message.addHeader) {

     if(!message.id || !message.header || !message.value) {
        console.error("missing params");
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
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: message.value,
                  },
                  // Add Cache-Control to prevent caching
                  {
                    header: "Cache-Control",
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: "no-cache, no-store, must-revalidate"

                  },
                  {
                    header: "Pragma",
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: "no-cache"
                  },
                  {
                    header: "Expires",
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: "0"
                  }
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
          removeRuleIds: [],
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
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "do-something") {
    console.log("F2 pressed");
    // Add your desired action here
  }
});
