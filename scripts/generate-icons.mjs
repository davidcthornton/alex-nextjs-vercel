import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const inFile = "assets/icon-master.png";
const outDir = "public/icons";

fs.mkdirSync(outDir, { recursive: true });

const targets = [
  // iOS
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-1024.png", size: 1024 },

  // Web / general
  { name: "icon-512.png", size: 512 },
  { name: "icon-192.png", size: 192 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-16.png", size: 16 },
];

for (const t of targets) {
  const outPath = path.join(outDir, t.name);
  await sharp(inFile)
    .resize(t.size, t.size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log("Wrote", outPath);
}
