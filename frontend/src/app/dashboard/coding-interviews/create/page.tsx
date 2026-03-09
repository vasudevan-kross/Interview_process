'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Code,
  Sparkles,
  FileText,
  Plus,
  Trash2,
  Loader2,
  Calendar,
  Clock,
  Save,
  Copy,
  Share2,
  Upload,
  File,
  CheckCircle2,
} from 'lucide-react'
import { createInterview, generateQuestions, generateShareableLink, extractQuestionsFromDocument, type Question } from '@/lib/api/coding-interviews'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { toast } from 'sonner'

export default function CreateInterviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [activeTab, setActiveTab] = useState('ai-generate')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  // Interview details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledStartTime, setScheduledStartTime] = useState('')
  const [scheduledEndTime, setScheduledEndTime] = useState('')
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(15)
  const [programmingLanguage, setProgrammingLanguage] = useState('python')
  const [interviewType, setInterviewType] = useState('coding')
  const [testFramework, setTestFramework] = useState('selenium-python')
  const [domainTool, setDomainTool] = useState('')  // Generic tool/dialect for non-coding/testing domains
  const [resumeRequired, setResumeRequired] = useState<'mandatory' | 'optional' | 'disabled'>('mandatory')

  // Bond/Terms fields
  const [bondTerms, setBondTerms] = useState('')
  const [bondDocumentUrl, setBondDocumentUrl] = useState('')
  const [requireSignature, setRequireSignature] = useState(true)  // Default to checked
  const [bondYears, setBondYears] = useState<string>('2')  // Use string to allow clearing
  const [bondTiming, setBondTiming] = useState<'before_start' | 'before_submission'>('before_submission')
  const [bondDocumentFile, setBondDocumentFile] = useState<File | null>(null)

  // AI Generation
  const [jobDescription, setJobDescription] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [numQuestions, setNumQuestions] = useState<string>('3')  // Use string to allow clearing
  const [totalMarks, setTotalMarks] = useState<string>('100')  // Use string to allow clearing

  // Questions
  const [questions, setQuestions] = useState<Question[]>([])
  const [shareableLink, setShareableLink] = useState('')

  // Helper: calculate available interview minutes from start/end time
  const getAvailableMinutes = () => {
    if (!scheduledStartTime || !scheduledEndTime) return 0
    const start = new Date(scheduledStartTime).getTime()
    const end = new Date(scheduledEndTime).getTime()
    return Math.max(0, Math.floor((end - start) / 60000))
  }

  // Distribute time and marks evenly across questions
  const distributeTimeAndMarks = (qs: Question[]): Question[] => {
    if (qs.length === 0) return qs
    const availableMinutes = getAvailableMinutes()
    const timePerQ = availableMinutes > 0 ? Math.floor(availableMinutes / qs.length) : 15
    const totalMarksNum = parseInt(totalMarks) || 100
    const marksPerQ = Math.floor(totalMarksNum / qs.length)
    const remainder = totalMarksNum - marksPerQ * qs.length
    return qs.map((q, i) => ({
      ...q,
      time_estimate_minutes: timePerQ,
      marks: marksPerQ + (i < remainder ? 1 : 0),
    }))
  }

  // Redistribute marks when total marks changes
  const handleTotalMarksChange = (newTotal: string) => {
    setTotalMarks(newTotal)
    const totalNum = parseInt(newTotal) || 0
    if (questions.length > 0 && totalNum > 0) {
      const marksPerQ = Math.floor(totalNum / questions.length)
      const remainder = totalNum - marksPerQ * questions.length
      setQuestions(questions.map((q, i) => ({
        ...q,
        marks: marksPerQ + (i < remainder ? 1 : 0),
      })))
    }
  }

  const handleGenerateQuestions = async () => {
    if (!jobDescription.trim()) {
      toast.error('Please enter a job description')
      return
    }

    try {
      setGenerating(true)
      const response = await generateQuestions({
        job_description: jobDescription,
        difficulty,
        num_questions: parseInt(numQuestions) || 3,
        programming_language: interviewType === 'coding' || interviewType === 'fullstack' || interviewType === 'data_science' ? programmingLanguage : undefined,
        test_framework: interviewType === 'testing' ? testFramework : undefined,
        domain_tool: ['devops', 'sql'].includes(interviewType) ? domainTool : undefined,
        interview_type: interviewType,
      })

      // Auto-switch interview type if backend detected a different role
      if (response.detected_type && response.detected_type !== interviewType) {
        setInterviewType(response.detected_type)
        toast.info(`Detected a ${response.detected_type} role from your job description — generated ${response.detected_type} questions instead.`)
      }

      setQuestions(distributeTimeAndMarks(response.questions))
      toast.success(`Generated ${response.count} questions successfully!`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate questions')
    } finally {
      setGenerating(false)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
      if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|doc|jpg|jpeg|png|xlsx|csv)$/i)) {
        toast.error('Please upload a PDF, Word, Image, Excel, or CSV file')
        return
      }

      setUploadedFile(file)
    }
  }

  const handleExtractQuestions = async () => {
    if (!uploadedFile) {
      toast.error('Please upload a document first')
      return
    }

    try {
      setExtracting(true)
      const response = await extractQuestionsFromDocument({
        file: uploadedFile,
        programming_language: programmingLanguage,
        interview_type: interviewType,
        difficulty,
      })

      setQuestions(distributeTimeAndMarks(response.questions))
      toast.success(`Extracted ${response.count} questions from document!`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to extract questions')
    } finally {
      setExtracting(false)
    }
  }

  const handleAddManualQuestion = () => {
    const newCount = questions.length + 1
    const availableMinutes = getAvailableMinutes()
    const timePerQ = availableMinutes > 0 ? Math.floor(availableMinutes / newCount) : 15
    const totalMarksNum = parseInt(totalMarks) || 100
    const marksPerQ = Math.floor(totalMarksNum / newCount)
    const remainder = totalMarksNum - marksPerQ * newCount
    const updatedQuestions = [
      ...questions.map((q, i) => ({
        ...q,
        time_estimate_minutes: timePerQ,
        marks: marksPerQ + (i < remainder ? 1 : 0),
      })),
      {
        question_text: '',
        difficulty: 'medium' as const,
        marks: marksPerQ + (questions.length < remainder ? 1 : 0),
        starter_code: '',
        solution_code: '',
        test_cases: [],
        topics: [],
        time_estimate_minutes: timePerQ,
      },
    ]
    setQuestions(updatedQuestions)
  }

  const handleUpdateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    setQuestions(updated)
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleCreateInterview = async () => {
    // Validation
    if (!title.trim()) {
      toast.error('Please enter interview title')
      return
    }
    if (!scheduledStartTime || !scheduledEndTime) {
      toast.error('Please select start and end times')
      return
    }

    // Validate end time is after start time
    const startTime = new Date(scheduledStartTime)
    const endTime = new Date(scheduledEndTime)
    if (endTime <= startTime) {
      toast.error('End time must be after start time. Please check your times.')
      return
    }

    if (questions.length === 0) {
      toast.error('Please add at least one question')
      return
    }

    try {
      setLoading(true)
      // Determine the correct language/tool to store based on interview type
      const effectiveLanguage = interviewType === 'testing'
        ? testFramework
        : (['devops', 'sql', 'system_design', 'data_science', 'fullstack'].includes(interviewType)
            ? (domainTool || interviewType)
            : programmingLanguage)  // 'any' is sent as-is — no fallback to 'python'

      const response = await createInterview({
        title,
        description,
        scheduled_start_time: scheduledStartTime,
        scheduled_end_time: scheduledEndTime,
        programming_language: effectiveLanguage,
        allowed_languages: interviewType === 'coding' && programmingLanguage === 'any' ? [] : undefined,
        interview_type: interviewType,
        grace_period_minutes: gracePeriodMinutes,
        resume_required: resumeRequired,
        bond_terms: bondTerms || undefined,
        bond_document_url: bondDocumentUrl || undefined,
        require_signature: requireSignature,
        bond_years: parseInt(bondYears) || 2,
        bond_timing: bondTiming,
        questions,
      })

      const link = generateShareableLink(response.access_token)
      setShareableLink(link)
      toast.success('Interview created successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create interview')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableLink)
    toast.success('Link copied to clipboard!')
  }

  const handleShareWhatsApp = () => {
    const message = `Interview: ${title}\n\nJoin link: ${shareableLink}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  if (shareableLink) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
              <Code className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl">Interview Created Successfully!</CardTitle>
            <CardDescription>Share this link with candidates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Shareable Link:</p>
              <p className="font-mono text-sm break-all">{shareableLink}</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCopyLink} className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
              <Button onClick={handleShareWhatsApp} variant="outline" className="flex-1">
                <Share2 className="mr-2 h-4 w-4" />
                Share on WhatsApp
              </Button>
            </div>

            <Button
              onClick={() => router.push('/dashboard/coding-interviews')}
              variant="outline"
              className="w-full"
            >
              Back to Interviews
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Create Technical Assessment
        </h1>
        <p className="text-gray-600 mt-2">Set up a time-bound assessment with AI-generated or custom questions</p>
      </div>

      {/* Interview Details */}
      <Card>
        <CardHeader>
          <CardTitle>Interview Details</CardTitle>
          <CardDescription>Basic information about the interview</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Interview Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Python Backend Developer Interview"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="interviewType">Interview Type *</Label>
              <Select value={interviewType} onValueChange={(v) => { setInterviewType(v); setDomainTool('') }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coding">Coding (Algorithms, Development)</SelectItem>
                  <SelectItem value="testing">Testing/QA (Test Cases, Automation)</SelectItem>
                  <SelectItem value="devops">DevOps (Docker, K8s, CI/CD, IaC)</SelectItem>
                  <SelectItem value="sql">SQL / Database</SelectItem>
                  <SelectItem value="system_design">System Design (Architecture)</SelectItem>
                  <SelectItem value="fullstack">Fullstack (Backend + Frontend)</SelectItem>
                  <SelectItem value="data_science">Data Science / ML</SelectItem>
                  <SelectItem value="both">Both Coding + Testing (Mixed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the interview"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>
                <Calendar className="inline h-4 w-4 mr-1" />
                Start Time *
              </Label>
              <DateTimePicker
                value={scheduledStartTime}
                onChange={(start) => {
                  setScheduledStartTime(start)
                  if (start) {
                    const pad = (n: number) => String(n).padStart(2, '0')
                    // Preserve existing duration; default to 1 hour if end not set
                    const durationMs = scheduledStartTime && scheduledEndTime
                      ? new Date(scheduledEndTime).getTime() - new Date(scheduledStartTime).getTime()
                      : 60 * 60 * 1000
                    const endDate = new Date(new Date(start).getTime() + Math.max(durationMs, 60 * 60 * 1000))
                    setScheduledEndTime(
                      `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`
                    )
                  }
                }}
                placeholder="Select start date & time"
                minDate={new Date()}
              />
            </div>

            <div className="space-y-2">
              <Label>
                <Clock className="inline h-4 w-4 mr-1" />
                End Time *
              </Label>
              <DateTimePicker
                value={scheduledEndTime}
                onChange={setScheduledEndTime}
                placeholder="Select end date & time"
                minDate={scheduledStartTime ? new Date(scheduledStartTime) : new Date()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gracePeriod">Grace Period (minutes)</Label>
              <Input
                id="gracePeriod"
                type="number"
                value={gracePeriodMinutes}
                onChange={(e) => setGracePeriodMinutes(parseInt(e.target.value) || 0)}
                min="0"
                max="60"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Coding / Fullstack / Data Science: programming language picker */}
            {['coding', 'fullstack', 'data_science', 'both'].includes(interviewType) && (
              <div className="space-y-2">
                <Label htmlFor="language">Programming Language</Label>
                <Select value={programmingLanguage} onValueChange={setProgrammingLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewType === 'coding' && <SelectItem value="any">Any Language (Candidate's Choice)</SelectItem>}
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="csharp">C#</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                    <SelectItem value="rust">Rust</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {programmingLanguage === 'any'
                    ? 'Candidates can write in any programming language'
                    : `Interview will use ${programmingLanguage.toUpperCase()}`
                  }
                </p>
              </div>
            )}

            {/* Testing: test framework picker */}
            {interviewType === 'testing' && (
              <div className="space-y-2">
                <Label htmlFor="testFramework">Test Framework *</Label>
                <Select value={testFramework} onValueChange={setTestFramework}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selenium-python">Selenium (Python)</SelectItem>
                    <SelectItem value="selenium-java">Selenium (Java)</SelectItem>
                    <SelectItem value="playwright-js">Playwright (JavaScript)</SelectItem>
                    <SelectItem value="cypress-js">Cypress (JavaScript)</SelectItem>
                    <SelectItem value="pytest">Pytest (Python)</SelectItem>
                    <SelectItem value="junit">JUnit (Java)</SelectItem>
                    <SelectItem value="manual-test-cases">Manual Test Case Design</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* DevOps: tool picker */}
            {interviewType === 'devops' && (
              <div className="space-y-2">
                <Label htmlFor="devopsTool">DevOps Focus</Label>
                <Select value={domainTool || 'general'} onValueChange={setDomainTool}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General DevOps</SelectItem>
                    <SelectItem value="docker">Docker</SelectItem>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                    <SelectItem value="terraform">Terraform</SelectItem>
                    <SelectItem value="ansible">Ansible</SelectItem>
                    <SelectItem value="bash">Bash / Shell Scripting</SelectItem>
                    <SelectItem value="ci-cd">CI/CD (GitHub Actions / Jenkins)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SQL: dialect picker */}
            {interviewType === 'sql' && (
              <div className="space-y-2">
                <Label htmlFor="sqlDialect">SQL Dialect</Label>
                <Select value={domainTool || 'general'} onValueChange={setDomainTool}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General SQL</SelectItem>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                    <SelectItem value="oracle">Oracle SQL</SelectItem>
                    <SelectItem value="sqlserver">SQL Server (T-SQL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="resumeRequired">Resume Upload Requirement</Label>
              <Select value={resumeRequired} onValueChange={(v: any) => setResumeRequired(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory (Must upload)</SelectItem>
                  <SelectItem value="optional">Optional (Recommended)</SelectItem>
                  <SelectItem value="disabled">Disabled (No upload)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {resumeRequired === 'mandatory' && 'Candidates must upload resume to complete interview'}
                {resumeRequired === 'optional' && 'Candidates can optionally upload resume after submission'}
                {resumeRequired === 'disabled' && 'Resume upload will not be shown to candidates'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bond/Terms and Conditions */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            Bond Agreement & Terms
          </CardTitle>
          <CardDescription>
            Add terms and conditions that candidates must accept after submitting the interview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requireSignature"
              checked={requireSignature}
              onChange={(e) => setRequireSignature(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="requireSignature" className="cursor-pointer">
              Require digital signature before submission
            </Label>
          </div>

          {requireSignature && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bondYears">Bond Period (Years)</Label>
                  <Input
                    id="bondYears"
                    type="number"
                    min="1"
                    max="10"
                    value={bondYears}
                    onChange={(e) => setBondYears(e.target.value)}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val) < 1) {
                        setBondYears('1')
                      } else if (parseInt(val) > 10) {
                        setBondYears('10')
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500">Number of years for the bond agreement</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bondTiming">Show Bond Agreement</Label>
                  <Select value={bondTiming} onValueChange={(v: any) => setBondTiming(v)}>
                    <SelectTrigger id="bondTiming">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before_submission">Before submission (after completing test)</SelectItem>
                      <SelectItem value="before_start">Before test starts (must sign to begin)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    {bondTiming === 'before_start'
                      ? 'Candidate must sign the bond before they can start answering questions'
                      : 'Candidate signs the bond after completing the test, before final submission'
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bondTerms">Terms and Conditions Text</Label>
                <Textarea
                  id="bondTerms"
                  value={bondTerms}
                  onChange={(e) => setBondTerms(e.target.value)}
                  rows={8}
                  placeholder="Enter the terms and conditions, bond details, certificate collection information, etc.&#10;&#10;Example:&#10;- Service bond: 2 years from joining date&#10;- Original certificates will be collected and returned after bond completion&#10;- Early exit penalty: Rs. 1,00,000&#10;- Non-compete clause for 6 months after exit"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  This text will be shown to candidates after they submit their interview
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bondDocument">Upload Bond Document (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="bondDocument"
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setBondDocumentFile(file)
                        // TODO: Upload to storage and get URL
                        toast.info('File selected. Upload will be implemented.')
                      }
                    }}
                  />
                  {bondDocumentFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBondDocumentFile(null)
                        setBondDocumentUrl('')
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Upload a Word/PDF document with detailed terms (optional). Accepted formats: .pdf, .doc, .docx, .txt
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>Generate questions with AI or add manually</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ai-generate">
                <Sparkles className="mr-2 h-4 w-4" />
                AI Generate
              </TabsTrigger>
              <TabsTrigger value="upload-document">
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </TabsTrigger>
              <TabsTrigger value="manual">
                <FileText className="mr-2 h-4 w-4" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            {/* AI Generate Tab */}
            <TabsContent value="ai-generate" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobDescription">Job Description *</Label>
                <Textarea
                  id="jobDescription"
                  placeholder="Describe the role and required skills..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numQuestions">Number of Questions</Label>
                  <Input
                    id="numQuestions"
                    type="number"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(e.target.value)}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val) < 1) {
                        setNumQuestions('1')
                      } else if (parseInt(val) > 10) {
                        setNumQuestions('10')
                      }
                    }}
                    min="1"
                    max="10"
                  />
                </div>
              </div>

              <Button onClick={handleGenerateQuestions} disabled={generating} className="w-full">
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Questions...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Questions with AI
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Upload Document Tab */}
            <TabsContent value="upload-document" className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors">
                <input
                  type="file"
                  id="document-upload"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.xlsx,.csv"
                  onChange={handleFileUpload}
                />
                <label htmlFor="document-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center">
                    {uploadedFile ? (
                      <>
                        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                        <p className="text-sm font-medium text-gray-900 mb-2">
                          File uploaded successfully!
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                          {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                        </p>
                      </>
                    ) : (
                      <>
                        <File className="h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-sm font-medium text-gray-900 mb-2">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">
                          PDF, Word, Image, Excel, or CSV (max 10MB)
                        </p>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {uploadedFile && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setUploadedFile(null)
                      const input = document.getElementById('document-upload') as HTMLInputElement
                      if (input) input.value = ''
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove File
                  </Button>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-medium mb-2">
                  📝 Document Format Tips:
                </p>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>Questions should be clearly numbered or separated</li>
                  <li>Include marks for each question if possible</li>
                  <li>Starter code and solutions will be extracted if present</li>
                  <li>Images will be processed using OCR</li>
                </ul>
              </div>

              <Button
                onClick={handleExtractQuestions}
                disabled={!uploadedFile || extracting}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting Questions...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Extract Questions from Document
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Manual Entry Tab */}
            <TabsContent value="manual" className="space-y-4">
              <Button onClick={handleAddManualQuestion} variant="outline" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Question
              </Button>
            </TabsContent>
          </Tabs>

          {/* Questions List */}
          {questions.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">
                  Questions ({questions.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="totalMarks" className="text-sm text-gray-600 whitespace-nowrap">Total Marks:</Label>
                  <Input
                    id="totalMarks"
                    type="number"
                    value={totalMarks}
                    onChange={(e) => handleTotalMarksChange(e.target.value)}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val) < 1) {
                        handleTotalMarksChange('1')
                      }
                    }}
                    min="1"
                    className="w-24 h-8"
                  />
                  <p className="text-xs text-gray-400">
                    (Assigned: {questions.reduce((sum, q) => sum + q.marks, 0)})
                  </p>
                </div>
              </div>
              {getAvailableMinutes() > 0 && (
                <p className="text-xs text-gray-500">
                  ⏱ Interview duration: {getAvailableMinutes()} min · ~{Math.floor(getAvailableMinutes() / questions.length)} min per question
                </p>
              )}

              {questions.map((question, index) => (
                <Card key={index} className="border-l-4 border-l-indigo-500">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Question {index + 1}</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteQuestion(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label>Question Text</Label>
                      <Textarea
                        value={question.question_text}
                        onChange={(e) => handleUpdateQuestion(index, 'question_text', e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select
                          value={question.difficulty}
                          onValueChange={(v) => handleUpdateQuestion(index, 'difficulty', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Marks</Label>
                        <Input
                          type="number"
                          value={question.marks}
                          onChange={(e) => handleUpdateQuestion(index, 'marks', parseInt(e.target.value) || 0)}
                          min="1"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Time (minutes)</Label>
                        <Input
                          type="number"
                          value={question.time_estimate_minutes || 30}
                          onChange={(e) =>
                            handleUpdateQuestion(index, 'time_estimate_minutes', parseInt(e.target.value) || 5)
                          }
                          min="5"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateInterview}
          disabled={loading || questions.length === 0}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Create Interview
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
