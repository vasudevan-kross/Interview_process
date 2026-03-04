# Question Import Format Guide

## Supported File Formats

The Voice Screening campaign creation supports importing custom questions from:
- **CSV files** (.csv)
- **Excel files** (.xlsx, .xls)
- **Text files** (.txt)

## Format Requirements

### CSV Files (.csv)
- One question per line
- No header row needed
- Lines starting with `#` are treated as comments and ignored

**Example:**
```csv
Can you introduce yourself?
Which programming language are you most comfortable with?
What is Object-Oriented Programming?
Can you explain what inheritance is?
Have you worked on any projects during college?
```

### Excel Files (.xlsx, .xls)
- Questions should be in the **first column**
- **First row is treated as header** and will be skipped
- Only the first sheet is read
- Empty cells are ignored

**Example:**

| Interview Questions | (Other columns ignored) |
|---------------------|-------------------------|
| Can you introduce yourself? | |
| Which programming language are you most comfortable with? | |
| What is Object-Oriented Programming? | |
| Can you explain what inheritance is? | |
| Have you worked on any projects during college? | |

### Text Files (.txt)
- One question per line
- No special formatting needed
- Lines starting with `#` are treated as comments and ignored
- Blank lines are ignored

**Example:**
```txt
# Fresher Interview Questions

Can you introduce yourself?
Which programming language are you most comfortable with?
What is Object-Oriented Programming?
Can you explain what inheritance is?
Have you worked on any projects during college?
```

## How to Import

1. **Go to Campaign Creation**: Navigate to `/dashboard/voice-screening/campaigns/new`
2. **Find Interview Questions Section**: Scroll to "Interview Questions" card
3. **Click "Import Questions" Button**: This will open a file picker
4. **Select Your File**: Choose your CSV, Excel, or TXT file
5. **Questions Imported**: You'll see all questions populated in the form

## Tips

### For Freshers
Start with basic questions:
```
Can you introduce yourself? Tell me your name, college, degree, and graduation year
Which programming language or framework are you most comfortable with?
What is Object-Oriented Programming?
Can you explain inheritance with an example?
What is the difference between a list and tuple in Python?
Have you built any projects in college? Tell me about one
What technologies did you use in your college projects?
Are you comfortable learning new technologies?
What are your career goals?
```

### For Experienced Candidates
Focus on work experience:
```
Can you walk me through your current role and responsibilities?
What projects have you worked on in your current company?
Can you describe a challenging technical problem you solved?
How do you approach code reviews?
What is your experience with microservices architecture?
How do you handle database optimization?
What CI/CD tools have you used?
```

### Technology-Specific Questions

**Java:**
```
What is OOPs and its four pillars?
Explain encapsulation with an example
What is the difference between abstract class and interface?
What are Java collections? Name a few
What is the difference between ArrayList and LinkedList?
```

**Python:**
```
What are the basic data types in Python?
What is the difference between list and tuple?
Explain decorators in Python
What is a lambda function?
How do you handle exceptions in Python?
```

**React:**
```
What is a React component?
What is the difference between props and state?
What is the useState hook?
What is the useEffect hook used for?
Explain the component lifecycle
```

**JavaScript:**
```
What is the difference between let, const, and var?
What is a closure in JavaScript?
Explain event bubbling and capturing
What is the difference between == and ===?
What are arrow functions?
```

## Error Messages

- **"No questions found in file"**: Your file is empty or all lines are comments/blank
- **"No questions found in file. Make sure questions are in the first column"**: For Excel files, questions must be in column A
- **"Please upload a CSV, TXT, or Excel file"**: You selected an unsupported file format
- **"Failed to import questions. Please check file format"**: The file format is corrupted or invalid

## Best Practices

1. **Keep questions clear and concise**
2. **Use natural language** (the AI will ask them verbatim)
3. **Start with self-introduction questions**
4. **Ask technology preference before deep-diving**
5. **Match questions to candidate level** (fresher vs experienced)
6. **Use 5-10 questions** for a good interview flow
7. **Test with "Generate with AI"** to see sample questions first

## Example Files

### sample_fresher_questions.csv
```csv
Can you introduce yourself?
Which programming language are you most comfortable with?
What is OOPs?
Can you explain inheritance?
What projects have you built in college?
```

### sample_experienced_questions.xlsx
| Interview Questions |
|---------------------|
| Tell me about your current role |
| What projects have you worked on? |
| Describe a technical challenge you faced |
| How do you approach code reviews? |
| What is your experience with cloud platforms? |

### sample_mixed_questions.txt
```txt
# General Questions
Can you introduce yourself?
What is your preferred technology stack?

# Technical Questions
Explain your understanding of REST APIs
How do you handle database optimization?
What testing frameworks have you used?

# Behavioral Questions
How do you handle tight deadlines?
Describe your ideal work environment
```

## Notes

- Questions are imported **in order** from the file
- You can **edit, add, or remove** questions after importing
- You can **import multiple times** (replaces existing questions)
- **Empty lines and comments** are automatically filtered out
- For Excel files, **only the first sheet** is processed
