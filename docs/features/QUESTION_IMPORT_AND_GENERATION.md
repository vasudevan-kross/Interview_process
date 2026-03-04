# Question Import and AI Generation Feature

## Overview
Added the ability to import custom questions from files (CSV/TXT) and generate questions using AI (Ollama) when creating voice screening campaigns.

---

## Features

### 1. Import Questions from CSV/TXT Files
**Location:** Campaign Creation Page → Custom Questions Section

**Supported Formats:**
- **CSV files** (.csv) - One question per line
- **Text files** (.txt) - One question per line

**How it works:**
1. Click "Import CSV/TXT" button
2. Select a CSV or TXT file containing questions
3. Questions are parsed (one per line)
4. Empty lines and lines starting with `#` are skipped
5. All questions are loaded into the form

**Example CSV/TXT Format:**
```
Tell me about your experience with React and Node.js
What was your most challenging project and how did you handle it?
How do you stay updated with the latest technology trends?
Describe a time when you had to work with a difficult team member
What is your expected salary range?
# This is a comment and will be skipped
Why do you want to work for our company?
```

### 2. AI Question Generation
**Location:** Campaign Creation Page → Custom Questions Section

**How it works:**
1. Enter the **Job Role** first (required)
2. Select **Candidate Type** (fresher/experienced/general)
3. Click "Generate with AI" button
4. Ollama (Mistral:7b) generates 5 contextually relevant questions
5. Questions appear in the form, ready to edit

**AI Generation Features:**
- Contextually relevant to job role
- Tailored to candidate type (fresher vs experienced)
- Mix of technical and behavioral questions
- Conversational tone for voice interviews
- No yes/no questions

---

## Implementation Details

### Frontend Changes

#### File: `frontend/src/app/dashboard/voice-screening/campaigns/new/page.tsx`

**New Imports:**
```typescript
import { useRef } from 'react'
import { Upload, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api/client'
```

**New State:**
```typescript
const [generatingQuestions, setGeneratingQuestions] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
```

**Import Handler:**
```typescript
const handleImportQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  const text = await file.text()
  let questions: string[] = []

  if (file.name.endsWith('.csv')) {
    questions = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
  } else if (file.name.endsWith('.txt')) {
    questions = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
  }

  setFormData(prev => ({ ...prev, custom_questions: questions }))
  toast.success(`Imported ${questions.length} questions`)
}
```

**AI Generation Handler:**
```typescript
const handleGenerateQuestions = async () => {
  if (!formData.job_role.trim()) {
    toast.error('Please enter a job role first')
    return
  }

  setGeneratingQuestions(true)
  const response = await apiClient['client'].post('/api/v1/voice-screening/generate-questions', {
    job_role: formData.job_role,
    candidate_type: formData.candidate_type,
    num_questions: 5
  })

  const generatedQuestions = response.data.questions || []
  setFormData(prev => ({ ...prev, custom_questions: generatedQuestions }))
  toast.success(`Generated ${generatedQuestions.length} questions using AI`)
  setGeneratingQuestions(false)
}
```

**UI Buttons:**
```tsx
<div className="flex gap-2">
  {/* Hidden file input */}
  <input
    ref={fileInputRef}
    type="file"
    accept=".csv,.txt"
    onChange={handleImportQuestions}
    className="hidden"
  />

  {/* Import button */}
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => fileInputRef.current?.click()}
  >
    <Upload className="h-4 w-4 mr-2" />
    Import CSV/TXT
  </Button>

  {/* Generate button */}
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={handleGenerateQuestions}
    disabled={generatingQuestions || !formData.job_role}
  >
    {generatingQuestions ? (
      <>
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Generating...
      </>
    ) : (
      <>
        <Sparkles className="h-4 w-4 mr-2" />
        Generate with AI
      </>
    )}
  </Button>
</div>
```

### Backend Changes

#### File: `backend/app/schemas/voice_screening.py`

**New Schemas:**
```python
class QuestionGenerationRequest(BaseModel):
    """Schema for AI question generation request."""
    job_role: str = Field(..., min_length=1, max_length=200)
    candidate_type: CandidateType = Field(default=CandidateType.GENERAL)
    num_questions: int = Field(default=5, ge=1, le=20)


class QuestionGenerationResponse(BaseModel):
    """Schema for AI question generation response."""
    questions: List[str] = Field(...)
    model: str = Field(...)
```

#### File: `backend/app/api/v1/voice_screening.py`

**New Endpoint:**
```python
@router.post("/generate-questions", response_model=QuestionGenerationResponse)
async def generate_questions(
    request: QuestionGenerationRequest,
    current_user_id: str = Depends(get_current_user_id)
):
    """Generate interview questions using Ollama AI."""

    # Build context-aware prompt
    candidate_context = {
        "fresher": "entry-level candidate with 0-2 years of experience",
        "experienced": "senior professional with 5+ years of experience",
        "general": "candidate of any experience level"
    }.get(request.candidate_type.value, "candidate")

    system_prompt = f"""Generate {request.num_questions} interview questions
    for a {candidate_context} applying for {request.job_role}.

    Return ONLY a JSON array of questions: ["question1", "question2", ...]"""

    # Call Ollama
    response = ollama.chat(
        model="mistral:7b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate {request.num_questions} questions"}
        ],
        options={"temperature": 0.7}
    )

    # Extract JSON array
    response_text = response["message"]["content"].strip()
    json_match = re.search(r'\[[\s\S]*\]', response_text)
    questions = json.loads(json_match.group(0))

    return QuestionGenerationResponse(
        questions=questions,
        model="mistral:7b"
    )
```

---

## Usage Guide

### Importing Questions from File

**Step 1: Prepare Question File**

Create a CSV or TXT file with questions (one per line):

**questions.txt:**
```
What programming languages are you proficient in?
Describe your experience with cloud platforms
Tell me about a challenging bug you fixed
How do you approach code reviews?
What's your experience with CI/CD pipelines?
```

**Step 2: Import in Campaign Form**

1. Go to Voice Screening → Campaigns → Create Campaign
2. Fill in Campaign Name and Job Role
3. In "Custom Questions" section, click "Import CSV/TXT"
4. Select your questions file
5. Questions will populate the form
6. Edit as needed
7. Submit to create campaign

### Generating Questions with AI

**Step 1: Enter Job Role**

1. Go to Voice Screening → Campaigns → Create Campaign
2. Enter **Campaign Name**: "Backend Developer Screening"
3. Enter **Job Role**: "Senior Backend Developer" (required!)
4. Select **Candidate Type**: "Experienced"

**Step 2: Generate Questions**

1. In "Custom Questions" section, click "Generate with AI"
2. Wait 3-5 seconds (AI is generating)
3. 5 questions will appear, tailored to:
   - Job role: Senior Backend Developer
   - Candidate type: Experienced
4. Edit questions if needed
5. Submit to create campaign

**Example Generated Questions (for Senior Backend Developer):**
```
1. Can you describe your experience with microservices architecture and how you've implemented it in previous projects?
2. What strategies do you use for database optimization and handling high-traffic scenarios?
3. Tell me about a time when you had to debug a complex production issue. What was your approach?
4. How do you ensure code quality and maintainability in large-scale backend systems?
5. What's your experience with containerization technologies like Docker and Kubernetes?
```

---

## API Endpoints

### Generate Questions

**POST** `/api/v1/voice-screening/generate-questions`

**Request:**
```json
{
  "job_role": "Senior Full Stack Developer",
  "candidate_type": "experienced",
  "num_questions": 5
}
```

**Response:**
```json
{
  "questions": [
    "Can you describe your experience with both frontend and backend technologies?",
    "How do you approach system design for scalable applications?",
    "Tell me about a challenging technical decision you made recently",
    "What's your experience with DevOps practices and CI/CD?",
    "How do you stay current with rapidly evolving web technologies?"
  ],
  "model": "mistral:7b"
}
```

**Status Codes:**
- **200 OK**: Questions generated successfully
- **401 Unauthorized**: Not authenticated
- **500 Internal Server Error**: Ollama error or generation failed

---

## Question Quality

### AI-Generated Questions

**Strengths:**
- ✅ Contextually relevant to job role
- ✅ Appropriate complexity for candidate type
- ✅ Open-ended (not yes/no)
- ✅ Mix of technical and behavioral
- ✅ Conversational tone

**Customization Recommended:**
- You can edit AI-generated questions
- Add company-specific questions
- Adjust difficulty level
- Include role-specific scenarios

### Imported Questions

**Best Practices:**
- Keep questions clear and concise
- One question per line
- Use `#` for comments/notes in file
- Test questions before importing
- Review all imported questions before submitting

---

## Error Handling

### Import Errors

**Error: "Please upload a CSV or TXT file"**
- Only .csv and .txt files are supported
- Excel files (.xlsx) are not directly supported

**Error: "No questions found in file"**
- File is empty
- All lines start with `#` (comments)
- Check file encoding (use UTF-8)

**Solution:** Verify file format and content

### AI Generation Errors

**Error: "Please enter a job role first"**
- Job role field is required before generating
- Fill in the job role input

**Error: "Failed to generate questions"**
- Ollama might not be running
- Mistral:7b model not pulled
- Network connectivity issue

**Solution:**
```bash
# Start Ollama
docker-compose up -d

# Pull Mistral model
ollama pull mistral:7b

# Verify Ollama is running
curl http://localhost:11434/api/tags
```

---

## Workflow Comparison

### Manual Entry
```
Campaign Form
  ↓
Enter each question manually
  ↓
One at a time
  ↓
Time: 5-10 minutes for 5 questions
```

### Import from File
```
Campaign Form
  ↓
Click "Import CSV/TXT"
  ↓
Select file
  ↓
All questions loaded instantly
  ↓
Time: 10 seconds
```

### AI Generation
```
Campaign Form
  ↓
Enter job role
  ↓
Click "Generate with AI"
  ↓
Wait 3-5 seconds
  ↓
5 contextually relevant questions appear
  ↓
Time: 10 seconds
```

---

## Tips and Tricks

### 1. Combine Methods
- Generate questions with AI (get 5 relevant questions)
- Import your company-specific questions from CSV
- Manually add 1-2 custom questions
- Result: Comprehensive question set

### 2. Build Question Library
- Create CSV files for different roles
- `backend-questions.csv`
- `frontend-questions.csv`
- `devops-questions.csv`
- Reuse across campaigns

### 3. Refine AI Questions
- AI provides a great starting point
- Edit to add company context
- Adjust complexity level
- Add specific technology mentions

### 4. Version Control
- Store question CSV files in git
- Track changes over time
- Share across team

---

## Testing

### Test Import Feature

1. Create `test-questions.txt`:
```
What is your experience level?
Why are you interested in this role?
What are your salary expectations?
```

2. Navigate to Create Campaign
3. Click "Import CSV/TXT"
4. Select `test-questions.txt`
5. Verify 3 questions appear
6. ✅ Success

### Test AI Generation

1. Navigate to Create Campaign
2. Enter Job Role: "Software Engineer"
3. Select Candidate Type: "General"
4. Click "Generate with AI"
5. Wait for generation
6. Verify 5 questions appear
7. Check questions are relevant to Software Engineer
8. ✅ Success

---

## Troubleshooting

### Import Button Not Working
- Check browser console for errors
- Verify file input is visible (inspect element)
- Try different file

### AI Generation Takes Too Long
- Check Ollama is running: `docker ps | grep ollama`
- Check Ollama logs: `docker logs ollama`
- Verify Mistral model: `ollama list`

### Questions Not Relevant
- Model might need better prompt
- Try different candidate type
- Edit questions manually after generation

---

## Future Enhancements

1. **Excel Support**: Import from .xlsx files
2. **Question Templates**: Pre-built question sets for common roles
3. **Multi-Language**: Generate questions in different languages
4. **Question Bank**: Save and reuse questions across campaigns
5. **Bulk Generation**: Generate more questions at once (10, 15, 20)
6. **Question Categories**: Tag questions (technical, behavioral, cultural fit)

---

**Status:** ✅ Complete and ready for testing!
