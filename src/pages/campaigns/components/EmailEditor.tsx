import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { useState } from 'react'
import {
  Bold, Italic, UnderlineIcon, Link2, Image as ImageIcon, List,
  ListOrdered, AlignLeft, AlignCenter, AlignRight, Undo, Redo,
  Code, Quote, Minus, ChevronDown, Eye, Code2,
} from 'lucide-react'
import { cn } from '../../../lib/utils'

const MERGE_TAGS = [
  { label: '{{first_name}}', desc: "Recipient's first name" },
  { label: '{{last_name}}', desc: "Recipient's last name" },
  { label: '{{email}}', desc: "Recipient's email address" },
  { label: '{{company}}', desc: "Recipient's company" },
  { label: '{{unsubscribe_link}}', desc: 'Unsubscribe URL' },
]

function ToolbarBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={cn(
        'w-7 h-7 rounded flex items-center justify-center transition-colors text-sage-600',
        active ? 'bg-forest text-white' : 'hover:bg-sage-100 hover:text-forest'
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-sage-200 mx-0.5" />
}

export default function EmailEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [showMergeTags, setShowMergeTags] = useState(false)
  const [showHtml, setShowHtml] = useState(false)
  const [htmlValue, setHtmlValue] = useState(value)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-forest underline' } }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded-lg' } }),
      Placeholder.configure({ placeholder: 'Write your email body here...' }),
      CharacterCount,
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      setHtmlValue(html)
      onChange(html)
    },
  })

  if (!editor) return null

  const insertMergeTag = (tag: string) => {
    editor.chain().focus().insertContent(tag).run()
    setShowMergeTags(false)
  }

  const setLink = () => {
    const url = window.prompt('Enter URL:')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  const addImage = () => {
    const url = window.prompt('Enter image URL:')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="border border-sage-200 rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-3 py-2 border-b border-sage-100 bg-sage-50">
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <select
          className="text-xs border border-sage-200 rounded px-1.5 py-1 text-sage-700 bg-white focus:outline-none focus:border-forest"
          onChange={e => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: parseInt(v) as 1|2|3 }).run()
          }}
          value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'}
        >
          <option value="p">Normal</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={setLink} active={editor.isActive('link')} title="Insert link">
          <Link2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={addImage} title="Insert image">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider line">
          <Minus className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
          <Code className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        {/* Merge tags */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMergeTags(p => !p)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-forest bg-forest/8 hover:bg-forest/15 transition-colors border border-forest/20"
          >
            {'{ }'}
            <span className="ml-0.5">Merge tag</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showMergeTags && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-sage-200 rounded-xl shadow-card-hover z-20 min-w-[200px] py-1 overflow-hidden">
              {MERGE_TAGS.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => insertMergeTag(t.label)}
                  className="w-full text-left px-3 py-2 hover:bg-sage-50 transition-colors"
                >
                  <p className="text-xs font-mono font-semibold text-forest">{t.label}</p>
                  <p className="text-[10px] text-sage-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHtml(p => !p)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              showHtml ? 'bg-forest text-white' : 'text-sage-600 hover:bg-sage-100'
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            HTML
          </button>
        </div>
      </div>

      {showHtml ? (
        <textarea
          className="w-full p-4 text-xs font-mono text-sage-700 resize-none focus:outline-none"
          style={{ minHeight: 320 }}
          value={htmlValue}
          onChange={e => {
            setHtmlValue(e.target.value)
            editor.commands.setContent(e.target.value, false)
            onChange(e.target.value)
          }}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-5 min-h-[320px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-sage-300 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-sage-100 bg-sage-50">
        <span className="text-[10px] text-sage-400">
          {editor.storage.characterCount.characters()} characters · {editor.storage.characterCount.words()} words
        </span>
        <span className="text-[10px] text-sage-400">Use merge tags to personalise</span>
      </div>
    </div>
  )
}
