import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy } from 'lucide-react'

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState('')
  return <div className="code-block">
    <pre>{children}</pre>
    <button type="button" className="copy-button" aria-label="Copy code" title="Copy code" onClick={async event => {
      const code = event.currentTarget.previousElementSibling?.textContent ?? ''
      try {
        await navigator.clipboard.writeText(code)
        setStatus('Copied')
      } catch {
        setStatus('Copy unavailable')
      }
    }}><Copy size={17} /></button>
    {status && <span className="copy-status" role="status">{status}</span>}
  </div>
}

export function Markdown({ content }: { content: string }) {
  return content.trim()
    ? <div className="markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    }}>{content}</ReactMarkdown></div>
    : <p className="muted">No context has been written for this topic yet.</p>
}
