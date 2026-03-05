import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const bumpType = process.argv[2];
if (!bumpType || !["patch", "minor", "major"].includes(bumpType)) {
  console.error("Usage: bun run version <patch|minor|major>");
  process.exit(1);
}

// Read current version from manifest.json (authority)
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const [major, minor, patch] = manifest.version.split(".").map(Number);

// Bump
let newVersion: string;
switch (bumpType) {
  case "major":
    newVersion = `${major + 1}.0.0`;
    break;
  case "minor":
    newVersion = `${major}.${minor + 1}.0`;
    break;
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
}

// Update manifest.json
manifest.version = newVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

// Update package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = newVersion;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

// Update versions.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[newVersion] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

// Commit and tag
execSync("git add manifest.json package.json versions.json");
execSync(`git commit -m "chore: bump version to ${newVersion}"`);
execSync(`git tag -a ${newVersion} -m "${newVersion}"`);

console.log(
  `Bumped to ${newVersion} — commit and tag created. Push with: git push && git push --tags`,
);
