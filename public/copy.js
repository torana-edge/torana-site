const copyStatus = document.querySelector("#copy-status");

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    if (!value) return;

    const previous = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
      if (copyStatus) copyStatus.textContent = "Install command copied to clipboard.";
    } catch {
      button.textContent = "Copy failed — select the command";
      if (copyStatus) copyStatus.textContent = "Clipboard access failed. Select and copy the command manually.";
    } finally {
      button.removeAttribute("aria-busy");
      window.setTimeout(() => {
        button.textContent = previous;
        button.disabled = false;
      }, 2400);
    }
  });
}
