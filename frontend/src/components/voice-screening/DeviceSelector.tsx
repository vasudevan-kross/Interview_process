'use client'

import { AudioDevice } from '@/lib/utils/mediaDevices'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Mic } from 'lucide-react'

interface DeviceSelectorProps {
  devices: AudioDevice[]
  selectedDeviceId: string
  onDeviceChange: (deviceId: string) => void
  disabled?: boolean
}

export function DeviceSelector({
  devices,
  selectedDeviceId,
  onDeviceChange,
  disabled = false
}: DeviceSelectorProps) {
  if (devices.length <= 1) {
    // Don't show selector if only one device
    return null
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="device-selector" className="text-sm font-medium text-slate-900">
        <Mic className="inline h-4 w-4 mr-1.5" />
        Select Microphone
      </Label>
      <Select
        value={selectedDeviceId}
        onValueChange={onDeviceChange}
        disabled={disabled}
      >
        <SelectTrigger id="device-selector" className="w-full">
          <SelectValue placeholder="Choose a microphone" />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-slate-500">
        {devices.length} microphone{devices.length !== 1 ? 's' : ''} detected
      </p>
    </div>
  )
}
