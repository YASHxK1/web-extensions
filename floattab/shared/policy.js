(function (root, factory) {
  const api = factory();
  root.FloatTabPolicy = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RESTRICTED_SCHEMES = [
    "about:",
    "chrome:",
    "chrome-extension:",
    "devtools:",
    "edge:",
    "file:",
    "moz-extension:",
    "view-source:",
  ];

  function isRestrictedUrl(url) {
    if (typeof url !== "string" || url.length === 0) return true;

    try {
      const parsed = new URL(url);
      return (
        RESTRICTED_SCHEMES.includes(parsed.protocol) ||
        (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      );
    } catch (_) {
      return true;
    }
  }

  function matchesHostSource(source, ancestorOrigin) {
    if (source === "*") return true;
    if (source === "'self'") return true;

    let ancestor;
    try {
      ancestor = new URL(ancestorOrigin);
    } catch (_) {
      return false;
    }

    if (/^[a-z][a-z0-9+.-]*:$/.test(source)) {
      return ancestor.protocol === source;
    }

    const wildcardMatch = source.match(
      /^([a-z][a-z0-9+.-]*:\/\/)?\*\.([^/:]+)(?::(\d+))?$/i
    );
    if (wildcardMatch) {
      const [, schemePrefix, baseHost, port] = wildcardMatch;
      if (
        schemePrefix &&
        ancestor.protocol !== schemePrefix.toLowerCase().replace("//", "")
      ) {
        return false;
      }

      const hostname = ancestor.hostname.toLowerCase();
      const normalizedBase = baseHost.toLowerCase();
      if (!hostname.endsWith(`.${normalizedBase}`)) return false;
      return !port || ancestor.port === port;
    }

    try {
      const normalized =
        source.includes("://") ? source : `${ancestor.protocol}//${source}`;
      return new URL(normalized).origin === ancestor.origin;
    } catch (_) {
      return false;
    }
  }

  function evaluateFrameAncestors(csp, pageOrigin) {
    if (!csp) return { allowed: true, reason: null };

    const directives = String(csp)
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean);
    const frameAncestors = directives.find((directive) =>
      /^frame-ancestors(?:\s|$)/i.test(directive)
    );

    if (!frameAncestors) return { allowed: true, reason: null };

    const sources = frameAncestors
      .replace(/^frame-ancestors/i, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((source) => source.toLowerCase());

    if (sources.length === 0 || sources.includes("'none'")) {
      return { allowed: false, reason: "CSP_FRAME_ANCESTORS" };
    }

    const allowed = sources.some((source) =>
      matchesHostSource(source, pageOrigin)
    );
    return {
      allowed,
      reason: allowed ? null : "CSP_FRAME_ANCESTORS",
    };
  }

  function evaluateXFrameOptions(xFrameOptions) {
    if (!xFrameOptions) return { allowed: true, reason: null };

    const values = String(xFrameOptions)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (values.length === 0) return { allowed: true, reason: null };
    if (values.every((value) => value === "sameorigin")) {
      return { allowed: true, reason: null };
    }
    if (values.some((value) => value === "deny")) {
      return { allowed: false, reason: "X_FRAME_OPTIONS" };
    }

    return { allowed: false, reason: "X_FRAME_OPTIONS_UNKNOWN" };
  }

  function evaluateFramePolicy(url, headers = {}) {
    if (isRestrictedUrl(url)) {
      return { embeddable: false, reason: "RESTRICTED_URL" };
    }

    let pageOrigin;
    try {
      pageOrigin = new URL(url).origin;
    } catch (_) {
      return { embeddable: false, reason: "RESTRICTED_URL" };
    }

    const cspResult = evaluateFrameAncestors(headers.csp, pageOrigin);
    if (!cspResult.allowed) {
      return { embeddable: false, reason: cspResult.reason };
    }

    const xfoResult = evaluateXFrameOptions(headers.xFrameOptions);
    if (!xfoResult.allowed) {
      return { embeddable: false, reason: xfoResult.reason };
    }

    return { embeddable: true, reason: null };
  }

  return {
    evaluateFrameAncestors,
    evaluateFramePolicy,
    evaluateXFrameOptions,
    isRestrictedUrl,
    matchesHostSource,
  };
});
