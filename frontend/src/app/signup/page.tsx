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
import { Sparkles, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        toast.success('Account created successfully! Please check your email to verify.')
        router.push('/login')
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

      {/* Left panel — form */}
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
                <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
                <p className="text-slate-400 text-sm">Start automating your hiring process today</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-sm font-medium text-slate-300">
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                </div>

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
                  <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
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
                      Create account
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right panel — benefits (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12">
        {/* Logo */}
        <div className="flex justify-end">
          <Link href="/" className="flex items-center gap-3 group w-fit">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              AI Interview
            </span>
          </Link>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-4xl font-black mb-4 leading-tight text-white"
            >
              Everything you need<br />to hire better.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="text-slate-400 text-lg leading-relaxed max-w-sm"
            >
              Join teams that cut hiring time by 80% using AI-driven screening, grading, and interviews.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="space-y-3"
          >
            {[
              'Rank hundreds of resumes in seconds',
              'Grade 50 answer sheets simultaneously',
              'AI phone screens candidates automatically',
              'Live coding tests with instant AI scoring',
              'Full analytics dashboard included',
              'No credit card required to start',
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">{benefit}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom stat row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { value: '80%', label: 'Time saved' },
            { value: '95%', label: 'Accuracy' },
            { value: '50+', label: 'Candidates/day' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white">
                {stat.value}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
