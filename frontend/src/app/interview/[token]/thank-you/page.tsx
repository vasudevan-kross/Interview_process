'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'

export default function ThankYouPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-white" />
          </div>
          <CardTitle className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Interview Submitted Successfully!
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            Thank you for taking the time to complete this interview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
            <h3 className="font-semibold text-green-900 mb-2">Application Complete!</h3>
            <p className="text-green-800 text-sm">
              Your interview submission has been received. We&apos;ll review your answers and get back to you soon.
            </p>
          </div>

          <div className="text-center space-y-2">
            <p className="text-gray-600 text-sm">
              You can now close this tab. We&apos;ll contact you at the email address you provided.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
