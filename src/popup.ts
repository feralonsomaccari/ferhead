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
type Profile = { id: number; headerEntries: HeaderEntry[] };

const DEFAULT_ROW_COUNT = 6;
const MAX_SHORTCUT_ROW = 9;
const PROFILE_COLORS = ["#37a1ce", "#cc7a5a", "#5bb98c", "#b06abf", "#d4b14a", "#5c7fe0"];

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

type StorageShape = {
  profiles: Profile[];
  activeProfileId: number;
  nextProfileId: number;
  nextRowId: number;
};

const loadState = (): Promise<StorageShape> =>
  new Promise((resolve) => {
    chrome.storage.local.get(
      ["profiles", "activeProfileId", "nextProfileId", "nextRowId", "headerEntries", "nextId", "checkboxes"],
      (result) => {
        if (Array.isArray(result.profiles)) {
          resolve({
            profiles: result.profiles,
            activeProfileId: result.activeProfileId,
            nextProfileId: result.nextProfileId,
            nextRowId: result.nextRowId,
          });
          return;
        }

        if (Array.isArray(result.headerEntries)) {
          const entries = result.headerEntries as HeaderEntry[];
          const nextRowId =
            typeof result.nextId === "number"
              ? result.nextId
              : entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
          const state: StorageShape = {
            profiles: [{ id: 1, headerEntries: entries }],
            activeProfileId: 1,
            nextProfileId: 2,
            nextRowId,
          };
          chrome.storage.local.set(state, () => {
            chrome.storage.local.remove(["headerEntries", "nextId"]);
          });
          resolve(state);
          return;
        }

        if (result.checkboxes && typeof result.checkboxes === "object") {
          const migrated = migrateOldCheckboxes(result.checkboxes);
          const nextRowId = migrated.reduce((max, e) => Math.max(max, e.id), 0) + 1;
          const state: StorageShape = {
            profiles: [{ id: 1, headerEntries: migrated }],
            activeProfileId: 1,
            nextProfileId: 2,
            nextRowId,
          };
          chrome.storage.local.set(state, () => {
            chrome.storage.local.remove(["checkboxes", "headerEntries", "nextId"]);
          });
          resolve(state);
          return;
        }

        const state: StorageShape = {
          profiles: [{ id: 1, headerEntries: defaultHeaderEntries() }],
          activeProfileId: 1,
          nextProfileId: 2,
          nextRowId: DEFAULT_ROW_COUNT + 1,
        };
        chrome.storage.local.set(state);
        resolve(state);
      },
    );
  });

document.addEventListener("DOMContentLoaded", async () => {
  const rowsContainer = document.querySelector<HTMLDivElement>("#headerRows");
  const template = document.querySelector<HTMLTemplateElement>("#header-row-template");
  const addButton = document.querySelector<HTMLButtonElement>("#addHeaderRow");
  const profileListContainer = document.querySelector<HTMLDivElement>("#profileList");
  const profileTemplate = document.querySelector<HTMLTemplateElement>("#profile-tile-template");
  const addProfileButton = document.querySelector<HTMLButtonElement>("#addProfile");
  const toggleAllButton = document.querySelector<HTMLButtonElement>("#toggleAllHeaders");
  const deleteProfileButton = document.querySelector<HTMLButtonElement>("#deleteProfile");
  const activeProfileSwatch = document.querySelector<HTMLSpanElement>("#activeProfileSwatch");

  // One Servo button for the whole popup: it reads the active tab, not any single row.
  const servoButton = document.querySelector<HTMLButtonElement>("#servoOpen");

  if (
    !rowsContainer ||
    !template ||
    !addButton ||
    !profileListContainer ||
    !profileTemplate ||
    !addProfileButton ||
    !toggleAllButton ||
    !deleteProfileButton ||
    !activeProfileSwatch ||
    !servoButton
  ) {
    console.error("One or more elements are missing.");
    return;
  }

  let profiles: Profile[] = [];
  let activeProfileId = 1;
  let nextProfileId = 1;
  let nextRowId = 1;
  let renderedRows: Array<{
    entry: HeaderEntry;
    checkboxEl: HTMLInputElement;
    nameEl: HTMLInputElement;
    valueEl: HTMLInputElement;
  }> = [];

  const currentProfile = (): Profile => profiles.find((p) => p.id === activeProfileId)!;

  const isAnyChecked = () => currentProfile().headerEntries.some((entry) => entry.checked);

  const persist = () => {
    chrome.storage.local.set({ profiles, activeProfileId, nextProfileId, nextRowId });
  };

  const applyActiveProfile = () => {
    chrome.runtime.sendMessage({
      replaceAllRules: true,
      entries: currentProfile().headerEntries,
      isAnyChecked: isAnyChecked(),
    });
  };

  const updateToggleAllButton = () => {
    const entries = currentProfile().headerEntries;
    toggleAllButton.disabled = entries.length === 0;
    const anyChecked = entries.some((entry) => entry.checked);
    toggleAllButton.classList.toggle("is-all-active", anyChecked);
    toggleAllButton.setAttribute(
      "aria-label",
      anyChecked ? "Deactivate all headers in this profile" : "Activate all headers in this profile",
    );
  };

  const updateActiveProfileSwatch = () => {
    const index = profiles.findIndex((p) => p.id === activeProfileId);
    // Set on the document root (not just the swatch element) so it cascades
    // down to the header rows too, tinting the checked-row accent border.
    document.documentElement.style.setProperty("--profile-color", PROFILE_COLORS[index % PROFILE_COLORS.length]);
  };

  const renderRows = () => {
    rowsContainer.replaceChildren();
    renderedRows = currentProfile().headerEntries.map((entry, index) => {
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
        updateToggleAllButton();

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
        currentProfile().headerEntries = currentProfile().headerEntries.filter((e) => e.id !== entry.id);
        persist();
        chrome.runtime.sendMessage({ addHeader: false, id: entry.id, isAnyChecked: isAnyChecked() });
        renderRows();
      });

      rowsContainer.appendChild(fragment);

      return { entry, checkboxEl, nameEl, valueEl };
    });

    updateToggleAllButton();
  };

  const renderProfiles = () => {
    profileListContainer.replaceChildren();

    profiles.forEach((profile, index) => {
      const fragment = profileTemplate.content.cloneNode(true) as DocumentFragment;
      const tile = fragment.querySelector<HTMLDivElement>(".profile-tile");
      const numberEl = fragment.querySelector<HTMLSpanElement>(".profile-number");

      if (!tile || !numberEl) {
        throw new Error("Profile tile template is missing an expected element.");
      }

      const position = index + 1;
      tile.style.setProperty("--profile-color", PROFILE_COLORS[index % PROFILE_COLORS.length]);
      tile.classList.toggle("is-active", profile.id === activeProfileId);
      numberEl.textContent = String(position);
      tile.setAttribute("aria-label", `Switch to profile ${position}`);

      tile.addEventListener("click", () => {
        switchProfile(profile.id);
      });

      profileListContainer.appendChild(fragment);
    });

    updateActiveProfileSwatch();
  };

  const switchProfile = (profileId: number) => {
    if (profileId === activeProfileId) return;
    activeProfileId = profileId;
    persist();
    applyActiveProfile();
    renderRows();
    renderProfiles();
  };

  const deleteActiveProfile = () => {
    if (profiles.length === 1) {
      flash(deleteProfileButton, "is-error");
      return;
    }

    profiles = profiles.filter((p) => p.id !== activeProfileId);
    activeProfileId = profiles[0].id;
    persist();
    applyActiveProfile();
    renderRows();
    renderProfiles();
  };

  ({ profiles, activeProfileId, nextProfileId, nextRowId } = await loadState());
  renderRows();
  renderProfiles();

  addButton.addEventListener("click", () => {
    const entry: HeaderEntry = { id: nextRowId, checked: false, name: "", value: "" };
    nextRowId += 1;
    currentProfile().headerEntries.push(entry);
    persist();
    renderRows();
    renderedRows[renderedRows.length - 1]?.nameEl.focus();
  });

  addProfileButton.addEventListener("click", () => {
    const profile: Profile = {
      id: nextProfileId,
      headerEntries: [{ id: nextRowId, checked: false, name: "", value: "" }],
    };
    nextProfileId += 1;
    nextRowId += 1;
    profiles.push(profile);
    activeProfileId = profile.id;
    persist();
    applyActiveProfile();
    renderRows();
    renderProfiles();
  });

  deleteProfileButton.addEventListener("click", () => {
    deleteActiveProfile();
  });

  toggleAllButton.addEventListener("click", () => {
    const entries = currentProfile().headerEntries;
    const nextChecked = !isAnyChecked();
    entries.forEach((entry) => {
      entry.checked = nextChecked;
    });
    renderedRows.forEach(({ entry, checkboxEl }) => {
      checkboxEl.checked = entry.checked;
    });
    persist();
    applyActiveProfile();
    updateToggleAllButton();
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

    // Ctrl+Shift+N switches to the Nth profile. Plain Alt/Option+N doesn't reach
    // here reliably on macOS (the OS consumes it to type accented/symbol
    // characters), so this uses a two-modifier combo that's free on both
    // platforms, distinct from Ctrl-alone/Shift-alone below.
    if (event.ctrlKey && event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
      event.preventDefault();

      const position = parseInt(event.code.replace("Digit", ""), 10);
      const profile = profiles[position - 1];
      if (!profile) return;

      switchProfile(profile.id);
      return;
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

