/* Sets data-theme on <html> before the first paint: the owner's saved choice, else the system
   setting (followed live until a choice is saved). External, not inline, because the CSP
   allows only same-origin scripts. src/lib/theme.ts saves the choice under the same key. */
(function () {
  var KEY = "parcel-rates-theme";
  var root = document.documentElement;
  var system = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function saved() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }
  function apply() {
    root.setAttribute("data-theme", saved() || (system && system.matches ? "dark" : "light"));
  }
  apply();
  if (system && system.addEventListener) system.addEventListener("change", function () {
    if (!saved()) apply();
  });
})();
