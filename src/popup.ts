const checkboxes: Record<string, { checked: boolean; inputs: string[] }> = {};

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

  const inputElements = checkboxIds.map((id, index) => [
    document.querySelector<HTMLInputElement>(`#paramHeader${index + 1}`),
    document.querySelector<HTMLInputElement>(`#paramName${index + 1}`),
  ]);

  // Check if any checkbox is missing
  if (
    checkboxElements.some((checkbox) => !checkbox) ||
    inputElements.some(([inputA, inputB]) => !inputA || !inputB)
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
});
