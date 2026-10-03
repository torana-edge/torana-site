const copyStatus = document.querySelector("#copy-status");

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    if (!value) return;

    const label = button.querySelector?.("[data-copy-text]") || button;
    const previous = label.textContent;
    const previousTitle = button.getAttribute("title");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await navigator.clipboard.writeText(value);
      label.textContent = "Copied";
      button.dataset.copyState = "success";
      button.setAttribute("title", "Copied");
      if (copyStatus) copyStatus.textContent = button.dataset.copyLabel || "Command copied to clipboard.";
      try {
        // Only a successful copy is a useful signal. No clipboard content is
        // attached, and a missing or failed analytics helper has no effect.
        button.dispatchEvent(new Event("torana:copy-success", { bubbles: true }));
      } catch { /* Copy feedback remains successful if analytics is unavailable. */ }
    } catch {
      label.textContent = "Copy failed — select the command";
      button.dataset.copyState = "error";
      button.setAttribute("title", "Copy failed — select the command");
      if (copyStatus) copyStatus.textContent = "Clipboard access failed. Select and copy the command manually.";
    } finally {
      button.removeAttribute("aria-busy");
      window.setTimeout(() => {
        label.textContent = previous;
        delete button.dataset.copyState;
        if (previousTitle === null) button.removeAttribute("title");
        else button.setAttribute("title", previousTitle);
        button.disabled = false;
      }, 2400);
    }
  });
}
