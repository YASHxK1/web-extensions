"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requested = process.argv[2] || "all";
const browsers =
  requested === "all" ? ["chrome", "firefox"] : [requested.toLowerCase()];

if (browsers.some((browser) => !["chrome", "firefox"].includes(browser))) {
  throw new Error("Usage: node scripts/build.js [all|chrome|firefox]");
}

function copy(relativePath, destinationRoot) {
  const source = path.join(root, relativePath);
  const destination = path.join(destinationRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function build(browser) {
  const output = path.join(root, "dist", browser);
  fs.mkdirSync(output, { recursive: true });

  for (const sharedPath of ["popup", "icons", "shared"]) {
    copy(sharedPath, output);
  }

  if (browser === "chrome") {
    copy("background/service_worker.js", output);
    copy("content", output);
    copy("offscreen", output);
  } else {
    copy("background/firefox_background.js", output);
  }

  fs.copyFileSync(
    path.join(root, "manifests", `manifest.${browser}.json`),
    path.join(output, "manifest.json")
  );

  console.log(`Built ${browser}: ${path.relative(root, output)}`);
}

for (const browser of browsers) build(browser);
