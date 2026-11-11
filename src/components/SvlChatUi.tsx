import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Send, Terminal, Zap } from 'lucide-react';
import { SVL_UI_EXTRA_TYPES, SvlUiExtraWidget } from './SvlUiExtras';

/**
 * SVL declarative chat UI. Agents return JSON in a fenced svl-ui block.
 * The renderer does NOT execute arbitrary HTML or JavaScript from agents.
 */
export const SVL_UI_TYPES = [
  'lightsaber', 'text', 'card', 'badge', 'alert', 'status', 'metric', 'button',
  'button_group', 'progress', 'toggle', 'checkbox', 'radio', 'slider',
  'text_input', 'textarea', 'select', 'tabs', 'accordion', 'table',
  'bar_chart', 'timeline', 'code', 'terminal', 'divider', 'link',
  ...SVL_UI_EXTRA_TYPES,
] as const;
export type SvlUiType = typeof SVL_UI_TYPES[number];
export interface SvlUiItem {
  type: SvlUiType;
  id?: string; title?: string; label?: string; description?: string;
  value?: string | number | boolean; status?: string; unit?: string;
  placeholder?: string; action?: string; href?: string;
  min?: number; max?: number; step?: number;
  options?: string[]; rows?: Array<{ label: string; value: string | number }>;
}
export interface SvlUiDocument { title?: string; components: SvlUiItem[] }
export type SvlUiPart = { kind: 'text'; text: string } | { kind: 'ui'; document: SvlUiDocument };
const TYPES = new Set<string>(SVL_UI_TYPES);
const string = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
const number = (v: unknown, defaultValue: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : defaultValue;

/** Strict JSON schema subset; bounds output size and component count. */
export function validateSvlUiDocument(raw: unknown): SvlUiDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.components) || doc.components.length < 1 || doc.components.length > 40) return null;
  const components: SvlUiItem[] = [];
  for (const entry of doc.components) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const c = entry as Record<string, unknown>;
    if (typeof c.type !== 'string' || !TYPES.has(c.type)) return null;
    if (c.options !== undefined &&
      (!Array.isArray(c.options) || c.options.length > 30 || !c.options.every(o => typeof o === 'string'))) return null;
    if (c.rows !== undefined && (!Array.isArray(c.rows) || c.rows.length > 100)) return null;
    components.push({
      type: c.type as SvlUiType,
      id: string(c.id, 80),
      title: string(c.title, 180),
      label: string(c.label, 180),
      description: string(c.description, 600),
      value: typeof c.value === 'boolean' || (typeof c.value === 'number' && Number.isFinite(c.value))
        ? c.value : string(c.value, 2000),
      status: string(c.status, 50),
      unit: string(c.unit, 40),
      placeholder: string(c.placeholder, 150),
      action: string(c.action, 1000),
      href: typeof c.href === 'string' && /^https:\/\//i.test(c.href) ? c.href.slice(0, 2000) : undefined,
      min: number(c.min, 0), max: number(c.max, 100),
      step: Math.max(0.001, number(c.step, 1)),
      options: Array.isArray(c.options) ? c.options.map(o => string(o, 120)) : undefined,
      rows: Array.isArray(c.rows) ? c.rows.map(r => {
        const row = r && typeof r === 'object' ? r as Record<string, unknown> : {};
        return { label: string(row.label, 140),
          value: typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : string(row.value, 500) };
      }) : undefined,
    });
  }
  return { title: string(doc.title, 180), components };
}

export function splitSvlUiContent(content: string): SvlUiPart[] {
  const fence = String.fromCharCode(96).repeat(3);
  const regex = new RegExp(fence + 'svl-ui\\s*\\n([\\s\\S]*?)' + fence, 'gi');
  const result: SvlUiPart[] = [];
  let offset = 0;
  for (const match of content.matchAll(regex)) {
    const at = match.index ?? 0;
    if (at > offset) result.push({ kind: 'text', text: content.slice(offset, at) });
    let document: SvlUiDocument | null = null;
    try {
      if (match[1].length <= 30000) document = validateSvlUiDocument(JSON.parse(match[1]));
    } catch { /* Preserve rejected markup as normal text. */ }
    result.push(document ? { kind: 'ui', document } : { kind: 'text', text: match[0] });
    offset = at + match[0].length;
  }
  if (offset < content.length) result.push({ kind: 'text', text: content.slice(offset) });
  return result.length ? result : [{ kind: 'text', text: content }];
}

const panel = 'rounded-xl border border-violet-400/20 bg-[#111a2b] p-3 text-slate-100';
const control = 'min-h-9 rounded-lg border border-violet-400/30 bg-violet-600/15 px-3 py-2 text-xs text-violet-100 hover:bg-violet-600/30 focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';
const field = 'min-h-9 w-full rounded-lg border border-slate-700 bg-[#070d19] px-3 py-2 text-xs text-slate-100 focus:border-violet-400 focus:outline-none';

export function SvlLightsaber() {
  const [enabled, setEnabled] = useState(true);
  return <button type="button" title="Włącz lub wyłącz fioletowe ostrze" aria-label="Miecz świetlny" aria-pressed={enabled}
    onClick={() => setEnabled(value => !value)}
    className="rounded-lg border border-violet-400/20 bg-[#0a1020] p-2 hover:border-violet-300">
    <svg width="150" height="40" viewBox="0 0 160 42" aria-hidden="true">
      <rect x="3" y="16" width="44" height="10" rx="3" fill="#8997ac"/>
      <rect x="8" y="18" width="27" height="6" rx="2" fill="#263148"/>
      <rect x="14" y="18" width="3" height="6" fill="#d5ddec"/>
      <rect x="24" y="18" width="3" height="6" fill="#d5ddec"/>
      <rect x="40" y="13" width="9" height="16" rx="2" fill="#c8d0e0"/>
      <circle cx="34" cy="21" r="2" fill={enabled ? '#a78bfa' : '#526072'}/>
      {enabled && <>
        <line x1="48" y1="21" x2="151" y2="21" stroke="#a78bfa" strokeWidth="18" strokeLinecap="round" opacity=".15"/>
        <line x1="48" y1="21" x2="151" y2="21" stroke="#ad7eff" strokeWidth="9" strokeLinecap="round" opacity=".6"/>
        <line x1="48" y1="21" x2="151" y2="21" stroke="#f8f4ff" strokeWidth="2.5" strokeLinecap="round"/>
      </>}
    </svg>
  </button>;
}

const asText = (value: unknown) => typeof value === 'boolean' ? (value ? 'Tak' : 'Nie') : String(value ?? '');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function Widget({ component: c, onAction }: { component: SvlUiItem; onAction?: (message: string) => void }) {
  const [value, setValue] = useState<string | number | boolean>(c.value ?? '');
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const sendAction = (valueToSend?: string) => {
    // Click only sends a deliberate user request to chat; it never executes on the host.
    const text = valueToSend || c.action || c.label || c.title;
    if (onAction && text) onAction(text);
  };
  const heading = <span className="font-semibold text-violet-100">{c.title || c.label}</span>;
  const note = c.description && <p className="mt-1 break-words text-[11px] text-slate-400">{c.description}</p>;
  const opts = c.options ?? [];
  const rows = c.rows ?? [];
  const low = c.min ?? 0;
  const high = Math.max(low + 1, c.max ?? 100);
  const currentNumber = Number(value) || 0;

  switch (c.type) {
    case 'lightsaber': return <div className={panel}><SvlLightsaber/>{note}</div>;
    case 'divider': return <hr className="my-2 border-slate-700"/>;
    case 'text': return <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{asText(c.value || c.label || c.description)}</p>;
    case 'badge': return <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-600/15 px-3 py-1 text-[11px] font-medium text-violet-200">{c.label || asText(c.value)}</span>;
    case 'card': case 'alert': case 'status': return <div role={c.type === 'alert' ? 'alert' : undefined} className={panel}>{heading}{note}<p className="mt-2 break-words text-xs text-slate-300">{asText(c.value || c.status)}</p></div>;
    case 'metric': return <div className={panel}>{heading}<p className="mt-1 text-xl font-bold text-violet-200">{asText(c.value)} <span className="text-xs font-normal text-slate-400">{c.unit}</span></p>{note}</div>;
    case 'progress': return <div className={panel}>{heading}<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-400" style={{ width: clamp(currentNumber, 0, 100) + '%' }}/></div><p className="mt-1 text-[11px] text-slate-400">{clamp(currentNumber, 0, 100)}%</p>{note}</div>;
    case 'button': return <button type="button" onClick={() => sendAction()} className={control}><Send className="mr-1.5 inline h-3.5 w-3.5"/>{c.label || c.title}</button>;
    case 'button_group': return <div className="flex flex-wrap gap-2">{opts.map(option =>
      <button type="button" key={option} onClick={() => sendAction((c.action ? c.action + ' ' : '') + option)} className={control}>{option}</button>)}</div>;
    case 'toggle': case 'checkbox': return <label className={panel + ' flex cursor-pointer items-center gap-3'}>
      <input type="checkbox" checked={value === true || value === 'true'} onChange={e => setValue(e.target.checked)} className="accent-violet-400"/>
      <span className="flex-1 text-xs">{c.label || c.title}</span><span className="text-[10px] text-slate-400">{value === true || value === 'true' ? 'Włączono' : 'Wyłączono'}</span>
    </label>;
    case 'radio': return <fieldset className={panel}><legend className="text-xs font-semibold">{c.label || c.title}</legend><div className="mt-2 flex flex-wrap gap-3">{opts.map(option =>
      <label key={option} className="flex items-center gap-2 text-xs"><input type="radio" checked={value === option} onChange={() => setValue(option)} className="accent-violet-400"/>{option}</label>)}</div></fieldset>;
    case 'slider': return <div className={panel}>{heading}<input type="range" className="mt-2 w-full accent-violet-400" min={low} max={high} step={c.step || 1} value={clamp(currentNumber, low, high)} onChange={e => setValue(Number(e.target.value))}/><p className="text-xs text-slate-300">{asText(value)} {c.unit}</p></div>;
    case 'text_input': case 'textarea': return <label className="block space-y-2 text-xs text-violet-100">{c.label || c.title}
      {c.type === 'textarea'
        ? <textarea value={asText(value)} rows={3} onChange={e => setValue(e.target.value)} placeholder={c.placeholder} className={field}/>
        : <input value={asText(value)} onChange={e => setValue(e.target.value)} placeholder={c.placeholder} className={field}/>}
      {c.action && <button type="button" onClick={() => sendAction(c.action + '\n' + asText(value))} className={control}>Wyślij</button>}
    </label>;
    case 'select': return <label className="block space-y-1.5 text-xs text-violet-100">{c.label || c.title}<select className={field} value={asText(value) || opts[0] || ''} onChange={e => setValue(e.target.value)}>{opts.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
    case 'tabs': return <div className={panel}><div className="flex flex-wrap gap-1 border-b border-slate-700 pb-2">{opts.map((o, i) =>
      <button type="button" key={o} onClick={() => setSelectedTab(i)} className={'rounded-md px-3 py-1.5 text-xs ' + (selectedTab === i ? 'bg-violet-500/25 text-violet-100' : 'text-slate-400')}>{o}</button>)}</div>{note}<p className="pt-2 text-xs text-slate-300">{opts[selectedTab] || c.label}</p></div>;
    case 'accordion': return <div className={panel}><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-xs text-violet-100">{heading}{open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>{open && <div className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-300">{c.description || asText(c.value)}</div>}</div>;
    case 'table': return <div className={panel}>{heading}<div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-700 text-left text-violet-200"><th className="p-2">Nazwa</th><th className="p-2">Wartość</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-slate-800"><td className="p-2">{row.label}</td><td className="p-2">{row.value}</td></tr>)}</tbody></table></div></div>;
    case 'bar_chart': return <div className={panel}>{heading}<div className="mt-3 space-y-2">{rows.map((row, i) => {
      const numeric = typeof row.value === 'number' ? row.value : Number(row.value);
      const ceiling = Math.max(1, ...rows.map(r => Number(r.value) || 0));
      return <div key={i}><div className="mb-1 flex justify-between gap-3 text-[11px] text-slate-300"><span>{row.label}</span><span>{row.value}</span></div><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full rounded bg-violet-400" style={{width: clamp((numeric || 0) / ceiling * 100, 0, 100) + '%'}}/></div></div>;
    })}</div></div>;
    case 'timeline': return <div className={panel}>{heading}<ol className="mt-2 border-l border-violet-400/40 pl-3">{rows.map((row, i) => <li key={i} className="mb-3 text-[11px] text-slate-300"><strong className="text-violet-200">{row.label}</strong><p>{row.value}</p></li>)}</ol></div>;
    case 'code': case 'terminal': return <div className={panel}><div className="mb-2 flex items-center justify-between">{heading}<button type="button" title="Kopiuj" onClick={() => void navigator.clipboard.writeText(asText(c.value))} className="rounded p-1.5 text-slate-400 hover:text-violet-200"><Copy size={14}/></button></div><pre className="overflow-x-auto rounded-lg bg-[#050a12] p-3 text-[11px] text-emerald-200">{asText(c.value)}</pre>{c.type === 'terminal' && <p className="mt-2 text-[10px] text-slate-500">Podgląd wyniku, bez automatycznego wykonania</p>}</div>;
    case 'link': return c.href ? <a href={c.href} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-xs text-violet-300 underline">{c.label || c.href}<ExternalLink size={12}/></a> : null;
    default: return <SvlUiExtraWidget component={c} onAction={onAction} />;
  }
}

export function SvlChatUiRenderer({ document, onAction }: { document: SvlUiDocument; onAction?: (message: string) => void }) {
  return <section aria-label={document.title || 'Interaktywne elementy SVL'} className="my-3 space-y-2 rounded-xl border border-violet-400/25 bg-[#0c1424] p-3">
    <div className="flex items-center gap-2 text-[11px] font-semibold text-violet-200"><Zap size={13}/>{document.title || 'Elementy interaktywne SVL'}</div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{document.components.map((component, i) =>
      <div key={component.id || i} className={component.type === 'divider' || component.type === 'table' || component.type === 'bar_chart' || component.type === 'terminal' || component.type === 'textarea' ? 'sm:col-span-2' : ''}>
        <Widget component={component} onAction={onAction}/>
      </div>)}</div>
  </section>;
}
