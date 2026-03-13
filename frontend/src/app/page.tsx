'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { HeroAnimation } from '@/components/landing/HeroAnimation'
import { BentoGrid } from '@/components/landing/BentoGrid'
import { ScrollingStory } from '@/components/landing/ScrollingStory'
import { InteractiveModules } from '@/components/landing/InteractiveModules'
import {
  ArrowRight,
  FileSearch,
  FileCheck,
  Sparkles,
  Zap,
  Shield,
  TrendingUp,
  CheckCircle2,
  ChevronRight
} from 'lucide-react'

// Background grid pattern and radial gradient
const BackgroundElements = () => (
  <div className="fixed inset-0 pointer-events-none z-[-1]">
    <div className="absolute inset-0 bg-slate-950" />
    <div className="absolute top-0 inset-x-0 h-[800px] bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
  </div>
)

// Feature grid now uses BentoGrid component



export default function LandingPage() {
  const { scrollYProgress } = useScroll()
  const heroRef = useRef(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  // Parallax effects
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%'])
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0])

  // Mouse move effect for hero section
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <div className="relative bg-slate-950 text-white overflow-x-clip">
      {/* Background Elements */}
      <BackgroundElements />

      {/* Grain texture overlay */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0wIDBoMzAwdjMwMEgweiIgZmlsdGVyPSJ1cmwoI2EpIiBvcGFjaXR5PSIuMDUiLz48L3N2Zz4=')]" />

      {/* Header */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/50 backdrop-blur-xl bg-slate-950/80"
      >
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              AI Interview
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              Features
            </a>
            <a href="#how-it-works" className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              How It Works
            </a>
            <a href="#cta" className="text-slate-300 hover:text-cyan-400 transition-colors font-medium">
              Get Started
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800">
                Login
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all duration-300 rounded-full px-6">
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-20 px-6">
        <motion.div
          style={{ y, opacity }}
          className="container mx-auto max-w-6xl text-center relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm mb-8"
          >
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-slate-300">AI-Powered Recruitment Platform</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            style={{
              transform: `translate(${mousePosition.x * 0.2}px, ${mousePosition.y * 0.2}px)`,
            }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 leading-[1.1]"
          >
            <span className="text-white">
              Transform Your
            </span>
            <br />
            <span className="text-slate-400">
              Hiring Process
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto mb-12 leading-relaxed"
          >
            Streamline recruitment with intelligent resume matching, automated test evaluation,
            and AI-powered voice screening. Hire faster, smarter, better.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link href="/signup">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-6 text-base rounded-full shadow-xl shadow-indigo-900/20 transition-all duration-300 group">
                Start Free Trial
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="outline" className="bg-slate-900/50 border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-8 py-6 text-base rounded-full backdrop-blur-sm transition-all duration-300">
                See How It Works
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <HeroAnimation />
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        {/* <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 border-2 border-slate-700 rounded-full flex justify-center pt-2">
            <div className="w-1.5 h-3 bg-gradient-to-b from-cyan-400 to-transparent rounded-full" />
          </div>
        </motion.div> */}
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-32 px-6">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm mb-6">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">Powerful Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              <span className="text-white">
                Everything You Need
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              AI-powered tools that make recruitment effortless and efficient
            </p>
          </motion.div>

          <BentoGrid />
        </div>
      </section>

      {/* ── Modules Overview Section ── */}
      <section className="relative py-32 px-6">
        <div className="container mx-auto max-w-6xl">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm mb-6">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-slate-300">End-to-End Hiring Platform</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              <span className="text-white">
                Four Core Modules
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Every stage of your hiring pipeline — automated, AI-scored, and ready in minutes.
            </p>
          </motion.div>

          {/* Interactive tabs */}
          <InteractiveModules />

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center text-[11px] tracking-[0.3em] text-slate-500 uppercase mb-14"
          >
            Four modules. One complete hiring pipeline.
          </motion.p>

          {/* Bottom 4-card row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: '📄', color: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-800/50 hover:border-blue-500/60', badge: 'Matches', badgeCls: 'bg-blue-500/15 text-blue-300 border-blue-500/30', name: 'Resume AI', role: 'Resume Matching', desc: 'Hybrid semantic + keyword scoring ranks every applicant against your job description automatically.', num: '01' },
              { icon: '📝', color: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-800/50 hover:border-cyan-500/60', badge: 'Grades', badgeCls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', name: 'Exam AI', role: 'Test Evaluation', desc: 'OCR reads handwritten and printed answers. Partial credit, detailed feedback, and batch results in minutes.', num: '02' },
              { icon: '💻', color: 'from-green-500/15 to-green-600/5', border: 'border-green-800/50 hover:border-green-500/60', badge: 'Assesses', badgeCls: 'bg-green-500/15 text-green-300 border-green-500/30', name: 'Code AI', role: 'Coding Interviews', desc: 'Live editor with anti-cheat monitoring. AI generates questions, evaluates submissions, and scores instantly.', num: '03' },
              { icon: '🎙️', color: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-800/50 hover:border-purple-500/60', badge: 'Screens', badgeCls: 'bg-purple-500/15 text-purple-300 border-purple-500/30', name: 'Voice AI', role: 'Voice Screening', desc: 'AI conducts natural phone calls, adapts to candidate experience level, and delivers structured hiring reports.', num: '04' },
            ].map((card, i) => (
              <motion.div
                key={card.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className={`relative bg-slate-900/60 backdrop-blur-sm border ${card.border} rounded-2xl p-5 transition-all duration-300 h-full`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl">
                      {card.icon}
                    </div>
                    <span className="text-slate-700 text-xs font-mono">{card.num}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-bold text-base">{card.name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeCls}`}>{card.badge}</span>
                  </div>
                  <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-3">{card.role}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-32 px-6 bg-slate-900/30">

        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm mb-6">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">Simple Process</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              <span className="text-white">
                How It Works
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Get started in minutes with our streamlined workflow
            </p>
          </motion.div>

          <ScrollingStory />
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" className="relative py-32 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-slate-900/40 rounded-3xl" />
            <div className="relative bg-slate-950/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-12 md:p-16 text-center shadow-2xl shadow-black/50">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                <span className="text-white">
                  Ready to Transform Your Hiring?
                </span>
              </h2>
              <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
                Join innovative companies using AI to hire faster and smarter.
                Start your free trial today, no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/signup">
                  <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-10 py-6 text-base rounded-full shadow-xl shadow-indigo-900/20 transition-all duration-300">
                    Start Free Trial
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="bg-slate-900/50 border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-10 py-6 text-base rounded-full backdrop-blur-sm transition-all duration-300">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-slate-800 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                AI Interview
              </span>
            </div>
            <div className="text-slate-400 text-sm">
              © 2026 AI Interview Platform. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
