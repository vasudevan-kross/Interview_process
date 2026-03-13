'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Sparkles, Loader2, ArrowRight, FileSearch, FileCheck, Mic, Code } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        toast.success('Logged in successfully!')
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white overflow-hidden flex">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1]">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-0 inset-x-0 h-[800px] bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
      </div>

      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group w-fit">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">
            AI Interview
          </span>
        </Link>

        {/* Center content */}
        <div className="space-y-10">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-4xl font-black mb-4 leading-tight text-white"
            >
              Hire faster.<br />Score smarter.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="text-slate-400 text-lg leading-relaxed max-w-sm"
            >
              Your entire recruitment pipeline — AI-powered, automated, and ready in minutes.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="space-y-4"
          >
            {[
              { icon: FileSearch, label: 'Resume Matching', desc: 'AI ranks candidates by job fit' },
              { icon: FileCheck, label: 'Test Evaluation', desc: 'Batch answer grading with OCR' },
              { icon: Mic, label: 'Voice Screening', desc: 'AI phone interviews at scale' },
              { icon: Code, label: 'Coding Interviews', desc: 'Live editor with anti-cheat' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom quote */}
        <p className="text-xs text-slate-600 tracking-widest uppercase">
          AI-Powered Recruitment Platform
        </p>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              AI Interview
            </span>
          </div>

          {/* Card */}
          <div className="relative">
            <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
                <p className="text-slate-400 text-sm">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                      Password
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all duration-300 group rounded-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Don't have an account?{' '}
                <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
