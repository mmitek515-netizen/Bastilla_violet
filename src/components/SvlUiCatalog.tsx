import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SVL_UI_CATEGORIES } from './SvlUiExtras';
import { SvlChatUiRenderer, type SvlUiDocument, SVL_UI_TYPES } from './SvlChatUi';

export const SvlUiCatalog: React.FC<{ onChoose: (name: string) => void; onClose: () => void }> = ({ onChoose, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('chip_group');
  const catalog = useMemo(() => Object.entries(SVL_UI_CATEGORIES)
    .map(([category, items]) => ({ category, items: items.filter(item => item.toLowerCase().includes(query.toLowerCase().trim())) }))
    .filter(group => group.items.length), [query]);

  const previews: Record<string, SvlUiDocument> = {
    chip_group: { title: 'Przykład niebieskich etykiet', components: [{ type: 'chip_group', options: ['System', 'Flota', 'Misje', 'Ollama', 'HyperCom'] }] },
    agent_card: { title: 'Karta agenta — przykład, nie stan rzeczywisty', components: [{ type: 'agent_card', title: 'Aria', status: 'NIEZWERYFIKOWANO', description: 'Dane demonstracyjne katalogu' }] },
    line_chart: { title: 'Wykres — przykładowe dane', components: [{ type: 'line_chart', title: 'Przykład', rows: [{label:'A',value:3},{label:'B',value:7},{label:'C',value:4}] }] },
    image_prompt: { title: 'Render z promptu', components: [{ type: 'image_prompt', title: 'Projekt statku — przykład', value: 'Futuristic starship concept art with cyan ambient lighting, dark background' }] },
  };
  const example: SvlUiDocument = previews[selected] ?? {
    title: 'Przykład typu ' + selected,
    components: [{ type: selected as typeof SVL_UI_TYPES[number], title: selected, label: selected, status: 'DEMO', value: selected.includes('chart') || selected === 'progress' ? 45 : 'Wartość przykładowa', options: ['Pierwszy', 'Drugi'], rows: [{ label:'Wpis 1',value:20 },{ label:'Wpis 2',value:40 }], description: 'Podgląd katalogu. Rzeczywiste wyniki muszą pochodzić z API.' }],
  };
  return <section aria-label="Biblioteka komponentów czatu AI" className="max-h-[48vh] overflow-y-auto rounded-xl border border-cyan-400/25 bg-[#08192a] p-3 text-xs text-slate-200">
    <div className="flex items-center justify-between gap-2">
      <div><p className="font-semibold text-cyan-200">Biblioteka komponentów AI · {SVL_UI_TYPES.length} typów</p>
        <p className="mt-1 text-[11px] text-slate-400">Każdy agent może generować te elementy bez pisania HTML.</p></div>
      <button aria-label="Zamknij bibliotekę" type="button" className="rounded p-2 hover:bg-slate-800" onClick={onClose}><X size={15}/></button>
    </div>
    <label className="my-3 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1">
      <Search size={14}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Znajdź element…" className="min-w-0 flex-1 bg-transparent p-1 outline-none" /></label>
    <div className="space-y-3">{catalog.map(group => <section key={group.category}>
      <h4 className="mb-1 text-[11px] font-semibold text-slate-300">{group.category} ({group.items.length})</h4>
      <div className="flex flex-wrap gap-1">{group.items.map(item => <button key={item} type="button" aria-pressed={selected === item}
        className={'rounded border px-2 py-1 text-[11px] ' + (selected === item ? 'border-cyan-300 bg-cyan-600/30 text-cyan-100' : 'border-cyan-900/70 bg-cyan-950/30 text-cyan-300')}
        onClick={() => setSelected(item)}>{item}</button>)}</div></section>)}</div>
    <div className="mt-3 border-t border-slate-700 pt-2">
      <SvlChatUiRenderer document={example}/>
      <button type="button" onClick={() => onChoose(selected)}
        className="mt-2 min-h-9 rounded bg-cyan-700 px-3 py-2 font-semibold text-slate-100">Poproś AI o ten element</button>
    </div>
  </section>;
};
