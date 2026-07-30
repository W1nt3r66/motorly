import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const distDirectory = path.join(projectRoot, "dist");
const assetsDirectory = path.join(distDirectory, "assets");
const outputFontsDirectory = path.join(distDirectory, "fonts");
const webBundleDirectory = path.join(
  distDirectory,
  "_expo",
  "static",
  "js",
  "web",
);

function findFontsDirectory(directory) {
  if (!fs.existsSync(directory)) {
    return null;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (
      entry.name === "Fonts" &&
      fullPath.includes("@expo") &&
      fullPath.includes("vector-icons")
    ) {
      return fullPath;
    }

    const nestedResult = findFontsDirectory(fullPath);

    if (nestedResult) {
      return nestedResult;
    }
  }

  return null;
}

const sourceFontsDirectory = findFontsDirectory(assetsDirectory);

if (!sourceFontsDirectory) {
  throw new Error("Expo icon-font directory was not found.");
}

fs.mkdirSync(outputFontsDirectory, {
  recursive: true,
});

for (const filename of fs.readdirSync(sourceFontsDirectory)) {
  if (!filename.endsWith(".ttf")) {
    continue;
  }

  fs.copyFileSync(
    path.join(sourceFontsDirectory, filename),
    path.join(outputFontsDirectory, filename),
  );
}

if (!fs.existsSync(webBundleDirectory)) {
  throw new Error("Expo web bundle directory was not found.");
}

const oldFontPath =
  "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/";

for (const filename of fs.readdirSync(webBundleDirectory)) {
  if (!filename.endsWith(".js")) {
    continue;
  }

  const bundlePath = path.join(webBundleDirectory, filename);
  const originalBundle = fs.readFileSync(bundlePath, "utf8");
  const correctedBundle = originalBundle.replaceAll(oldFontPath, "/fonts/");

  fs.writeFileSync(bundlePath, correctedBundle);
}

console.log("Netlify icon fonts prepared successfully.");
