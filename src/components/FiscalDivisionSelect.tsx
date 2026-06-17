import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';

interface Option { value: string; label: string }
interface Group  { label: string; options: Option[] }

const GROUPS: Group[] = [
  {
    label: 'DGE — Direction des Grandes Entreprises',
    options: [
      { value: 'DGE', label: 'Direction des grandes entreprises' },
    ],
  },
  {
    label: 'DME — Directions des Moyennes Entreprises',
    options: [
      { value: 'DME-CI',   label: 'DME du Centre I' },
      { value: 'DME-CII',  label: 'DME du Centre II' },
      { value: 'DME-CIII', label: 'DME du Centre III' },
      { value: 'DME-CIV',  label: 'DME du Centre IV' },
      { value: 'DME-CV',   label: 'DME du Centre V' },
      { value: 'DME-HB',   label: 'DME des Hauts-Bassins' },
    ],
  },
  {
    label: 'DCI — Directions du Centre des Impôts',
    options: [
      { value: 'DCI-OI',    label: 'DCI Ouaga I' },
      { value: 'DCI-OII',   label: 'DCI Ouaga II' },
      { value: 'DCI-OIII',  label: 'DCI Ouaga III' },
      { value: 'DCI-OIV',   label: 'DCI Ouaga IV' },
      { value: 'DCI-OV',    label: 'DCI Ouaga V' },
      { value: 'DCI-OVI',   label: 'DCI Ouaga VI' },
      { value: 'DCI-OVII',  label: 'DCI Ouaga VII' },
      { value: 'DCI-OVIII', label: 'DCI Ouaga VIII' },
      { value: 'DCI-OIX',   label: 'DCI Ouaga IX' },
      { value: 'DCI-BI',    label: 'DCI Bobo I' },
      { value: 'DCI-BII',   label: 'DCI Bobo II' },
      { value: 'DCI-BIII',  label: 'DCI Bobo III' },
      { value: 'DCI-BIV',   label: 'DCI Bobo IV' },
      { value: 'DCI-NDO',   label: "DCI de N'Dorola" },
      { value: 'DCI-SAM',   label: 'DCI de Samorogouan' },
    ],
  },
  {
    label: 'DRI — Directions Régionales des Impôts',
    options: [
      { value: 'DRI-CE',  label: 'DRI du Centre-Est' },
      { value: 'DRI-CO',  label: 'DRI du Centre-Ouest' },
      { value: 'DRI-CN',  label: 'DRI du Centre-Nord' },
      { value: 'DRI-CS',  label: 'DRI du Centre-Sud' },
      { value: 'DRI-CA',  label: 'DRI des Cascades' },
      { value: 'DRI-BM',  label: 'DRI de la Boucle du Mouhoun' },
      { value: 'DRI-SA',  label: 'DRI du Sahel' },
      { value: 'DRI-EST', label: "DRI de l'Est" },
      { value: 'DRI-SO',  label: 'DRI du Sud-Ouest' },
      { value: 'DRI-NO',  label: 'DRI du Nord' },
      { value: 'DRI-PC',  label: 'DRI du Plateau central' },
    ],
  },
  {
    label: 'DPI — Directions Provinciales des Impôts',
    options: [
      { value: 'DPI-KEN', label: 'DPI du Kénédougou' },
      { value: 'DPI-TUY', label: 'DPI du Tuy' },
      { value: 'DPI-BOU', label: 'DPI du Boulgou' },
    ],
  },
];

const ALL_OPTIONS: Option[] = GROUPS.flatMap(g => g.options);

export function fiscalDivisionLabel(value: string): string {
  return ALL_OPTIONS.find(o => o.value === value)?.label ?? value;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function FiscalDivisionSelect({ value, onChange, placeholder = 'Rechercher une division…' }: Props) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const selectedLabel = ALL_OPTIONS.find(o => o.value === value)?.label ?? '';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function openDropdown() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function select(opt: Option) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  }

  const q = query.toLowerCase();
  const filtered: Group[] = GROUPS.map(g => ({
    ...g,
    options: g.options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      o.value.toLowerCase().includes(q) ||
      g.label.toLowerCase().includes(q)
    ),
  })).filter(g => g.options.length > 0);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        className="form-input"
        onClick={openDropdown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', minHeight: 37 }}
      >
        <span style={{ color: selectedLabel ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
          {value && (
            <span
              onMouseDown={clear}
              style={{ display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
            >
              <Icon name="x" size={13} />
            </span>
          )}
          <Icon name="chevron-down" size={14} style={{ color: 'var(--color-text-tertiary)', transition: 'transform .12s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-md)',
          boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,.12))',
          overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="search" size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filtrer…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', width: '100%' }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 14px', fontSize: 12.5, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Aucun résultat</div>
            ) : filtered.map(group => (
              <div key={group.label}>
                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--color-text-tertiary)' }}>
                  {group.label}
                </div>
                {group.options.map(opt => (
                  <div
                    key={opt.value}
                    onMouseDown={() => select(opt)}
                    style={{
                      padding: '8px 14px',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: opt.value === value ? 'var(--brand-tint)' : 'transparent',
                      color: opt.value === value ? 'var(--brand)' : 'var(--color-text-primary)',
                      fontWeight: opt.value === value ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-background-secondary)'; }}
                    onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <span>{opt.label}</span>
                    {opt.value === value && <Icon name="check" size={13} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
