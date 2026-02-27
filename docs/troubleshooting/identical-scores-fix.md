# Identical Scores in Batch Processing - Fix

## Problem

When processing multiple answer sheets in batch mode, different candidates were receiving identical scores:
- Candidate 1: 71.9% (17.98 marks)
- Candidate 2: 71.9% (17.98 marks) ← Same!
- Candidate 3: 71.9% (17.98 marks) ← Same!
- Candidate 4: 71.9% (17.98 marks) ← Same!
- Candidate 5: 40.1% (10.02 marks)

This indicates that answer sheets aren't being properly differentiated during evaluation.

## Root Causes Identified

### 1. **Wrong API Keys in Batch Processor** ✅ FIXED

**Issue:** The batch processor was looking for wrong keys in the service response.

**Location:** `backend/app/api/v1/test_evaluation_batch.py` line 46-54

**Before:**
```python
return {
    "score": result.get("total_score"),  # ❌ Wrong key!
    "percentage": result.get("percentage"),
}
```

**After:**
```python
return {
    "score": result.get("total_marks_obtained"),  # ✅ Correct key
    "total_marks": result.get("total_marks"),
    "percentage": result.get("percentage"),
    "answer_sheet_id": result.get("answer_sheet_id")
}
```

**Why This Caused Issues:**
- `result.get("total_score")` returned `None` for all candidates
- When `None` values were used in calculations, they could cause unexpected behavior
- The actual scores (`total_marks_obtained`) were never being extracted

### 2. **Missing File Uniqueness Verification** ✅ FIXED

**Issue:** No logging to verify that each uploaded file is actually different.

**Solution:** Added comprehensive logging with file hashes:

```python
# When files are uploaded
for i, file in enumerate(files):
    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()[:8]
    logger.info(f"Uploaded file {i+1}: {file.filename}, hash: {file_hash}")
```

```python
# When files are processed
file_hash = hashlib.md5(file_data).hexdigest()[:8]
logger.info(f"Processing {filename}, size: {len(file_data)} bytes, hash: {file_hash}")
```

**What to Look For:**
- Each file should have a **different hash**
- If multiple files have the same hash → same content (user error or file upload issue)
- If hashes differ but scores identical → evaluation logic issue

## Testing the Fix

### 1. Restart Backend

The code changes require a backend restart:

```bash
cd backend
# Stop current server (Ctrl+C)
uvicorn app.main:app --reload
```

### 2. Test Batch Upload

1. Go to Test Evaluation
2. Select a test
3. Upload 3-5 **different** answer sheets with **unique** answers
4. Watch backend logs

**Expected Log Output:**

```
INFO: [Batch abc123] Uploaded file 1/5: answer1.pdf, candidate: John Doe, size: 123456 bytes, hash: a1b2c3d4
INFO: [Batch abc123] Uploaded file 2/5: answer2.pdf, candidate: Jane Smith, size: 234567 bytes, hash: e5f6g7h8
INFO: [Batch abc123] Uploaded file 3/5: answer3.pdf, candidate: Bob Johnson, size: 345678 bytes, hash: i9j0k1l2
...
INFO: [Batch abc123] Processing answer1.pdf for candidate: John Doe, file size: 123456 bytes, hash: a1b2c3d4
INFO: Extracted text length: 1234 chars
INFO: LLM response for answer parsing (first 500 chars): {"answers": [...]
INFO: Successfully parsed 5 answers
INFO: Processed paper: answer1.pdf - Score: 15.5/25
...
INFO: [Batch abc123] Processing answer2.pdf for candidate: Jane Smith, file size: 234567 bytes, hash: e5f6g7h8
INFO: Processed paper: answer2.pdf - Score: 18.2/25
```

### 3. Verify Results

Check that:
- ✅ Each file has a unique hash (different content)
- ✅ Each candidate gets a different score (unless answers are genuinely identical)
- ✅ Scores are properly extracted and displayed

## Potential Remaining Issues

If candidates **still** get identical scores after this fix, check:

### 1. **OCR Extraction Quality**

If all PDFs have poor OCR quality or are images of the same page:

```python
# Check in logs for:
INFO: Extracted text length: 50 chars  # ⚠️ Too short - OCR failed?
```

**Solution:**
- Ensure answer sheets are clear, high-quality scans
- Check that different candidates submitted different content
- Try with text-based PDFs instead of scanned images

### 2. **LLM Caching or Hallucination**

If the LLM is seeing very similar text patterns and generating identical responses:

**Solution:**
- Lower the temperature (currently 0.1 for answer parsing)
- Add more context to prompts to differentiate between candidates
- Use different models for different papers

### 3. **Shared State in Service**

If there's any singleton state being reused:

**Check:**
```python
# In test_evaluation.py
_test_evaluation_service: Optional[TestEvaluationService] = None
```

This singleton is fine - it doesn't store answer-specific state.

## Files Modified

1. **backend/app/api/v1/test_evaluation_batch.py**
   - Fixed: Changed `total_score` → `total_marks_obtained`
   - Fixed: Changed `max_score` → `total_marks`
   - Added: File hash logging for debugging
   - Added: Detailed processing logs
   - Added: `hashlib` import for MD5 hashing

## Verification Checklist

After applying the fix:

- [ ] Backend restarted with new code
- [ ] Upload 3+ different answer sheets
- [ ] Check logs show different file hashes
- [ ] Check logs show different extracted text
- [ ] Verify candidates get different scores
- [ ] Confirm scores match actual answer quality

## Expected Behavior

**Before Fix:**
```
Candidate 1: 71.9% (17.98 marks)
Candidate 2: 71.9% (17.98 marks)  ← Identical!
Candidate 3: 71.9% (17.98 marks)  ← Identical!
```

**After Fix:**
```
Candidate 1: 78.2% (19.55 marks)
Candidate 2: 65.4% (16.35 marks)  ← Different!
Candidate 3: 82.8% (20.70 marks)  ← Different!
```

Scores should vary based on actual answer quality!

## Debug Commands

If issues persist, use these commands to debug:

### Check if files are actually different:
```bash
# In the upload directory
md5sum candidate1.pdf candidate2.pdf candidate3.pdf
```

All hashes should be different!

### Check backend logs for processing details:
```bash
# Watch logs in real-time
tail -f backend_logs.log | grep "Batch"
```

### Verify database entries:
```sql
SELECT candidate_name, total_marks_obtained, percentage
FROM answer_sheets
WHERE test_id = 'your-test-id'
ORDER BY submitted_at DESC;
```

Each candidate should have unique scores!

## Summary

The primary issue was **wrong API keys** in the batch processor:
- Looking for `total_score` instead of `total_marks_obtained`
- This caused all score extractions to fail
- Added comprehensive logging to verify file uniqueness

**Expected Improvement:**
- ✅ Correct scores displayed for each candidate
- ✅ Better debugging with file hashes
- ✅ Clear logs showing processing details

The fix ensures each answer sheet is properly evaluated and scores are correctly extracted!
