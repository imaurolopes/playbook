import { describe, expect, it } from 'vitest'
import { formatMarkdown, type MarkdownFormat } from './markdown-formatting'

function apply(value: string, start: number, end: number, format: MarkdownFormat) {
  const edit = formatMarkdown(value, start, end, format)
  const result = value.slice(0, edit.start) + edit.text + value.slice(edit.end)
  return { result, selected: result.slice(edit.selectionStart, edit.selectionEnd), caret: edit.selectionStart }
}

describe('Markdown formatting', () => {
  it.each([
    ['heading1', '# Heading', 'Heading'], ['heading2', '## Heading', 'Heading'], ['heading3', '### Heading', 'Heading'],
    ['bold', '**text**', 'text'], ['italic', '*text*', 'text'], ['unordered', '- Item', 'Item'],
    ['ordered', '1. Item', 'Item'], ['checklist', '- [ ] Item', 'Item'], ['quote', '> Quote', 'Quote'],
    ['link', '[text](https://example.com)', 'text'], ['inlineCode', '`code`', 'code'],
    ['codeBlock', '```\ncode\n```', 'code'],
    ['table', '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Value |', 'Cell'],
  ] as const)('inserts a %s template and selects the placeholder', (format, result, selected) => {
    expect(apply('', 0, 0, format)).toMatchObject({ result, selected })
  })

  it('preserves neighboring text and places the selection within the inline markers', () => {
    expect(apply('A word here', 2, 6, 'bold')).toEqual({ result: 'A **word** here', selected: 'word', caret: 4 })
    expect(apply('A word here', 2, 6, 'italic')).toEqual({ result: 'A *word* here', selected: 'word', caret: 3 })
    expect(apply('don’t', 2, 2, 'bold')).toEqual({ result: 'do**text**n’t', selected: 'text', caret: 4 })
  })

  it('formats every selected line, excluding the next unselected line', () => {
    const source = 'one\ntwo\n\nthree\nlast'
    expect(apply(source, 1, 15, 'ordered').result).toBe('1. one\n2. two\n\n1. three\nlast')
    expect(apply(source, 0, 8, 'checklist').result).toBe('- [ ] one\n- [ ] two\n\nthree\nlast')
    expect(apply(source, 4, 4, 'quote')).toEqual({ result: 'one\n> two\n\nthree\nlast', selected: '', caret: 6 })
    expect(apply('\nnext', 0, 0, 'heading3').result).toBe('### Heading\nnext')
    expect(apply('one\n\ntwo', 0, 8, 'bold').result).toBe('**one**\n\n**two**')
  })

  it('inserts a link and selects the destination when text already exists', () => {
    expect(apply('Read [this]', 5, 11, 'link')).toMatchObject({
      result: 'Read [\\[this\\]](https://example.com)', selected: 'https://example.com',
    })
  })

  it('keeps selected code intact and separates a fenced block from surrounding prose', () => {
    const code = 'a\n```\nb'
    expect(apply('Before ' + code + ' after', 7, 7 + code.length, 'codeBlock')).toMatchObject({
      result: 'Before \n\n````\n' + code + '\n````\n\n after', selected: code,
    })
    expect(apply('`example`', 0, 9, 'inlineCode')).toMatchObject({ result: '`` `example` ``', selected: '`example`' })
  })

  it('preserves table source rows and escapes pipe characters inside cells', () => {
    expect(apply('A|B\nC', 0, 5, 'table')).toMatchObject({
      result: '| Column 1 | Column 2 |\n| --- | --- |\n| A\\|B | Value |\n| C | Value |', selected: 'A\\|B',
    })
  })
})
