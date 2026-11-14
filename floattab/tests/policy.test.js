"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateFramePolicy,
  isRestrictedUrl,
  matchesHostSource,
} = require("../shared/policy.js");
const {
  getCapabilities,
  retainLiveSessions,
} = require("../shared/runtime.js");

test("restricted URLs include browser and extension pages", () => {
  assert.equal(isRestrictedUrl("about:debugging"), true);
  assert.equal(isRestrictedUrl("chrome://settings"), true);
  assert.equal(isRestrictedUrl("moz-extension://example/page.html"), true);
  assert.equal(isRestrictedUrl("https://example.com"), false);
});

test("SAMEORIGIN and self allow the page to frame itself", () => {
  assert.deepEqual(
    evaluateFramePolicy("https://example.com/app", {
      xFrameOptions: "SAMEORIGIN",
      csp: "default-src 'self'; frame-ancestors 'self'",
    }),
    { embeddable: true, reason: null }
  );
});

test("DENY and frame-ancestors none block embedding", () => {
  assert.equal(
    evaluateFramePolicy("https://example.com", {
      xFrameOptions: "DENY",
    }).embeddable,
    false
  );
  assert.equal(
    evaluateFramePolicy("https://example.com", {
      csp: "frame-ancestors 'none'",
    }).reason,
    "CSP_FRAME_ANCESTORS"
  );
});

test("matching explicit and wildcard frame ancestors are allowed", () => {
  assert.equal(
    evaluateFramePolicy("https://app.example.com", {
      csp: "frame-ancestors https://app.example.com",
    }).embeddable,
    true
  );
  assert.equal(
    matchesHostSource("https://*.example.com", "https://app.example.com"),
    true
  );
  assert.equal(
    matchesHostSource("https://*.example.com", "https://example.com"),
    false
  );
});

test("unknown X-Frame-Options values fail conservatively", () => {
  assert.equal(
    evaluateFramePolicy("https://example.com", {
      xFrameOptions: "ALLOW-FROM https://other.example",
    }).reason,
    "X_FRAME_OPTIONS_UNKNOWN"
  );
});

test("platform capabilities select the supported browser implementation", () => {
  assert.equal(getCapabilities("chrome").implementation, "document-pip");
  assert.equal(getCapabilities("chrome").multipleWindows, "best-effort");
  assert.equal(getCapabilities("firefox").implementation, "compact-window");
  assert.equal(getCapabilities("firefox").supportsMirror, false);
});

test("session reconciliation removes missing and mismatched windows", () => {
  const records = [
    { sourceTabId: 1, floatTabId: 11, windowId: 21 },
    { sourceTabId: 2, floatTabId: 12, windowId: 22 },
  ];
  const liveState = new Map([
    [
      1,
      {
        sourceTab: { id: 1 },
        floatTab: { id: 11, windowId: 21 },
        window: { id: 21, type: "popup" },
      },
    ],
    [
      2,
      {
        sourceTab: { id: 2 },
        floatTab: { id: 12, windowId: 99 },
        window: { id: 22, type: "popup" },
      },
    ],
  ]);

  assert.deepEqual(retainLiveSessions(records, liveState), [records[0]]);
});
