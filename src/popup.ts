// The actions open a tab or write to the clipboard, neither of which is visible
// from the popup. Flash the button so a click always resolves to something.
const flash = (button: HTMLButtonElement, state: "is-ok" | "is-error") => {
  button.classList.remove("is-ok", "is-error");
  // Force a reflow so a repeat click restarts the flash instead of no-opping.
  void button.offsetWidth;
  button.classList.add(state);
  setTimeout(() => button.classList.remove(state), 600);
};

const copyToClipboard = (text: string, button: HTMLButtonElement) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      flash(button, "is-ok");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      flash(button, "is-error");
    });
};

// Servo app names don't follow one rule from the brand ("-rendering" vs
// "-renderer"), so each brand is listed explicitly. Add brands as they come up.
const SERVO_APPS: Record<string, { app: string; region: string }> = {
  barrons: { app: "barrons-rendering", region: "oregon" },
  marketwatch: { app: "marketwatch-renderer", region: "oregon" },
};

// Market-data pages on barrons are served by their own app, except for this one
// path, which the barrons app still renders.
const ORION_APP = "orion";
const BARRONS_MARKET_DATA_PATH = "/market-data/stocks/stock-picks";

// pr-327.www.dev.barrons.com -> orgs/dev .. apps/barrons-rendering .. stacks/pr327
const servoUrlFromTabUrl = (tabUrl: string): string | null => {
  let url: URL;
  try {
    url = new URL(tabUrl);
  } catch {
    return null;
  }

  const labels = url.hostname.split(".");

  const prNumber = labels[0]?.match(/^pr-(\d+)$/)?.[1];
  if (!prNumber) return null;

  const brand = labels.find((label) => label in SERVO_APPS);
  if (!brand) return null;
  const { region } = SERVO_APPS[brand];
  let { app } = SERVO_APPS[brand];

  // The label before the brand is the environment (…dev.barrons.com -> dev).
  const environment = labels[labels.indexOf(brand) - 1];
  if (!environment) return null;

  // Trailing slashes shouldn't change which app a path maps to.
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (
    brand === "barrons" &&
    /^\/market-data\/.+/.test(path) &&
    path !== BARRONS_MARKET_DATA_PATH
  ) {
    app = ORION_APP;
  }

  return `https://next.onservo.com/orgs/${environment}/regions/${region}/apps/${app}/stacks/pr${prNumber}`;
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

  // One S for the whole popup: it reads the active tab, not any single row.
  const servoButton = document.querySelector<HTMLButtonElement>("#servoOpen");

  const copyButtonsWithUrl = checkboxIds.map((id, index) =>
    document.querySelector<HTMLButtonElement>(`#paramCopyWithUrl-${index + 1}`),
  );

  // Check if any element is missing
  if (
    checkboxElements.some((checkbox) => !checkbox) ||
    inputElements.some(([inputA, inputB]) => !inputA || !inputB) ||
    !servoButton ||
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

    // Shift+N selects row N's value, Ctrl+N its header name. Both select the
    // whole field so the next keystroke replaces it.
    if ((event.shiftKey || event.ctrlKey) && /^Digit[1-6]$/.test(event.code)) {
      event.preventDefault();

      const keyNumber = parseInt(event.code.replace("Digit", ""), 10);
      const field = event.shiftKey ? "paramValue" : "paramHeader";
      const target = document.querySelector<HTMLInputElement>(
        `#${field}-${keyNumber}`,
      );

      if (target) {
        target.focus();
        target.select();
      }
      return;
    }

    // Typing inside a field is text entry, never a checkbox toggle.
    if (
      activeElement instanceof HTMLInputElement &&
      activeElement.type === "text"
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

  if (servoButton) {
    servoButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url) {
          console.error("Unable to retrieve the active tab's URL");
          flash(servoButton, "is-error");
          return;
        }

        const servoUrl = servoUrlFromTabUrl(activeTab.url);
        if (!servoUrl) {
          console.error(
            "This tab doesn't look like a PR stack, or its brand isn't in SERVO_APPS:",
            activeTab.url,
          );
          flash(servoButton, "is-error");
          return;
        }

        window.open(servoUrl, "_blank");
        flash(servoButton, "is-ok");
      });
    });
  }

  copyButtonsWithUrl.forEach((buttonEl, index) => {
    const [inputA, inputB] = inputElements[index];
    if (!buttonEl || !inputA || !inputB) return;

    buttonEl.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url) {
          console.error("Unable to retrieve the active tab's URL");
          flash(buttonEl, "is-error");
          return;
        }
        const url = new URL(activeTab.url);
        url.searchParams.set(inputA.value, inputB.value);
        const fullUrl = url.toString();
        copyToClipboard(fullUrl, buttonEl);
      });
    });
  });

});

