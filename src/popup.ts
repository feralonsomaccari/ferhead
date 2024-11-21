document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup loaded.");

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
});
