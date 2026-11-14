(function (root, factory) {
  const api = factory();
  root.FloatTabRuntime = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getCapabilities(platform) {
    if (platform === "firefox") {
      return {
        success: true,
        platform: "firefox",
        implementation: "compact-window",
        supportsInteractive: true,
        supportsMirror: false,
        multipleWindows: true,
      };
    }

    return {
      success: true,
      platform: "chrome",
      implementation: "document-pip",
      supportsInteractive: true,
      supportsMirror: true,
      multipleWindows: "best-effort",
    };
  }

  function retainLiveSessions(records, liveState) {
    return records.filter((record) => {
      const state = liveState.get(record.sourceTabId);
      return Boolean(
        state &&
          state.sourceTab &&
          state.floatTab &&
          state.window &&
          state.floatTab.windowId === record.windowId &&
          state.window.type === "popup"
      );
    });
  }

  return { getCapabilities, retainLiveSessions };
});
