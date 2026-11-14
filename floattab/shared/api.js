(function () {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  if (!extensionApi) {
    throw new Error("No WebExtension API namespace is available");
  }

  globalThis.FloatTabAPI = extensionApi;
})();
