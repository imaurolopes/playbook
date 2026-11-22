import { useRef, type KeyboardEvent } from 'react'
import {
  Bold, Code, CodeXml, Heading1, Heading2, Heading3, Italic, Link, List,
  ListChecks, ListOrdered, Quote, SquareCode, Table, type LucideIcon,
} from 'lucide-react'
import { formatMarkdown, type MarkdownFormat } from './markdown-formatting'

const controls: readonly { format: MarkdownFormat; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { format: 'heading1', label: 'Heading 1', icon: Heading1 },
  { format: 'heading2', label: 'Heading 2', icon: Heading2 },
  { format: 'heading3', label: 'Heading 3', icon: Heading3 },
  { format: 'bold', label: 'Bold', icon: Bold, shortcut: 'b' },
  { format: 'italic', label: 'Italic', icon: Italic, shortcut: 'i' },
  { format: 'unordered', label: 'Unordered list', icon: List },
  { format: 'ordered', label: 'Ordered list', icon: ListOrdered },
  { format: 'checklist', label: 'Checklist', icon: ListChecks },
  { format: 'link', label: 'Link', icon: Link, shortcut: 'k' },
  { format: 'inlineCode', label: 'Inline code', icon: Code },
  { format: 'codeBlock', label: 'Code block', icon: SquareCode },
  { format: 'quote', label: 'Blockquote', icon: Quote },
  { format: 'table', label: 'Table', icon: Table },
]

export function MarkdownIndicator() {
  return <span className="markdown-indicator"><CodeXml size={16} aria-hidden="true" /> Markdown</span>
}

export function MarkdownEditor({ value, onChange, hidden, label, placeholder, rows }: {
  value: string
  onChange: (value: string) => void
  hidden?: boolean
  label: string
  placeholder?: string
  rows?: number
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  function apply(format: MarkdownFormat) {
    const editor = textarea.current
    if (!editor || editor.matches(':disabled')) return
    const { start, end, text, selectionStart, selectionEnd } =
      formatMarkdown(editor.value, editor.selectionStart, editor.selectionEnd, format)
    if (text === editor.value.slice(start, end)) return
    editor.focus()
    editor.setSelectionRange(start, end)
    // Native insertion keeps toolbar changes in the same undo history as typing.
    if (!editor.ownerDocument.execCommand?.('insertText', false, text)) {
      editor.setRangeText(text, start, end, 'end')
    }
    onChange(editor.value)
    editor.setSelectionRange(selectionStart, selectionEnd)
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return
    const control = controls.find(item => item.shortcut === event.key.toLowerCase())
    if (!control) return
    event.preventDefault()
    apply(control.format)
  }

  return <div hidden={hidden}>
    <div className="markdown-toolbar" role="group" aria-label="Markdown formatting">
      {controls.map(({ format, label, icon: Icon, shortcut }) => <button key={format} type="button"
        aria-label={label} aria-keyshortcuts={shortcut ? `Control+${shortcut.toUpperCase()} Meta+${shortcut.toUpperCase()}` : undefined}
        title={shortcut ? `${label} (Ctrl/⌘+${shortcut.toUpperCase()})` : label}
        onMouseDown={event => { if (event.button === 0) event.preventDefault() }} onClick={() => apply(format)}>
        <Icon size={17} aria-hidden="true" />
      </button>)}
    </div>
    <textarea ref={textarea} className="markdown-input" aria-label={label} placeholder={placeholder} rows={rows}
      value={value} onChange={event => onChange(event.target.value)} onKeyDown={handleShortcut} />
  </div>
}
