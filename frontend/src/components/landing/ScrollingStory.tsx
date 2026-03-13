'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { UploadCloud, FileSearch, CheckCircle2, Mic, Sparkles } from 'lucide-react'

const steps = [
  {
    num: "01",
    title: "Create Job Opening",
    desc: "Define role requirements, upload question papers, and set evaluation criteria. Our AI understands your needs perfectly.",
    icon: FileSearch
  },
  {
    num: "02",
    title: "Upload Resumes",
    desc: "Drag and drop multiple resumes at once. AI automatically extracts skills, experience, and matches against your requirements.",
    icon: UploadCloud
  },
  {
    num: "03",
    title: "Batch Process Tests",
    desc: "Upload 20-50 answer sheets simultaneously. AI evaluates with partial credit, generating detailed feedback in minutes.",
    icon: CheckCircle2
  },
  {
    num: "04",
    title: "Automated Voice Screens",
    desc: "Deploy AI voice agents to call candidates, ask adaptive screening questions, and rank them before human interviews.",
    icon: Mic
  }
]

export function ScrollingStory() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  })

  // Crossfade visuals with overlapping ranges — no gaps between transitions
  // Each step occupies ~25% of scroll. Crossfade over ~5% overlap so one fades
  // out while the next fades in simultaneously.
  const visual1Opacity = useTransform(scrollYProgress, [0, 0.18, 0.23], [1, 1, 0])
  const visual2Opacity = useTransform(scrollYProgress, [0.18, 0.23, 0.43, 0.48], [0, 1, 1, 0])
  const visual3Opacity = useTransform(scrollYProgress, [0.43, 0.48, 0.68, 0.73], [0, 1, 1, 0])
  const visual4Opacity = useTransform(scrollYProgress, [0.68, 0.73, 1.0], [0, 1, 1])

  return (
    <div ref={containerRef} className="relative flex flex-col md:flex-row">

      {/* Left Column: Scrolling Text */}
      <div className="w-full md:w-1/2 pr-0 md:pr-16 relative">
        {/* Continuous progress line */}
        <div className="absolute left-[27px] top-6 bottom-6 w-0.5 bg-slate-800 hidden md:block" />
        <motion.div
          className="absolute left-[27px] top-6 w-0.5 bg-indigo-500 hidden md:block origin-top"
          style={{ scaleY: scrollYProgress }}
        />

        <div className="space-y-[25vh]">
          {steps.map((step, i) => (
            <div key={i} className="relative z-10 min-h-[35vh] flex flex-col justify-center">
              <div className="flex gap-6 items-start">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 shadow-lg relative bg-slate-950">
                  <step.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <div className="text-indigo-500 font-mono text-sm mb-2 opacity-80">{step.num}</div>
                  <h3 className="text-2xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-slate-400 text-lg leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="pb-[30vh]" />
      </div>

      {/* Right Column: stretches to match left column height */}
      <div className="w-full md:w-1/2 hidden md:block pl-8 z-10">
        {/* Sticky inner — stays centered in viewport while scrolling */}
        <div className="sticky top-[25vh] flex items-center justify-center">
        <div className="relative w-full aspect-video max-w-2xl bg-slate-900/20 rounded-2xl border border-slate-800/30 overflow-hidden shadow-[0_0_100px_rgba(79,70,229,0.05)]">

        {/* Visual 1: Dashboard UI Mockup */}
        <motion.div style={{ opacity: visual1Opacity }} className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 overflow-hidden relative">
            <div className="flex items-center justify-between mb-2">
               <div className="h-4 w-24 bg-slate-800 rounded" />
               <div className="flex gap-1">
                 <div className="w-2 h-2 rounded-full bg-slate-800" />
                 <div className="w-2 h-2 rounded-full bg-slate-800" />
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                 <div className="h-2 w-full bg-slate-800 rounded" />
                 <div className="h-2 w-4/5 bg-slate-800 rounded" />
                 <div className="h-2 w-5/6 bg-slate-800 rounded" />
              </div>
              <div className="h-24 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-center">
                 <Sparkles className="w-6 h-6 text-indigo-500/40" />
              </div>
            </div>
            <div className="flex-1 bg-slate-800/20 rounded-xl mt-2 p-4">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-slate-800" />
                 <div className="h-3 w-32 bg-slate-800 rounded" />
               </div>
            </div>
          </div>
        </motion.div>

        {/* Visual 2: Bulk Upload UI */}
        <motion.div style={{ opacity: visual2Opacity }} className="absolute inset-0 flex items-center justify-center">
           <div className="w-full h-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                 <div className="text-xs font-mono text-slate-500 uppercase">Uploading 48 files...</div>
                 <div className="text-xs font-mono text-indigo-400">85%</div>
              </div>
              {[
                { name: "resume_john_doe.pdf", size: "1.2MB" },
                { name: "cv_sarah_smith.pdf", size: "0.8MB" },
                { name: "dev_marcus_v3.pdf", size: "2.1MB" }
              ].map((file, i) => (
                <div key={i} className="bg-slate-800/40 border border-slate-700/50 p-3 rounded-xl flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <UploadCloud className="w-4 h-4 text-slate-500" />
                      <div className="text-xs font-medium text-slate-300">{file.name}</div>
                   </div>
                   <div className="w-24 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 1, delay: i * 0.2, repeat: Infinity, repeatDelay: 2 }}
                        className="h-full bg-indigo-500"
                      />
                   </div>
                </div>
              ))}
           </div>
        </motion.div>

        {/* Visual 3: Batch Evaluation UI */}
        <motion.div style={{ opacity: visual3Opacity }} className="absolute inset-0 flex items-center justify-center">
           <div className="w-full h-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                 <div className="text-xs font-mono text-slate-500 uppercase">Batch Evaluation: Final Exam</div>
                 <div className="flex gap-2">
                    <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-bold">42/50 Graded</div>
                 </div>
              </div>
              <div className="space-y-3">
                 {[
                   { name: "Robert Fox", status: "Graded", score: "88/100" },
                   { name: "Jane Cooper", status: "Graded", score: "92/100" },
                   { name: "Cody Fisher", status: "Processing...", score: "--" }
                 ].map((row, i) => (
                   <div key={i} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />
                         <span className="text-slate-300">{row.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                         <span className={row.status === 'Graded' ? 'text-green-500' : 'text-indigo-400 animate-pulse'}>{row.status}</span>
                         <span className="font-mono text-slate-500 w-12 text-right">{row.score}</span>
                      </div>
                   </div>
                 ))}
              </div>
              <div className="flex-1 bg-slate-950/50 rounded-xl mt-2 border border-slate-800/50 p-4 flex items-center justify-center">
                 <div className="text-center">
                    <div className="text-[10px] font-mono text-slate-600 uppercase mb-2">AI Insights</div>
                    <div className="text-[10px] text-slate-400 italic">&quot;Common weakness detected in Section B (Recursion)&quot;</div>
                 </div>
              </div>
           </div>
        </motion.div>

        {/* Visual 4: Live Screening UI */}
        <motion.div style={{ opacity: visual4Opacity }} className="absolute inset-0 flex items-center justify-center">
           <div className="w-full h-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                 <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">Live AI Screening Agent</span>
              </div>
              <div className="flex-1 p-4 space-y-4">
                 <div className="flex gap-3">
                   <div className="w-6 h-6 rounded bg-indigo-500 shrink-0 flex items-center justify-center text-[10px] text-white font-bold">AI</div>
                   <div className="bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-lg text-[10px] text-slate-300">&quot;Tell me about your experience with React...&quot;</div>
                 </div>
                 <div className="flex gap-3 justify-end">
                   <div className="bg-slate-800 p-2 rounded-lg text-[10px] text-slate-400 max-w-[70%]">&quot;I&apos;ve worked with React for 3 years, building...&quot;</div>
                   <div className="w-6 h-6 rounded bg-slate-700 shrink-0 flex items-center justify-center text-[10px] text-slate-400 font-bold">CAN</div>
                 </div>
              </div>
              <div className="h-16 px-4 bg-slate-950/50 flex items-center gap-1.5 border-t border-slate-800">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: ["10px", `${10 + Math.random() * 30}px`, "10px"] }}
                    transition={{ duration: 0.5 + Math.random(), repeat: Infinity, ease: "easeInOut" }}
                    className="w-2 rounded-full bg-indigo-500/40"
                  />
                ))}
              </div>
           </div>
        </motion.div>

        </div>
        </div>
      </div>
    </div>
  )
}
