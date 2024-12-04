document.addEventListener("DOMContentLoaded", () => {
  const checkbox1 =
    document.querySelector<HTMLInputElement>("#headerCheckbox1");
  const checkbox2 =
    document.querySelector<HTMLInputElement>("#headerCheckbox2");
  const checkbox3 =
    document.querySelector<HTMLInputElement>("#headerCheckbox3");
  const checkbox4 =
    document.querySelector<HTMLInputElement>("#headerCheckbox4");

  if (!checkbox1 || !checkbox2 || !checkbox3 || !checkbox4) {
    console.error("missing checkbox");
    return;
  }

  document.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "1":
        checkbox1.checked = !checkbox1.checked;
        checkbox1.dispatchEvent(new Event("change"));
        break;
      case "2":
        checkbox2.checked = !checkbox2.checked;
        break;
      case "3":
        checkbox3.checked = !checkbox3.checked;
        break;
      case "4":
        checkbox4.checked = !checkbox4.checked;
        break;

      default:
    }
  });

  checkbox1.addEventListener("change", () => {
    if (checkbox1.checked) {
      // Send message to background script to enable header modification
      chrome.runtime.sendMessage({ addHeader: true });
    } else {
      // Send message to background script to disable header modification
      chrome.runtime.sendMessage({ addHeader: false });
    }
  });
});
