const checkboxes: Record<string, boolean> = {};

document.addEventListener("DOMContentLoaded", () => {
  const checkboxIds = [
    "headerCheckbox1",
    "headerCheckbox2",
    "headerCheckbox3",
    "headerCheckbox4",
  ];

  const checkboxElements = checkboxIds.map((id) =>
    document.querySelector<HTMLInputElement>(`#${id}`),
  );

  // Check if any checkbox is missing
  if (checkboxElements.some((checkbox) => !checkbox)) {
    console.error("One or more checkboxes are missing.");
    return;
  }

  // Load saved states from storage
  chrome.storage.local.get(["checkboxes"], (result) => {
    if (result.checkboxes) {
      Object.assign(checkboxes, result.checkboxes);
      checkboxElements.forEach((checkbox, index) => {
        if (!checkbox) return;
        const key = `checkbox${index + 1}`;
        checkbox.checked = checkboxes[key] || false;
      });
    }
  });

  // Handle keydown events
  document.addEventListener("keydown", (event) => {
    const key = parseInt(event.key, 10);
    if (key >= 1 && key <= checkboxElements.length) {
      const checkbox = checkboxElements[key - 1];
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    }
  });

  // Add event listeners for all checkboxes
  checkboxElements.forEach((checkbox, index) => {
    if (!checkbox) return;
    const key = `checkbox${index + 1}`;
    checkbox.addEventListener("change", () => {
      checkboxes[key] = checkbox.checked;
      chrome.runtime.sendMessage({
        addHeader: checkbox.checked && key === "checkbox1",
      });
      chrome.storage.local.set({ checkboxes });
    });
  });
});
