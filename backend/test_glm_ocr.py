"""
Direct GLM-OCR test without app dependencies
"""
import asyncio
from pathlib import Path
import io

try:
    from PIL import Image
    import pdf2image
    import ollama
    import base64
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install Pillow pdf2image ollama")
    exit(1)

async def extract_with_glm_ocr(image_bytes: bytes) -> str:
    """Extract text using GLM-OCR"""
    try:
        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        print("  🤖 Calling GLM-OCR...")

        # Use Ollama's vision model for OCR
        response = ollama.generate(
            model="glm-ocr:latest",
            prompt="Extract all text from this image. Return only the extracted text, without any additional commentary or formatting.",
            images=[image_base64],
            options={
                "temperature": 0.1,
            }
        )

        extracted_text = response.get('response', '').strip()
        return extracted_text

    except Exception as e:
        print(f"  ❌ GLM-OCR error: {e}")
        return ""

async def test_pdf_ocr():
    pdf_path = Path(r"d:\Projects\AI driven\Interview\Kirubanithi6369275558.pdf")

    if not pdf_path.exists():
        print(f"❌ PDF not found: {pdf_path}")
        return

    print(f"📄 Testing OCR on: {pdf_path.name}")
    print(f"📏 Size: {pdf_path.stat().st_size / 1024 / 1024:.2f} MB\n")

    # Read PDF
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()

    # Convert to images
    print("🖼️  Converting PDF to images...")
    images = pdf2image.convert_from_bytes(pdf_bytes)
    print(f"  ✓ Got {len(images)} pages\n")

    # Test OCR on each page
    all_text = []
    for i, image in enumerate(images, 1):
        print(f"📄 Page {i}/{len(images)}:")

        # Convert to RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Convert to bytes
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()

        print(f"  📏 Image size: {len(img_bytes) / 1024:.1f} KB")

        # Extract text
        page_text = await extract_with_glm_ocr(img_bytes)

        if page_text:
            print(f"  ✅ Extracted {len(page_text)} characters")
            print(f"  📝 First 200 chars: {page_text[:200]}")
            all_text.append(page_text)
        else:
            print(f"  ⚠️  No text extracted")

        print()

    # Summary
    print("=" * 80)
    print(f"📊 Summary:")
    print(f"  - Total pages processed: {len(images)}")
    print(f"  - Pages with text: {len(all_text)}")
    print(f"  - Total characters: {sum(len(t) for t in all_text)}")
    print(f"  - Total words: {sum(len(t.split()) for t in all_text)}")

    # Combined text
    combined_text = "\n\n".join(all_text)

    print(f"\n📝 Combined text (first 1500 characters):")
    print("=" * 80)
    print(combined_text[:1500])
    print("=" * 80)

    # Look for question indicators
    print(f"\n🔍 Looking for question patterns...")
    for i in range(1, 10):
        found = False
        for pattern in [f"question {i}", f"q{i}", f"{i}.", f"{i})"]:
            if pattern.lower() in combined_text.lower():
                print(f"  ✓ Found Q{i}: pattern '{pattern}'")
                found = True
                break
        if not found:
            print(f"  ✗ Q{i} not found")

if __name__ == "__main__":
    asyncio.run(test_pdf_ocr())
