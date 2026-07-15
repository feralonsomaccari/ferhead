const copyToClipboard = (text: string) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      console.log("Copied to clipboard:", text);
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
    });
};

const checkboxes: Record<string, { checked: boolean; inputs: string[] }> = {};


document.addEventListener("DOMContentLoaded", () => {
  const checkboxIds = [
    "headerCheckbox1",
    "headerCheckbox2",
    "headerCheckbox3",
    "headerCheckbox4",
    "headerCheckbox5",
    "headerCheckbox6",
  ];

  const isAnyChecked = () => checkboxIds.some((id) => document.querySelector<HTMLInputElement>(`#${id}`)?.checked);

  const checkboxElements = checkboxIds.map((id) =>
    document.querySelector<HTMLInputElement>(`#${id}`),
  );

  const inputElements = checkboxIds.map((id, index) => [
    document.querySelector<HTMLInputElement>(`#paramHeader-${index + 1}`),
    document.querySelector<HTMLInputElement>(`#paramValue-${index + 1}`),
  ]);

  const copyButtons = checkboxIds.map((id, index) =>
    document.querySelector<HTMLButtonElement>(`#paramCopy-${index + 1}`),
  );

  const copyButtonsWithUrl = checkboxIds.map((id, index) =>
    document.querySelector<HTMLButtonElement>(`#paramCopyWithUrl-${index + 1}`),
  );

  // Check if any element is missing
  if (
    checkboxElements.some((checkbox) => !checkbox) ||
    inputElements.some(([inputA, inputB]) => !inputA || !inputB) ||
    copyButtons.some((copyButton) => !copyButton) ||
    copyButtonsWithUrl.some((copyButton) => !copyButton)
  ) {
    console.error("One or more elements are missing.");
    return;
  }

  // Load saved states from storage
  chrome.storage.local.get(["checkboxes"], (result) => {
    if (result.checkboxes) {
      Object.assign(checkboxes, result.checkboxes);
      checkboxElements.forEach((checkbox, index) => {
        if (!checkbox) return;
        const key = `checkbox${index + 1}`;
        const [inputA, inputB] = inputElements[index];
        checkbox.checked = checkboxes[key]?.checked || false;
        if (inputA && inputB) {
          inputA.value = checkboxes[key]?.inputs?.[0] || "";
          inputB.value = checkboxes[key]?.inputs?.[1] || "";
        }
      });
    }
  });

  // Handle edits to either field while the checkbox is active. Both fields are
  // covered: clearing the header name has to reach the background too, or the
  // previous rule keeps injecting.
  document.addEventListener("input", (event) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement &&
      (activeElement.id.startsWith("paramValue") ||
        activeElement.id.startsWith("paramHeader"))
    ) {
      event.preventDefault();
      const paramId = parseInt(activeElement.id.split("-")[1]);
      const [inputA, inputB] = inputElements[paramId - 1];
      const checkbox = checkboxElements[paramId - 1];
      if (inputA && inputB && checkbox?.checked) {
        // An empty field sends through as-is; the background drops the rule
        // rather than leaving a stale one live.
        chrome.runtime.sendMessage({
          addHeader: true,
          id: paramId,
          header: inputA.value,
          value: inputB.value,
          isAnyChecked: isAnyChecked(),
        });
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    const key = parseInt(event.key, 10);

    if (event.key === "Escape" && activeElement instanceof HTMLInputElement) {
      if (activeElement.selectionStart !== activeElement.selectionEnd) {
        activeElement.setSelectionRange(
          activeElement.selectionStart,
          activeElement.selectionStart,
        );
      }

      activeElement.blur();
      event.preventDefault();
    }

    if (event.shiftKey && /^Digit[1-4]$/.test(event.code)) {
      event.preventDefault();

      const keyNumber = parseInt(event.code.replace("Digit", ""), 10);
      const paramHeaderInputId = `paramValue-${keyNumber}`;
      const secondInput = document.querySelector<HTMLInputElement>(
        `#${paramHeaderInputId}`,
      );

      if (secondInput) {
        const pattern = new RegExp(`-pr\\d+-`, "g");
        const match = secondInput.value.match(pattern);

        if (match) {
          const startIndex = secondInput.value.indexOf(match[0]) + 3;
          const endIndex = startIndex + match[0].slice(4).length;
          secondInput.focus();
          secondInput.setSelectionRange(startIndex, endIndex);
        }
      }
      return;
    }

    // Handle only numeric input when a number is selected
    if (
      activeElement instanceof HTMLInputElement &&
      activeElement.selectionStart !== activeElement.selectionEnd &&
      activeElement.id.startsWith("paramValue")
    ) {
      // Allow cut, copy, and paste commands
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "c" || event.key === "x" || event.key === "v")
      ) {
        return; // Allow Ctrl+C, Ctrl+X, and Ctrl+V to pass through
      }

      // Allow only numbers (0-9)
      if (
        !/^\d$/.test(event.key) &&
        event.key !== "Backspace" &&
        event.key !== "Delete" &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Tab"
      ) {
        event.preventDefault();
      }
    }

    // After here it sohuld only affect checkboxes
    if (
      activeElement instanceof HTMLInputElement &&
      activeElement.type === "text" &&
      activeElement.id.startsWith("paramValue")
    ) {
      return;
    }

    // Check box Listener
    if (key >= 1 && key <= checkboxElements.length) {
      const checkbox = checkboxElements[key - 1];
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    }
  });

  // Handle changes to checkboxes and inputs
  checkboxElements.forEach((checkbox, index) => {
    const key = `checkbox${index + 1}`;
    const [inputA, inputB] = inputElements[index];

    if (!checkbox || !inputA || !inputB) return;

    checkbox.addEventListener("change", () => {
      checkboxes[key] = {
        checked: checkbox.checked,
        inputs: [inputA.value, inputB.value],
      };
      chrome.storage.local.set({ checkboxes });

      if (checkbox.checked) {
        chrome.runtime.sendMessage({
          addHeader: true,
          id: index + 1,
          header: inputA.value,
          value: inputB.value,
          isAnyChecked: isAnyChecked(),
        });
      } else {
        chrome.runtime.sendMessage({ addHeader: false, id: index + 1, isAnyChecked: isAnyChecked() });
      }
    });

    [inputA, inputB].forEach((input, inputIndex) => {
      input.addEventListener("input", () => {
        if (!checkboxes[key]) {
          checkboxes[key] = { checked: checkbox.checked, inputs: ["", ""] };
        }
        checkboxes[key].inputs[inputIndex] = input.value;
        chrome.storage.local.set({ checkboxes });
      });
    });
  });

  copyButtons.forEach((buttonEl, index) => {
    const [inputA, inputB] = inputElements[index];
    if (!buttonEl || !inputA || !inputB) return;
       buttonEl.addEventListener("click", () => {

       const matches = inputB.value.match(/pub-(\w+)-([\w-]+)\.(\w+)-(\w+)\./);
       if (matches) {
          const [prNumber, appName, region, environment] = [matches[1], matches[2], matches[3], matches[4]];
          const regionVal = region === 'ore' ? 'oregon' : 'virginia'; 
          window.open(`https://next.onservo.com/orgs/${environment}/regions/${regionVal}/apps/${appName}/stacks/${prNumber}`, "_blank");
       } else {
          console.error("No match found! Header value format might be incorrect or doesnt exists in servo.");
       }
    });
  });

  copyButtonsWithUrl.forEach((buttonEl, index) => {
    const [inputA, inputB] = inputElements[index];
    if (!buttonEl || !inputA || !inputB) return;

    buttonEl.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url) {
          console.error("Unable to retrieve the active tab's URL");
          return;
        }
        const url = new URL(activeTab.url);
        url.searchParams.set(inputA.value, inputB.value);
        const fullUrl = url.toString();
        copyToClipboard(fullUrl);
      });
    });
  });

});

