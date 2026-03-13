'use client'

import { motion } from 'framer-motion'
import { FileText, CheckCircle2, User, Sparkles } from 'lucide-react'

export function HeroAnimation() {
  return (
    <div className="relative w-full max-w-4xl mx-auto mt-20">
      {/* Container simulating a browser/app window */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 backdrop-blur-xl shadow-2xl shadow-indigo-900/10 overflow-hidden">
        {/* Window header */}
        <div className="h-10 border-b border-slate-800/60 bg-slate-900/50 flex items-center px-4 gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-slate-700/50" />
            <div className="w-3 h-3 rounded-full bg-slate-700/50" />
            <div className="w-3 h-3 rounded-full bg-slate-700/50" />
          </div>
          <div className="ml-4 text-xs font-mono text-slate-500 flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            Processing Applicants
          </div>
        </div>

        {/* Window body */}
        <div className="p-8 relative min-h-[400px] flex flex-col md:flex-row gap-8 items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-transparent to-transparent">
          
          {/* Job Description Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full md:w-64 bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 shrink-0 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-5 text-indigo-400">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <FileText className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm text-slate-200">Senior Frontend Eng.</span>
            </div>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>Experience</span>
                <span className="text-slate-300">5+ Years</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-4/5 bg-indigo-500/40 rounded-full" />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>Location</span>
                <span className="text-slate-300">Remote / NY</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-indigo-500/40 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold tracking-wide border border-indigo-500/20">REACT</span>
              <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold tracking-wide border border-indigo-500/20">TYPESCRIPT</span>
            </div>
          </motion.div>

          {/* AI Connection Pipe */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="hidden md:flex flex-col items-center justify-center shrink-0"
          >
            <div className="h-0.5 w-12 bg-slate-800" />
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-10 relative my-[-20px]">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="h-0.5 w-12 bg-slate-800" />
          </motion.div>

          {/* Resumes Container */}
          <div className="relative flex flex-col gap-3 w-full md:w-80">


            {[
              { delay: 1.0, name: "David Chen", role: "UI Developer", match: "45%", highlight: false },
              { delay: 1.1, name: "Sarah Jenkins", role: "Senior FE Eng", match: "98%", highlight: true },
              { delay: 1.2, name: "Marcus Johnson", role: "Fullstack Eng", match: "62%", highlight: false },
            ].map((candidate, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: candidate.delay }}
                className="relative"
              >
                <motion.div 
                  initial={{ borderColor: 'rgba(51, 65, 85, 0.6)' }}
                  animate={candidate.highlight 
                    ? { borderColor: ['rgba(51, 65, 85, 0.6)', 'rgba(74, 222, 128, 0.6)', 'rgba(51, 65, 85, 0.6)'], backgroundColor: ['rgba(15, 23, 42, 0.6)', 'rgba(20, 83, 45, 0.15)', 'rgba(15, 23, 42, 0.6)'] }
                    : { borderColor: 'rgba(51, 65, 85, 0.6)', backgroundColor: 'rgba(15, 23, 42, 0.6)' }
                  }
                  transition={{ duration: 0.6, delay: 3.2, repeat: Infinity, repeatDelay: 4.4 }}
                  className="bg-slate-900/60 border rounded-xl p-4 flex items-center justify-between z-0 relative overflow-hidden"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700/50">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-200">{candidate.name}</div>
                      <div className="text-xs text-slate-500 font-medium">{candidate.role}</div>
                    </div>
                  </div>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 1, 0], scale: [0.8, 1, 0.8] }}
                    transition={{ duration: 0.6, delay: 3.2, repeat: Infinity, repeatDelay: 4.4 }}
                    className="flexItems-center gap-1"
                  >
                    {candidate.highlight ? (
                       <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-bold rounded-full">
                         <CheckCircle2 className="w-3.5 h-3.5" />
                         {candidate.match}
                       </span>
                    ) : (
                       <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold rounded-full">
                         {candidate.match}
                       </span>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
