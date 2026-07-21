// scripts/build-images.mjs
// Usage: node scripts/build-images.mjs
// Reads assets/img/src/*.{jpg,jpeg,png}, writes responsive variants to assets/img/.
// Strips all metadata (sharp default). Never overwrites existing outputs.
import sharp from "sharp";
import { readdir, mkdir, access } from "node:fs/promises";
import path from "node:path";

const SRC = "assets/img/src";
const OUT = "assets/img";
const WIDTHS = [768, 1280, 1920];
const FORMATS = [
  ["avif", { quality: 50 }],
  ["webp", { quality: 72 }],
  ["jpg",  { quality: 80, mozjpeg: true }],
];

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter(f => /\.(jpe?g|png)$/i.test(f));

for (const file of files) {
  const slug = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const w of WIDTHS) {
    for (const [ext, opts] of FORMATS) {
      const dest = path.join(OUT, `${slug}-${w}.${ext}`);
      try { await access(dest); continue; } catch {}
      await sharp(path.join(SRC, file))
        .resize({ width: w, withoutEnlargement: true })
        .toFormat(ext === "jpg" ? "jpeg" : ext, opts)
        .toFile(dest);
      console.log("built", dest);
    }
  }
  console.log(`\n<picture> snippet for ${slug}:`);
  console.log(`<picture>
  <source type="image/avif" srcset="/assets/img/${slug}-768.avif 768w, /assets/img/${slug}-1280.avif 1280w, /assets/img/${slug}-1920.avif 1920w" sizes="100vw">
  <source type="image/webp" srcset="/assets/img/${slug}-768.webp 768w, /assets/img/${slug}-1280.webp 1280w, /assets/img/${slug}-1920.webp 1920w" sizes="100vw">
  <img src="/assets/img/${slug}-1280.jpg" width="1280" height="AUTO_FILL" alt="" loading="lazy" decoding="async">
</picture>\n`);
}
