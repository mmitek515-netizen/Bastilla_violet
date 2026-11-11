import React, { useState } from 'react';
import { Send, Copy, ImagePlus, ExternalLink } from 'lucide-react';
import type { SvlUiItem } from './SvlChatUi';

/**
 * Safe, declarative library of real message widgets; data must be supplied by the
 * agent/backend. Rendering does not imply a physical service is operational.
 */
export const SVL_UI_EXTRA_TYPES = [
  'chip', 'chip_group', 'heading', 'subheading', 'paragraph', 'quote', 'callout',
  'kbd', 'avatar', 'avatar_group', 'breadcrumb', 'steps', 'key_value',
  'stat_grid', 'list', 'ordered_list', 'checklist', 'data_grid',
  'line_chart', 'area_chart', 'pie_chart', 'donut_chart', 'sparkline',
  'gauge', 'indicator', 'trend', 'agent_card', 'worker_card', 'task_card',
  'mission_card', 'fleet_card', 'project_card', 'database_card', 'file_card',
  'log_viewer', 'activity_feed', 'health_grid', 'service_card',
  'terminal_output', 'diff_viewer', 'number_input', 'search_input', 'date_input',
  'password_input', 'switch', 'multi_select', 'segmented', 'image', 'video',
  'image_prompt', 'json_viewer', 'heatmap', 'scatter_chart', 'histogram',
] as const;

export const SVL_UI_CATEGORIES: Record<string, string[]> = {
  'Tekst i formatowanie': ['text', 'heading', 'subheading', 'paragraph', 'badge', 'chip', 'chip_group', 'quote', 'callout', 'alert', 'status', 'divider', 'kbd', 'avatar', 'avatar_group', 'breadcrumb', 'card', 'lightsaber'],
  'Dane i wykresy': ['metric', 'stat_grid', 'key_value', 'table', 'data_grid', 'bar_chart', 'line_chart', 'area_chart', 'pie_chart', 'donut_chart', 'sparkline', 'heatmap', 'scatter_chart', 'histogram', 'gauge', 'indicator', 'trend', 'progress', 'timeline', 'steps', 'list', 'ordered_list', 'checklist'],
  'Interakcje': ['button', 'button_group', 'toggle', 'switch', 'checkbox', 'radio', 'slider', 'text_input', 'number_input', 'search_input', 'date_input', 'password_input', 'textarea', 'select', 'multi_select', 'segmented', 'tabs', 'accordion'],
  'System i projekty': ['agent_card', 'worker_card', 'task_card', 'mission_card', 'fleet_card', 'project_card', 'database_card', 'file_card', 'activity_feed', 'health_grid', 'service_card', 'log_viewer', 'terminal_output', 'diff_viewer', 'terminal', 'code', 'json_viewer', 'link'],
  'Multimedia': ['image', 'video', 'image_prompt'],
};

const pane = 'min-w-0 rounded-xl border border-cyan-500/20 bg-[#0c1b30] p-3 text-xs text-slate-200';
const actionStyle = 'rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40';
const inputStyle = 'w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100';
const text = (v: unknown) => typeof v === 'boolean' ? (v ? 'Tak' : 'Nie') : String(v ?? '');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const allowedUrl = (url?: string) => url && /^https:\/\//i.test(url) ? url : undefined;
const badge = 'inline-flex max-w-full items-center gap-1 break-all rounded-md border border-cyan-500/35 bg-cyan-950/50 px-2 py-1 text-[11px] font-medium text-cyan-200';
type RenderProps = { component: SvlUiItem; onAction?: (message: string) => void };

function MiniChart({ c, kind }: { c: SvlUiItem; kind: string }) {
  const rows = c.rows ?? [];
  const values = rows.slice(0, 40).map(r => number(r.value));
  if (!values.length) return <p className="text-slate-500">Brak danych do wykresu.</p>;
  const w = 300, h = 112, m = 12;
  const high = Math.max(1, ...values), low = Math.min(0, ...values), range = high - low || 1;
  const points = values.map((v, i) => [
    m + (i / Math.max(1, values.length - 1)) * (w - 2 * m),
    h - m - (v - low) / range * (h - 2 * m),
  ]);
  const coords = points.map(pair => pair.map(p => p.toFixed(1)).join(',')).join(' ');
  if (kind === 'pie_chart' || kind === 'donut_chart') {
    const sum = values.reduce((s, v) => s + Math.max(0, v), 0);
    if (!sum) return <p className="text-slate-500">Brak wartości dodatnich.</p>;
    let total = 0;
    const colors = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#818cf8'];
    const stops = values.map((value, i) => {
      const from = total;
      total += Math.max(0, value) / sum * 100;
      return colors[i % colors.length] + ' ' + from.toFixed(2) + '% ' + total.toFixed(2) + '%';
    });
    return <div className="flex flex-wrap items-center gap-4">
      <div className="h-28 w-28 shrink-0 rounded-full" role="img" aria-label="Udziały z danych podanych przez agenta"
        style={{ background: 'conic-gradient(' + stops.join(',') + ')',
          maskImage: kind === 'donut_chart' ? 'radial-gradient(circle, transparent 0 37%, black 38%)' : undefined }} />
      <div className="space-y-1 text-[11px]">{rows.slice(0, 10).map((r, i) =>
        <div key={i}><span style={{ color: colors[i % colors.length] }}>● </span>{r.label}: {r.value}</div>)}</div>
    </div>;
  }
  if (kind === 'heatmap') return <div className="grid grid-cols-5 gap-1">
    {values.map((v, i) => <div title={rows[i]?.label + ': ' + v} key={i} className="rounded border border-cyan-500/20 p-2 text-center text-[10px]"
      style={{ background: 'rgba(34,211,238,' + (0.08 + clamp((v - low) / range, 0, 1) * 0.55) + ')' }}>{v}</div>)}</div>;
  if (kind === 'histogram') return <div className="flex h-28 items-end gap-1">{values.map((v,i) =>
    <div title={rows[i]?.label + ': ' + v} key={i} className="min-w-1 flex-1 rounded-t bg-cyan-500/60" style={{ height: 2 + clamp((v - low) / range, 0, 1) * 95 + '%' }} />)}</div>;
  const areaPath = m + ',' + (h-m) + ' ' + coords + ' ' + (w-m) + ',' + (h-m);
  return <svg viewBox="0 0 300 112" className="w-full max-w-xl" role="img" aria-label={kind + ' — wartości przekazane w wiadomości'}>
    <line x1={m} x2={w-m} y1={h-m} y2={h-m} stroke="#475569" strokeWidth="1"/>
    {kind === 'area_chart' && <polygon points={areaPath} fill="#06b6d4" opacity=".2"/>}
    {kind === 'scatter_chart'
      ? points.map(([x,y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#22d3ee"/>)
      : <polyline points={coords} stroke="#22d3ee" strokeWidth="2.5" fill="none"/>}
    {kind === 'line_chart' && points.map(([x,y],i) => <circle key={i} cx={x} cy={y} r="2" fill="#a78bfa"/> )}
  </svg>;
}

/** GPT Image replaces the retired DALL-E 3 API; requires explicit operator action. */
function ImagePrompt({ c }: { c: SvlUiItem }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState('');
  const [model, setModel] = useState('');
  const prompt = text(c.value || c.description || c.label);
  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setError(''); setImage(''); setBusy(true);
    try {
      const response = await fetch('/api/ai/runtime/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token.trim() ? { 'x-svl-ai-token': token.trim() } : {}) },
        body: JSON.stringify({ prompt, size: '1024x1024' }),
      });
      const result: { success?: boolean; image?: string; mimeType?: string; model?: string; error?: string } = await response.json();
      if (!response.ok || result.success !== true || !result.image || !result.mimeType) {
        throw new Error(result.error || 'API nie wygenerowało obrazu.');
      }
      setImage('data:' + result.mimeType + ';base64,' + result.image);
      setModel(result.model || 'GPT Image');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <div className={pane}>
    <p className="font-semibold text-cyan-200"><ImagePlus size={15} className="mr-1 inline"/> {c.title || 'Renderowanie z promptu AI'}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-slate-300">{prompt}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <input type="password" autoComplete="off" aria-label="Token renderowania" placeholder="Token AI, jeśli wymagany"
        className={inputStyle + ' flex-1'} value={token} onChange={e => setToken(e.target.value)}/>
      <button className={actionStyle} type="button" onClick={() => void generate()} disabled={busy || !prompt.trim()}>{busy ? 'Generowanie…' : 'Wygeneruj obraz'}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-rose-300">{error}</p>}
    {image && <div className="mt-3 space-y-2">
      <img src={image} alt={c.label || 'Obraz wygenerowany na żądanie'} className="max-h-[420px] w-full rounded object-contain"/>
      <p className="text-[11px] text-emerald-200">Wygenerowano przez {model}</p>
      <a href={image} download="bastilla-ai-image.png" className="text-cyan-300 underline">Zapisz PNG</a>
    </div>}
    <p className="mt-2 text-[10px] text-slate-500">Brak generowania bez kliknięcia; wymagany aktywny backend, klucz API i dostęp do modelu.</p>
  </div>;
}

export function SvlUiExtraWidget({ component: c, onAction }: RenderProps) {
  const [value, setValue] = useState<string | number | boolean>(c.value ?? '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const rows = c.rows ?? [];
  const options = c.options ?? [];
  const name = c.title || c.label || c.type.replaceAll('_', ' ');
  const action = (answer?: string) => {
    if (onAction && c.action) onAction(c.action + (answer ? '\n' + answer : ''));
  };
  const top = <p className="mb-2 break-words font-semibold text-cyan-200">{name}</p>;
  const detail = c.description && <p className="mt-1 break-words text-[11px] text-slate-400">{c.description}</p>;
  switch (c.type) {
    case 'chip': return <span className={badge}>{c.label || text(c.value)}</span>;
    case 'chip_group': case 'avatar_group': return <div className="flex flex-wrap gap-1">{options.map((o,i) =>
      <span key={i} className={badge}>{c.type === 'avatar_group' ? '◉ ' : ''}{o}</span>)}</div>;
    case 'heading': return <h2 className="border-b border-cyan-500/20 pb-1 text-lg font-semibold text-cyan-100">{text(c.value || name)}</h2>;
    case 'subheading': return <h3 className="text-sm font-semibold text-cyan-200">{text(c.value || name)}</h3>;
    case 'paragraph': return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text(c.value || c.description || c.label)}</p>;
    case 'quote': return <blockquote className="border-l-2 border-cyan-400 bg-cyan-950/20 py-2 pl-3 italic">{text(c.value || c.description)}</blockquote>;
    case 'callout': return <div role="note" className={pane + ' border-l-4 border-l-cyan-400'}>{top}{detail}<p>{text(c.value)}</p></div>;
    case 'kbd': return <kbd className="rounded border border-slate-500 bg-slate-900 px-2 py-1 font-mono text-xs">{text(c.value || name)}</kbd>;
    case 'avatar': return <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-950 text-cyan-200">{name.slice(0,1).toUpperCase()}</span>{name}</div>;
    case 'breadcrumb': return <nav aria-label="Ścieżka" className="flex flex-wrap items-center gap-1 text-xs">{options.map((o,i) =>
      <React.Fragment key={i}>{i>0 && <span className="text-slate-600">/</span>}<span className="text-cyan-200">{o}</span></React.Fragment>)}</nav>;
    case 'key_value': case 'data_grid': case 'stat_grid': case 'health_grid':
      return <div className={pane}>{top}<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{rows.map((r,i) =>
        <div key={i} className="rounded border border-slate-700 bg-slate-950/70 p-2">
          <p className="text-[10px] text-slate-400">{r.label}</p><p className="mt-1 break-all text-cyan-200">{r.value}</p>
        </div>)}</div>{detail}</div>;
    case 'list': case 'ordered_list': case 'steps': case 'activity_feed':
      return <div className={pane}>{top}<ol className="space-y-2">{rows.map((r,i) =>
        <li key={i} className="border-l border-cyan-500/35 pl-3"><span className="text-cyan-300">{c.type === 'ordered_list' || c.type === 'steps' ? i+1+'. ' : '• '}{r.label}</span>
          <p className="mt-1 text-slate-400">{r.value}</p></li>)}</ol>{detail}</div>;
    case 'checklist': return <div className={pane}>{top}{rows.map((r,i) =>
      <label key={i} className="my-2 flex items-center gap-2">
        <input type="checkbox" checked={!!checked[String(i)]} onChange={e => setChecked(prev => ({...prev,[i]:e.target.checked}))}/>
        <span>{r.label}</span></label>)}
      {c.action && <button type="button" className={actionStyle} onClick={() => action(rows.filter((_,i) => checked[String(i)]).map(r=>r.label).join(', '))}>Wyślij wybór</button>}</div>;
    case 'line_chart': case 'area_chart': case 'pie_chart': case 'donut_chart':
    case 'sparkline': case 'heatmap': case 'scatter_chart': case 'histogram':
      return <div className={pane}>{top}<MiniChart c={c} kind={c.type}/>{detail}</div>;
    case 'gauge': return <div className={pane}>{top}
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamp(number(c.value),0,100)}
        className="h-3 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan-400" style={{width:clamp(number(c.value),0,100)+'%'}}/></div>
      <p className="mt-2 text-cyan-200">{clamp(number(c.value),0,100)}%</p>{detail}</div>;
    case 'indicator': case 'trend': return <div className={pane}>{top}<span className={badge}>{c.status || text(c.value) || 'Niezweryfikowano'}</span>{detail}</div>;
    case 'agent_card': case 'worker_card': case 'task_card': case 'mission_card': case 'fleet_card':
    case 'project_card': case 'database_card': case 'file_card': case 'service_card':
      return <div className={pane}>{top}<div className="flex items-center gap-2">
        <span className={badge}>{c.status || 'NIEZWERYFIKOWANO'}</span>
        {c.value !== undefined && <span className="break-all text-cyan-100">{text(c.value)}</span>}
      </div>{detail}
      {rows.length > 0 && <dl className="mt-2 space-y-1">{rows.map((r,i) =>
        <div key={i} className="flex flex-wrap justify-between gap-2 border-t border-slate-700/50 pt-1">
          <dt className="text-slate-400">{r.label}</dt><dd className="text-cyan-200">{r.value}</dd>
        </div>)}</dl>}
      {c.action && <button type="button" className={actionStyle + ' mt-3'} onClick={() => action()}><Send size={12} className="mr-1 inline"/>Zapytaj AI</button>}</div>;
    case 'log_viewer': case 'terminal_output': case 'diff_viewer': case 'json_viewer':
      return <div className={pane}>{top}<div className="mb-2 flex justify-end"><button className={actionStyle} type="button"
        onClick={() => void navigator.clipboard.writeText(text(c.value))}><Copy size={12} className="mr-1 inline"/>Kopiuj</button></div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-[#030812] p-2 font-mono text-[11px]">{text(c.value)}</pre>
      <p className="mt-1 text-[10px] text-slate-500">Wynik tekstowy; brak automatycznego uruchamiania.</p></div>;
    case 'number_input': case 'search_input': case 'date_input': case 'password_input':
      return <label className={pane + ' block'}>{top}<input className={inputStyle}
        type={c.type === 'number_input' ? 'number' : c.type === 'search_input' ? 'search' : c.type === 'date_input' ? 'date' : 'password'}
        value={text(value)} placeholder={c.placeholder}
        onChange={e => setValue(e.target.value)}/>
      {c.action && <button type="button" className={actionStyle + ' mt-2'} onClick={() => action(text(value))}>Wyślij</button>}</label>;
    case 'switch': return <label className={pane + ' flex items-center justify-between'}>
      <span>{name}</span><input type="checkbox" role="switch" className="accent-cyan-400"
        checked={value === true || value === 'true'} onChange={e => setValue(e.target.checked)}/></label>;
    case 'multi_select': return <div className={pane}>{top}{options.map(o =>
      <label key={o} className="flex items-center gap-2 py-1"><input type="checkbox"
        checked={selected.includes(o)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,o]:prev.filter(v=>v!==o))}/>{o}</label>)}
      {c.action && <button type="button" className={actionStyle} onClick={()=>action(selected.join(', '))}>Wyślij wybór</button>}</div>;
    case 'segmented': return <div className={pane}>{top}<div className="flex flex-wrap gap-1">{options.map(o =>
      <button type="button" key={o} onClick={()=>{setValue(o);if(c.action)action(o)}} aria-pressed={value===o}
        className={actionStyle + (value===o?' border-cyan-300 bg-cyan-500/30':'')}>{o}</button>)}</div></div>;
    case 'image': return allowedUrl(c.href) ? <div className={pane}>{top}<img alt={c.label||name} src={c.href} loading="lazy" className="max-h-96 w-full rounded object-contain"/>{detail}</div> : <p className="text-slate-500">Wymagany prawdziwy adres HTTPS obrazu.</p>;
    case 'video': return allowedUrl(c.href) ? <div className={pane}>{top}<video controls preload="metadata" src={c.href} className="max-h-96 w-full"/>{detail}</div> : <p className="text-slate-500">Wymagany prawdziwy adres HTTPS wideo.</p>;
    case 'image_prompt': return <ImagePrompt c={c}/>;
    default: return null;
  }
}
