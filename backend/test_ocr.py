"""
Test script to check OCR extraction from PDF
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.document_processor import get_document_processor

async def test_ocr():
    # Read the PDF file
    pdf_path = Path(r"d:\Projects\AI driven\Interview\Kirubanithi6369275558.pdf")

    if not pdf_path.exists():
        print(f"❌ PDF file not found: {pdf_path}")
        return

    print(f"📄 Reading PDF: {pdf_path.name}")
    print(f"📏 File size: {pdf_path.stat().st_size / 1024 / 1024:.2f} MB\n")

    with open(pdf_path, 'rb') as f:
        file_data = f.read()

    # Get document processor
    processor = get_document_processor()

    try:
        print("🔍 Extracting text from PDF...")
        result = await processor.extract_text(file_data, pdf_path.name)

        print(f"\n✅ Extraction successful!")
        print(f"📊 Statistics:")
        print(f"  - Pages: {result.get('page_count')}")
        print(f"  - Characters: {result.get('char_count')}")
        print(f"  - Words: {result.get('word_count')}")
        print(f"  - OCR used: {result.get('ocr_used', False)}")
        print(f"  - Method: {result.get('metadata', {}).get('method', 'N/A')}")

        print(f"\n📝 Extracted text (first 1000 characters):")
        print("=" * 80)
        print(result['extracted_text'][:1000])
        print("=" * 80)

        print(f"\n📝 Extracted text (last 500 characters):")
        print("=" * 80)
        print(result['extracted_text'][-500:])
        print("=" * 80)

        # Check for question patterns
        text = result['extracted_text']
        questions_found = []
        for i in range(1, 10):
            patterns = [
                f"question {i}",
                f"q{i}",
                f"{i}.",
                f"{i})",
                f"write a function",
                f"write a program"
            ]
            for pattern in patterns:
                if pattern.lower() in text.lower():
                    questions_found.append(f"Q{i}: Found pattern '{pattern}'")
                    break

        print(f"\n🔍 Question patterns found:")
        for q in questions_found:
            print(f"  ✓ {q}")

        if not questions_found:
            print("  ⚠️  No question patterns found!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_ocr())
