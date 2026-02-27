'use client'

import { useState, useEffect } from 'react'
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
import { Calendar, Clock, Users, Video, Plus, X, Loader2, ArrowLeft } from 'lucide-react'
import { scheduleInterview, type Interviewer, type InterviewQuestion } from '@/lib/api/video-interviews'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function ScheduleInterviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [jobs, setJobs] = useState<any[]>([])

  // Form state
  const [formData, setFormData] = useState({
    job_description_id: '',
    candidate_email: '',
    candidate_name: '',
    resume_id: '',
    title: '',
    description: '',
    scheduled_date: '',
    scheduled_time: '',
    duration_minutes: 60,
    interview_type: 'panel',
  })

  const [interviewers, setInterviewers] = useState<Interviewer[]>([
    { name: '', email: '' },
  ])

  const [questions, setQuestions] = useState<InterviewQuestion[]>([])

  useEffect(() => {
    fetchUserAndJobs()
  }, [])

  const fetchUserAndJobs = async () => {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get user ID from users table
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (userRecord) {
        setUserId(userRecord.id)
      }

      // Fetch job descriptions
      const { data: jobsData } = await supabase
        .from('job_descriptions')
        .select('id, title, department')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (jobsData) {
        setJobs(jobsData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const addInterviewer = () => {
    setInterviewers([...interviewers, { name: '', email: '' }])
  }

  const removeInterviewer = (index: number) => {
    if (interviewers.length > 1) {
      setInterviewers(interviewers.filter((_, i) => i !== index))
    }
  }

  const updateInterviewer = (index: number, field: keyof Interviewer, value: string) => {
    const updated = [...interviewers]
    updated[index] = { ...updated[index], [field]: value }
    setInterviewers(updated)
  }

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        question_text: '',
        question_type: 'technical',
        expected_duration_minutes: 10,
      },
    ])
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    setQuestions(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.job_description_id) {
      toast.error('Please select a job description')
      return
    }

    if (!formData.candidate_email || !formData.candidate_name) {
      toast.error('Please provide candidate details')
      return
    }

    if (!formData.scheduled_date || !formData.scheduled_time) {
      toast.error('Please select interview date and time')
      return
    }

    const hasValidInterviewer = interviewers.some((i) => i.name && i.email)
    if (!hasValidInterviewer) {
      toast.error('Please add at least one interviewer')
      return
    }

    setLoading(true)

    try {
      // Combine date and time
      const scheduledAt = new Date(`${formData.scheduled_date}T${formData.scheduled_time}:00`)

      // Filter valid interviewers
      const validInterviewers = interviewers.filter((i) => i.name && i.email)

      // Filter valid questions
      const validQuestions = questions
        .filter((q) => q.question_text)
        .map((q) => ({
          question_text: q.question_text,
          question_type: q.question_type || 'technical',
          expected_duration_minutes: q.expected_duration_minutes || 10,
        }))

      const result = await scheduleInterview({
        job_description_id: formData.job_description_id,
        candidate_email: formData.candidate_email,
        candidate_name: formData.candidate_name,
        resume_id: formData.resume_id || undefined,
        title: formData.title || `Interview with ${formData.candidate_name}`,
        description: formData.description || undefined,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: formData.duration_minutes,
        interviewers: validInterviewers,
        questions: validQuestions.length > 0 ? validQuestions : undefined,
        interview_type: formData.interview_type as any,
      })

      toast.success('Interview scheduled successfully!')

      // Show join URLs
      console.log('Interview scheduled:', result)

      router.push('/dashboard/video-interviews')
    } catch (error: any) {
      toast.error(error.message || 'Failed to schedule interview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Video className="h-8 w-8 text-cyan-600" />
          Schedule Video Interview
        </h1>
        <p className="text-slate-600 mt-1">
          Set up a panel interview with multiple interviewers
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job & Candidate Details */}
        <Card>
          <CardHeader>
            <CardTitle>Job & Candidate Information</CardTitle>
            <CardDescription>
              Select the job and provide candidate details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="job">Job Description *</Label>
              <Select
                value={formData.job_description_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, job_description_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title} {job.department && `(${job.department})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="candidate_name">Candidate Name *</Label>
                <Input
                  id="candidate_name"
                  value={formData.candidate_name}
                  onChange={(e) =>
                    setFormData({ ...formData, candidate_name: e.target.value })
                  }
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <Label htmlFor="candidate_email">Candidate Email *</Label>
                <Input
                  id="candidate_email"
                  type="email"
                  value={formData.candidate_email}
                  onChange={(e) =>
                    setFormData({ ...formData, candidate_email: e.target.value })
                  }
                  placeholder="john.doe@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">Interview Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Leave empty to auto-generate"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Additional notes or instructions..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule & Duration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_date: e.target.value })
                  }
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div>
                <Label htmlFor="time">Time *</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_time: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Select
                  value={formData.duration_minutes.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, duration_minutes: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="type">Interview Type</Label>
              <Select
                value={formData.interview_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, interview_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="panel">Panel Interview</SelectItem>
                  <SelectItem value="one_on_one">One-on-One</SelectItem>
                  <SelectItem value="technical">Technical Interview</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Interviewers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Interviewers
              </span>
              <Button type="button" variant="outline" size="sm" onClick={addInterviewer}>
                <Plus className="h-4 w-4 mr-2" />
                Add Interviewer
              </Button>
            </CardTitle>
            <CardDescription>
              Add at least one interviewer who will conduct the interview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {interviewers.map((interviewer, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Interviewer name"
                    value={interviewer.name}
                    onChange={(e) => updateInterviewer(index, 'name', e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="interviewer@example.com"
                    value={interviewer.email}
                    onChange={(e) => updateInterviewer(index, 'email', e.target.value)}
                  />
                </div>
                {interviewers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeInterviewer(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Questions (Optional) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Interview Questions (Optional)</span>
              <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </CardTitle>
            <CardDescription>
              Pre-load questions to guide the interview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                No questions added. Click "Add Question" to start.
              </p>
            ) : (
              questions.map((question, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-start">
                    <Label>Question {index + 1}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Enter your question..."
                    value={question.question_text}
                    onChange={(e) =>
                      updateQuestion(index, 'question_text', e.target.value)
                    }
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      value={question.question_type}
                      onValueChange={(value) =>
                        updateQuestion(index, 'question_type', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="behavioral">Behavioral</SelectItem>
                        <SelectItem value="coding">Coding</SelectItem>
                        <SelectItem value="system_design">System Design</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Duration (min)"
                      value={question.expected_duration_minutes}
                      onChange={(e) =>
                        updateQuestion(
                          index,
                          'expected_duration_minutes',
                          parseInt(e.target.value)
                        )
                      }
                      min={1}
                      max={60}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Video className="h-4 w-4 mr-2" />
                Schedule Interview
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
