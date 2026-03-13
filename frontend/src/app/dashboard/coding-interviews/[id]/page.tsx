'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Code,
    Calendar,
    Clock,
    Users,
    ChevronLeft,
    Copy,
    Share2,
    ExternalLink,
    Loader2,
    Award,
    FileText,
    GitFork,
    Pencil,
} from 'lucide-react'

import { getInterview, generateShareableLink, cloneInterview, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { SkeletonPageHeader } from '@/components/ui/skeleton'

export default function InterviewDetailPage() {
    const params = useParams()
    const router = useRouter()
    const interviewId = params.id as string

    const [interview, setInterview] = useState<Interview | null>(null)
    const [loading, setLoading] = useState(true)
    const [cloning, setCloning] = useState(false)

    useEffect(() => {
        fetchInterview()
    }, [interviewId])

    const fetchInterview = async () => {
        try {
            setLoading(true)
            const data = await getInterview(interviewId)
            setInterview(data)
        } catch (error: any) {
            toast.error(error.message || 'Failed to load interview')
        } finally {
            setLoading(false)
        }
    }

    const handleCopyLink = () => {
        if (!interview) return
        const link = generateShareableLink(interview.access_token)
        navigator.clipboard.writeText(link)
        toast.success('Interview link copied to clipboard!')
    }

    const handleClone = async () => {
        if (!interview) return
        setCloning(true)
        try {
            const result = await cloneInterview(interviewId)
            toast.success(`Cloned as "${result.title}"`)
            router.push(`/dashboard/coding-interviews/${result.interview_id}`)
        } catch (error: any) {
            toast.error(error.message || 'Failed to clone interview')
        } finally {
            setCloning(false)
        }
    }

    const handleShareWhatsApp = () => {
        if (!interview) return
        const link = generateShareableLink(interview.access_token)
        const message = `Interview: ${interview.title}\n\nJoin link: ${link}`
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
    }

    const getStatusBadge = (status: string) => {
        const variants: Record<string, string> = {
            scheduled: 'bg-blue-50 text-blue-700 border border-blue-200 rounded-md',
            in_progress: 'bg-green-50 text-green-700 border border-green-200 rounded-md',
            completed: 'bg-slate-100 text-slate-700 border border-slate-200 rounded-md',
            expired: 'bg-red-50 text-red-700 border border-red-200 rounded-md',
        }
        return <Badge className={variants[status] || variants.scheduled}>{status.replace('_', ' ').toUpperCase()}</Badge>
    }

    const getDifficultyBadge = (difficulty: string) => {
        const variants: Record<string, string> = {
            easy: 'bg-green-100 text-green-800',
            medium: 'bg-yellow-100 text-yellow-800',
            hard: 'bg-red-100 text-red-800',
        }
        return <Badge className={variants[difficulty] || variants.medium}>{difficulty.toUpperCase()}</Badge>
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

    const shareableLink = generateShareableLink(interview.access_token)

    return (
        <div className="space-y-6 p-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-semibold text-slate-900">
                            {interview.title}
                        </h1>
                        {getStatusBadge(interview.status)}
                    </div>
                    {interview.description && (
                        <p className="text-gray-600 mt-1">{interview.description}</p>
                    )}
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleCopyLink}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                    </Button>
                    <Button variant="outline" onClick={handleShareWhatsApp}>
                        <Share2 className="h-4 w-4 mr-2" />
                        WhatsApp
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/dashboard/coding-interviews/${interviewId}/edit`)}
                    >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                    </Button>
                    <Button variant="outline" onClick={handleClone} disabled={cloning}>
                        {cloning ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <GitFork className="h-4 w-4 mr-2" />
                        )}
                        Clone
                    </Button>
                    <Button
                        onClick={() => router.push(`/dashboard/coding-interviews/${interviewId}/submissions`)}
                    >
                        <Users className="h-4 w-4 mr-2" />
                        View Submissions
                    </Button>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border border-slate-200 bg-white">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-slate-500">Scheduled Time</CardTitle>
                            <Calendar className="h-4 w-4 text-slate-300" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tabular-nums text-slate-900">
                            {format(new Date(interview.scheduled_start_time), 'MMM dd')}
                        </div>
                        <p className="text-sm text-slate-500">
                            {format(new Date(interview.scheduled_start_time), 'yyyy, HH:mm')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-slate-500">Duration</CardTitle>
                            <Clock className="h-4 w-4 text-slate-300" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tabular-nums text-slate-900">{interview.duration_minutes} min</div>
                        <p className="text-sm text-slate-500">
                            {interview.interview_type.toUpperCase()} interview
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-slate-500">Total Marks</CardTitle>
                            <Award className="h-4 w-4 text-slate-300" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tabular-nums text-slate-900">{interview.total_marks}</div>
                        <p className="text-sm text-slate-500">
                            {interview.questions?.length || 0} questions
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-slate-500">
                                {interview.interview_type === 'testing' ? 'Framework' : 'Language'}
                            </CardTitle>
                            <Code className="h-4 w-4 text-slate-300" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tabular-nums text-slate-900">
                            {interview.allowed_languages?.length === 0
                                ? 'ANY'
                                : interview.programming_language.toUpperCase()}
                        </div>
                        <p className="text-sm text-slate-500">
                            {interview.allowed_languages?.length === 0
                                ? "Candidate's Choice"
                                : interview.interview_type === 'testing' ? 'Test Framework' : 'Programming Language'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Shareable Link */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Shareable Link
                    </CardTitle>
                    <CardDescription>Share this link with candidates to start the interview</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                        <code className="flex-1 text-sm text-indigo-700 break-all">{shareableLink}</code>
                        <Button size="sm" variant="outline" onClick={handleCopyLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Questions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Questions ({interview.questions?.length || 0})
                    </CardTitle>
                    <CardDescription>Interview questions and their details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {interview.questions?.map((q, idx) => (
                        <div key={q.id || idx} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-lg">Question {idx + 1}</h3>
                                <div className="flex items-center gap-2">
                                    {getDifficultyBadge(q.difficulty)}
                                    <Badge variant="outline">{q.marks} marks</Badge>
                                    {q.time_estimate_minutes && (
                                        <Badge variant="outline">
                                            <Clock className="h-3 w-3 mr-1" />
                                            {q.time_estimate_minutes} min
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <p className="whitespace-pre-wrap text-gray-700">{q.question_text}</p>
                            {q.topics && q.topics.length > 0 && (
                                <div className="flex items-center gap-2 mt-3">
                                    {q.topics.map((topic, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                            {topic}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {(!interview.questions || interview.questions.length === 0) && (
                        <p className="text-gray-400 text-center py-8">No questions added yet</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
