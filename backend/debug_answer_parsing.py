"""
Debug script to test answer parsing with actual prompts
"""
import asyncio
from pathlib import Path
import io
import sys
import json

try:
    from PIL import Image
    import pdf2image
    import ollama
    import base64
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

async def extract_with_glm_ocr(image_bytes):
    """Extract text using GLM-OCR"""
    try:
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
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

async def parse_answers_with_llm(text, questions):
    """Parse answers using the same logic as the backend"""
    try:
        # Format questions for the prompt (same as backend)
        questions_text = "\n".join([
            f"Q{i+1}: {q}"
            for i, q in enumerate(questions)
        ])

        system_prompt = """You are an expert at parsing student answer sheets.
Extract the candidate's answers for each question from the given answer sheet text.
Match each answer to its corresponding question number.

Return only a JSON object with this structure:
{
  "answers": [
    {
      "question_number": 1,
      "answer": "candidate's answer text"
    }
  ]
}
If an answer is not found, use empty string for that question.
Only return the JSON object, no additional text."""

        user_prompt = f"""Parse candidate answers from this answer sheet:

QUESTIONS (for reference):
{questions_text}

ANSWER SHEET TEXT:
{text[:10000]}

Extract the candidate's answer for each question number.
Return the result as JSON."""

        print("\n" + "="*80)
        print("PROMPT BEING SENT TO LLM:")
        print("="*80)
        print(f"System: {system_prompt[:200]}...")
        print(f"\nUser prompt (first 500 chars):\n{user_prompt[:500]}")
        print("="*80 + "\n")

        # Call LLM
        print("Calling mistral:7b to parse answers...")
        response = ollama.generate(
            model="mistral:7b",
            prompt=user_prompt,
            system=system_prompt,
            options={"temperature": 0.1}
        )

        response_text = response.get('response', '').strip()

        print("\n" + "="*80)
        print("LLM RESPONSE:")
        print("="*80)
        print(response_text)
        print("="*80 + "\n")

        # Try to extract JSON
        # Only extract if the ENTIRE response is wrapped in code blocks (starts with ```)
        if response_text.startswith('```'):
            # Find the first code block
            if response_text.startswith('```json'):
                response_text = response_text[7:]  # Remove ```json
            else:
                response_text = response_text[3:]  # Remove ```
            # Find the closing ```
            end_marker = response_text.find('```')
            if end_marker != -1:
                response_text = response_text[:end_marker].strip()

        # Parse JSON
        parsed_data = json.loads(response_text)
        return parsed_data

    except json.JSONDecodeError as e:
        print(f"\nJSON PARSE ERROR: {e}")
        print(f"Raw response was: {response_text[:500]}")
        return {"error": str(e)}
    except Exception as e:
        print(f"\nERROR: {e}")
        return {"error": str(e)}

async def main():
    pdf_path = Path(r"d:\Projects\AI driven\Interview\Kirubanithi6369275558.pdf")

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        return

    print(f"Testing Answer Parsing Debug on: {pdf_path.name}\n")

    # Read PDF
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()

    # Convert to images
    print("Converting PDF to images...")
    images = pdf2image.convert_from_bytes(pdf_bytes)
    print(f"Got {len(images)} pages\n")

    # Extract text with OCR
    all_text = []
    for i, image in enumerate(images, 1):
        print(f"Page {i}/{len(images)}: Extracting text...")

        if image.mode != 'RGB':
            image = image.convert('RGB')

        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()

        page_text = await extract_with_glm_ocr(img_bytes)

        if page_text:
            print(f"  Extracted {len(page_text)} characters")
            all_text.append(page_text)
        else:
            print(f"  No text extracted")

    combined_text = "\n\n".join(all_text)

    print(f"\n{'='*80}")
    print(f"TOTAL EXTRACTED TEXT ({len(combined_text)} chars):")
    print(f"{'='*80}")
    print(combined_text)
    print(f"{'='*80}\n")

    # Sample questions (you should replace these with actual questions from the test)
    questions = [
        "Write a function that returns the largest element in an array.",
        "Write a program that tests whether a string is a palindrome.",
        "Write a program to print the following series: 1, 1, 2, 3, 5, 8, 13",
        "Question 4 placeholder",
        "Question 5 placeholder"
    ]

    # Parse answers
    print("\nParsing answers with LLM...\n")
    result = await parse_answers_with_llm(combined_text, questions)

    print("\n" + "="*80)
    print("FINAL PARSED RESULT:")
    print("="*80)
    print(json.dumps(result, indent=2))
    print("="*80)

    # Show what was found
    if "answers" in result:
        print("\n" + "="*80)
        print("ANSWERS SUMMARY:")
        print("="*80)
        for ans in result["answers"]:
            q_num = ans.get("question_number")
            answer = ans.get("answer", "")
            status = "FOUND" if answer.strip() else "NOT FOUND"
            print(f"Q{q_num}: {status}")
            if answer.strip():
                print(f"  Preview: {answer[:100]}...")
        print("="*80)

if __name__ == "__main__":
    asyncio.run(main())
