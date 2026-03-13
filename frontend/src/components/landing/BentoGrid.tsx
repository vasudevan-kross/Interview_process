'use client'

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FileSearch, FileCheck, Video, TrendingUp, Zap, CheckCircle2 } from 'lucide-react'

// Features data
const features = [
  {
    icon: FileSearch,
    title: "Smart Resume Matching",
    description: "AI analyzes resumes to extract skills, experience, and qualifications. Automatically ranks candidates based on job requirements with 95% accuracy.",
    colSpan: "md:col-span-2 lg:col-span-2",
    delay: 0,
    Visual: () => (
      <div className="absolute right-0 top-0 w-48 h-full bg-gradient-to-l from-slate-900 via-slate-900/80 to-transparent p-6 flex flex-col justify-center items-end opacity-20 group-hover:opacity-100 transition-opacity duration-700">
        <motion.div
           animate={{ y: [0, -10, 0] }}
           transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
           className="bg-slate-800 border border-indigo-500/30 p-3 rounded-lg w-32 shadow-xl shadow-indigo-500/10 mb-2"
        >
          <div className="h-2 w-full bg-slate-700 rounded mb-2" />
          <div className="h-2 w-3/4 bg-slate-700 rounded mb-3" />
          <div className="flex justify-between items-center">
             <div className="h-4 w-12 bg-indigo-500/20 rounded-full" />
             <span className="text-[10px] text-green-400 font-bold">98% Match</span>
          </div>
        </motion.div>
      </div>
    )
  },
  {
    icon: FileCheck,
    title: "Automated Evaluation",
    description: "Process 20+ answer sheets simultaneously. AI reads handwriting and generates feedback.",
    colSpan: "md:col-span-1 lg:col-span-1",
    delay: 0.1,
    Visual: () => (
      <div className="absolute right-4 bottom-4 opacity-10 group-hover:opacity-100 transition-opacity duration-500">
        <motion.div animate={{ rotate: [0, 5, 0] }} transition={{ duration: 4, repeat: Infinity }}>
          <FileCheck className="w-24 h-24 text-indigo-500/20" />
        </motion.div>
      </div>
    )
  },
  {
    icon: TrendingUp,
    title: "Analytics Dashboard",
    description: "Comprehensive insights into hiring metrics and candidate performance trends.",
    colSpan: "md:col-span-1 lg:col-span-1",
    delay: 0.3,
    Visual: () => null
  },
  {
    icon: Zap,
    title: "Batch Processing",
    description: "Process hundreds of applications in minutes with parallel AI evaluation.",
    colSpan: "md:col-span-2 lg:col-span-2",
    delay: 0.4,
    Visual: () => (
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-32 h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.5)] transform -translate-y-1/2" />
        <div className="absolute top-1/3 left-1/2 w-48 h-[1px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_10px_rgba(99,102,241,0.5)] transform -translate-x-1/2 rotate-45" />
      </div>
    )
  },
  {
    icon: CheckCircle2,
    title: "Quality Assurance",
    description: "Hybrid scoring algorithms and error recovery ensure 95%+ reliability.",
    colSpan: "md:col-span-3 lg:col-span-3",
    delay: 0.5,
    Visual: () => null
  }
]

function BentoCard({ feature }: { feature: any }) {
  const [isHovered, setIsHovered] = useState(false)
  
  const Icon = feature.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: feature.delay }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden ${feature.colSpan}`}
    >
      {/* Background Hover Element */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 bg-gradient-to-br from-indigo-500/5 to-transparent z-0" />
      
      {/* Content */}
      <div className="relative z-10 p-8 h-full flex flex-col pointer-events-none">
        <div className="bg-slate-800/80 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300 border border-slate-700/50 group-hover:border-indigo-500/50">
          <Icon className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
        </div>
        <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">
          {feature.title}
        </h3>
        <p className="text-slate-400 leading-relaxed text-sm">
          {feature.description}
        </p>
      </div>

      {/* Decorative Visuals */}
      {feature.Visual && <feature.Visual />}
    </motion.div>
  )
}

export function BentoGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {features.map((feature, idx) => (
        <BentoCard key={idx} feature={feature} />
      ))}
    </div>
  )
}
