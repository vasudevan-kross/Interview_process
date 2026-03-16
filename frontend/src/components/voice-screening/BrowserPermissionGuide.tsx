'use client'

import { AlertCircle, CheckCircle } from 'lucide-react'
import { MicrophoneErrorType } from '@/lib/utils/mediaDevices'
import { getBrowserPermissionInstructions } from '@/lib/utils/mediaDevices'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface BrowserPermissionGuideProps {
  errorType: MicrophoneErrorType
  message: string
}

export function BrowserPermissionGuide({ errorType, message }: BrowserPermissionGuideProps) {
  const { browser, instructions } = getBrowserPermissionInstructions()

  const getErrorContent = () => {
    switch (errorType) {
      case 'not_allowed':
        return {
          title: 'Microphone Access Denied',
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          color: 'border-red-200 bg-red-50',
          instructions: instructions
        }

      case 'not_found':
        return {
          title: 'No Microphone Detected',
          icon: <AlertCircle className="h-5 w-5 text-yellow-500" />,
          color: 'border-yellow-200 bg-yellow-50',
          instructions: [
            'Connect a headset or external microphone to your computer',
            'Make sure the microphone is properly plugged in',
            'Try a different USB port if using a USB microphone',
            'Check that the microphone is not muted (hardware switch)',
            'Refresh this page after connecting a microphone'
          ]
        }

      case 'not_readable':
        return {
          title: 'Microphone in Use',
          icon: <AlertCircle className="h-5 w-5 text-orange-500" />,
          color: 'border-orange-200 bg-orange-50',
          instructions: [
            'Close other applications that might be using your microphone (Zoom, Teams, Skype, etc.)',
            'Check if any browser tabs are using the microphone',
            'Restart your browser if the issue persists',
            'Try using a different microphone if available'
          ]
        }

      case 'unsupported':
        return {
          title: 'Browser Not Supported',
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          color: 'border-red-200 bg-red-50',
          instructions: [
            'Please use a modern browser: Chrome, Firefox, Edge, or Safari',
            'Update your browser to the latest version',
            'Internet Explorer is not supported',
            'If using a privacy browser, check that microphone access is not blocked'
          ]
        }

      default:
        return {
          title: 'Microphone Error',
          icon: <AlertCircle className="h-5 w-5 text-slate-500" />,
          color: 'border-slate-200 bg-slate-50',
          instructions: [
            'Refresh the page and try again',
            'Check your browser console for error details',
            'Try using a different browser',
            'Contact support if the issue persists'
          ]
        }
    }
  }

  const content = getErrorContent()

  return (
    <div className="space-y-4">
      <Alert className={`${content.color} border-2`}>
        <div className="flex gap-3">
          {content.icon}
          <div className="flex-1 space-y-1">
            <AlertTitle className="text-base font-semibold text-slate-900">
              {content.title}
            </AlertTitle>
            <AlertDescription className="text-sm text-slate-700">
              {message}
            </AlertDescription>
          </div>
        </div>
      </Alert>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-indigo-600" />
          How to fix this {errorType === 'not_allowed' ? `in ${browser}` : ''}:
        </h3>
        <ol className="space-y-2 ml-6 text-sm text-slate-700">
          {content.instructions.map((instruction, index) => (
            <li key={index} className="list-decimal">
              {instruction}
            </li>
          ))}
        </ol>
      </div>

      {errorType === 'not_allowed' && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm text-indigo-900">
            <strong>💡 Tip:</strong> After updating your browser settings, click the "Try Again" button below to request microphone access again.
          </p>
        </div>
      )}
    </div>
  )
}
