export type MarkdownFormat =
  | 'heading1' | 'heading2' | 'heading3' | 'bold' | 'italic'
  | 'unordered' | 'ordered' | 'checklist' | 'link' | 'inlineCode' | 'codeBlock' | 'quote' | 'table'

interface MarkdownEdit {
  start: number
  end: number
  text: string
  selectionStart: number
  selectionEnd: number
}

function replacement(start: number, end: number, text: string, from: number, to = from): MarkdownEdit {
  return { start, end, text, selectionStart: start + from, selectionEnd: start + to }
}

function backtickFence(text: string, minimum: number) {
  let length = minimum
  for (const [run] of text.matchAll(/`+/g)) length = Math.max(length, run.length + 1)
  return '`'.repeat(length)
}

function inlineCode(text: string): [string, string] {
  const fence = backtickFence(text, 1)
  const pad = /^`|`$/.test(text) ? ' ' : ''
  return [fence + pad, pad + fence]
}

function linePrefix(format: MarkdownFormat, index: number): string | undefined {
  switch (format) {
    case 'heading1': return '# '
    case 'heading2': return '## '
    case 'heading3': return '### '
    case 'unordered': return '- '
    case 'ordered': return `${index + 1}. `
    case 'checklist': return '- [ ] '
    case 'quote': return '> '
  }
}

export function formatMarkdown(value: string, start: number, end: number, format: MarkdownFormat): MarkdownEdit {
  const selected = value.slice(start, end)
  const prefix = linePrefix(format, 0)
  if (prefix) {
    const firstLine = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
    const includesLineBreak = end > start && value[end - 1] === '\n'
    const lastBreak = value.indexOf('\n', includesLineBreak ? end - 1 : end)
    const lastLine = lastBreak === -1 ? value.length : lastBreak
    const original = value.slice(firstLine, lastLine)
    const placeholder = format.startsWith('heading') ? 'Heading' : format === 'quote' ? 'Quote' : 'Item'
    if (!original.trim() && start === end) {
      return replacement(firstLine, lastLine, prefix + placeholder, prefix.length, prefix.length + placeholder.length)
    }

    let index = 0
    const text = original.split('\n').map(line => {
      if (!line.trim()) {
        index = 0
        return line
      }
      return linePrefix(format, index++) + line
    }).join('\n')
    return start === end
      ? replacement(firstLine, lastLine, text, start - firstLine + prefix.length)
      : replacement(firstLine, lastLine, text, text === original ? 0 : prefix.length, text.length)
  }

  if (format === 'codeBlock' || format === 'table') {
    const before = value.slice(0, start)
    const after = value.slice(end)
    const leading = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const trailing = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    if (format === 'codeBlock') {
      const code = selected || 'code'
      const fence = backtickFence(code, 3)
      const opening = leading + fence + '\n'
      return replacement(start, end, opening + code + (code.endsWith('\n') ? '' : '\n') + fence + trailing,
        opening.length, opening.length + code.length)
    }
    const tableHeader = '| Column 1 | Column 2 |\n| --- | --- |\n| '
    const cells = (selected || 'Cell').split('\n').map(line => line.replace(/\|/g, '\\|'))
    const table = leading + tableHeader + cells.join(' | Value |\n| ') + ' | Value |'
    const cellStart = leading.length + tableHeader.length
    return replacement(start, end, table + trailing, cellStart, cellStart + cells[0]!.length)
  }

  if (format === 'link') {
    const url = 'https://example.com'
    let urlStart: number | undefined
    let length = 0
    const text = (selected || 'text').split('\n').map(line => {
      if (!line.trim()) {
        length += line.length + 1
        return line
      }
      const label = line.replace(/[\\[\]]/g, '\\$&')
      urlStart ??= length + label.length + 3
      const link = `[${label}](${url})`
      length += link.length + 1
      return link
    }).join('\n')
    if (!selected) return replacement(start, end, text, 1, 5)
    if (urlStart === undefined) return replacement(start, end, text, 0, text.length)
    return replacement(start, end, text, urlStart, urlStart + url.length)
  }

  const content = selected || (format === 'inlineCode' ? 'code' : 'text')
  let selectionOffset = 0
  let selectionEnd = 0
  let length = 0
  const text = content.split('\n').map(line => {
    const body = line.trim()
    const offset = line.indexOf(body)
    if (!body) {
      length += line.length + 1
      return line
    }
    const [opening, closing] = format === 'inlineCode' ? inlineCode(body) : format === 'bold' ? ['**', '**'] : ['*', '*']
    if (!selectionEnd) selectionOffset = length + offset + opening.length
    selectionEnd = length + offset + opening.length + body.length
    const result = line.slice(0, offset) + opening + body + closing + line.slice(offset + body.length)
    length += result.length + 1
    return result
  }).join('\n')
  return replacement(start, end, text, selectionOffset, selectionEnd || content.length)
}
