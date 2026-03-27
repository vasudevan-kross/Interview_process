'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { createCampaign, uploadFileToVapi, deleteVapiFile } from '@/lib/api/voice-screening'
import { Plus, Trash2, Loader2, Upload, Sparkles, FileText, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api/client'
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance } from '@/lib/api/credits'

const AVAILABLE_FIELDS = [
  { id: 'email', label: 'Email Address', default: true },
  { id: 'phone', label: 'Phone Number', default: true },
  { id: 'current_work_location', label: 'Current Work Location', default: false },
  { id: 'current_employer', label: 'Current Employer', default: false },
  { id: 'current_role', label: 'Current Role', default: false },
  { id: 'total_experience', label: 'Total Experience', default: false },
  { id: 'technical_skills', label: 'Technical Skills', default: true },
  { id: 'certifications', label: 'Certifications', default: false },
  { id: 'current_ctc', label: 'Current CTC', default: false },
  { id: 'expected_ctc', label: 'Expected CTC', default: false },
  { id: 'notice_period', label: 'Notice Period', default: false },
  { id: 'availability', label: 'Availability', default: false },
]

export default function CreateCampaignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pipelineJobId = searchParams.get('job_id')
  const [loading, setLoading] = useState(false)
  const [generatingQuestions, setGeneratingQuestions] = useState(false)

  // Fetch credit balance
  const { data: balance } = useQuery({
    queryKey: ['credit-balance'],
    queryFn: getCreditBalance,
  })
  const [showAIDialog, setShowAIDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const knowledgeBaseInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    name: '',
    job_role: '',
    description: '',
    job_description_text: '',
    technical_requirements: '',
    custom_questions: [''],
    required_fields: AVAILABLE_FIELDS.filter(f => f.default).map(f => f.id),
    interview_persona: 'professional' as const,
    candidate_type: 'general' as const,
    interview_style: 'conversational' as const,
    knowledge_base_file_ids: [] as string[],
    // Scheduling fields
    scheduled_start_time: '',
    scheduled_end_time: '',
    grace_period_minutes: 15,
  })

  const [uploadedFiles, setUploadedFiles] = useState<Array<{id: string, name: string}>>([])

  const [aiConfig, setAiConfig] = useState({
    num_questions: 5,
    selected_fields: [] as string[],
    question_basis: ['job_description', 'job_role'] as string[],
    enable_adaptive_questioning: true
  })

  const handleAddQuestion = () => {
    setFormData(prev => ({
      ...prev,
      custom_questions: [...prev.custom_questions, '']
    }))
  }

  const handleRemoveQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      custom_questions: prev.custom_questions.filter((_, i) => i !== index)
    }))
  }

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...formData.custom_questions]
    updated[index] = value
    setFormData(prev => ({ ...prev, custom_questions: updated }))
  }

  const handleFieldToggle = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      required_fields: prev.required_fields.includes(fieldId)
        ? prev.required_fields.filter(f => f !== fieldId)
        : [...prev.required_fields, fieldId]
    }))
  }

  const handleImportQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      let questions: string[] = []

      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        // Handle CSV and TXT files
        const text = await file.text()
        questions = text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Handle Excel files
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })

        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to JSON (array of arrays)
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        // Extract questions from first column, skip header row
        questions = data
          .slice(1) // Skip header row
          .map(row => String(row[0] || '').trim())
          .filter(q => q && !q.startsWith('#'))
      } else {
        toast.error('Please upload a CSV, TXT, or Excel (.xlsx, .xls) file')
        return
      }

      if (questions.length === 0) {
        toast.error('No questions found in file. Make sure questions are in the first column.')
        return
      }

      setFormData(prev => ({
        ...prev,
        custom_questions: questions
      }))

      toast.success(`Imported ${questions.length} questions from ${file.name}`)
    } catch (error) {
      console.error('Failed to import questions:', error)
      toast.error('Failed to import questions. Please check file format.')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const result = await uploadFileToVapi(file)

      setUploadedFiles(prev => [...prev, { id: result.file_id, name: result.name }])
      setFormData(prev => ({
        ...prev,
        knowledge_base_file_ids: [...prev.knowledge_base_file_ids, result.file_id]
      }))

      toast.success(`Uploaded ${result.name}`)
    } catch (error) {
      console.error('Failed to upload file:', error)
      toast.error('Failed to upload file to VAPI')
    } finally {
      setUploading(false)
      if (knowledgeBaseInputRef.current) {
        knowledgeBaseInputRef.current.value = ''
      }
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    try {
      await deleteVapiFile(fileId)
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
      setFormData(prev => ({
        ...prev,
        knowledge_base_file_ids: prev.knowledge_base_file_ids.filter(id => id !== fileId)
      }))
      toast.success('File removed')
    } catch (error) {
      console.error('Failed to remove file:', error)
      toast.error('Failed to remove file')
    }
  }

  const handleOpenAIDialog = () => {
    if (!formData.job_role.trim()) {
      toast.error('Please enter a job role first')
      return
    }
    setShowAIDialog(true)
  }

  const handleGenerateQuestions = async () => {
    try {
      setGeneratingQuestions(true)
      setShowAIDialog(false)

      // Build the prompt with selected fields context
      let contextualJobRole = formData.job_role
      if (aiConfig.selected_fields.length > 0) {
        const fieldLabels = aiConfig.selected_fields
          .map(fieldId => AVAILABLE_FIELDS.find(f => f.id === fieldId)?.label)
          .filter(Boolean)
        contextualJobRole = `${formData.job_role} (focus on: ${fieldLabels.join(', ')})`
      }

      const response = await apiClient['client'].post('/api/v1/voice-screening/generate-questions', {
        job_role: contextualJobRole,
        candidate_type: formData.candidate_type,
        num_questions: aiConfig.num_questions,
        job_description_text: formData.job_description_text,
        technical_requirements: formData.technical_requirements,
        question_basis: aiConfig.question_basis,
        enable_adaptive_questioning: aiConfig.enable_adaptive_questioning,
        focus_areas: aiConfig.selected_fields.length > 0 ? aiConfig.selected_fields : undefined
      })

      const generatedQuestions = response.data.questions || []

      setFormData(prev => ({
        ...prev,
        custom_questions: generatedQuestions
      }))

      toast.success(`Generated ${generatedQuestions.length} questions using AI`)
    } catch (error: any) {
      console.error('Failed to generate questions:', error)
      toast.error(error.response?.data?.detail || 'Failed to generate questions')
    } finally {
      setGeneratingQuestions(false)
    }
  }

  const handleAIFieldToggle = (fieldId: string) => {
    setAiConfig(prev => ({
      ...prev,
      selected_fields: prev.selected_fields.includes(fieldId)
        ? prev.selected_fields.filter(f => f !== fieldId)
        : [...prev.selected_fields, fieldId]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Filter out empty questions
      const cleanedQuestions = formData.custom_questions.filter(q => q.trim())

      // DateTimePicker already provides datetime-local format, convert to ISO
      const payload = {
        ...formData,
        custom_questions: cleanedQuestions,
        scheduled_start_time: formData.scheduled_start_time
          ? new Date(formData.scheduled_start_time).toISOString()
          : null,
        scheduled_end_time: formData.scheduled_end_time
          ? new Date(formData.scheduled_end_time).toISOString()
          : null,
        ...(pipelineJobId ? { job_id: pipelineJobId } : {})
      }

      const campaign = await createCampaign(payload)

      // If created from pipeline, navigate back to pipeline
      if (pipelineJobId) {
        toast.success('Campaign created! Returning to pipeline...')
        router.push('/dashboard/pipeline')
        return
      }

      toast.success('Campaign created successfully!')
      router.push(`/dashboard/voice-screening/campaigns/${campaign.id}`)
    } catch (error: any) {
      console.error('Failed to create campaign:', error)
      toast.error(error.response?.data?.detail || 'Failed to create campaign. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <PageHeader
        title="Create Voice Screening Campaign"
        backHref="/dashboard/voice-screening"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>Basic information about this screening campaign</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Senior Backend Developer Screening"
                required
              />
            </div>

            <div>
              <Label htmlFor="job_role">Job Role *</Label>
              <Input
                id="job_role"
                value={formData.job_role}
                onChange={(e) => setFormData(prev => ({ ...prev, job_role: e.target.value }))}
                placeholder="e.g., Senior Backend Developer"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this campaign..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Job Context (NEW) */}
        <Card>
          <CardHeader>
            <CardTitle>Job Context (Optional)</CardTitle>
            <CardDescription>
              Provide context for the AI to ask relevant, intelligent questions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="job_description">Job Description</Label>
              <Textarea
                id="job_description"
                value={formData.job_description_text}
                onChange={(e) => setFormData(prev => ({ ...prev, job_description_text: e.target.value }))}
                placeholder="Full job description, responsibilities, team structure..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground mt-1">
                The AI will use this to ask context-aware questions about specific responsibilities
              </p>
            </div>

            <div>
              <Label htmlFor="technical_requirements">Technical Requirements</Label>
              <Textarea
                id="technical_requirements"
                value={formData.technical_requirements}
                onChange={(e) => setFormData(prev => ({ ...prev, technical_requirements: e.target.value }))}
                placeholder="React, TypeScript, Node.js, AWS, Docker, Kubernetes..."
                rows={3}
              />
              <p className="text-sm text-muted-foreground mt-1">
                List the key technologies and skills required for this role
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Interview Style (NEW) */}
        <Card>
          <CardHeader>
            <CardTitle>Interview Style</CardTitle>
            <CardDescription>
              Choose how the AI conducts the interview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="interview_style">Conversation Style</Label>
              <Select
                value={formData.interview_style}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, interview_style: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="structured">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Structured</span>
                      <span className="text-xs text-muted-foreground">Fixed questions in exact order</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="adaptive">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Adaptive</span>
                      <span className="text-xs text-muted-foreground">Core questions + 2-3 follow-ups</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="conversational">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Conversational (Recommended)</span>
                      <span className="text-xs text-muted-foreground">Dynamic, natural conversation</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="interview_persona">Interview Tone</Label>
              <Select
                value={formData.interview_persona}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, interview_persona: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="candidate_type">Candidate Level</Label>
              <Select
                value={formData.candidate_type}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, candidate_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresher">Fresher (0-2 years)</SelectItem>
                  <SelectItem value="experienced">Experienced (3+ years)</SelectItem>
                  <SelectItem value="general">General (Adaptive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle>Interview Scheduling</CardTitle>
            <CardDescription>
              Set time window and grace period for voice interviews (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduled_start_time">Start Time (Optional)</Label>
                <DateTimePicker
                  value={formData.scheduled_start_time}
                  onChange={(value) => setFormData(prev => ({
                    ...prev,
                    scheduled_start_time: value
                  }))}
                  placeholder="Select start date & time"
                  minDate={new Date()}
                />
                <p className="text-xs text-slate-500 mt-1">
                  When interviews can begin
                </p>
              </div>

              <div>
                <Label htmlFor="scheduled_end_time">End Time (Optional)</Label>
                <DateTimePicker
                  value={formData.scheduled_end_time}
                  onChange={(value) => setFormData(prev => ({
                    ...prev,
                    scheduled_end_time: value
                  }))}
                  placeholder="Select end date & time"
                  minDate={formData.scheduled_start_time ? new Date(formData.scheduled_start_time) : new Date()}
                />
                <p className="text-xs text-slate-500 mt-1">
                  When interviews must end
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="grace_period_minutes">Grace Period (Minutes)</Label>
              <Input
                id="grace_period_minutes"
                type="number"
                min="0"
                max="120"
                value={formData.grace_period_minutes}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  grace_period_minutes: parseInt(e.target.value) || 15
                }))}
                className="max-w-xs"
              />
              <p className="text-xs text-slate-500 mt-1">
                Extra time allowed after scheduled end time
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Base (NEW) */}
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base (Optional)</CardTitle>
            <CardDescription>
              Upload documents for AI context (job descriptions, technical docs, company info)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Upload Files</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Supports PDF, DOCX, TXT, MD files
              </p>

              <div className="flex items-center gap-2">
                <Input
                  ref={knowledgeBaseInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="cursor-pointer"
                />
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Uploaded Files ({uploadedFiles.length})</Label>
                {uploadedFiles.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between bg-muted p-3 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interview Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Interview Questions</CardTitle>
            <CardDescription>
              Questions the AI will ask (or use as guidance for conversational style). Import from CSV, Excel, or TXT files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleImportQuestions}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Questions
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenAIDialog}
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

            <div className="space-y-2">
              {formData.custom_questions.map((question, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => handleQuestionChange(index, e.target.value)}
                    placeholder={`Question ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveQuestion(index)}
                    disabled={formData.custom_questions.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddQuestion}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </CardContent>
        </Card>

        {/* Required Fields */}
        <Card>
          <CardHeader>
            <CardTitle>Information to Extract</CardTitle>
            <CardDescription>
              Select which information the AI should extract during the conversation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_FIELDS.map(field => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={field.id}
                    checked={formData.required_fields.includes(field.id)}
                    onCheckedChange={() => handleFieldToggle(field.id)}
                  />
                  <Label
                    htmlFor={field.id}
                    className="cursor-pointer font-normal text-sm"
                  >
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Credit Cost Information */}
        <CreditCostBanner
          featureName="Voice Screening Calls"
          cost={75}
          currentBalance={balance?.balance}
          breakdown={[
            '15 credits per minute of voice call',
            '3 credits for AI-generated call summary',
            'Example: 5-minute call = 75 credits (call) + 3 credits (summary) = 78 credits total',
          ]}
          message="Credits are held when call starts and actual usage is charged when call ends. Unused credits are automatically refunded."
        />

        {/* Submit */}
        <div className="flex gap-4">
          <Link href="/dashboard/voice-screening">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading || generatingQuestions}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Campaign...
              </>
            ) : generatingQuestions ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating AI Prompts...
              </>
            ) : (
              'Create Campaign'
            )}
          </Button>
        </div>
      </form>

      {/* AI Question Generation Dialog */}
      <AlertDialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Questions with AI</AlertDialogTitle>
            <AlertDialogDescription>
              Configure AI question generation for {formData.job_role}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-6 py-4">
            {/* Number of Questions */}
            <div>
              <Label htmlFor="num_questions">Number of Questions</Label>
              <Input
                id="num_questions"
                type="number"
                min={1}
                max={20}
                value={aiConfig.num_questions}
                onChange={(e) => setAiConfig(prev => ({ ...prev, num_questions: parseInt(e.target.value) || 5 }))}
                className="mt-2"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Generate between 1 and 20 questions
              </p>
            </div>

            {/* Question Basis */}
            <div>
              <Label htmlFor="question_basis">Question Basis</Label>
              <p className="text-sm text-muted-foreground mb-2">
                What should the questions be based on?
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="basis_job_description"
                    checked={aiConfig.question_basis?.includes('job_description')}
                    onCheckedChange={(checked) => {
                      setAiConfig(prev => ({
                        ...prev,
                        question_basis: checked
                          ? [...(prev.question_basis || []), 'job_description']
                          : (prev.question_basis || []).filter(b => b !== 'job_description')
                      }))
                    }}
                  />
                  <Label htmlFor="basis_job_description" className="cursor-pointer font-normal">
                    Job Description & Requirements
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="basis_technical"
                    checked={aiConfig.question_basis?.includes('technical_requirements')}
                    onCheckedChange={(checked) => {
                      setAiConfig(prev => ({
                        ...prev,
                        question_basis: checked
                          ? [...(prev.question_basis || []), 'technical_requirements']
                          : (prev.question_basis || []).filter(b => b !== 'technical_requirements')
                      }))
                    }}
                  />
                  <Label htmlFor="basis_technical" className="cursor-pointer font-normal">
                    Technical Skills & Competencies
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="basis_role"
                    checked={aiConfig.question_basis?.includes('job_role')}
                    onCheckedChange={(checked) => {
                      setAiConfig(prev => ({
                        ...prev,
                        question_basis: checked
                          ? [...(prev.question_basis || []), 'job_role']
                          : (prev.question_basis || []).filter(b => b !== 'job_role')
                      }))
                    }}
                  />
                  <Label htmlFor="basis_role" className="cursor-pointer font-normal">
                    Job Role & Responsibilities
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="basis_knowledge_base"
                    checked={aiConfig.question_basis?.includes('knowledge_base')}
                    onCheckedChange={(checked) => {
                      setAiConfig(prev => ({
                        ...prev,
                        question_basis: checked
                          ? [...(prev.question_basis || []), 'knowledge_base']
                          : (prev.question_basis || []).filter(b => b !== 'knowledge_base')
                      }))
                    }}
                  />
                  <Label htmlFor="basis_knowledge_base" className="cursor-pointer font-normal">
                    Knowledge Base Files (if uploaded)
                  </Label>
                </div>
              </div>
            </div>

            {/* Adaptive Questioning */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="enable_adaptive"
                  checked={aiConfig.enable_adaptive_questioning}
                  onCheckedChange={(checked) => {
                    setAiConfig(prev => ({ ...prev, enable_adaptive_questioning: checked === true }))
                  }}
                />
                <Label htmlFor="enable_adaptive" className="cursor-pointer font-medium">
                  Enable Adaptive Questioning
                </Label>
              </div>
              <p className="text-sm text-muted-foreground pl-6">
                Allow the AI to ask follow-up questions based on candidate responses. This creates a more natural conversation flow and can probe deeper into areas of interest.
              </p>
            </div>

            {/* Field Selection */}
            <div>
              <Label>Focus Areas (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Select specific fields you want the AI to focus on when generating questions
              </p>
              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto border rounded-md p-4">
                {AVAILABLE_FIELDS.map(field => (
                  <div key={field.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`ai-${field.id}`}
                      checked={aiConfig.selected_fields.includes(field.id)}
                      onCheckedChange={() => handleAIFieldToggle(field.id)}
                    />
                    <Label htmlFor={`ai-${field.id}`} className="cursor-pointer font-normal text-sm">
                      {field.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={generatingQuestions}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateQuestions} disabled={generatingQuestions}>
              {generatingQuestions ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Questions
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
