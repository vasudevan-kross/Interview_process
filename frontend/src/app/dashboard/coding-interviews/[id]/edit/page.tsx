'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import {
  ChevronLeft,
  Loader2,
  Save,
  FileText,
  Plus,
  Trash2,
  Calendar,
  Clock,
} from 'lucide-react'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { getInterview, updateInterview, type Interview, type Question } from '@/lib/api/coding-interviews'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { format } from 'date-fns'

/** Convert ISO string → datetime-local input value in LOCAL time (YYYY-MM-DDTHH:mm) */
function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso)
    // Shift to local time and format
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    )
  } catch {
    return ''
  }
}

/**
 * Convert a datetime-local string (no timezone, treated as LOCAL) to an ISO 8601
 * string that includes the browser's UTC offset — so the server stores the
 * correct wall-clock time instead of silently subtracting the UTC offset.
 *
 * Example (IST = UTC+5:30):
 *   "2025-03-09T16:00" → "2025-03-09T16:00:00+05:30"
 */
function localToIso(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  const d = new Date(datetimeLocal)          // parsed as local time by the browser
  const offsetMin = -d.getTimezoneOffset()   // e.g. +330 for IST
  const sign = offsetMin >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mm = String(absMin % 60).padStart(2, '0')
  // Build ISO string with explicit offset so it round-trips correctly
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${hh}:${mm}`
  )
}

export default function EditInterviewPage() {
  const params = useParams()
  const router = useRouter()
  const interviewId = params.id as string

  const [interview, setInterview] = useState<Interview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Basic details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [gracePeriod, setGracePeriod] = useState('15')

  // Bond/Terms
  const [requireSignature, setRequireSignature] = useState(false)
  const [bondTerms, setBondTerms] = useState('')
  const [bondYears, setBondYears] = useState('2')
  const [bondTiming, setBondTiming] = useState<'before_start' | 'before_submission'>('before_submission')
  const [bondDocumentUrl, setBondDocumentUrl] = useState('')

  // Questions
  const [questions, setQuestions] = useState<Question[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await getInterview(interviewId)
        setInterview(data)
        setTitle(data.title)
        setDescription(data.description || '')
        setStartTime(toDatetimeLocal(data.scheduled_start_time))
        setEndTime(toDatetimeLocal(data.scheduled_end_time))
        setGracePeriod(String(data.grace_period_minutes ?? 15))
        setRequireSignature(data.require_signature ?? false)
        setBondTerms(data.bond_terms || '')
        setBondYears(String(data.bond_years ?? 2))
        setBondTiming((data.bond_timing as any) || 'before_submission')
        setBondDocumentUrl(data.bond_document_url || '')
        setQuestions(data.questions || [])
      } catch (error: any) {
        toast.error(error.message || 'Failed to load interview')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [interviewId])

  const getAvailableMinutes = () => {
    if (!startTime || !endTime) return 0
    return Math.max(0, Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000))
  }

  const handleUpdateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    setQuestions(updated)
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleAddQuestion = () => {
    const availableMinutes = getAvailableMinutes()
    const newCount = questions.length + 1
    const timePerQ = availableMinutes > 0 ? Math.floor(availableMinutes / newCount) : 15
    setQuestions([
      ...questions,
      {
        question_text: '',
        difficulty: 'medium',
        marks: 10,
        time_estimate_minutes: timePerQ,
        starter_code: '',
        topics: [],
      },
    ])
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!startTime || !endTime) {
      toast.error('Start and end times are required')
      return
    }
    if (new Date(startTime) >= new Date(endTime)) {
      toast.error('End time must be after start time')
      return
    }
    if (questions.length === 0) {
      toast.error('At least one question is required')
      return
    }

    setSaving(true)
    try {
      await updateInterview(interviewId, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_start_time: localToIso(startTime),
        scheduled_end_time: localToIso(endTime),
        grace_period_minutes: parseInt(gracePeriod) || 15,
        require_signature: requireSignature,
        bond_terms: bondTerms.trim() || undefined,
        bond_years: parseInt(bondYears) || 2,
        bond_timing: bondTiming,
        bond_document_url: bondDocumentUrl.trim() || undefined,
        questions: questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          difficulty: q.difficulty,
          marks: q.marks,
          time_estimate_minutes: q.time_estimate_minutes,
          starter_code: q.starter_code,
          topics: q.topics,
        })),
      })
      toast.success('Interview updated successfully')
      router.push(`/dashboard/coding-interviews/${interviewId}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-8">
        <SkeletonPageHeader />
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Interview not found.</p>
      </div>
    )
  }

  const availableMinutes = getAvailableMinutes()

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>
      <PageHeader
        title="Edit Interview"
        description="Update interview details, bond settings, and questions"
      />

      {/* Basic Details */}
      <Card>
        <CardHeader>
          <CardTitle>Interview Details</CardTitle>
          <CardDescription>Basic information about the interview</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Interview Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Developer Assessment"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description shown to candidates"
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
                value={startTime}
                onChange={(start) => {
                  setStartTime(start)
                  if (start) {
                    const pad = (n: number) => String(n).padStart(2, '0')
                    const durationMs = startTime && endTime
                      ? new Date(endTime).getTime() - new Date(startTime).getTime()
                      : 60 * 60 * 1000
                    const endDate = new Date(new Date(start).getTime() + Math.max(durationMs, 60 * 60 * 1000))
                    setEndTime(
                      `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`
                    )
                  }
                }}
                placeholder="Select start date & time"
              />
            </div>

            <div className="space-y-2">
              <Label>
                <Clock className="inline h-4 w-4 mr-1" />
                End Time *
              </Label>
              <DateTimePicker
                value={endTime}
                onChange={setEndTime}
                placeholder="Select end date & time"
                minDate={startTime ? new Date(startTime) : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grace">Grace Period (minutes)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                max={120}
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Extra time candidates can still submit after the end.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bond/Terms */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            Bond Agreement & Terms
          </CardTitle>
          <CardDescription>
            Terms and conditions candidates must accept
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
                      const val = parseInt(e.target.value)
                      if (!val || val < 1) setBondYears('1')
                      else if (val > 10) setBondYears('10')
                    }}
                  />
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
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bondTerms">Terms and Conditions Text</Label>
                <Textarea
                  id="bondTerms"
                  value={bondTerms}
                  onChange={(e) => setBondTerms(e.target.value)}
                  rows={8}
                  placeholder="Enter bond terms, certificate collection info, penalty clauses, etc."
                  className="font-mono text-sm"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Questions ({questions.length})</CardTitle>
              <CardDescription>
                Edit existing questions or add new ones
                {availableMinutes > 0 && questions.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    ⏱ {availableMinutes} min total · ~{Math.floor(availableMinutes / questions.length)} min/question
                  </span>
                )}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleAddQuestion}>
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.length === 0 && (
            <p className="text-gray-400 text-center py-8">No questions yet. Click "Add Question" to start.</p>
          )}

          {questions.map((question, index) => (
            <Card key={question.id || index} className="border-l-4 border-l-indigo-500">
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
                    placeholder="Describe the problem to solve..."
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

          {questions.length > 0 && (
            <div className="flex items-center justify-end gap-2 pt-2 text-sm text-gray-600">
              <span>Total marks: <strong>{questions.reduce((s, q) => s + q.marks, 0)}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
