"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// The actions open a tab or write to the clipboard, neither of which is visible
// from the popup. Flash the button so a click always resolves to something.
const flash = (button, state) => {
    button.classList.remove("is-ok", "is-error");
    // Force a reflow so a repeat click restarts the flash instead of no-opping.
    void button.offsetWidth;
    button.classList.add(state);
    setTimeout(() => button.classList.remove(state), 600);
};
const copyToClipboard = (text, button) => {
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
const SERVO_APPS = {
    barrons: { app: "barrons-rendering", region: "oregon" },
    marketwatch: { app: "marketwatch-renderer", region: "oregon" },
};
// Market-data pages on barrons are served by their own app, except for this one
// path, which the barrons app still renders.
const ORION_APP = "orion";
const BARRONS_MARKET_DATA_PATH = "/market-data/stocks/stock-picks";
// The page can name its own Servo context, which beats inferring one from the
// URL: servo:<env>:<region>:<app>:<stack>. The env is ignored on purpose —
// these links are only ever useful pointing at dev.
const SERVO_META_NAME = "servo-context";
const servoUrlFromContext = (content) => {
    const parts = content.trim().split(":");
    if (parts.length !== 5)
        return null;
    const [prefix, , region, app, stack] = parts;
    if (prefix !== "servo")
        return null;
    if (!region || !app || !stack)
        return null;
    return `https://next.onservo.com/orgs/dev/regions/${region}/apps/${app}/stacks/${stack}`;
};
// pr-327.www.dev.barrons.com -> orgs/dev .. apps/barrons-rendering .. stacks/pr327
const servoUrlFromTabUrl = (tabUrl) => {
    var _a, _b;
    let url;
    try {
        url = new URL(tabUrl);
    }
    catch (_c) {
        return null;
    }
    const labels = url.hostname.split(".");
    const prNumber = (_b = (_a = labels[0]) === null || _a === void 0 ? void 0 : _a.match(/^pr-(\d+)$/)) === null || _b === void 0 ? void 0 : _b[1];
    if (!prNumber)
        return null;
    const brand = labels.find((label) => label in SERVO_APPS);
    if (!brand)
        return null;
    const { region } = SERVO_APPS[brand];
    let { app } = SERVO_APPS[brand];
    // The label before the brand is the environment (…dev.barrons.com -> dev).
    const environment = labels[labels.indexOf(brand) - 1];
    if (!environment)
        return null;
    // Trailing slashes shouldn't change which app a path maps to.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (brand === "barrons" &&
        /^\/market-data\/.+/.test(path) &&
        path !== BARRONS_MARKET_DATA_PATH) {
        app = ORION_APP;
    }
    return `https://next.onservo.com/orgs/${environment}/regions/${region}/apps/${app}/stacks/pr${prNumber}`;
};
const checkboxes = {};
document.addEventListener("DOMContentLoaded", () => {
    const checkboxIds = [
        "headerCheckbox1",
        "headerCheckbox2",
        "headerCheckbox3",
        "headerCheckbox4",
        "headerCheckbox5",
        "headerCheckbox6",
    ];
    const isAnyChecked = () => checkboxIds.some((id) => { var _a; return (_a = document.querySelector(`#${id}`)) === null || _a === void 0 ? void 0 : _a.checked; });
    const checkboxElements = checkboxIds.map((id) => document.querySelector(`#${id}`));
    const inputElements = checkboxIds.map((id, index) => [
        document.querySelector(`#paramHeader-${index + 1}`),
        document.querySelector(`#paramValue-${index + 1}`),
    ]);
    // One S for the whole popup: it reads the active tab, not any single row.
    const servoButton = document.querySelector("#servoOpen");
    const copyButtonsWithUrl = checkboxIds.map((id, index) => document.querySelector(`#paramCopyWithUrl-${index + 1}`));
    // Check if any element is missing
    if (checkboxElements.some((checkbox) => !checkbox) ||
        inputElements.some(([inputA, inputB]) => !inputA || !inputB) ||
        !servoButton ||
        copyButtonsWithUrl.some((copyButton) => !copyButton)) {
        console.error("One or more elements are missing.");
        return;
    }
    // Load saved states from storage
    chrome.storage.local.get(["checkboxes"], (result) => {
        if (result.checkboxes) {
            Object.assign(checkboxes, result.checkboxes);
            checkboxElements.forEach((checkbox, index) => {
                var _a, _b, _c, _d, _e;
                if (!checkbox)
                    return;
                const key = `checkbox${index + 1}`;
                const [inputA, inputB] = inputElements[index];
                checkbox.checked = ((_a = checkboxes[key]) === null || _a === void 0 ? void 0 : _a.checked) || false;
                if (inputA && inputB) {
                    inputA.value = ((_c = (_b = checkboxes[key]) === null || _b === void 0 ? void 0 : _b.inputs) === null || _c === void 0 ? void 0 : _c[0]) || "";
                    inputB.value = ((_e = (_d = checkboxes[key]) === null || _d === void 0 ? void 0 : _d.inputs) === null || _e === void 0 ? void 0 : _e[1]) || "";
                }
            });
        }
    });
    // Handle edits to either field while the checkbox is active. Both fields are
    // covered: clearing the header name has to reach the background too, or the
    // previous rule keeps injecting.
    document.addEventListener("input", (event) => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement &&
            (activeElement.id.startsWith("paramValue") ||
                activeElement.id.startsWith("paramHeader"))) {
            event.preventDefault();
            const paramId = parseInt(activeElement.id.split("-")[1]);
            const [inputA, inputB] = inputElements[paramId - 1];
            const checkbox = checkboxElements[paramId - 1];
            if (inputA && inputB && (checkbox === null || checkbox === void 0 ? void 0 : checkbox.checked)) {
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
                activeElement.setSelectionRange(activeElement.selectionStart, activeElement.selectionStart);
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
            const target = document.querySelector(`#${field}-${keyNumber}`);
            if (target) {
                target.focus();
                target.select();
            }
            return;
        }
        // Typing inside a field is text entry, never a checkbox toggle.
        if (activeElement instanceof HTMLInputElement &&
            activeElement.type === "text") {
            return;
        }
        // Check box Listener
        if (key >= 1 && key <= checkboxElements.length) {
            const checkbox = checkboxElements[key - 1];
            if (!checkbox)
                return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event("change"));
        }
    });
    // Handle changes to checkboxes and inputs
    checkboxElements.forEach((checkbox, index) => {
        const key = `checkbox${index + 1}`;
        const [inputA, inputB] = inputElements[index];
        if (!checkbox || !inputA || !inputB)
            return;
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
            }
            else {
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
    // Ask the page for its servo-context meta tag. Resolves to null whenever the
    // tag is absent or the page can't be scripted (chrome:// pages, the store).
    const readServoContext = (tabId) => new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId },
            func: (metaName) => {
                var _a, _b;
                return (_b = (_a = document
                    .querySelector(`meta[name="${metaName}"]`)) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null;
            },
            args: [SERVO_META_NAME],
        }, (results) => {
            var _a;
            if (chrome.runtime.lastError || !(results === null || results === void 0 ? void 0 : results.length)) {
                resolve(null);
                return;
            }
            resolve((_a = results[0].result) !== null && _a !== void 0 ? _a : null);
        });
    });
    if (servoButton) {
        servoButton.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => __awaiter(void 0, void 0, void 0, function* () {
                const activeTab = tabs[0];
                if (!activeTab || !activeTab.url || activeTab.id === undefined) {
                    console.error("Unable to retrieve the active tab");
                    flash(servoButton, "is-error");
                    return;
                }
                // The page's own context wins; the URL is only a fallback guess.
                const context = yield readServoContext(activeTab.id);
                const servoUrl = (context && servoUrlFromContext(context)) ||
                    servoUrlFromTabUrl(activeTab.url);
                if (!servoUrl) {
                    console.error("No servo-context meta tag, and this tab doesn't look like a PR stack:", activeTab.url);
                    flash(servoButton, "is-error");
                    return;
                }
                window.open(servoUrl, "_blank");
                flash(servoButton, "is-ok");
            }));
        });
    }
    copyButtonsWithUrl.forEach((buttonEl, index) => {
        const [inputA, inputB] = inputElements[index];
        if (!buttonEl || !inputA || !inputB)
            return;
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
