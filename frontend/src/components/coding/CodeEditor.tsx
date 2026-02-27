'use client'

import { useRef, useEffect } from 'react'
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

export default function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = '60vh',
  className = '',
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // Configure editor
    editor.updateOptions({
      fontSize: 14,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      readOnly,
    })

    // Focus editor
    if (!readOnly) {
      editor.focus()
    }
  }

  // Map language names to Monaco language IDs
  const getMonacoLanguage = (lang: string): string => {
    const languageMap: Record<string, string> = {
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

    return languageMap[lang.toLowerCase()] || 'plaintext'
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <Editor
        height={height}
        language={getMonacoLanguage(language)}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full bg-gray-900">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        }
        options={{
          readOnly,
          fontSize: 14,
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
    </div>
  )
}
