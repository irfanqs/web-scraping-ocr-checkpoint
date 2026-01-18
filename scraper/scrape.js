import fs from "fs";
import path from "path";
import crypto from "crypto";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const BASE_URL = "https://kliping.jogjakota.go.id/frontend";
const DATE_FROM = "2024-01-01";
const DATE_TO = "2025-12-31";
const STEP = 9;
const MAX_PAGES = 1100;

const OUT = path.resolve("output");
const IMG_DIR = path.join(OUT, "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function downloadImage(page, imgUrl, savePath) {
  const buffer = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    const arr = await res.arrayBuffer();
    return Array.from(new Uint8Array(arr));
  }, imgUrl);

  const data = Buffer.from(buffer);
  fs.writeFileSync(savePath, data);

  return {
    size: data.length,
    sha256: sha256(data),
  };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8"
  });

  const metadata = [];

  for (let p = 0; p < MAX_PAGES; p++) {
    const offset = p === 0 ? "" : `/${p * STEP}`;
    const listUrl =
      `${BASE_URL}/home/cari/${DATE_FROM}/${DATE_TO}/all/all/all/null${offset}`;

    console.log("OPEN LIST:", listUrl);
    await page.goto(listUrl, { waitUntil: "networkidle2" });
    await sleep(1500 + Math.random() * 2000);

    const cards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".row-cards .card")).map(card => {
        const titleEl = card.querySelector(".text-muted a");
        const title = titleEl?.innerText.trim() || null;
        const detailUrl = titleEl?.href || null;

        const media = card.querySelector(".d-flex a.text-default")?.innerText || null;
        const date = card.querySelector(".d-flex small")?.innerText || null;

        return { title, detailUrl, media, date };
      });
    });

    for (let i = 0; i < cards.length; i++) {
      const item = cards[i];
      if (!item.detailUrl) continue;

      console.log(` Page ${p + 1}, Card ${i + 1}`);
      console.log(`  OPEN DETAIL: ${item.detailUrl}`);

      await page.goto(item.detailUrl, { waitUntil: "networkidle2" });
      await sleep(1200 + Math.random() * 1500);

      const images = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll("a.aimage-zoom img")
        ).map(img => ({
          src: img.src,
          filename: img.closest("a")?.dataset?.gambar_filename || null
        }));
      });

      if (!images.length) continue;

      const yearMatch = item.date?.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "unknown";
      const dir = path.join(IMG_DIR, year);
      fs.mkdirSync(dir, { recursive: true });

      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        if (!img.src) continue;

        const baseName =
          img.filename ||
          `${item.date}_${item.title}_${idx + 1}`;

        const safeName =
          baseName.replace(/[^a-z0-9]/gi, "_") + ".jpg";

        const fpath = path.join(dir, safeName);

        const imgMeta = await downloadImage(page, img.src, fpath);

        metadata.push({
          title: item.title,
          date: item.date,
          media: item.media,
          detail_url: item.detailUrl,
          image_url: img.src,
          local_image: fpath,
          ...imgMeta,
          scraped_at: new Date().toISOString(),
        });

        await sleep(400 + Math.random() * 600);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  await browser.close();
})();
