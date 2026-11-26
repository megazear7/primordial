// Regenerate with: npm install --no-save sharp && node scripts/generate-icons.mjs
// The PNGs in public/ are committed so the Pages build does not need sharp.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = resolve(root, 'public/icons');

function artwork(size, maskable) {
  const center = size / 2;
  const radius = size * (maskable ? 0.2 : 0.28);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#021014"/>
  <circle cx="${center}" cy="${center}" r="${radius}" fill="#1ad1b2"/>
  <circle cx="${center - radius * 0.34}" cy="${center - radius * 0.32}" r="${radius * 0.33}" fill="#e8fff8"/>
  <circle cx="${center + radius * 0.52}" cy="${center + radius * 0.4}" r="${radius * 0.26}" fill="#ff7a9c"/>
</svg>`;
}

const outputs = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/icon-maskable-192.png', 192, true],
  ['public/icons/icon-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, false],
];

await mkdir(iconsDir, { recursive: true });
for (const [file, size, maskable] of outputs) {
  const png = await sharp(Buffer.from(artwork(size, maskable)))
    .flatten({ background: '#021014' })
    .png()
    .toBuffer();
  await sharp(png).toFile(resolve(root, file));
}
console.log(`wrote ${outputs.length} icons`);
