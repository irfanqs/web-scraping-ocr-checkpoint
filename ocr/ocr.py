from paddleocr import PaddleOCR
import json
import os

ocr = PaddleOCR(use_angle_cls=True, lang="id")

CHECKPOINT_FILE = "../scraper/output/ocr_checkpoint.json"
OUTPUT_FILE = "../scraper/output/metadata_ocr.json"
INPUT_FILE = "../scraper/output/metadata.json"

# Fungsi untuk load checkpoint OCR
def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                checkpoint = json.load(f)
                print(f"📋 Checkpoint OCR ditemukan! Melanjutkan dari index {checkpoint['last_index'] + 1}")
                return checkpoint
        except Exception as e:
            print(f"⚠️  Error membaca checkpoint: {e}")
            return None
    return None

# Fungsi untuk save checkpoint OCR
def save_checkpoint(index, total):
    checkpoint = {
        "last_index": index,
        "total_items": total,
        "last_updated": str(os.times())
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)

# Load data dan checkpoint
with open(INPUT_FILE, encoding="utf-8") as f:
    data = json.load(f)

checkpoint = load_checkpoint()

# Load hasil OCR yang sudah ada (jika ada)
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
            # Update data dengan hasil OCR yang sudah ada
            for i, item in enumerate(existing_data):
                if i < len(data) and "ocr_text" in item:
                    data[i]["ocr_text"] = item["ocr_text"]
    except Exception as e:
        print(f"⚠️  Error membaca file output yang ada: {e}")

start_index = checkpoint["last_index"] + 1 if checkpoint else 0
total_items = len(data)

print(f"🚀 Memulai OCR dari item {start_index + 1} dari total {total_items} item")

for i in range(start_index, total_items):
    item = data[i]
    img_path = item["local_image"]
    
    # Skip jika sudah ada OCR text
    if "ocr_text" in item:
        print(f"⏭️  Item {i + 1}/{total_items}: Sudah di-OCR, skip")
        continue
    
    if not os.path.exists(img_path):
        print(f"⚠️  Item {i + 1}/{total_items}: File tidak ditemukan - {img_path}")
        item["ocr_text"] = []
        continue

    print(f"🔍 Item {i + 1}/{total_items}: Melakukan OCR pada {os.path.basename(img_path)}")
    
    try:
        result = ocr.ocr(img_path, cls=True)
        texts = []

        if result and result[0]:
            for line in result[0]:
                texts.append({
                    "text": line[1][0],
                    "confidence": float(line[1][1])
                })

        item["ocr_text"] = texts
        
        # Simpan progress setiap item selesai
        save_checkpoint(i, total_items)
        
        # Simpan hasil ke file setiap item (auto-save berkala)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        print(f"❌ Error OCR pada item {i + 1}: {e}")
        item["ocr_text"] = []
        continue

# Simpan hasil final
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Hapus checkpoint jika semua selesai
if os.path.exists(CHECKPOINT_FILE):
    os.remove(CHECKPOINT_FILE)
    print("🗑️  Checkpoint OCR dihapus (proses selesai)")

print(f"✅ OCR selesai! Total {total_items} item berhasil diproses")

