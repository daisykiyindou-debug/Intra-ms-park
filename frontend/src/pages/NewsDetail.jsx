import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, ExternalLink, FileText } from "lucide-react";
import { api, formatDateFr } from "@/lib/api";

export default function NewsDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/news/${id}`).then((r) => setItem(r.data)).catch(() => setErr(true));
  }, [id]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">Actualité introuvable</div>;
  if (!item) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="ms-fade-up max-w-3xl mx-auto space-y-5">
      <Link
        to="/actualites"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au fil
      </Link>

      <article className="ms-card overflow-hidden" data-testid={`news-detail-${item.id}`}>
        {item.image && (
          <img src={item.image} alt="" className="w-full h-64 object-cover" />
        )}
        <div className="p-6 md:p-8">
          <div className="ms-overline">{item.category}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#071B34] mt-2 tracking-tight">
            {item.title}
          </h1>
          <div className="mt-3 text-xs text-[#475569] inline-flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateFr(item.date?.slice(0, 10))}
            {item.author_name && <span>· {item.author_name}</span>}
          </div>

          <div className="mt-6 text-[15px] leading-relaxed text-[#071B34] whitespace-pre-wrap">
            {item.content}
          </div>

          {item.images?.length > 0 && (
            <div className={`mt-6 grid gap-2 ${item.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {item.images.map((u) => (
                <img key={u} src={u} alt="" className="w-full rounded-xl object-cover max-h-72" />
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
          <img src={item.image} alt="" className="w-full h-64 object-cover" />
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
            {item.signup_enabled && item.signup_url && (
              <a
                href={item.signup_url}
                target="_blank"
                rel="noreferrer"
                data-testid="event-signup"
                className="ms-btn-primary"
              >
                S'inscrire à l'événement
              </a>
            )}
            {item.linked_news_id && (
              <Link to={`/actualites/${item.linked_news_id}`} className="ms-btn-outline">
                Voir l'actualité liée
              </Link>
            )}
            {item.external_link && (
              <a href={item.external_link} target="_blank" rel="noreferrer" className="ms-btn-outline">
                Ouvrir le lien <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
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
