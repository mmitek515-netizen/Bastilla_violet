import React, { useEffect, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';

export type SvlAvatars = Record<string, string>;
const PEOPLE = [
  { id: 'Operator', name: 'Operator' },
  { id: 'Alex', name: 'Alex' },
  { id: 'Astyria', name: 'Astyria' },
  { id: 'Aurelius', name: 'Aurelius' },
  { id: 'si_1', name: 'Aria' },
];
const ids = new Set(PEOPLE.map(person => person.id));
const field = 'w-full min-h-10 rounded-lg border border-slate-700 bg-[#0a1120] p-2 text-xs text-slate-200 focus:outline-none focus:border-violet-400';
const button = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/20 px-3 text-xs text-violet-100 hover:bg-violet-500/30 disabled:opacity-40';

export const SvlAvatar: React.FC<{ agent: string; avatars: SvlAvatars; size?: number }> =
  ({ agent, avatars, size = 32 }) => {
    const key = agent === 'Aria' ? 'si_1' : agent;
    const url = avatars[key];
    const label = PEOPLE.find(person => person.id === key)?.name || agent;
    return <span style={{ width: size, height: size }} title={label}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-400/30 bg-violet-600/20 text-xs font-semibold text-violet-200">
      {url ? <img alt={'Awatar: ' + label} src={url} className="h-full w-full object-cover"
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
        referrerPolicy="no-referrer" /> : label.slice(0, 2).toUpperCase()}
    </span>;
  };

export const AvatarSettings: React.FC<{
  avatars: SvlAvatars;
  onChange: (avatars: SvlAvatars) => void;
  onClose: () => void;
}> = ({ avatars, onChange, onClose }) => {
  const [agent, setAgent] = useState('Operator');
  const [source, setSource] = useState<'url'|'file'|'prompt'>('url');
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const call = async (route: string, init?: RequestInit) => {
    const response = await fetch('/api/ai/runtime' + route, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'x-svl-ai-token': token } : {}),
      },
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Błąd serwera HTTP ' + response.status);
    return result;
  };
  const refresh = async () => {
    setError(''); setBusy(true);
    try {
      const result = await call('/avatars');
      onChange(result.avatars || {});
      setNotice('Wczytano awatary z pamięci hosta.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie można odczytać awatarów.');
    } finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); /* Load on dialog open, token can be entered and refreshed manually. */ }, []);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNotice('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3_000_000) {
      setError('Wybierz PNG/JPG/WEBP o rozmiarze do 3 MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ''));
    reader.onerror = () => setError('Nie udało się odczytać pliku.');
    reader.readAsDataURL(file);
  };
  const generate = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      if (!prompt.trim()) throw new Error('Wpisz opis awatara.');
      const result = await call('/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A single avatar portrait, square composition, no text. ' + prompt.trim(),
          size: '1024x1024',
        }),
      });
      if (typeof result.image !== 'string' || typeof result.mimeType !== 'string') throw new Error('Model nie zwrócił obrazu.');
      setPreview('data:' + result.mimeType + ';base64,' + result.image);
      setNotice('Wygenerowano awatar przez ' + result.provider + '/' + result.model + '. Zapisz, aby używać go w czacie.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wygenerować awatara.');
    } finally { setBusy(false); }
  };
  const save = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      if (!ids.has(agent)) throw new Error('Wybierz profil.');
      const image = source === 'url' ? url.trim() : preview;
      if (!image) throw new Error('Wybierz obraz, plik lub wygeneruj awatar.');
      await call('/avatars', { method: 'POST', body: JSON.stringify({ agent, image }) });
      onChange({ ...avatars, [agent]: image });
      setNotice('Awatar zapisany na hoście i przypisany do profilu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu awatara.');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setError(''); setBusy(true);
    try {
      await call('/avatars/' + agent, { method: 'DELETE' });
      const updated = { ...avatars };
      delete updated[agent];
      onChange(updated);
      setPreview('');
      setNotice('Awatar przywrócony do domyślnego.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Nie udało się usunąć awatara.'); }
    finally { setBusy(false); }
  };

  return <section aria-label="Edytor awatarów" className="space-y-3 rounded-xl border border-violet-400/30 bg-[#101727] p-3 text-slate-100">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-violet-200">Awatary — operator i agenci</h3>
      <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Zamknij</button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-[11px] text-slate-300">Profil
        <select className={field} value={agent} onChange={event => { setAgent(event.target.value); setPreview(''); }}>
          {PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[11px] text-slate-300">Źródło
        <select className={field} value={source} onChange={event => { setSource(event.target.value as typeof source); setPreview(''); }}>
          <option value="url">Adres HTTPS</option><option value="file">Plik z urządzenia</option><option value="prompt">Prompt AI</option>
        </select>
      </label>
    </div>
    <div className="flex items-center gap-3">
      <SvlAvatar agent={agent} avatars={avatars} size={48}/>
      <span className="text-xs text-slate-400">Aktualny awatar profilu. Zmiany pojawią się przy wiadomościach.</span>
    </div>
    {source === 'url' && <input aria-label="Adres obrazu HTTPS" className={field} value={url} onChange={event => setUrl(event.target.value)}
      placeholder="https://example.com/avatar.png"/>}
    {source === 'file' && <label className="flex items-center gap-2 text-xs text-slate-300">
      <UploadCloud size={16}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void loadFile(event.target.files?.[0])}/></label>}
    {source === 'prompt' && <div className="space-y-2">
      <textarea rows={3} className={field} value={prompt} onChange={event => setPrompt(event.target.value)}
        placeholder="Np. fioletowy cybernetyczny rycerz, portret, ciemne tło..."/>
      <button type="button" className={button} onClick={() => void generate()} disabled={busy || !prompt.trim()}>
        <ImagePlus size={14}/> Generuj przez GPT Image
      </button>
      <p className="text-[10px] text-slate-500">Generowanie wymaga działającego serwera i klucza OpenAI. Model DALL·E 3 nie jest używany przez aktualny backend.</p>
    </div>}
    {preview && <img src={preview} alt="Podgląd wybranego awatara" className="h-24 w-24 rounded-full border border-violet-400/30 object-cover"/>}
    <label className="block space-y-1 text-[11px] text-slate-300">Token serwera AI (nie jest zapisywany)
      <input type="password" autoComplete="off" className={field} value={token} onChange={event => setToken(event.target.value)}
        placeholder="SVL_AI_ACCESS_TOKEN — tylko jeśli wymagany"/>
    </label>
    {error && <p role="alert" className="rounded-lg bg-rose-950/30 p-2 text-xs text-rose-200">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-950/20 p-2 text-xs text-emerald-200">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => void save()} disabled={busy}><ImagePlus size={14}/> Zapisz awatar</button>
      <button type="button" className={button} onClick={() => void refresh()} disabled={busy}><RefreshCw size={14}/> Odśwież</button>
      <button type="button" className={button} onClick={() => void remove()} disabled={busy}><Trash2 size={14}/> Przywróć</button>
    </div>
  </section>;
};
