// Tiptap set up for the invoice notes (PRO-167): only the formats the invoice
// page and the PDF can show (see rich-text.ts). No code, quotes, images or rules.

import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { safeHref } from '@/lib/rich-text';

export const NOTES_MAX_CHARS = 2000;

export const notesExtensions = [
  StarterKit.configure({
    heading: { levels: [3] },
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https', 'mailto'],
      isAllowedUri: url => safeHref(url) !== null,
    },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
];
