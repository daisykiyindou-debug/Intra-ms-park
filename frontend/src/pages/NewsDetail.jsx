import { useEffect, useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, ExternalLink, FileText } from "lucide-react";
import { api, formatDateFr, absoluteUrl } from "@/lib/api";

/**
 * Legacy route `/actualites/:id` — redirige désormais vers le fil d'actualités
 * avec le post ciblé mis en surbrillance (mode Feed interactif : like, commentaire,
 * réponse). L'ancienne page de lecture faisait doublon avec le fil.
 */
export default function NewsDetail() {
  const { id } = useParams();
  return <Navigate to={`/actualites?post=${id}`} replace />;
}

/**
 * Page dédiée à un événement d'agenda. Reste en lecture complète (pas de fil
 * interactif équivalent côté agenda).
 */
export function EventDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/events/${id}`);
        if (!cancelled) setItem(r.data);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">Événement introuvable</div>;
  if (!item) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="ms-fade-up max-w-3xl mx-auto space-y-5">
      <Link to="/agenda" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]">
        <ArrowLeft className="h-4 w-4" /> Retour à l'agenda
      </Link>
      <article className="ms-card overflow-hidden" data-testid={`event-detail-${item.id}`}>
        {item.image && <img src={absoluteUrl(item.image)} alt="" className="w-full h-64 object-cover" />}
        <div className="p-6 md:p-8">
          <div className="ms-overline">{item.category || "Événement"}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-2 tracking-tight">
            {item.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#475569]">
            {item.date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> {formatDateFr(item.date)}
              </span>
            )}
            {(item.start_time || item.end_time) && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {item.start_time || "?"}{item.end_time ? ` – ${item.end_time}` : ""}
              </span>
            )}
            {item.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {item.location}
              </span>
            )}
          </div>
          {item.description && (
            <div
              className="mt-6 ms-prose text-[15px] leading-relaxed text-[#071B34]"
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
          )}
          {item.cta_url && (
            <a
              href={item.cta_url}
              target={item.cta_url.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="ms-btn-primary mt-6 inline-flex"
            >
              {item.cta_text || "En savoir plus"} <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {item.attachments && item.attachments.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="ms-overline">Pièces jointes</div>
              {item.attachments.map((a, i) => (
                <a
                  key={i}
                  href={absoluteUrl(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl bg-[#F4F7FA] px-4 py-2.5 text-sm font-semibold text-[#071B34] hover:bg-[#3BA4FF]/10 transition-colors"
                >
                  <FileText className="h-4 w-4 text-[#3BA4FF]" /> {a.name || "Document"}
                </a>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
