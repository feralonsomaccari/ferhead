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

// The default profile lives outside the numbered `profiles` array (see `StorageShape`)
// so its reserved id and color never shift the numbered profiles' positions/palette.
const DEFAULT_PROFILE_ID = 0;
const DEFAULT_PROFILE_COLOR = "#d9a62e";

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
  defaultProfile: Profile;
};

// A freshly created default profile starts with one empty row, consuming `rowId`
// from whichever `nextRowId` counter was in play at the time.
const freshDefaultProfile = (rowId: number): Profile => ({
  id: DEFAULT_PROFILE_ID,
  headerEntries: [{ id: rowId, checked: false, name: "", value: "" }],
});

const loadState = (): Promise<StorageShape> =>
  new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "profiles",
        "activeProfileId",
        "nextProfileId",
        "nextRowId",
        "defaultProfile",
        "headerEntries",
        "nextId",
        "checkboxes",
      ],
      (result) => {
        if (Array.isArray(result.profiles)) {
          if (result.defaultProfile) {
            resolve({
              profiles: result.profiles,
              activeProfileId: result.activeProfileId,
              nextProfileId: result.nextProfileId,
              nextRowId: result.nextRowId,
              defaultProfile: result.defaultProfile,
            });
            return;
          }

          // Upgrading from the pre-default-profile shape: add an empty default
          // profile without disturbing any existing profile/id-counter state.
          const state: StorageShape = {
            profiles: result.profiles,
            activeProfileId: result.activeProfileId,
            nextProfileId: result.nextProfileId,
            nextRowId: result.nextRowId + 1,
            defaultProfile: freshDefaultProfile(result.nextRowId),
          };
          chrome.storage.local.set(state);
          resolve(state);
          return;
        }

        if (Array.isArray(result.headerEntries)) {
          const entries = result.headerEntries as HeaderEntry[];
          const baseNextRowId =
            typeof result.nextId === "number"
              ? result.nextId
              : entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
          const state: StorageShape = {
            profiles: [{ id: 1, headerEntries: entries }],
            activeProfileId: 1,
            nextProfileId: 2,
            nextRowId: baseNextRowId + 1,
            defaultProfile: freshDefaultProfile(baseNextRowId),
          };
          chrome.storage.local.set(state, () => {
            chrome.storage.local.remove(["headerEntries", "nextId"]);
          });
          resolve(state);
          return;
        }

        if (result.checkboxes && typeof result.checkboxes === "object") {
          const migrated = migrateOldCheckboxes(result.checkboxes);
          const baseNextRowId = migrated.reduce((max, e) => Math.max(max, e.id), 0) + 1;
          const state: StorageShape = {
            profiles: [{ id: 1, headerEntries: migrated }],
            activeProfileId: 1,
            nextProfileId: 2,
            nextRowId: baseNextRowId + 1,
            defaultProfile: freshDefaultProfile(baseNextRowId),
          };
          chrome.storage.local.set(state, () => {
            chrome.storage.local.remove(["checkboxes", "headerEntries", "nextId"]);
          });
          resolve(state);
          return;
        }

        const defaultRowId = DEFAULT_ROW_COUNT + 1;
        const state: StorageShape = {
          profiles: [{ id: 1, headerEntries: defaultHeaderEntries() }],
          activeProfileId: 1,
          nextProfileId: 2,
          nextRowId: defaultRowId + 1,
          defaultProfile: freshDefaultProfile(defaultRowId),
        };
        chrome.storage.local.set(state);
        resolve(state);
      },
    );
  });

type RenderedRow = {
  entry: HeaderEntry;
  checkboxEl: HTMLInputElement;
  nameEl: HTMLInputElement;
  valueEl: HTMLInputElement;
};

type ProfileTileSpec = {
  id: number;
  label: string;
  color: string;
  isActive: boolean;
  ariaLabel: string;
  isDefault?: boolean;
};

document.addEventListener("DOMContentLoaded", async () => {
  const rowsContainer = document.querySelector<HTMLDivElement>("#headerRows");
  const template = document.querySelector<HTMLTemplateElement>("#header-row-template");
  const addButton = document.querySelector<HTMLButtonElement>("#addHeaderRow");
  const defaultProfileSlot = document.querySelector<HTMLDivElement>("#defaultProfileSlot");
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
    !defaultProfileSlot ||
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
  let defaultProfile: Profile = { id: DEFAULT_PROFILE_ID, headerEntries: [] };
  let renderedRows: RenderedRow[] = [];

  const currentProfile = (): Profile =>
    activeProfileId === DEFAULT_PROFILE_ID ? defaultProfile : profiles.find((p) => p.id === activeProfileId)!;

  // The toolbar icon reflects whether anything is actually live on the wire (the
  // default profile OR the viewed profile); the toggle-all button only cares
  // about the profile currently being viewed. Keep these two deliberately separate.
  const isDefaultProfileChecked = (): boolean => defaultProfile.headerEntries.some((entry) => entry.checked);
  const isViewedProfileChecked = (): boolean => currentProfile().headerEntries.some((entry) => entry.checked);
  const isAnyChecked = (): boolean => isDefaultProfileChecked() || isViewedProfileChecked();

  const persist = () => {
    chrome.storage.local.set({ profiles, activeProfileId, nextProfileId, nextRowId, defaultProfile });
  };

  // The default profile's checked rows always ride along with whichever profile
  // is active, since every row id is globally unique there's never a collision.
  const entriesForRuleSync = (): HeaderEntry[] =>
    activeProfileId === DEFAULT_PROFILE_ID
      ? defaultProfile.headerEntries
      : [...defaultProfile.headerEntries, ...currentProfile().headerEntries];

  const applyActiveProfile = () => {
    chrome.runtime.sendMessage({
      replaceAllRules: true,
      entries: entriesForRuleSync(),
      isAnyChecked: isAnyChecked(),
    });
  };

  const updateToggleAllButton = () => {
    const entries = currentProfile().headerEntries;
    toggleAllButton.disabled = entries.length === 0;
    const anyChecked = isViewedProfileChecked();
    toggleAllButton.classList.toggle("is-all-active", anyChecked);
    toggleAllButton.setAttribute(
      "aria-label",
      anyChecked ? "Deactivate all headers in this profile" : "Activate all headers in this profile",
    );
  };

  const updateDeleteProfileButton = () => {
    const isDefault = activeProfileId === DEFAULT_PROFILE_ID;
    deleteProfileButton.disabled = isDefault;
    deleteProfileButton.title = isDefault ? "The default profile can't be deleted" : "Delete the active profile";
    deleteProfileButton.setAttribute("aria-label", deleteProfileButton.title);
  };

  const updateActiveProfileSwatch = () => {
    const color =
      activeProfileId === DEFAULT_PROFILE_ID
        ? DEFAULT_PROFILE_COLOR
        : PROFILE_COLORS[profiles.findIndex((p) => p.id === activeProfileId) % PROFILE_COLORS.length];
    // Set on the document root (not just the swatch element) so it cascades
    // down to the header rows too, tinting the checked-row accent border.
    document.documentElement.style.setProperty("--profile-color", color);
  };

  const wireHeaderRow = (entry: HeaderEntry, position: number): { row: DocumentFragment; descriptor: RenderedRow } => {
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

    titleEl.textContent = String(position);
    titleEl.classList.toggle("header-title-first", position === 1);

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

    return { row: fragment, descriptor: { entry, checkboxEl, nameEl, valueEl } };
  };

  const renderRows = () => {
    rowsContainer.replaceChildren();
    renderedRows = currentProfile().headerEntries.map((entry, index) => {
      const { row, descriptor } = wireHeaderRow(entry, index + 1);
      rowsContainer.appendChild(row);
      return descriptor;
    });

    updateToggleAllButton();
    updateDeleteProfileButton();
  };

  const renderProfileTile = (container: HTMLElement, spec: ProfileTileSpec) => {
    const fragment = profileTemplate.content.cloneNode(true) as DocumentFragment;
    const tile = fragment.querySelector<HTMLDivElement>(".profile-tile");
    const numberEl = fragment.querySelector<HTMLSpanElement>(".profile-number");

    if (!tile || !numberEl) {
      throw new Error("Profile tile template is missing an expected element.");
    }

    tile.style.setProperty("--profile-color", spec.color);
    tile.classList.toggle("is-active", spec.isActive);
    tile.classList.toggle("profile-tile--default", !!spec.isDefault);
    numberEl.textContent = spec.label;
    tile.setAttribute("aria-label", spec.ariaLabel);
    tile.title = spec.ariaLabel;

    tile.addEventListener("click", () => {
      switchProfile(spec.id);
    });

    container.appendChild(fragment);
  };

  const renderProfiles = () => {
    defaultProfileSlot.replaceChildren();
    renderProfileTile(defaultProfileSlot, {
      id: DEFAULT_PROFILE_ID,
      label: "*",
      color: DEFAULT_PROFILE_COLOR,
      isActive: activeProfileId === DEFAULT_PROFILE_ID,
      ariaLabel: "Default profile — its checked headers apply to every profile",
      isDefault: true,
    });

    profileListContainer.replaceChildren();
    profiles.forEach((profile, index) => {
      const position = index + 1;
      renderProfileTile(profileListContainer, {
        id: profile.id,
        label: String(position),
        color: PROFILE_COLORS[index % PROFILE_COLORS.length],
        isActive: profile.id === activeProfileId,
        ariaLabel: `Switch to profile ${position}`,
      });
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
    if (activeProfileId === DEFAULT_PROFILE_ID) {
      flash(deleteProfileButton, "is-error");
      return;
    }

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

  ({ profiles, activeProfileId, nextProfileId, nextRowId, defaultProfile } = await loadState());
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
    const nextChecked = !isViewedProfileChecked();
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

  const tryHandleEscape = (event: KeyboardEvent): boolean => {
    const activeElement = document.activeElement;
    if (!(event.key === "Escape" && activeElement instanceof HTMLInputElement)) return false;

    if (activeElement.selectionStart !== activeElement.selectionEnd) {
      activeElement.setSelectionRange(activeElement.selectionStart, activeElement.selectionStart);
    }

    activeElement.blur();
    event.preventDefault();
    return true;
  };

  // Ctrl+Shift+0 switches to the default profile, Ctrl+Shift+1-9 to the Nth
  // numbered profile. Plain Alt/Option+N doesn't reach here reliably on macOS
  // (the OS consumes it to type accented/symbol characters), so this uses a
  // two-modifier combo that's free on both platforms, distinct from
  // Ctrl-alone/Shift-alone below.
  const tryHandleProfileSwitchShortcut = (event: KeyboardEvent): boolean => {
    if (!(event.ctrlKey && event.shiftKey && /^Digit[0-9]$/.test(event.code))) return false;
    event.preventDefault();

    const digit = parseInt(event.code.replace("Digit", ""), 10);
    const targetId = digit === 0 ? DEFAULT_PROFILE_ID : profiles[digit - 1]?.id;
    if (targetId === undefined) return true;

    switchProfile(targetId);
    return true;
  };

  // Shift+N selects row N's value, Ctrl+N its header name. Both select the
  // whole field so the next keystroke replaces it.
  const tryHandleFieldSelectShortcut = (event: KeyboardEvent): boolean => {
    if (!((event.shiftKey || event.ctrlKey) && /^Digit[1-9]$/.test(event.code))) return false;
    event.preventDefault();

    const position = parseInt(event.code.replace("Digit", ""), 10);
    const row = renderedRows[position - 1];
    if (!row) return true;
    const target = event.shiftKey ? row.valueEl : row.nameEl;

    target.focus();
    target.select();
    return true;
  };

  // Typing inside a field is text entry, never a checkbox toggle.
  const isTypingInTextField = (): boolean => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement && activeElement.type === "text";
  };

  const tryHandleRowToggleShortcut = (event: KeyboardEvent): boolean => {
    const key = parseInt(event.key, 10);
    if (!(key >= 1 && key <= MAX_SHORTCUT_ROW && key <= renderedRows.length)) return false;

    const row = renderedRows[key - 1];
    if (!row) return false;
    row.checkboxEl.checked = !row.checkboxEl.checked;
    row.checkboxEl.dispatchEvent(new Event("change"));
    return true;
  };

  document.addEventListener("keydown", (event) => {
    if (tryHandleEscape(event)) return;
    if (tryHandleProfileSwitchShortcut(event)) return;
    if (tryHandleFieldSelectShortcut(event)) return;
    if (isTypingInTextField()) return;
    tryHandleRowToggleShortcut(event);
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

