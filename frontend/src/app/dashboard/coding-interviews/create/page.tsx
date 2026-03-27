'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  ArrowLeft,
} from 'lucide-react'
import { createInterview, generateQuestions, generateShareableLink, extractQuestionsFromDocument, type Question } from '@/lib/api/coding-interviews'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { PageHeader } from '@/components/ui/page-header'
import { toast } from 'sonner'
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance } from '@/lib/api/credits'

/**
 * Convert a datetime-local string (treated as LOCAL time) to an ISO 8601
 * string with the browser's UTC offset, so the server stores the correct
 * wall-clock time rather than silently subtracting the UTC offset.
 */
function localToIso(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  const d = new Date(datetimeLocal)
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mm = String(absMin % 60).padStart(2, '0')
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${hh}:${mm}`
  )
}

export default function CreateInterviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pipelineJobId = searchParams.get('job_id')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [activeTab, setActiveTab] = useState('ai-generate')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  // Fetch credit balance
  const { data: balance } = useQuery({
    queryKey: ['credit-balance'],
    queryFn: getCreditBalance,
  })

  // Interview details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledStartTime, setScheduledStartTime] = useState('')
  const [scheduledEndTime, setScheduledEndTime] = useState('')
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(15)
  const [programmingLanguage, setProgrammingLanguage] = useState('python')
  const [interviewType, setInterviewType] = useState('coding')
  const [testFramework, setTestFramework] = useState('selenium-python')
  const [domainTool, setDomainTool] = useState('')
  const [resumeRequired, setResumeRequired] = useState<'mandatory' | 'optional' | 'disabled'>('mandatory')

  // Bond/Terms fields
  const [bondTerms, setBondTerms] = useState('')
  const [bondDocumentUrl, setBondDocumentUrl] = useState('')
  const [requireSignature, setRequireSignature] = useState(true)
  const [bondYears, setBondYears] = useState<string>('2')
  const [bondTiming, setBondTiming] = useState<'before_start' | 'before_submission'>('before_submission')
  const [bondDocumentFile, setBondDocumentFile] = useState<File | null>(null)

  // AI Generation
  const [jobDescription, setJobDescription] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [numQuestions, setNumQuestions] = useState<string>('3')
  const [totalMarks, setTotalMarks] = useState<string>('100')

  const MAX_AI_QUESTIONS = 5 // Limit for reliable AI generation

  // Questions
  const [questions, setQuestions] = useState<Question[]>([])
  const [shareableLink, setShareableLink] = useState('')

  const getAvailableMinutes = () => {
    if (!scheduledStartTime || !scheduledEndTime) return 0
    const start = new Date(scheduledStartTime).getTime()
    const end = new Date(scheduledEndTime).getTime()
    return Math.max(0, Math.floor((end - start) / 60000))
  }

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

  // Sync question times when duration changes
  useEffect(() => {
    if (questions.length === 0) return
    setQuestions(prev => distributeTimeAndMarks(prev))
  }, [scheduledStartTime, scheduledEndTime])

  const handleGenerateQuestions = async () => {
    if (!jobDescription.trim()) {
      toast.error('Please enter a job description')
      return
    }

    const numQs = parseInt(numQuestions) || 3
    if (numQs > MAX_AI_QUESTIONS) {
      toast.error(`AI can reliably generate up to ${MAX_AI_QUESTIONS} questions. Use "Add Manual Question" for more.`)
      return
    }

    try {
      setGenerating(true)
      const response = await generateQuestions({
        job_description: jobDescription,
        difficulty,
        num_questions: numQs,
        programming_language: interviewType === 'coding' || interviewType === 'fullstack' || interviewType === 'data_science' ? programmingLanguage : undefined,
        test_framework: interviewType === 'testing' ? testFramework : undefined,
        domain_tool: ['devops', 'sql'].includes(interviewType) ? domainTool : undefined,
        interview_type: interviewType,
      })

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
    if (!title.trim()) {
      toast.error('Please enter interview title')
      return
    }
    if (!scheduledStartTime || !scheduledEndTime) {
      toast.error('Please select start and end times')
      return
    }

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
      const effectiveLanguage = interviewType === 'testing'
        ? testFramework
        : (['devops', 'sql', 'system_design', 'data_science', 'fullstack'].includes(interviewType)
          ? (domainTool || interviewType)
          : programmingLanguage)

      const response = await createInterview({
        title,
        description,
        scheduled_start_time: localToIso(scheduledStartTime),
        scheduled_end_time: localToIso(scheduledEndTime),
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
        job_id: pipelineJobId || undefined,
        questions,
      })

      // If created from pipeline, navigate back to pipeline
      if (pipelineJobId) {
        toast.success('Assessment created! Returning to pipeline...')
        router.push('/dashboard/pipeline')
        return
      }

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

  // ── Success screen ──────────────────────────────────────────────────────────
  if (shareableLink) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-xl">Interview Created!</CardTitle>
            <CardDescription>Share this link with your candidates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Shareable Link</p>
              <p className="font-mono text-sm break-all text-slate-800">{shareableLink}</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCopyLink} className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
              <Button onClick={handleShareWhatsApp} variant="outline" className="flex-1">
                <Share2 className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>

            <Button
              onClick={() => router.push('/dashboard/coding-interviews')}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Interviews
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Technical Assessment"
        description="Set up a time-bound assessment with AI-generated or custom questions."
        action={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        }
      />

      {/* ── Section 1: Interview Details ── */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Interview Details</CardTitle>
          <CardDescription>Basic information about the assessment</CardDescription>
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
                  <SelectItem value="testing">Testing / QA (Test Cases, Automation)</SelectItem>
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
              rows={2}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>
                <Calendar className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                Start Time *
              </Label>
              <DateTimePicker
                value={scheduledStartTime}
                onChange={(start) => {
                  setScheduledStartTime(start)
                  if (start) {
                    const pad = (n: number) => String(n).padStart(2, '0')
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
                <Clock className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
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
              <Label htmlFor="gracePeriod">Grace Period (mins)</Label>
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

          {/* Conditional language/tool selectors */}
          <div className="grid gap-4 md:grid-cols-2">
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
                <p className="text-xs text-slate-500">
                  {programmingLanguage === 'any'
                    ? 'Candidates can write in any programming language'
                    : `Interview will use ${programmingLanguage.toUpperCase()}`}
                </p>
              </div>
            )}

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
              <Label htmlFor="resumeRequired">Resume Upload</Label>
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
              <p className="text-xs text-slate-500">
                {resumeRequired === 'mandatory' && 'Candidates must upload resume to complete interview'}
                {resumeRequired === 'optional' && 'Candidates can optionally upload resume after submission'}
                {resumeRequired === 'disabled' && 'Resume upload will not be shown to candidates'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Bond / Terms ── */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            Bond Agreement & Terms
          </CardTitle>
          <CardDescription>
            Optional terms that candidates must accept before or after the assessment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requireSignature"
              checked={requireSignature}
              onChange={(e) => setRequireSignature(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            <Label htmlFor="requireSignature" className="cursor-pointer text-sm font-medium text-slate-700">
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
                      if (val === '' || parseInt(val) < 1) setBondYears('1')
                      else if (parseInt(val) > 10) setBondYears('10')
                    }}
                  />
                  <p className="text-xs text-slate-500">Number of years for the bond agreement</p>
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
                  <p className="text-xs text-slate-500">
                    {bondTiming === 'before_start'
                      ? 'Candidate must sign the bond before they can start answering questions'
                      : 'Candidate signs the bond after completing the test, before final submission'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bondTerms">Terms and Conditions Text</Label>
                <Textarea
                  id="bondTerms"
                  value={bondTerms}
                  onChange={(e) => setBondTerms(e.target.value)}
                  rows={6}
                  placeholder={`Enter bond terms, conditions, and certificate details...\n\nExample:\n- Service bond: 2 years from joining date\n- Original certificates collected and returned after bond completion\n- Early exit penalty: Rs. 1,00,000\n- Non-compete clause for 6 months after exit`}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500">This text will be shown to candidates when signing</p>
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
                        toast.info('File selected. Upload will be implemented.')
                      }
                    }}
                  />
                  {bondDocumentFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setBondDocumentFile(null); setBondDocumentUrl('') }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Accepted: .pdf, .doc, .docx, .txt
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Questions ── */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>Generate with AI, extract from a document, or write manually</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-lg mb-4">
              <TabsTrigger
                value="ai-generate"
                className="rounded-md text-sm data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI Generate
              </TabsTrigger>
              <TabsTrigger
                value="upload-document"
                className="rounded-md text-sm data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="rounded-md text-sm data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
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
                  placeholder="Describe the role and required skills. AI will detect the interview type and generate relevant questions automatically."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
                  <Label htmlFor="numQuestions">Number of Questions (Max {MAX_AI_QUESTIONS})</Label>
                  <Input
                    id="numQuestions"
                    type="number"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(e.target.value)}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val) < 1) setNumQuestions('1')
                      else if (parseInt(val) > MAX_AI_QUESTIONS) setNumQuestions(MAX_AI_QUESTIONS.toString())
                    }}
                    min="1"
                    max={MAX_AI_QUESTIONS}
                  />
                  <p className="text-xs text-slate-500">
                    Need more? Generate {MAX_AI_QUESTIONS}, then click "Add Manual Question" below to add more.
                  </p>
                </div>
              </div>

              {/* Credit Cost Banner */}
              <CreditCostBanner
                featureName="AI Question Generation"
                cost={4}
                currentBalance={balance?.balance}
                message="Generates coding/testing questions based on your job description"
              />

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
              <div className="flex justify-end mb-2">
                <a href="/samples/coding-interviews/sample_question_bank.csv" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample CSV</a>
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-indigo-300 transition-colors">
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
                        <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
                        <p className="text-sm font-medium text-slate-900 mb-1">File ready</p>
                        <p className="text-xs text-slate-500">
                          {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                        </p>
                      </>
                    ) : (
                      <>
                        <File className="h-10 w-10 text-slate-300 mb-3" />
                        <p className="text-sm font-medium text-slate-700 mb-1">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-slate-400">
                          PDF, Word, Image, Excel, or CSV (max 10 MB)
                        </p>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {uploadedFile && (
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
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Document Format Tips</p>
                <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                  <li>Questions should be clearly numbered or separated</li>
                  <li>Include marks per question where possible</li>
                  <li>Starter code and solutions will be extracted if present</li>
                  <li>Images and handwriting processed via OCR</li>
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
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                <Code className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 mb-4">Add questions one by one</p>
                <Button onClick={handleAddManualQuestion} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Question
                </Button>
              </div>
            </TabsContent>

          </Tabs>

          {/* Questions List */}
          {questions.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Questions ({questions.length})
                  </h3>
                  {getAvailableMinutes() > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {getAvailableMinutes()} min total · ~{Math.floor(getAvailableMinutes() / questions.length)} min per question
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="totalMarks" className="text-xs text-slate-500 whitespace-nowrap">Total Marks</Label>
                  <Input
                    id="totalMarks"
                    type="number"
                    value={totalMarks}
                    onChange={(e) => handleTotalMarksChange(e.target.value)}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val) < 1) handleTotalMarksChange('1')
                    }}
                    min="1"
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    ({questions.reduce((sum, q) => sum + q.marks, 0)} assigned)
                  </span>
                </div>
              </div>

              {questions.map((question, index) => (
                <Card key={index} className="border border-slate-200 bg-white">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-semibold flex items-center justify-center">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-slate-700">Question {index + 1}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteQuestion(index)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-500">Question Text</Label>
                      <Textarea
                        value={question.question_text}
                        onChange={(e) => handleUpdateQuestion(index, 'question_text', e.target.value)}
                        rows={3}
                        placeholder="Enter question here..."
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">Difficulty</Label>
                        <Select
                          value={question.difficulty}
                          onValueChange={(v) => handleUpdateQuestion(index, 'difficulty', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">Marks</Label>
                        <Input
                          type="number"
                          value={question.marks}
                          onChange={(e) => handleUpdateQuestion(index, 'marks', parseInt(e.target.value) || 0)}
                          min="1"
                          className="h-9"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">Time (minutes)</Label>
                        <Input
                          type="number"
                          value={question.time_estimate_minutes || 30}
                          onChange={(e) =>
                            handleUpdateQuestion(index, 'time_estimate_minutes', parseInt(e.target.value) || 5)
                          }
                          min="5"
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-500">Topics (comma-separated)</Label>
                      <Input
                        value={Array.isArray(question.topics) ? question.topics.join(', ') : ''}
                        onChange={(e) => handleUpdateQuestion(index, 'topics', e.target.value.split(',').map(t => t.trim()).filter(t => t))}
                        placeholder="e.g., arrays, sorting, recursion"
                        className="h-9"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(activeTab === 'manual' || activeTab === 'ai-generate' || activeTab === 'upload-document') && (
                <Button onClick={handleAddManualQuestion} variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {activeTab === 'ai-generate' || activeTab === 'upload-document' ? 'Add Manual Question' : 'Add Another Question'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer actions ── */}
      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateInterview}
          disabled={loading || questions.length === 0}
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
