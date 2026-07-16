import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, ExternalLink, FileText } from "lucide-react";
import { api, formatDateFr, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

/**
 * Detail page for anything stored under `/api/news` OR `/api/posts`.
 * Buttons on the carousel/agenda always link here via `/actualites/:id`
 * — the ID is resolved to whichever store contains it.
 */
export default function NewsDetail() {
  const { id } = useParams();
  const { findEmployee } = useApp();
  const [item, setItem] = useState(null);
  const [kind, setKind] = useState(null); // "news" | "post"
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First try the curated news store, then fall back to the internal feed
      try {
        const r = await api.get(`/news/${id}`);
        if (!cancelled) { setItem(r.data); setKind("news"); }
      } catch {
        try {
          const r = await api.get(`/posts/${id}`);
          if (!cancelled) { setItem(r.data); setKind("post"); }
        } catch {
          if (!cancelled) setErr(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">Actualité introuvable</div>;
  if (!item) return <div className="ms-card p-8 animate-pulse h-64" />;

  const author = kind === "post" ? findEmployee?.(item.author_id) : null;
  const authorName = kind === "post"
    ? (item.posted_as === "official" ? "MS Park" : author ? `${author.first_name} ${author.last_name}` : "MS Park")
    : item.author_name;
  const dateStr = (item.date || item.created_at || "").slice(0, 10);

  return (
    <div className="ms-fade-up max-w-3xl mx-auto space-y-5">
      <Link
        to="/actualites"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au fil
      </Link>

      <article className="ms-card overflow-hidden" data-testid={`news-detail-${item.id}`}>
        {item.image && <img src={absoluteUrl(item.image)} alt="" className="w-full h-64 object-cover" />}
        <div className="p-6 md:p-8">
          <div className="ms-overline">{item.category || "Actualité"}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-2 tracking-tight">
            {item.title}
          </h1>
          <div className="mt-3 text-xs text-[#475569] inline-flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateFr(dateStr)}
            {authorName && <span>· {authorName}</span>}
          </div>

          {/* Content: news uses plain text, posts use HTML from the rich text editor */}
          {item.content && (
            <div
              className="mt-6 ms-prose text-[15px] leading-relaxed text-[#071B34]"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
          )}

          {item.images?.length > 0 && (
            <div className={`mt-6 grid gap-2 ${item.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {item.images.map((u) => (
                <img key={u} src={u} alt="" className="w-full rounded-xl object-cover max-h-72" />
              ))}
            </div>
          )}

          {item.attachments?.length > 0 && (
            <div className="mt-6 space-y-2">
              {item.attachments.map((d, i) => (
                <a
                  key={i}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-4 py-2.5 text-sm text-[#071B34]"
                >
                  <FileText className="h-4 w-4 text-[#3BA4FF]" />
                  <span className="flex-1 font-medium truncate">{d.name}</span>
                </a>
              ))}
            </div>
          )}

          {item.documents?.length > 0 && (
            <div className="mt-6 space-y-2">
              {item.documents.map((d, i) => (
                <a
                  key={i}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-4 py-2.5 text-sm text-[#071B34]"
                >
                  <FileText className="h-4 w-4 text-[#3BA4FF]" />
                  <span className="flex-1 font-medium truncate">{d.name}</span>
                </a>
              ))}
            </div>
          )}

          {item.external_link && (
            <a
              href={item.external_link}
              target="_blank"
              rel="noreferrer"
              className="ms-btn-primary inline-flex mt-6"
            >
              Ouvrir le lien <ExternalLink className="h-4 w-4" />
            </a>
          )}

          {item.hashtags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {item.hashtags.map((h) => (
                <span key={h} className="text-xs font-semibold text-[#3BA4FF]">{h}</span>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}


export function EventDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/events/${id}`).then((r) => setItem(r.data)).catch(() => setErr(true));
  }, [id]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">Événement introuvable</div>;
  if (!item) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="ms-fade-up max-w-3xl mx-auto space-y-5">
      <Link
        to="/agenda"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à l'agenda
      </Link>

      <article className="ms-card overflow-hidden" data-testid={`event-detail-${item.id}`}>
        {item.image && (
          <img src={absoluteUrl(item.image)} alt="" className="w-full h-64 object-cover" />
        )}
        <div className="p-6 md:p-8">
          <div className="ms-overline">{item.category || "Événement"}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-2 tracking-tight">
            {item.title}
          </h1>
          {item.intro_text && (
            <p className="mt-3 text-base text-[#475569] italic">{item.intro_text}</p>
          )}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoBox icon={Calendar} label="Date" value={formatDateFr(item.date)} />
            {(item.start_time || item.end_time) && (
              <InfoBox icon={Clock} label="Horaires" value={`${item.start_time || "—"} → ${item.end_time || "—"}`} />
            )}
            {item.location && <InfoBox icon={MapPin} label="Lieu" value={item.location} />}
          </div>
          {item.description && (
            <div className="mt-6 text-[15px] leading-relaxed text-[#071B34] whitespace-pre-wrap">
              {item.description}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {item.cta_enabled && item.cta_text ? (
              item.cta_target_type === "news" && item.cta_target_id ? (
                <Link to={`/actualites/${item.cta_target_id}`} className="ms-btn-primary">
                  {item.cta_text}
                </Link>
              ) : item.cta_target_type === "internal" && item.cta_url ? (
                <Link to={item.cta_url} className="ms-btn-primary">
                  {item.cta_text}
                </Link>
              ) : item.cta_url ? (
                <a
                  href={item.cta_url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="event-cta"
                  className="ms-btn-primary"
                >
                  {item.cta_text} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null
            ) : null}
          </div>
        </div>
      </article>
    </div>
  );
}

function InfoBox({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-[#F4F7FA] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-[#071B34]">{value}</div>
    </div>
  );
}
