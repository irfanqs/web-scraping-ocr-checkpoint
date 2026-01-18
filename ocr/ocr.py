from paddleocr import PaddleOCR
import json
import os

ocr = PaddleOCR(use_angle_cls=True, lang="id")

with open("../output/metadata.json", encoding="utf-8") as f:
    data = json.load(f)

for item in data:
    img_path = item["local_image"]
    if not os.path.exists(img_path):
        continue

    result = ocr.ocr(img_path, cls=True)
    texts = []

    for line in result[0]:
        texts.append({
            "text": line[1][0],
            "confidence": float(line[1][1])
        })

    item["ocr_text"] = texts

with open("../output/metadata_ocr.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
