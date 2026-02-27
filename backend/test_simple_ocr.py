"""Simple GLM-OCR test without emojis"""
import asyncio
from pathlib import Path
import io
import sys

try:
    from PIL import Image
    import pdf2image
    import ollama
    import base64
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

async def extract_with_glm_ocr(image_bytes):
    try:
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        print("  Calling GLM-OCR...")

        response = ollama.generate(
            model="glm-ocr:latest",
            prompt="Extract all text from this image. Return only the extracted text.",
            images=[image_base64],
            options={"temperature": 0.1}
        )

        return response.get('response', '').strip()
    except Exception as e:
        print(f"  ERROR: {e}")
        return ""

async def main():
    pdf_path = Path(r"d:\Projects\AI driven\Interview\Kirubanithi6369275558.pdf")

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        return

    print(f"Testing OCR on: {pdf_path.name}")
    print(f"Size: {pdf_path.stat().st_size / 1024 / 1024:.2f} MB\n")

    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()

    print("Converting PDF to images...")
    images = pdf2image.convert_from_bytes(pdf_bytes)
    print(f"Got {len(images)} pages\n")

    all_text = []
    for i, image in enumerate(images, 1):
        print(f"Page {i}/{len(images)}:")

        if image.mode != 'RGB':
            image = image.convert('RGB')

        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()

        print(f"  Image size: {len(img_bytes) / 1024:.1f} KB")

        page_text = await extract_with_glm_ocr(img_bytes)

        if page_text:
            print(f"  SUCCESS: Extracted {len(page_text)} characters")
            print(f"  Preview: {page_text[:150]}...")
            all_text.append(page_text)
        else:
            print(f"  WARNING: No text extracted")

        print()

    print("=" * 80)
    print(f"SUMMARY:")
    print(f"  Total pages: {len(images)}")
    print(f"  Pages with text: {len(all_text)}")
    print(f"  Total characters: {sum(len(t) for t in all_text)}")

    combined_text = "\n\n".join(all_text)

    print(f"\nCombined text (first 1000 chars):")
    print("=" * 80)
    print(combined_text[:1000])
    print("=" * 80)

    print(f"\nLooking for question patterns...")
    for i in range(1, 6):
        patterns = [f"question {i}", f"Q{i}", f"{i}.", f"{i})"]
        found = any(p.lower() in combined_text.lower() for p in patterns)
        print(f"  Q{i}: {'FOUND' if found else 'NOT FOUND'}")

if __name__ == "__main__":
    asyncio.run(main())
