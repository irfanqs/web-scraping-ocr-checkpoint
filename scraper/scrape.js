import fs from "fs"; // Import modul bawaan Node.js untuk baca/tulis file
import path from "path"; // Import modul path untuk mengatur path folder/file
import crypto from "crypto"; // Import crypto untuk membuat hash SHA256
import puppeteer from "puppeteer-extra"; // Import puppeteer-extra (versi puppeteer dengan plugin)
import StealthPlugin from "puppeteer-extra-plugin-stealth"; // Import plugin stealth agar tidak terdeteksi sebagai bot

puppeteer.use(StealthPlugin()); // Aktifkan plugin stealth

// URL utama website target dan batas tanggal pencarian
const BASE_URL = "https://kliping.jogjakota.go.id/frontend"; 
const DATE_FROM = "2024-01-01"; 
const DATE_TO = "2025-12-31"; 
const STEP = 9; // Jumlah data per halaman
const MAX_PAGES = 1; // Jumlah maksimum halaman yang akan discan

const OUT = path.resolve("output");
const IMG_DIR = path.join(OUT, "images");
fs.mkdirSync(IMG_DIR, { recursive: true }); // Buat folder jika belum ada

const sleep = ms => new Promise(r => setTimeout(r, ms)); // Fungsi delay / sleep

//Fungsi untuk membuat hash SHA256 dari file (validasi file)
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function formatTanggalIndo(dateStr) {
  if(!dateStr) return "unknown-date";

  const bulanMap = {
    Januari: "01",
    Februari: "02",
    Maret: "03",
    April: "04",
    Mei: "05",
    Juni: "06",
    Juli: "07",
    Agustus: "08",
    September: "09",
    Oktober: "10",
    November: "11",
    Desember: "12",
  };

  const match = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if(!match) return "unknown-date";

  const [, dd, bulan, yyyy] = match;
  const mm = bulanMap[bulan] || "00";

  return `${dd.padStart(2, "0")}-${mm}-${yyyy}`;
}

async function downloadImage(page, imgUrl, savePath) // Fungsi untuk download gambar dari browser dan simpan ke disk
 {
  //Menjalankan kode di dalam browser, bukan di Node.js
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

// Jalankan browser
(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  // Buka tab baru
  const page = await browser.newPage();

 // Set User-Agent agar terlihat seperti Chrome asli
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Set bahasa request ke Indonesia
  await page.setExtraHTTPHeaders({
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8"
  });

  const metadata = []; // Array untuk menyimpan semua metadata hasil scraping

  // Loop halaman list (pagination)
  for (let p = 0; p < MAX_PAGES; p++) {
    const offset = p === 0 ? "" : `/${p * STEP}`;
    const listUrl =
      `${BASE_URL}/home/cari/${DATE_FROM}/${DATE_TO}/all/all/all/null${offset}`;

    console.log("OPEN LIST:", listUrl);
    await page.goto(listUrl, { waitUntil: "networkidle2" }); 
    await sleep(1500 + Math.random() * 2000); //Delay acak agar tidak seperti bot (1,5 - 3,5 sec)

  // Mengambil semua data berita dari halaman
    const cards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".row-cards .card")).map(card => {
        //Ambil judul dan link detail
        const titleEl = card.querySelector(".text-muted a"); 
        const title = titleEl?.innerText.trim() || null;
        const detailUrl = titleEl?.href || null;

        const media = card.querySelector(".d-flex a.text-default")?.innerText || null; //Ambil nama media
        const date = card.querySelector(".d-flex small")?.innerText || null; //Ambil tanggal berita

        return { title, detailUrl, media, date }; //Hasilnya setiap berita disimpan sebagai object
      });
    });

  // Program masuk ke setiap page berita satu per satu.
    for (let i = 0; i < cards.length; i++) {
      const item = cards[i];
      if (!item.detailUrl) continue;

  //monitoring proses scraping di terminal
      console.log(` Page ${p + 1}, Card ${i + 1}`);
      console.log(`  OPEN DETAIL: ${item.detailUrl}`);

  // Buka halaman detail berita dan mengambil semua gambarnya.
      await page.goto(item.detailUrl, { waitUntil: "networkidle2" }); //Menunggu halaman benar-benar selesai (networkidle2)
      await sleep(1200 + Math.random() * 1500);

  //Ambil semua gambar di halaman detail
      const images = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll("a.aimage-zoom img")
        ).map(img => ({
          src: img.src,
          filename: img.closest("a")?.dataset?.gambar_filename || null
        }));
      });

      if (!images.length) continue; //Kalau tidak ada gambar → berita dilewati

  //Mengambil tahun dari tanggal berita
      const yearMatch = item.date?.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "unknown";

  //Membuat folder
      const dir = path.join(IMG_DIR, year);
      fs.mkdirSync(dir, { recursive: true });
  //Loop setiap gambar dalam satu berita

      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        if (!img.src) continue;

  //Penamaan file
        const tanggalFormatted = formatTanggalIndo(item.date);

        const originalName = img.src.split("/").pop() || `image_${idx + 1}.jpg`;
        // memastikan ekstensi tetap .jpg
        const finalName = `${tanggalFormatted}_${originalName}`;

        const safeName = finalName.replace(/[^a-z0-9.\-_]/gi, "_");
        const fpath = path.join(dir, safeName);

        const imgMeta = await downloadImage(page, img.src, fpath);

  //Simpan metadata ke array
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

        await sleep(400 + Math.random() * 600); //Delay kecil antar download
      }
    }
  }

//Setelah semua selesai → simpan ke JSON
  fs.writeFileSync(
    path.join(OUT, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

//Tutup browser
  await browser.close();
})();
