import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  preload: true,
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  title: 'AI Interview Platform | Transform Your Hiring Process',
  description: 'AI-powered recruitment platform with intelligent resume matching, automated test evaluation, and automated voice screening. Hire faster, smarter, better.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
