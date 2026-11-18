import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { LanguageSwitch, useLang } from "../lib/i18n";
import { AUDIENCE_LABEL, audienceFor, fillPlaceholders, mergeManual, type Audience } from "../lib/manual";
import { Markdown } from "../components/help/Markdown";
import { Empty } from "../components/ui";

/** The user manual: opens on the reader's own guide, in their language, with the platform's current rules filled in. */
export default function Help() {
  const { db, user } = useStore();
  const { lang } = useLang();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const isAdmin = user?.role === "admin";

  const articles = useMemo(() => mergeManual(db.helpArticles).filter((a) => !a.hidden && (a.audience !== "admin" || isAdmin)), [db.helpArticles, isAdmin]);
  const own = audienceFor(user?.role);
  const audiences = (["everyone", "investor", "business", "admin"] as Audience[])
    .filter((a) => a !== "admin" || isAdmin)
    .sort((a, b) => (a === own ? -1 : b === own ? 1 : 0));

  const requested = articles.find((a) => a.slug === params.get("article"));
  const audience = (requested?.audience ?? (params.get("for") as Audience | null) ?? own) as Audience;
  const searching = q.trim().length > 1;
  const list = searching
    ? articles.filter((a) => `${a.title.en} ${a.title.bn} ${a.body.en} ${a.body.bn}`.toLowerCase().includes(q.trim().toLowerCase()))
    : articles.filter((a) => a.audience === audience);
  const current = requested ?? list[0];
  const open = (slug: string) => { setParams({ article: slug }); window.scrollTo?.(0, 0); };

  const t = lang === "bn"
    ? { title: "ব্যবহার নির্দেশিকা", intro: user ? `আপনার জন্য: ${AUDIENCE_LABEL[own].bn}` : "FundBridge কীভাবে ব্যবহার করবেন", search: "নির্দেশিকায় খুঁজুন…", none: "কিছু পাওয়া যায়নি।", results: "খোঁজের ফল" }
    : { title: "User manual", intro: user ? `Showing first: ${AUDIENCE_LABEL[own].en.toLowerCase()}` : "How to use FundBridge", search: "Search the manual…", none: "Nothing found.", results: "Search results" };

  return (
    <div className="space-y-6" lang={lang}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.title}</h1>
          <p className="text-sm text-slate-600">{t.intro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input sm:w-64" placeholder={t.search} aria-label={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <LanguageSwitch />
        </div>
      </div>

      {!searching && (
        <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label={t.title}>
          {audiences.map((a) => (
            <button key={a} type="button" onClick={() => setParams({ for: a })} aria-current={audience === a ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${audience === a ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              {AUDIENCE_LABEL[a][lang]}
            </button>
          ))}
        </nav>
      )}

      {list.length === 0 && !current ? <Empty>{t.none}</Empty> : (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <aside className="min-w-0">
            {searching && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.results} · {list.length}</p>}
            <ol className="space-y-1">
              {list.map((a) => (
                <li key={a.slug}>
                  <button type="button" onClick={() => open(a.slug)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${current?.slug === a.slug ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-700 hover:bg-slate-100"}`}>
                    {a.title[lang]}
                    {searching && <span className="block text-xs font-normal text-slate-500">{AUDIENCE_LABEL[a.audience][lang]}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
          {current && (
            <article className="card min-w-0 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{AUDIENCE_LABEL[current.audience][lang]}</p>
              <h2 className="text-2xl font-bold">{current.title[lang]}</h2>
              <Markdown source={fillPlaceholders(current.body[lang], db.settings, lang)} />
            </article>
          )}
        </div>
      )}
    </div>
  );
}
