// The invoice editor's toolbar (PRO-167). Undo/redo and text formatting act on
// « Notes et conditions » and are greyed elsewhere; « Insérer » works anywhere.

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { useDismiss } from '@/lib/use-dismiss';
import { safeHref } from '@/lib/rich-text';

export type InsertKind = 'line' | 'catalogue' | 'discount' | 'notes';

const Svg = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d && <path d={d} />}{children}
  </svg>
);

function ToolButton({ label, active, disabled, onRun, children }: { label: string; active?: boolean; disabled?: boolean; onRun: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`ie-tool${active ? ' on' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the cursor in the notes while clicking
      onMouseDown={e => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({ editor, notesActive, locked, onInsert, onBadLink }: {
  editor: Editor | null;
  /** The cursor was last in the notes */
  notesActive: boolean;
  locked: boolean;
  onInsert: (kind: InsertKind) => void;
  onBadLink: () => void;
}) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      link: e.isActive('link'), bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), heading: e.isActive('heading', { level: 3 }),
      align: ((['center', 'right', 'justify'] as const).find(a => e.isActive({ textAlign: a })) ?? 'left') as 'left' | 'center' | 'right' | 'justify',
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    } : null,
  });
  const [insertOpen, setInsertOpen] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);
  const closeInsert = useCallback(() => setInsertOpen(false), []);
  useDismiss(insertRef, insertOpen, closeInsert);

  const off = !editor || !notesActive || locked;
  const chain = () => editor!.chain().focus();
  const setLink = () => {
    if (!editor) return;
    if (st?.link) { chain().unsetLink().run(); return; }
    const url = window.prompt('Adresse du lien (https://… ou mailto:…)');
    if (url === null || url.trim() === '') return;
    const href = safeHref(/^[a-z]+:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    if (!href) { onBadLink(); return; }
    chain().extendMarkRange('link').setLink({ href }).run();
  };
  const nextAlign = { left: 'center', center: 'right', right: 'justify', justify: 'left' } as const;
  const insert = (k: InsertKind) => { setInsertOpen(false); onInsert(k); };

  return (
    <div className="ie-toolbar" role="toolbar" aria-label="Édition de la facture">
      <ToolButton label="Annuler la dernière modification des notes" disabled={off || !st?.canUndo} onRun={() => chain().undo().run()}><Svg d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></ToolButton>
      <ToolButton label="Rétablir" disabled={off || !st?.canRedo} onRun={() => chain().redo().run()}><Svg d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /></ToolButton>
      <span className="ie-tool-sep" aria-hidden="true" />
      <ToolButton label="Titre" active={!!st?.heading} disabled={off} onRun={() => chain().toggleHeading({ level: 3 }).run()}><span className="ie-tool-txt">Titre</span></ToolButton>
      <span className="ie-tool-sep" aria-hidden="true" />
      <ToolButton label="Gras" active={!!st?.bold} disabled={off} onRun={() => chain().toggleBold().run()}><b>B</b></ToolButton>
      <ToolButton label="Italique" active={!!st?.italic} disabled={off} onRun={() => chain().toggleItalic().run()}><i className="ie-tool-i">I</i></ToolButton>
      <ToolButton label="Souligné" active={!!st?.underline} disabled={off} onRun={() => chain().toggleUnderline().run()}><u>U</u></ToolButton>
      <ToolButton label="Barré" active={!!st?.strike} disabled={off} onRun={() => chain().toggleStrike().run()}><s>S</s></ToolButton>
      <ToolButton label={st?.link ? 'Retirer le lien' : 'Lien'} active={!!st?.link} disabled={off} onRun={setLink}>
        <Svg><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Svg>
      </ToolButton>
      <span className="ie-tool-sep" aria-hidden="true" />
      <ToolButton label="Liste à puces" active={!!st?.bullet} disabled={off} onRun={() => chain().toggleBulletList().run()}>
        <Svg><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></Svg>
      </ToolButton>
      <ToolButton label="Liste numérotée" active={!!st?.ordered} disabled={off} onRun={() => chain().toggleOrderedList().run()}>
        <Svg d="M10 6h10M10 12h10M10 18h10M4 5h1v4M3.5 9h2.5M4 14.5a1 1 0 0 1 2 0c0 1-2 2-2 3.5h2" />
      </ToolButton>
      <ToolButton label={`Alignement : ${{ left: 'gauche', center: 'centré', right: 'droite', justify: 'justifié' }[st?.align ?? 'left']} (cliquer pour changer)`} disabled={off}
        onRun={() => chain().setTextAlign(nextAlign[st?.align ?? 'left']).run()}>
        <Svg d={{ left: 'M4 6h16M4 12h10M4 18h14', center: 'M4 6h16M7 12h10M5 18h14', right: 'M4 6h16M10 12h10M6 18h14', justify: 'M4 6h16M4 12h16M4 18h16' }[st?.align ?? 'left']} />
      </ToolButton>
      <span className="ie-tool-sep" aria-hidden="true" />
      <div className="ie-insert" ref={insertRef}>
        <button type="button" className="ie-tool ie-tool-txt" aria-haspopup="menu" aria-expanded={insertOpen} disabled={locked} onClick={() => setInsertOpen(o => !o)}>
          + Insérer <span aria-hidden="true">▾</span>
        </button>
        {insertOpen && (
          <div className="dt-menu ie-menu" role="menu" aria-label="Insérer">
            <button type="button" role="menuitem" className="dt-mi" onClick={() => insert('line')}><span><b>Ligne vide</b><small>Description, quantité, prix à saisir</small></span></button>
            <button type="button" role="menuitem" className="dt-mi" onClick={() => insert('catalogue')}><span><b>Depuis le catalogue</b><small>Ou tapez « / » dans une description</small></span></button>
            <button type="button" role="menuitem" className="dt-mi" onClick={() => insert('discount')}><span><b>Remise sur la facture</b><small>Un pourcentage, avant TVA</small></span></button>
            <button type="button" role="menuitem" className="dt-mi" onClick={() => insert('notes')}><span><b>Notes et conditions</b><small>En bas de la facture</small></span></button>
          </div>
        )}
      </div>
      <span className="ie-tool-where">{notesActive ? 'Mise en forme : Notes et conditions' : 'Mise en forme : cliquez dans les notes'}</span>
    </div>
  );
}
