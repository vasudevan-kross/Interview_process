'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { getCampaign, updateCampaign, uploadVapiFile, deleteVapiFile, type Campaign } from '@/lib/api/voice-screening'
import { ArrowLeft, Loader2, Save, X, Upload, Trash2, FileText, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import Link from 'next/link'
import { toast } from 'sonner'

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Refs
  const questionImportRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState('')
  const [jobRole, setJobRole] = useState('')
  const [description, setDescription] = useState('')
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [technicalRequirements, setTechnicalRequirements] = useState('')
  const [interviewPersona, setInterviewPersona] = useState<'professional' | 'casual' | 'technical'>('professional')
  const [candidateType, setCandidateType] = useState<'fresher' | 'experienced' | 'general'>('general')
  const [interviewStyle, setInterviewStyle] = useState<'structured' | 'adaptive' | 'conversational'>('conversational')
  const [customQuestions, setCustomQuestions] = useState<string[]>([])
  const [requiredFields, setRequiredFields] = useState<string[]>([])
  const [knowledgeBaseFileIds, setKnowledgeBaseFileIds] = useState<string[]>([])
  const [questionInput, setQuestionInput] = useState('')
  const [fieldInput, setFieldInput] = useState('')
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useState('')

  useEffect(() => {
    loadCampaign()
  }, [resolvedParams.id])

  const loadCampaign = async () => {
    try {
      setLoading(true)
      const data = await getCampaign(resolvedParams.id)
      setCampaign(data)

      // Populate form
      setName(data.name)
      setJobRole(data.job_role)
      setDescription(data.description || '')
      setJobDescriptionText(data.job_description_text || '')
      setTechnicalRequirements(data.technical_requirements || '')
      setInterviewPersona(data.interview_persona)
      setCandidateType(data.candidate_type)
      setInterviewStyle(data.interview_style)
      setCustomQuestions(data.custom_questions || [])
      setRequiredFields(data.required_fields || [])
      setKnowledgeBaseFileIds(data.knowledge_base_file_ids || [])
      setGeneratedSystemPrompt(data.generated_system_prompt || '')
    } catch (err: any) {
      console.error('Failed to load campaign:', err)
      toast.error('Failed to load campaign')
      router.push('/dashboard/voice-screening/campaigns')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !jobRole.trim()) {
      toast.error('Name and Job Role are required')
      return
    }

    try {
      setSaving(true)
      await updateCampaign(resolvedParams.id, {
        name,
        job_role: jobRole,
        description,
        job_description_text: jobDescriptionText,
        technical_requirements: technicalRequirements,
        interview_persona: interviewPersona,
        candidate_type: candidateType,
        interview_style: interviewStyle,
        custom_questions: customQuestions,
        required_fields: requiredFields,
        knowledge_base_file_ids: knowledgeBaseFileIds,
        generated_system_prompt: generatedSystemPrompt,
      })
      toast.success('Campaign updated successfully!')
      router.push(`/dashboard/voice-screening/campaigns/${resolvedParams.id}`)
    } catch (err: any) {
      console.error('Failed to update campaign:', err)
      toast.error(err.response?.data?.detail || 'Failed to update campaign')
    } finally {
      setSaving(false)
    }
  }

  const addQuestion = () => {
    if (questionInput.trim()) {
      setCustomQuestions([...customQuestions, questionInput.trim()])
      setQuestionInput('')
    }
  }

  const removeQuestion = (index: number) => {
    setCustomQuestions(customQuestions.filter((_, i) => i !== index))
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

      setCustomQuestions(questions)
      toast.success(`Imported ${questions.length} questions from ${file.name}`)
    } catch (error) {
      console.error('Failed to import questions:', error)
      toast.error('Failed to import questions. Please check file format.')
    } finally {
      if (questionImportRef.current) {
        questionImportRef.current.value = ''
      }
    }
  }

  const addField = () => {
    if (fieldInput.trim()) {
      setRequiredFields([...requiredFields, fieldInput.trim()])
      setFieldInput('')
    }
  }

  const removeField = (index: number) => {
    setRequiredFields(requiredFields.filter((_, i) => i !== index))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const result = await uploadVapiFile(file)
      setKnowledgeBaseFileIds([...knowledgeBaseFileIds, result.file_id])
      toast.success(`File "${result.name}" uploaded successfully!`)
    } catch (err: any) {
      console.error('Failed to upload file:', err)
      toast.error('Failed to upload file')
    } finally {
      setUploading(false)
      e.target.value = '' // Reset input
    }
  }

  const removeFile = async (fileId: string, index: number) => {
    try {
      await deleteVapiFile(fileId)
      setKnowledgeBaseFileIds(knowledgeBaseFileIds.filter((_, i) => i !== index))
      toast.success('File removed successfully')
    } catch (err: any) {
      console.error('Failed to remove file:', err)
      toast.error('Failed to remove file')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      <PageHeader
        title="Edit Campaign"
        description="Update campaign settings, questions, and knowledge base."
        action={
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
            <Link href={`/dashboard/voice-screening/campaigns/${resolvedParams.id}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Campaign name and job details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Senior React Developer Screening - Q1 2026"
              />
            </div>

            <div className="space-y-2">
              <Label>Job Role *</Label>
              <Input
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder="e.g., Senior React Developer"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief overview of this campaign"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Interview Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Interview Configuration</CardTitle>
            <CardDescription>Customize interview style and persona</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Interview Persona</Label>
                <Select value={interviewPersona} onValueChange={(v: any) => setInterviewPersona(v)}>
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

              <div className="space-y-2">
                <Label>Candidate Type</Label>
                <Select value={candidateType} onValueChange={(v: any) => setCandidateType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fresher">Fresher</SelectItem>
                    <SelectItem value="experienced">Experienced</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Interview Style</Label>
                <Select value={interviewStyle} onValueChange={(v: any) => setInterviewStyle(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="structured">Structured</SelectItem>
                    <SelectItem value="adaptive">Adaptive</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Context */}
        <Card>
          <CardHeader>
            <CardTitle>Job Context (For AI)</CardTitle>
            <CardDescription>Provide context to generate better questions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Job Description</Label>
              <Textarea
                value={jobDescriptionText}
                onChange={(e) => setJobDescriptionText(e.target.value)}
                placeholder="Paste the full job description here..."
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Technical Requirements</Label>
              <Textarea
                value={technicalRequirements}
                onChange={(e) => setTechnicalRequirements(e.target.value)}
                placeholder="e.g., React, TypeScript, Node.js, 5+ years experience..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* AI-Generated System Prompt */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI-Generated System Prompt
            </CardTitle>
            <CardDescription>
              This is the prompt that guides VAPI AI during interviews. You can edit it to customize the interview behavior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt</Label>
              <Textarea
                id="system-prompt"
                value={generatedSystemPrompt}
                onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
                placeholder="AI-generated system prompt will appear here..."
                rows={12}
                className="font-mono text-sm bg-white"
              />
              <p className="text-xs text-gray-600">
                💡 Tip: The system prompt defines how VAPI AI conducts the interview. Make sure it clearly states that VAPI is the interviewer asking questions, not the candidate answering them.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Custom Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Questions</CardTitle>
            <CardDescription>
              Questions to ask during the interview. Import from CSV, Excel, or TXT files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                ref={questionImportRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleImportQuestions}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => questionImportRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Questions
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Add a question manually..."
                onKeyPress={(e) => e.key === 'Enter' && addQuestion()}
              />
              <Button onClick={addQuestion} type="button">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            {customQuestions.length > 0 && (
              <div className="space-y-2">
                {customQuestions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <span className="text-sm font-medium text-gray-500 min-w-[2rem]">{i + 1}.</span>
                    <span className="flex-1 text-sm">{q}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(i)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Required Fields */}
        <Card>
          <CardHeader>
            <CardTitle>Required Fields</CardTitle>
            <CardDescription>Data fields to extract from interviews</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                placeholder="e.g., react_experience_years, preferred_state_library"
                onKeyPress={(e) => e.key === 'Enter' && addField()}
              />
              <Button onClick={addField} type="button">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            {requiredFields.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {requiredFields.map((field, i) => (
                  <div key={i} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                    <span className="text-sm font-medium">{field}</span>
                    <button
                      onClick={() => removeField(i)}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base Files</CardTitle>
            <CardDescription>Upload documents for AI context (RAG)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-400 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt"
                disabled={uploading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-teal-600 mb-2" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                )}
                <p className="text-sm text-gray-600">
                  {uploading ? 'Uploading...' : 'Click to upload PDF, DOCX, or TXT'}
                </p>
              </label>
            </div>

            {knowledgeBaseFileIds.length > 0 && (
              <div className="space-y-2">
                {knowledgeBaseFileIds.map((fileId, i) => (
                  <div key={fileId} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <FileText className="h-4 w-4 text-green-600" />
                    <span className="flex-1 text-sm font-medium text-green-900">
                      Knowledge Base File {i + 1}
                    </span>
                    <span className="text-xs text-green-600">ID: {fileId.substring(0, 8)}...</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(fileId, i)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Link href={`/dashboard/voice-screening/campaigns/${resolvedParams.id}`}>
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
