import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Renders the manual's small text format: blank line = paragraph, "## " heading, "- " bullets, "1. " steps, **bold**.
 * Text is rendered as React text (never as HTML), so admin-written articles can't inject markup.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) {
      blocks.push(<h3 key={i} className="pt-2 text-base font-bold text-slate-900">{inline(line.slice(3))}</h3>);
      i++;
    } else if (/^\s*- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) items.push(lines[i++].replace(/^\s*- /, ""));
      blocks.push(<ul key={i} className="list-disc space-y-1 pl-5">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (/^\s*\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\. /, ""));
      blocks.push(<ol key={i} className="list-decimal space-y-1 pl-5">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(## |\s*- |\s*\d+\. )/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={i}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="space-y-3 text-sm leading-relaxed text-slate-700">{blocks}</div>;
}

/** Small "Guide" link to a manual article, for context help on any page. */
export function HelpLink({ article, children = "Guide" }: { article: string; children?: ReactNode }) {
  return (
    <Link to={`/help?article=${article}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
      <span className="grid h-4 w-4 place-items-center rounded-full border border-brand-600 text-[10px]" aria-hidden>?</span>
      {children}
    </Link>
  );
}
