import json
import re
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

def repair_json(text: str) -> str:
    """
    Repair common JSON formatting errors introduced by LLMs.
    """
    if not text:
        return ""

    # 1. Clean markdown formatting
    text = text.strip()
    if text.startswith('```'):
        if text.startswith('```json'):
            text = text[7:]
        else:
            text = text[3:]
        # Find the closing fence
        end_marker = text.find('```')
        if end_marker != -1:
            text = text[:end_marker]
    text = text.strip()

    # 2. Fix literal newlines/tabs inside string values
    # We look for content between double quotes and replace real newlines with \n
    def escape_string_content(match):
        content = match.group(1)
        # Escape literal characters that are invalid in JSON string values
        return '"' + content.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t') + '"'
    
    # This regex attempts to find "string" values
    # It handles basic escaping but might not be perfect for every edge case
    text = re.sub(r'"((?:[^"\\]|\\.)*)"', escape_string_content, text)

    # 3. Fix invalid backslash escapes (common in code snippets)
    # Double any backslash not followed by a valid JSON escape char: " \ / b f n r t u
    text = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)

    # 4. Handle missing commas between elements (Common LLM error)
    # Between string and string: "..." "..." -> "...", "..."
    # We use a lookahead/lookbehind approach or simple substitution for adjacent delimiters
    # that are not separated by a comma or colon.
    
    # Between strings: "str1" "str2"
    text = re.sub(r'(")\s*(")', r'\1, \2', text)
    # Between object closing and opening: } {
    text = re.sub(r'(\})\s*(\{)', r'\1, \2', text)
    # Between array closing and opening: ] [
    text = re.sub(r'(\])\s*(\[)', r'\1, \2', text)
    # Between string and object: "str" {
    text = re.sub(r'(")\s*(\{)', r'\1, \2', text)
    # Between object and string: } "str"
    text = re.sub(r'(\})\s*(")', r'\1, \2', text)
    # Between array and string: ] "str"
    text = re.sub(r'(\])\s*(")', r'\1, \2', text)

    # 5. Handle trailing commas
    text = re.sub(r',\s*([}\]])', r'\1', text)
    
    # 6. Remove multiple consecutive commas
    text = re.sub(r',\s*,+', ',', text)

    return text

def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """
    Robustly extract JSON from potentially verbose LLM text.
    """
    if not text:
        return None

    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Pre-repair then parse
    try:
        repaired = repair_json(text)
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # Strategy 3: Regex match the largest JSON object boundary { ... }
    # We try greedy first
    try:
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            json_text = match.group(1)
            repaired = repair_json(json_text)
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                # If greedy fails, it might have captured too much text between multiple objects
                # Try finding the FIRST { and LAST } more carefully
                first_curly = text.find('{')
                last_curly = text.rfind('}')
                if first_curly != -1 and last_curly != -1 and last_curly > first_curly:
                    json_text = text[first_curly:last_curly+1]
                    repaired = repair_json(json_text)
                    try:
                        return json.loads(repaired)
                    except json.JSONDecodeError:
                        pass
    except Exception:
        pass

    # Strategy 4: Try to find any block that parses
    # (Expensive, only for smallish texts or if others fail)
    try:
        for match in re.finditer(r'\{', text):
            start = match.start()
            # Try progressively longer segments starting from this {
            for end in range(len(text), start, -1):
                if text[end-1] == '}':
                    try:
                        segment = text[start:end]
                        repaired = repair_json(segment)
                        return json.loads(repaired)
                    except json.JSONDecodeError:
                        continue
    except Exception:
        pass

    # Strategy 5: Handle truncated JSON (last resort)
    # If the response was cut off, try to close unclosed strings/objects
    try:
        def close_json(s):
            # Very simple stack-based closure
            stack = []
            is_in_string = False
            is_escaped = False
            
            for i, char in enumerate(s):
                if is_escaped:
                    is_escaped = False
                    continue
                if char == '\\':
                    is_escaped = True
                    continue
                if char == '"':
                    is_in_string = not is_in_string
                    continue
                if not is_in_string:
                    if char == '{':
                        stack.append('}')
                    elif char == '[':
                        stack.append(']')
                    elif char == '}':
                        if stack and stack[-1] == '}': stack.pop()
                    elif char == ']':
                        if stack and stack[-1] == ']': stack.pop()
            
            res = s
            if is_in_string:
                res += '"'
            
            # Close the stack in reverse
            for close_char in reversed(stack):
                res += close_char
            return res

        # Find the last unclosed block
        first_curly = text.find('{')
        if first_curly != -1:
            fragment = text[first_curly:]
            closed_json = close_json(fragment)
            repaired = repair_json(closed_json)
            return json.loads(repaired)
    except Exception:
        pass

    logger.warning(f"Failed to extract JSON from text: {text[:500]}...")
    return None
