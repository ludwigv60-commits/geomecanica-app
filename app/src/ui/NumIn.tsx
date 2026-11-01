// Campo numérico que acepta decimales con punto o coma (el texto se guarda tal cual mientras se escribe,
// así "5." o "5," no se borran antes de escribir el decimal).
import { useEffect, useState } from 'react';

const leer = (s: string) => { const t = s.trim().replace(',', '.'); if (t === '' || t === '-' || t === '.') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

export function NumIn({ valor, on, className, placeholder, signo }: { valor: number | null | undefined; on: (v: number | null) => void; className?: string; placeholder?: string; signo?: boolean }) {
  const [t, setT] = useState(valor == null ? '' : String(valor));
  useEffect(() => { if (leer(t) !== (valor ?? null)) setT(valor == null ? '' : String(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input className={className} placeholder={placeholder} inputMode={signo ? 'text' : 'decimal'} value={t}
    onChange={e => { const s = e.target.value.replace(/[^\d.,+-]/g, ''); setT(s); on(leer(s)); }} />;
}
