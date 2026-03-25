'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minuteStep?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

const getHourMinute = (value: string) => {
  if (!value) return { hours: 9, minutes: 0 }
  const [h, m] = value.split(':').map((v) => Number(v))
  return {
    hours: Number.isFinite(h) ? h : 9,
    minutes: Number.isFinite(m) ? m : 0,
  }
}

const toValue = (hours24: number, minutes: number) => {
  return `${pad(hours24)}:${pad(minutes)}`
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled,
  className,
  minuteStep = 5,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const { hours, minutes } = getHourMinute(value)

  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12

  const setHours12 = (h12: number) => {
    let newH = h12
    if (ampm === 'PM' && newH !== 12) newH += 12
    if (ampm === 'AM' && newH === 12) newH = 0
    onChange(toValue(newH, minutes))
  }

  const setMinutes = (m: number) => {
    onChange(toValue(hours, m))
  }

  const setAmPm = (newAmPm: string) => {
    let newH = hours
    if (newAmPm === 'PM' && ampm === 'AM') {
      newH = (newH % 12) + 12
    } else if (newAmPm === 'AM' && ampm === 'PM') {
      newH = newH % 12
    }
    onChange(toValue(newH, minutes))
  }

  const displayLabel = value
    ? `${pad(displayHours)}:${pad(minutes)} ${ampm}`
    : placeholder

  const minuteOptions = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-10',
            'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50',
            'focus:ring-2 focus:ring-indigo-400 focus:border-transparent',
            !value && 'text-slate-400',
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 text-indigo-500 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Select Time</p>
          <p className="text-white font-semibold text-base mt-0.5">
            {value ? displayLabel : 'Choose a time'}
          </p>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-1">Hour</span>
              <select
                value={displayHours}
                onChange={(e) => setHours12(Number(e.target.value))}
                className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((i) => (
                  <option key={i} value={i}>{pad(i)}</option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-bold text-lg mt-4">:</span>

            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-1">Minute</span>
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col items-center ml-2">
              <span className="text-[10px] text-slate-400 mb-1">AM/PM</span>
              <select
                value={ampm}
                onChange={(e) => setAmPm(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>

            <div className="ml-auto bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 mt-4">
              <span className="text-indigo-700 font-semibold text-sm tabular-nums">
                {pad(displayHours)}:{pad(minutes)} {ampm}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 bg-slate-50">
          <Button
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm h-9"
            onClick={() => {
              if (!value) {
                onChange(toValue(9, 0))
              }
              setOpen(false)
            }}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
