const fs = require("fs");
const path = require("path");

const possibleSrcs = [
  path.join(__dirname, "..", "node_modules", "mathlive", "dist", "fonts"),
  path.join(__dirname, "..", "node_modules", "mathlive", "fonts"),
];

let src = null;
for (const candidate of possibleSrcs) {
  if (fs.existsSync(candidate)) {
    src = candidate;
    break;
  }
}

const dest = path.join(__dirname, "..", "public", "mathlive-fonts");

if (!src) {
  console.warn("[copy-mathlive-fonts] mathlive/fonts not found, skipping");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });

for (const file of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}

console.log(
  `[copy-mathlive-fonts] copied ${fs.readdirSync(dest).length} font files to public/mathlive-fonts`
);
