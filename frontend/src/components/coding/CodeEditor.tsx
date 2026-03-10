'use client'

import { useRef } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import * as monaco from 'monaco-editor'

interface CodeEditorProps {
  value: string
  onChange: (value: string | undefined) => void
  language: string
  readOnly?: boolean
  height?: string
  className?: string
}

// Defined at module scope — never recreated on re-render
const LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  'c++': 'cpp',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  'selenium-python': 'python',
  'selenium-java': 'java',
  'playwright-js': 'javascript',
  'cypress-js': 'javascript',
  pytest: 'python',
  junit: 'java',
  'manual-test-cases': 'markdown',
}

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  lineNumbers: 'on',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  padding: { top: 8, bottom: 8 },
  renderWhitespace: 'selection',
  smoothScrolling: true,
}

export default function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = '60vh',
  className = '',
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor
    if (!readOnly) {
      editor.focus()
    }
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <Editor
        height={height}
        language={LANGUAGE_MAP[language.toLowerCase()] ?? 'plaintext'}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full bg-gray-900">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        }
        options={{ ...EDITOR_OPTIONS, readOnly }}
      />
    </div>
  )
}
