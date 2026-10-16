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

const SERVO_APPS: Record<string, { app: string; region: string }> = {
  barrons: { app: "barrons-rendering", region: "oregon" },
  marketwatch: { app: "marketwatch-renderer", region: "oregon" },
};

const ORION_APP = "orion";
const BARRONS_MARKET_DATA_PATH = "/market-data/stocks/stock-picks";

const SERVO_META_NAME = "servo-context";

const servoUrlFromContext = (content: string): string | null => {
  const parts = content.trim().split(":");
  if (parts.length !== 5) return null;

  const [prefix, , region, app, stack] = parts;
  if (prefix !== "servo") return null;
  if (!region || !app || !stack) return null;

  return `https://next.onservo.com/orgs/dev/regions/${region}/apps/${app}/stacks/${stack}`;
};

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

type HeaderEntry = { id: number; checked: boolean; name: string; value: string };

const DEFAULT_ROW_COUNT = 6;
const MAX_SHORTCUT_ROW = 9;

const defaultHeaderEntries = (): HeaderEntry[] =>
  Array.from({ length: DEFAULT_ROW_COUNT }, (_, i) => ({
    id: i + 1,
    checked: false,
    name: "",
    value: "",
  }));

type OldCheckboxes = Record<string, { checked?: boolean; inputs?: string[] } | undefined>;

const migrateOldCheckboxes = (old: OldCheckboxes): HeaderEntry[] =>
  Object.keys(old)
    .map((key) => {
      const match = key.match(/^checkbox(\d+)$/);
      if (!match) return null;
      const entry = old[key];
      return {
        id: parseInt(match[1], 10),
        checked: entry?.checked ?? false,
        name: entry?.inputs?.[0] ?? "",
        value: entry?.inputs?.[1] ?? "",
      } as HeaderEntry;
    })
    .filter((e): e is HeaderEntry => e !== null)
    .sort((a, b) => a.id - b.id);

const loadState = (): Promise<{ headerEntries: HeaderEntry[]; nextId: number }> =>
  new Promise((resolve) => {
    chrome.storage.local.get(["headerEntries", "nextId", "checkboxes"], (result) => {
      if (Array.isArray(result.headerEntries)) {
        const entries = result.headerEntries as HeaderEntry[];
        const nextId =
          typeof result.nextId === "number"
            ? result.nextId
            : entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
        resolve({ headerEntries: entries, nextId });
        return;
      }

      if (result.checkboxes && typeof result.checkboxes === "object") {
        const migrated = migrateOldCheckboxes(result.checkboxes);
        const nextId = migrated.reduce((max, e) => Math.max(max, e.id), 0) + 1;
        chrome.storage.local.set({ headerEntries: migrated, nextId }, () => {
          chrome.storage.local.remove("checkboxes");
        });
        resolve({ headerEntries: migrated, nextId });
        return;
      }

      const headerEntries = defaultHeaderEntries();
      const nextId = DEFAULT_ROW_COUNT + 1;
      chrome.storage.local.set({ headerEntries, nextId });
      resolve({ headerEntries, nextId });
    });
  });

document.addEventListener("DOMContentLoaded", async () => {
  const rowsContainer = document.querySelector<HTMLDivElement>("#headerRows");
  const template = document.querySelector<HTMLTemplateElement>("#header-row-template");
  const addButton = document.querySelector<HTMLButtonElement>("#addHeaderRow");

  // One Servo button for the whole popup: it reads the active tab, not any single row.
  const servoButton = document.querySelector<HTMLButtonElement>("#servoOpen");

  if (!rowsContainer || !template || !addButton || !servoButton) {
    console.error("One or more elements are missing.");
    return;
  }

  let headerEntries: HeaderEntry[] = [];
  let nextId = 1;
  let renderedRows: Array<{
    entry: HeaderEntry;
    checkboxEl: HTMLInputElement;
    nameEl: HTMLInputElement;
    valueEl: HTMLInputElement;
  }> = [];

  const isAnyChecked = () => headerEntries.some((entry) => entry.checked);

  const persist = () => {
    chrome.storage.local.set({ headerEntries, nextId });
  };

  const renderRows = () => {
    rowsContainer.replaceChildren();
    renderedRows = headerEntries.map((entry, index) => {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const titleEl = fragment.querySelector<HTMLSpanElement>(".header-title");
      const checkboxEl = fragment.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const nameEl = fragment.querySelector<HTMLInputElement>(".paramInput:not(.param-value)");
      const valueEl = fragment.querySelector<HTMLInputElement>(".param-value");
      const copyButton = fragment.querySelector<HTMLButtonElement>(".param-action-url");
      const deleteButton = fragment.querySelector<HTMLButtonElement>(".param-action-delete");

      if (!titleEl || !checkboxEl || !nameEl || !valueEl || !copyButton || !deleteButton) {
        throw new Error("Header row template is missing an expected element.");
      }

      const position = index + 1;
      titleEl.textContent = String(position);
      titleEl.classList.toggle("header-title-first", index === 0);

      checkboxEl.id = `headerCheckbox${entry.id}`;
      checkboxEl.setAttribute("aria-label", `Enable header ${position}`);
      checkboxEl.checked = entry.checked;

      nameEl.id = `paramHeader-${entry.id}`;
      nameEl.setAttribute("aria-label", `Header name ${position}`);
      nameEl.value = entry.name;

      valueEl.id = `paramValue-${entry.id}`;
      valueEl.setAttribute("aria-label", `Header value ${position}`);
      valueEl.value = entry.value;

      copyButton.id = `paramCopyWithUrl-${entry.id}`;
      copyButton.setAttribute("aria-label", `Copy tab URL with header ${position} as query param`);

      deleteButton.id = `paramDelete-${entry.id}`;
      deleteButton.setAttribute("aria-label", `Delete header ${position}`);

      checkboxEl.addEventListener("change", () => {
        entry.checked = checkboxEl.checked;
        persist();

        if (entry.checked) {
          chrome.runtime.sendMessage({
            addHeader: true,
            id: entry.id,
            header: nameEl.value,
            value: valueEl.value,
            isAnyChecked: isAnyChecked(),
          });
        } else {
          chrome.runtime.sendMessage({ addHeader: false, id: entry.id, isAnyChecked: isAnyChecked() });
        }
      });

      [nameEl, valueEl].forEach((input, inputIndex) => {
        input.addEventListener("input", () => {
          if (inputIndex === 0) {
            entry.name = input.value;
          } else {
            entry.value = input.value;
          }
          persist();

          if (entry.checked) {
            chrome.runtime.sendMessage({
              addHeader: true,
              id: entry.id,
              header: nameEl.value,
              value: valueEl.value,
              isAnyChecked: isAnyChecked(),
            });
          }
        });
      });

      copyButton.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab || !activeTab.url) {
            console.error("Unable to retrieve the active tab's URL");
            flash(copyButton, "is-error");
            return;
          }
          const url = new URL(activeTab.url);
          url.searchParams.set(nameEl.value, valueEl.value);
          const fullUrl = url.toString();
          copyToClipboard(fullUrl, copyButton);
        });
      });

      deleteButton.addEventListener("click", () => {
        headerEntries = headerEntries.filter((e) => e.id !== entry.id);
        persist();
        chrome.runtime.sendMessage({ addHeader: false, id: entry.id, isAnyChecked: isAnyChecked() });
        renderRows();
      });

      rowsContainer.appendChild(fragment);

      return { entry, checkboxEl, nameEl, valueEl };
    });
  };

  ({ headerEntries, nextId } = await loadState());
  renderRows();

  addButton.addEventListener("click", () => {
    const entry: HeaderEntry = { id: nextId, checked: false, name: "", value: "" };
    nextId += 1;
    headerEntries.push(entry);
    persist();
    renderRows();
    renderedRows[renderedRows.length - 1]?.nameEl.focus();
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
    if ((event.shiftKey || event.ctrlKey) && /^Digit[1-9]$/.test(event.code)) {
      event.preventDefault();

      const position = parseInt(event.code.replace("Digit", ""), 10);
      const row = renderedRows[position - 1];
      if (!row) return;
      const target = event.shiftKey ? row.valueEl : row.nameEl;

      target.focus();
      target.select();
      return;
    }

    // Typing inside a field is text entry, never a checkbox toggle.
    if (
      activeElement instanceof HTMLInputElement &&
      activeElement.type === "text"
    ) {
      return;
    }

    if (key >= 1 && key <= MAX_SHORTCUT_ROW && key <= renderedRows.length) {
      const row = renderedRows[key - 1];
      if (!row) return;
      row.checkboxEl.checked = !row.checkboxEl.checked;
      row.checkboxEl.dispatchEvent(new Event("change"));
    }
  });

  const readServoContext = (tabId: number): Promise<string | null> =>
    new Promise((resolve) => {
      if (!chrome.scripting?.executeScript) {
        resolve(null);
        return;
      }

      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: (metaName: string) =>
              document
                .querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`)
                ?.content ?? null,
            args: [SERVO_META_NAME],
          },
          (results) => {
            if (chrome.runtime.lastError || !results?.length) {
              resolve(null);
              return;
            }
            resolve(results[0].result ?? null);
          },
        );
      } catch {
        resolve(null);
      }
    });

  if (servoButton) {
    servoButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url || activeTab.id === undefined) {
          console.error("Unable to retrieve the active tab");
          flash(servoButton, "is-error");
          return;
        }

        try {
          const context = await readServoContext(activeTab.id);
          const servoUrl =
            (context && servoUrlFromContext(context)) ||
            servoUrlFromTabUrl(activeTab.url);

          if (!servoUrl) {
            console.error(
              "No servo-context meta tag, and this tab doesn't look like a PR stack:",
              activeTab.url,
            );
            flash(servoButton, "is-error");
            return;
          }

          window.open(servoUrl, "_blank");
          flash(servoButton, "is-ok");
        } catch (err) {
          console.error("Failed to open Servo:", err);
          flash(servoButton, "is-error");
        }
      });
    });
  }

});

