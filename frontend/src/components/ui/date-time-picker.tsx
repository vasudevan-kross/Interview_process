'use client'

import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { CalendarIcon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DateTimePickerProps {
  value: string           // datetime-local format: "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  className?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date & time',
  disabled,
  minDate,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse value string → Date
  const parsed = value ? new Date(value) : undefined
  const selectedDate = parsed && isValid(parsed) ? parsed : undefined

  // Hours/minutes from the value (or defaults)
  const hours = selectedDate ? selectedDate.getHours() : 9
  const minutes = selectedDate ? selectedDate.getMinutes() : 0
  
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12

  const pad = (n: number) => String(n).padStart(2, '0')

  const buildValue = (date: Date, h: number, m: number): string => {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(h)}:${pad(m)}`
  }

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return
    onChange(buildValue(day, hours, minutes))
  }

  const handleHourChange12 = (h12: number) => {
    let newH = h12;
    if (ampm === 'PM' && newH !== 12) newH += 12;
    if (ampm === 'AM' && newH === 12) newH = 0;
    const base = selectedDate || new Date()
    onChange(buildValue(base, newH, minutes))
  }

  const handleMinuteChange = (m: number) => {
    const base = selectedDate || new Date()
    onChange(buildValue(base, hours, m))
  }

  const handleAmPmChange = (newAmPm: string) => {
    let newH = hours;
    if (newAmPm === 'PM' && ampm === 'AM') {
      newH = (newH % 12) + 12;
    } else if (newAmPm === 'AM' && ampm === 'PM') {
      newH = newH % 12;
    }
    const base = selectedDate || new Date()
    onChange(buildValue(base, newH, minutes))
  }

  const displayLabel = selectedDate
    ? format(selectedDate, 'MMM dd, yyyy  hh:mm aa')
    : placeholder

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
            !selectedDate && 'text-slate-400',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-indigo-500 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
        {/* Calendar header gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Select Date & Time</p>
          <p className="text-white font-semibold text-base mt-0.5">
            {selectedDate ? format(selectedDate, 'EEEE, MMM dd yyyy') : 'Choose a date'}
          </p>
        </div>

        {/* Calendar */}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          disabled={minDate ? (day) => day < minDate : undefined}
          initialFocus
        />

        {/* Time selector */}
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Time</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Hour */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-1">Hour</span>
              <select
                value={displayHours}
                onChange={(e) => handleHourChange12(Number(e.target.value))}
                className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((i) => (
                  <option key={i} value={i}>{pad(i)}</option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-bold text-lg mt-4">:</span>

            {/* Minute */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 mb-1">Minute</span>
              <select
                value={minutes}
                onChange={(e) => handleMinuteChange(Number(e.target.value))}
                className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
            </div>

            {/* AM/PM */}
            <div className="flex flex-col items-center ml-2">
              <span className="text-[10px] text-slate-400 mb-1">AM/PM</span>
              <select
                value={ampm}
                onChange={(e) => handleAmPmChange(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>

            {/* Preview */}
            <div className="ml-auto bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 mt-4">
              <span className="text-indigo-700 font-semibold text-sm tabular-nums">
                {pad(displayHours)}:{pad(minutes)} {ampm}
              </span>
            </div>
          </div>
        </div>

        {/* Confirm button */}
        <div className="px-4 pb-3 bg-slate-50">
          <Button
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm h-9"
            onClick={() => setOpen(false)}
            disabled={!selectedDate}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
