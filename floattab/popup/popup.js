"use strict";

const api = globalThis.FloatTabAPI;
const pipBtn = document.getElementById("pip-btn");
const btnLabel = document.getElementById("btn-label");
const btnIcon = document.getElementById("btn-icon");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const platformChip = document.getElementById("platform-chip");
const hero = document.getElementById("hero");
const modeLabel = document.getElementById("mode-label");
const heroTitle = document.getElementById("hero-title");
const heroDescription = document.getElementById("hero-description");
const globalCount = document.getElementById("global-count");

let activeTab = null;
let capabilities = null;
let currentState = "inactive";

const ERROR_MESSAGES = {
  CAPTURE_FAILED: "Firefox or Chrome could not capture this page.",
  COMPACT_WINDOW_FAILED: "Firefox could not create the compact window.",
  DRM_BLOCKED: "Protected media cannot be captured.",
  FRAME_POLICY_BLOCKED: "This site blocks embedded interactive windows.",
  PIP_WINDOW_FAILED: "The browser could not open a Picture-in-Picture window.",
  PLATFORM_UNSUPPORTED: "This browser does not support this floating mode.",
  RESTRICTED_URL: "Browser and extension pages cannot be floated.",
};

function setIcon(type) {
  btnIcon.replaceChildren();
  const namespace = "http://www.w3.org/2000/svg";

  if (type === "close") {
    for (const [x1, y1, x2, y2] of [
      [5, 5, 15, 15],
      [15, 5, 5, 15],
    ]) {
      const line = document.createElementNS(namespace, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      btnIcon.appendChild(line);
    }
    return;
  }

  const back = document.createElementNS(namespace, "rect");
  back.setAttribute("x", "2");
  back.setAttribute("y", "3");
  back.setAttribute("width", "11");
  back.setAttribute("height", "10");
  back.setAttribute("rx", "2.5");
  back.setAttribute("fill", "currentColor");
  back.setAttribute("opacity", ".55");

  const front = document.createElementNS(namespace, "rect");
  front.setAttribute("x", "7");
  front.setAttribute("y", "7");
  front.setAttribute("width", "11");
  front.setAttribute("height", "10");
  front.setAttribute("rx", "2.5");
  front.setAttribute("fill", "currentColor");
  btnIcon.append(back, front);
}

function render(state, details = {}) {
  currentState = state;
  pipBtn.className = "primary-button";
  pipBtn.disabled = false;
  statusDot.className = "status-dot";

  const firefox = capabilities?.platform === "firefox";
  hero.classList.toggle(
    "chrome-inactive",
    !firefox && state === "inactive"
  );

  if (state === "inactive") {
    modeLabel.textContent = firefox ? "Compact window" : "Picture-in-Picture";
    heroTitle.textContent = firefox ? "Open an interactive copy" : "Keep this page close";
    heroDescription.textContent = firefox
      ? "Firefox opens a focused browser window. Always-on-top is not available."
      : "Interactive when framing is allowed, view-only when capture is required.";
    btnLabel.textContent = firefox ? "Open Compact Window" : "Open Float";
    statusText.textContent = firefox
      ? "Ready to duplicate this tab into a compact window."
      : "Ready. Multiple PiP windows depend on browser and OS support.";
    setIcon("open");
    return;
  }

  if (["interactive", "mirror", "compact"].includes(state)) {
    pipBtn.classList.add("active");
    statusDot.classList.add(state === "mirror" ? "mirror" : "active");
    modeLabel.textContent =
      state === "interactive"
        ? "Interactive"
        : state === "mirror"
          ? "View only"
          : "Firefox compact";
    heroTitle.textContent =
      state === "mirror" ? "Live page mirror" : "Your float is active";
    heroDescription.textContent =
      state === "mirror"
        ? "This site blocks embedding, so FloatTab is showing a live capture."
        : state === "compact"
          ? "A fully interactive Firefox popup is linked to this source tab."
          : "The page is running inside a Document Picture-in-Picture window.";
    btnLabel.textContent = "Close Float";
    statusText.textContent =
      state === "mirror"
        ? "View-only mode is active."
        : "Interactive mode is active.";
    setIcon("close");
    return;
  }

  if (state === "loading") {
    pipBtn.disabled = true;
    btnLabel.textContent = details.closing ? "Closing..." : "Opening...";
    modeLabel.textContent = "Working";
    heroTitle.textContent = details.closing ? "Closing the float" : "Preparing your float";
    heroDescription.textContent = "FloatTab is coordinating with the current browser tab.";
    statusText.textContent = details.closing
      ? "Cleaning up the active session..."
      : "Checking framing and browser capabilities...";
    return;
  }

  if (state === "restricted" || state === "unsupported") {
    pipBtn.disabled = true;
    statusDot.classList.add("error");
    modeLabel.textContent = "Unavailable";
    heroTitle.textContent =
      state === "restricted" ? "This page is protected" : "Mode not supported";
    heroDescription.textContent =
      state === "restricted"
        ? "Browser settings, internal pages, and extension pages cannot be floated."
        : "Use a supported Chrome build or the Firefox compact-window build.";
    btnLabel.textContent = "Cannot Open";
    statusText.textContent = heroDescription.textContent;
    return;
  }

  statusDot.classList.add("error");
  modeLabel.textContent = "Could not open";
  heroTitle.textContent = "FloatTab hit a browser limit";
  heroDescription.textContent =
    ERROR_MESSAGES[details.errorCode] ||
    details.message ||
    "Something went wrong while opening this page.";
  btnLabel.textContent = firefox ? "Try Compact Window" : "Try Again";
  statusText.textContent = heroDescription.textContent;
  setIcon("open");
}

function isRestrictedUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return !["http:", "https:"].includes(protocol);
  } catch (_) {
    return true;
  }
}

async function updateGlobalCount() {
  try {
    const response = await api.runtime.sendMessage({ type: "GET_ALL_PIP_COUNT" });
    const count = response?.count || 0;
    globalCount.textContent = count
      ? `${count} active float${count === 1 ? "" : "s"}`
      : "No active floats";
  } catch (_) {
    globalCount.textContent = "Session count unavailable";
  }
}

async function ensureContentScript(tabId) {
  await api.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"],
  });
}

function resultError(result, fallbackCode) {
  return {
    errorCode: result?.errorCode || result?.error || fallbackCode,
    message: result?.message,
  };
}

async function openChromeMirror(tab) {
  await ensureContentScript(tab.id);

  try {
    const streamId = await api.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
      consumerTabId: tab.id,
    });
    const [{ result }] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      args: [streamId],
      func: (capturedStreamId) =>
        typeof window.__floatTabOpenMirror === "function"
          ? window.__floatTabOpenMirror(capturedStreamId)
          : { success: false, errorCode: "CONTENT_NOT_READY" },
    });

    if (result?.success) {
      await api.runtime.sendMessage({
        type: "SET_PIP_STATE",
        mode: "mirror",
        host: "tab",
        tabId: tab.id,
      });
      return result;
    }
  } catch (_) {
    // The offscreen path remains available when tab-hosted capture fails.
  }

  return api.runtime.sendMessage({
    type: "OPEN_MIRROR_PIP",
    tabId: tab.id,
  });
}

async function openChromeFloat(tab) {
  const policyResult = await api.runtime.sendMessage({
    type: "CHECK_EMBEDDABLE",
    tabId: tab.id,
    url: tab.url,
  });

  if (policyResult?.embeddable) {
    await ensureContentScript(tab.id);
    const [{ result }] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () =>
        typeof window.__floatTabOpen === "function"
          ? window.__floatTabOpen()
          : { success: false, errorCode: "CONTENT_NOT_READY" },
    });

    if (result?.success) {
      await api.runtime.sendMessage({
        type: "SET_PIP_STATE",
        mode: "interactive",
        host: "tab",
        tabId: tab.id,
      });
      return result;
    }

    if (result?.errorCode === "PLATFORM_UNSUPPORTED") return result;
  }

  const mirrorResult = await openChromeMirror(tab);
  if (!mirrorResult?.success && !mirrorResult?.errorCode) {
    mirrorResult.errorCode = "CAPTURE_FAILED";
  }
  return mirrorResult;
}

async function initialize() {
  try {
    capabilities = await api.runtime.sendMessage({
      type: "GET_PLATFORM_CAPABILITIES",
    });
    platformChip.textContent =
      capabilities.platform === "firefox" ? "Firefox" : "Chrome";

    [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      render("error", { message: "No active browser tab was found." });
      return;
    }

    if (isRestrictedUrl(activeTab.url || "")) {
      render("restricted");
      await updateGlobalCount();
      return;
    }

    const response = await api.runtime.sendMessage({
      type: "GET_PIP_STATE",
      tabId: activeTab.id,
    });
    render(response?.pipState?.active ? response.pipState.mode : "inactive");
    await updateGlobalCount();
  } catch (error) {
    render("error", { message: error.message });
  }
}

pipBtn.addEventListener("click", async () => {
  if (!activeTab || pipBtn.disabled) return;

  const closing = ["interactive", "mirror", "compact"].includes(currentState);
  render("loading", { closing });

  try {
    if (closing) {
      const response = await api.runtime.sendMessage({
        type: "CLOSE_PIP",
        tabId: activeTab.id,
      });
      if (!response?.success) {
        render("error", resultError(response, "CLOSE_FAILED"));
      } else {
        render("inactive");
      }
      await updateGlobalCount();
      return;
    }

    const response =
      capabilities.platform === "firefox"
        ? await api.runtime.sendMessage({
            type: "OPEN_COMPACT_WINDOW",
            tabId: activeTab.id,
          })
        : await openChromeFloat(activeTab);

    if (response?.success) {
      render(response.mode || (capabilities.platform === "firefox" ? "compact" : "interactive"));
    } else if (response?.errorCode === "PLATFORM_UNSUPPORTED") {
      render("unsupported");
    } else {
      render("error", resultError(response, "PIP_WINDOW_FAILED"));
    }
    await updateGlobalCount();
  } catch (error) {
    render("error", { message: error.message });
  }
});

api.runtime.onMessage.addListener((message) => {
  if (["PIP_CLOSED_BY_USER", "MIRROR_PIP_ENDED"].includes(message.type)) {
    void initialize();
  }
  if (message.type === "MIRROR_PIP_DRM_DETECTED") {
    render("error", { errorCode: "DRM_BLOCKED" });
  }
});

void initialize();
