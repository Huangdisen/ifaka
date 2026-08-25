(() => {
  "use strict";

  const sensitivePaths = new Set([
    "/",
    "/recharge",
    "/refresh",
    "/claude-refresh",
    "/batch",
    "/card-tool",
    "/tool"
  ]);

  if (
    sensitivePaths.has(window.location.pathname) &&
    (window.location.search || window.location.hash)
  ) {
    window.history.replaceState(null, "", window.location.pathname);
  }
})();
