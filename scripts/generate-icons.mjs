/**
 * Renders the committed PWA icon set from the SVG sources in `public/`.
 * Run with `npm run icons` whenever `public/icon.svg` or
 * `public/icon-maskable.svg` change; the generated PNGs (and the favicon)
 * are committed so the build never depends on sharp.
 *
 * Outputs:
 *   public/icon-192.png, public/icon-512.png            (purpose "any")
 *   public/icon-maskable-192.png, icon-maskable-512.png (purpose "maskable")
 *   public/apple-touch-icon.png (180x180, full-bleed navy)
 *   app/favicon.ico (16/32/48 PNG-compressed entries)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const NAVY = "#0d1016"; // hsl(220 25% 7%) — --navy-950

const iconSvg = await readFile(join(pub, "icon.svg"));
const maskableSvg = await readFile(join(pub, "icon-maskable.svg"));

const png = (svg, size, { flatten = false } = {}) => {
  let pipeline = sharp(svg, { density: 300 }).resize(size, size);
  if (flatten) pipeline = pipeline.flatten({ background: NAVY });
  return pipeline.png().toBuffer();
};

/** Pack PNG buffers into a .ico container (PNG-in-ICO, Vista+). */
function toIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = [];
  const blobs = [];
  let offset = 6 + entries.length * 16;
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dir.push(entry);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

// "any" purpose — keeps the rounded-rect look from icon.svg.
await writeFile(join(pub, "icon-192.png"), await png(iconSvg, 192));
await writeFile(join(pub, "icon-512.png"), await png(iconSvg, 512));

// "maskable" purpose — full-bleed with the bolt inside the safe zone.
await writeFile(
  join(pub, "icon-maskable-192.png"),
  await png(maskableSvg, 192),
);
await writeFile(
  join(pub, "icon-maskable-512.png"),
  await png(maskableSvg, 512),
);

// apple-touch-icon — iOS applies its own corner mask, so flatten the
// rounded-rect source onto navy for a full-bleed 180x180.
await writeFile(
  join(pub, "apple-touch-icon.png"),
  await png(iconSvg, 180, { flatten: true }),
);

// favicon — PNG-compressed ICO from the rounded-rect source.
const faviconSizes = [16, 32, 48];
const faviconEntries = await Promise.all(
  faviconSizes.map(async (size) => ({ size, data: await png(iconSvg, size) })),
);
await writeFile(join(root, "app", "favicon.ico"), toIco(faviconEntries));

console.log(
  "Icon set generated: public/icon-*.png, apple-touch-icon.png, app/favicon.ico",
);
