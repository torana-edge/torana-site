(() => {
  const key = "torana-theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => ["light", "dark", "system"].includes(value);
  let choice = "system";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) choice = saved;
  } catch { /* Storage is optional; the theme still works for this page. */ }

  function apply() {
    const resolved = choice === "system" ? (media.matches ? "dark" : "light") : choice;
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  }
  // Parser-blocking, same-origin script: apply the choice before body paint.
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    choice = valid(event.newValue) ? event.newValue : "system";
    apply();
    const select = document.querySelector("#theme-choice");
    if (select) select.value = choice;
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    const select = document.querySelector("#theme-choice");
    if (select) {
      select.value = choice;
      select.closest("label").hidden = false;
      select.addEventListener("change", () => {
        choice = valid(select.value) ? select.value : "system";
        try { localStorage.setItem(key, choice); } catch { /* Non-persistent choice is still useful. */ }
        apply();
      });
    }
    const menu = document.querySelector(".mobile-menu");
    if (menu) {
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.open) {
          menu.open = false;
          menu.querySelector("summary").focus();
        }
      });
      document.addEventListener("click", (event) => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
    }
  });
})();
