import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Reader's language. Used by the user manual now; the rest of the interface will use the same switch. */
export type Lang = "en" | "bn";
const KEY = "fundbridge.lang";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "en" || saved === "bn") return saved;
    } catch { /* storage unavailable */ }
    return typeof navigator !== "undefined" && navigator.language?.startsWith("bn") ? "bn" : "en";
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
    document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

/** "বাংলা / English" toggle. */
export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Language / ভাষা">
      {(["en", "bn"] as Lang[]).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-md px-2.5 py-1 ${lang === l ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}>
          {l === "en" ? "English" : "বাংলা"}
        </button>
      ))}
    </div>
  );
}
