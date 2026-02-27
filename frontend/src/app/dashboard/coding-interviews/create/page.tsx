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
  const [interviewType, setInterviewType] = useState<'coding' | 'testing' | 'both'>('coding')
  const [testFramework, setTestFramework] = useState('selenium-python')
  const [resumeRequired, setResumeRequired] = useState<'mandatory' | 'optional' | 'disabled'>('mandatory')

  // AI Generation
  const [jobDescription, setJobDescription] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [numQuestions, setNumQuestions] = useState(3)
  const [totalMarks, setTotalMarks] = useState(100)

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
    const marksPerQ = Math.floor(totalMarks / qs.length)
    const remainder = totalMarks - marksPerQ * qs.length
    return qs.map((q, i) => ({
      ...q,
      time_estimate_minutes: timePerQ,
      marks: marksPerQ + (i < remainder ? 1 : 0),
    }))
  }

  // Redistribute marks when total marks changes
  const handleTotalMarksChange = (newTotal: number) => {
    setTotalMarks(newTotal)
    if (questions.length > 0) {
      const marksPerQ = Math.floor(newTotal / questions.length)
      const remainder = newTotal - marksPerQ * questions.length
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
        num_questions: numQuestions,
        programming_language: interviewType === 'coding' ? programmingLanguage : undefined,
        test_framework: interviewType === 'testing' ? testFramework : undefined,
        interview_type: interviewType,
      })

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
    const marksPerQ = Math.floor(totalMarks / newCount)
    const remainder = totalMarks - marksPerQ * newCount
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
    if (questions.length === 0) {
      toast.error('Please add at least one question')
      return
    }

    try {
      setLoading(true)
      const response = await createInterview({
        title,
        description,
        scheduled_start_time: scheduledStartTime,
        scheduled_end_time: scheduledEndTime,
        programming_language: programmingLanguage === 'any' ? 'python' : programmingLanguage,
        allowed_languages: programmingLanguage === 'any' ? [] : undefined,
        interview_type: interviewType,
        grace_period_minutes: gracePeriodMinutes,
        resume_required: resumeRequired,
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
          Create Coding Interview
        </h1>
        <p className="text-gray-600 mt-2">Set up a time-bound interview with AI-generated or custom questions</p>
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
              <Select value={interviewType} onValueChange={(v: any) => setInterviewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coding">Coding (Algorithms, Development)</SelectItem>
                  <SelectItem value="testing">Testing/QA (Test Cases, Automation)</SelectItem>
                  <SelectItem value="both">Both (Mixed)</SelectItem>
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
              <Label htmlFor="startTime">
                <Calendar className="inline h-4 w-4 mr-1" />
                Start Time *
              </Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">
                <Clock className="inline h-4 w-4 mr-1" />
                End Time *
              </Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={scheduledEndTime}
                onChange={(e) => setScheduledEndTime(e.target.value)}
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
            <div className="space-y-2">
              <Label htmlFor="language">Programming Language</Label>
              <Select value={programmingLanguage} onValueChange={setProgrammingLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Language (Candidate's Choice)</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="java">Java</SelectItem>
                  <SelectItem value="cpp">C++</SelectItem>
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
                    onChange={(e) => setNumQuestions(parseInt(e.target.value) || 1)}
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
                    onChange={(e) => handleTotalMarksChange(parseInt(e.target.value) || 0)}
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

                    <div className="space-y-2">
                      <Label>Starter Code (optional)</Label>
                      <Textarea
                        value={question.starter_code || ''}
                        onChange={(e) => handleUpdateQuestion(index, 'starter_code', e.target.value)}
                        rows={4}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Solution Code (for evaluation)</Label>
                      <Textarea
                        value={question.solution_code || ''}
                        onChange={(e) => handleUpdateQuestion(index, 'solution_code', e.target.value)}
                        rows={4}
                        className="font-mono text-sm"
                      />
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
