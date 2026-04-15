'use client'

import { useRef } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import type * as monacoType from 'monaco-editor'
import { toast } from 'sonner'

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

const EDITOR_OPTIONS: any = {
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
  // Disable all suggestions/autocomplete
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'off',
  tabCompletion: 'off',
  wordBasedSuggestions: 'off',
  parameterHints: { enabled: false },
  suggest: {
    showMethods: false,
    showFunctions: false,
    showConstructors: false,
    showFields: false,
    showVariables: false,
    showClasses: false,
    showInterfaces: false,
    showModules: false,
    showProperties: false,
    showEvents: false,
    showOperators: false,
    showUnits: false,
    showValues: false,
    showKeywords: false,
    showSnippets: false,
    showWords: false,
    showColors: false,
    showFiles: false,
    showReferences: false,
    showFolders: false,
    showTypeParameters: false,
    showIssues: false,
    showUsers: false,
  },
}

export default function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = '60vh',
  className = '',
}: CodeEditorProps) {
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor
    if (!readOnly) {
      editor.focus()

      // Block copy, paste, and cut shortcuts specifically in Monaco for candidates
      editor.onKeyDown((e) => {
        const { keyCode, ctrlKey, metaKey } = e
        
        const isCopy = (ctrlKey || metaKey) && keyCode === 33
        const isPaste = (ctrlKey || metaKey) && keyCode === 52
        const isCut = (ctrlKey || metaKey) && keyCode === 54

        if (isCopy || isPaste || isCut) {
          e.preventDefault()
          e.stopPropagation()
          
          if (isCopy) {
            toast.error('Copy action is restricted')
          } else if (isPaste) {
            toast.error('Paste action is restricted')
          } else if (isCut) {
            toast.error('Cut action is restricted')
          }
        }
      })
    }
  }

  return (
    <div 
      className={`w-full flex-1 flex flex-col min-h-[200px] bg-[#1E1E1E] ${className}`}
      style={height !== '100%' ? { height } : { flex: 1 }}
    >
      <Editor
        height="100%"
        language={LANGUAGE_MAP[language.toLowerCase()] ?? 'plaintext'}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full bg-[#1E1E1E]">
            <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
          </div>
        }
        options={{ 
          ...EDITOR_OPTIONS, 
          readOnly,
          contextmenu: !readOnly // Disable context menu only for candidates
        }}
      />
    </div>
  )
}
