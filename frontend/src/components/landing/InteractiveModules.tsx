'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, FileCheck, Mic, Code, Sparkles, CheckCircle2 } from 'lucide-react'

const modules = [
  {
    id: 'resume',
    icon: FileSearch,
    name: 'Resume Matching',
    desc: 'Upload resumes in bulk and let AI extract skills and rank candidates by job-fit score instantly.',
    color: 'blue'
  },
  {
    id: 'test',
    icon: FileCheck,
    name: 'Test Evaluation',
    desc: 'Process 50 answer sheets simultaneously. AI reads handwriting and awards partial credit.',
    color: 'cyan'
  },
  {
    id: 'code',
    icon: Code,
    name: 'Coding Interviews',
    desc: 'Time-bounded coding sessions with anti-cheat monitoring and AI-generated questions.',
    color: 'green'
  },
  {
    id: 'voice',
    icon: Mic,
    name: 'Voice Screening',
    desc: 'AI conducts natural phone calls, extracts data, and scores applicants autonomously.',
    color: 'purple'
  }
]

export function InteractiveModules() {
  const [activeTab, setActiveTab] = useState('resume')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7 }}
      className="relative mb-12 rounded-[26px] p-[2px] overflow-hidden"
    >
      {/* Spinning Gradient Border */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-[-100%] opacity-50"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0 200deg, #3b82f6 260deg, #a855f7 310deg, #06b6d4 360deg)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-slate-900/50 to-indigo-900/10 rounded-3xl blur-2xl z-0" />
      
      {/* Inner Dark Panel */}
      <div className="relative bg-slate-950/90 backdrop-blur-3xl rounded-[24px] p-6 md:p-12 z-10 w-full h-full shadow-2xl flex flex-col md:flex-row gap-8 min-h-[500px]">
        
        {/* Left Panel: Tabs */}
        <div className="w-full md:w-5/12 flex flex-col gap-3">
          {modules.map((m) => {
             const isActive = activeTab === m.id
             return (
               <button
                 key={m.id}
                 onClick={() => setActiveTab(m.id)}
                 className={`text-left p-5 rounded-2xl transition-all duration-300 border ${isActive ? 'bg-slate-800/80 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]' : 'bg-transparent border-transparent hover:bg-slate-800/40 hover:border-slate-700/50'}`}
               >
                 <div className="flex items-center gap-3 mb-2">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                     <m.icon className="w-4 h-4" />
                   </div>
                   <h4 className={`font-bold ${isActive ? 'text-white' : 'text-slate-300'}`}>{m.name}</h4>
                 </div>
                 <p className={`text-sm ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{m.desc}</p>
               </button>
             )
          })}
        </div>

        {/* Right Panel: Interactive Views */}
        <div className="w-full md:w-7/12 bg-slate-900/80 border border-slate-800 rounded-2xl relative overflow-hidden flex items-center justify-center p-8">
          
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:1rem_1rem] opacity-20 pointer-events-none" />

          <AnimatePresence mode="wait">
            {activeTab === 'resume' && (
              <motion.div key="resume" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full max-w-sm space-y-3 z-10">
                 <div className="flex justify-between text-xs text-slate-500 mb-2 font-mono uppercase tracking-widest bg-slate-950 py-2 px-4 rounded border border-slate-800">
                    <span>Candidate</span>
                    <span>Match Score</span>
                 </div>
                 {[98, 85, 62].map((score, i) => (
                    <motion.div key={i} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.15 }} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-700" />
                          <div className="space-y-1.5">
                             <div className="h-2 w-24 bg-slate-600 rounded" />
                             <div className="h-2 w-16 bg-slate-700 rounded" />
                          </div>
                       </div>
                       <div className={`px-2.5 py-1 rounded text-xs font-bold ${i === 0 ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                          {score}%
                       </div>
                    </motion.div>
                 ))}
              </motion.div>
            )}

            {activeTab === 'test' && (
              <motion.div key="test" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full max-w-sm z-10 relative">
                 <div className="bg-slate-200 rounded-xl p-6 aspect-[3/4] shadow-[0_0_30px_rgba(0,0,0,0.5)] transform -rotate-2">
                    <div className="h-3 w-1/3 bg-slate-300 rounded mb-6" />
                    <div className="space-y-4">
                       <div>
                         <div className="h-2 w-full bg-slate-300 rounded mb-2" />
                         <div className="h-2 w-5/6 bg-slate-300 rounded" />
                       </div>
                       <div>
                         <div className="h-2 w-full bg-slate-300 rounded mb-2" />
                         <div className="h-2 w-4/6 bg-slate-300 rounded" />
                       </div>
                    </div>
                    {/* Ghostly checkmarks simulating AI grading */}
                    <motion.div initial={{ opacity: 0, scale: 2 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="absolute top-16 right-8 text-green-500">
                      <CheckCircle2 className="w-12 h-12" />
                      <div className="text-xl font-black rotate-12 mt-1 drop-shadow-md">+5</div>
                    </motion.div>
                 </div>
              </motion.div>
            )}

            {activeTab === 'voice' && (
              <motion.div key="voice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full z-10 flex flex-col items-center justify-center">
                 <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-8 relative">
                    <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-full border-2 border-indigo-400" />
                    <Mic className="w-8 h-8 text-indigo-400" />
                 </div>
                 <div className="flex items-center gap-1.5 h-16 w-full max-w-xs justify-center items-end">
                    {[...Array(20)].map((_, i) => (
                       <motion.div 
                         key={i} 
                         animate={{ height: ["10%", `${20 + Math.random() * 80}%`, "10%"] }} 
                         transition={{ duration: 0.5 + Math.random(), repeat: Infinity, ease: "easeInOut" }} 
                         className="w-2 rounded-t-sm bg-indigo-400" 
                       />
                    ))}
                 </div>
              </motion.div>
            )}

            {activeTab === 'code' && (
              <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full z-10">
                 <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl">
                    <div className="flex items-center gap-1.5 bg-slate-900 border-b border-slate-800 px-4 py-2">
                       <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                       <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                       <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                       <div className="ml-3 text-[10px] font-mono text-slate-500">solution.ts</div>
                    </div>
                    <div className="p-4 font-mono text-xs md:text-sm text-indigo-300">
                       <TypewriterText text="function twoSum(nums, target) {" delay={0} />
                       <TypewriterText text="  const map = new Map();" delay={1} />
                       <TypewriterText text="  for(let i=0; i<nums.length; i++) {" delay={2} />
                       <TypewriterText text="    const diff = target - nums[i];" delay={3} />
                       <TypewriterText text="    // AI generating..." delay={4} className="text-slate-500 italic mt-2" />
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

function TypewriterText({ text, delay, className = "" }: { text: string, delay: number, className?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }} 
      animate={{ opacity: 1, x: 0 }} 
      transition={{ duration: 0.1, delay: delay * 0.4 }} 
      className={`whitespace-pre ${className}`}
    >
      {text}
    </motion.div>
  )
}
