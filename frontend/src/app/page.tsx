import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, FileCheck, Users, BarChart3 } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl">
            <FileCheck className="h-6 w-6 text-primary" />
            Interview Management
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
              AI-Powered Interview Management System
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Streamline your recruitment process with intelligent resume matching and automated test evaluation
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  Login
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/50 py-24">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="bg-background p-6 rounded-lg border">
                <Users className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Resume Matching</h3>
                <p className="text-muted-foreground">
                  Intelligent resume screening with AI-powered skill extraction and candidate ranking
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg border">
                <FileCheck className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Test Evaluation</h3>
                <p className="text-muted-foreground">
                  Automated grading with partial credit for written tests and technical assessments
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg border">
                <BarChart3 className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Analytics & Reports</h3>
                <p className="text-muted-foreground">
                  Comprehensive statistics and insights to make better hiring decisions
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 Interview Management System. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
