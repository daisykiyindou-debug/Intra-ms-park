import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Send, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

/**
 * Public form filling page — accessible to any logged employee at /formulaires/:id.
 * Auto-prefills first_name / last_name / email when the corresponding fields exist.
 */
export default function PublicForm() {
  const { id } = useParams();
  const { me } = useApp();
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    api.get(`/forms/${id}`).then((r) => setForm(r.data)).catch(() => setErr(true));
  }, [id]);

  // Auto-prefill from the logged-in employee
  useEffect(() => {
    if (!form || !me) return;
    const patch = {};
    for (const f of form.fields || []) {
      const n = (f.name || "").toLowerCase();
      const l = (f.label || "").toLowerCase();
      if (["first_name", "prenom", "prénom"].includes(n) || l.includes("prénom") || l === "prenom") {
        patch[f.name] = me.first_name;
      } else if (["last_name", "nom"].includes(n) || l === "nom" || l.includes("nom de famille")) {
        patch[f.name] = me.last_name;
      } else if (n === "email" || l.includes("mail")) {
        patch[f.name] = me.personal_email || me.email || "";
      } else if (n === "phone" || n === "tel" || l.includes("téléphone") || l.includes("telephone")) {
        patch[f.name] = me.phone || "";
      }
    }
    setAnswers((a) => ({ ...patch, ...a }));
  }, [form, me]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">Formulaire introuvable ou désactivé</div>;
  if (!form) return <div className="ms-card p-8 animate-pulse h-64" />;

  // ── Server said the current user has already answered this form.
  // Never show the inputs nor the submit button again.
  if (form.already_answered && !submitted) {
    return (
      <div className="ms-fade-up max-w-2xl mx-auto space-y-4">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="ms-card p-10 text-center" data-testid="form-already-answered">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#071B34]">Vous avez déjà répondu à ce formulaire.</h1>
          <p className="mt-2 text-sm text-[#475569]">Votre réponse a bien été enregistrée.</p>
          {form.my_response_at && (
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Envoyée le {new Date(form.my_response_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/dashboard" className="ms-btn-primary">Retour à l'accueil</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Server-set flag: the deadline is in the past. Show a "closed" state
  // instead of the interactive form.
  if (form.is_closed && !submitted) {
    return (
      <div className="ms-fade-up max-w-2xl mx-auto space-y-4">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <div className="ms-card p-10 text-center" data-testid="form-closed">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#B45309] mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#071B34]">Ce formulaire est fermé.</h1>
          <p className="mt-2 text-sm text-[#475569]">
            La date limite de réponse est dépassée
            {form.closes_at ? ` (${new Date(form.closes_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })})` : ""}.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/dashboard" className="ms-btn-primary">Retour à l'accueil</Link>
          </div>
        </div>
      </div>
    );
  }

  const setValue = (name, value) => setAnswers((a) => ({ ...a, [name]: value }));

  const toggleMulti = (name, opt) => {
    setAnswers((a) => {
      const cur = Array.isArray(a[name]) ? a[name] : [];
      const has = cur.includes(opt);
      return { ...a, [name]: has ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
  };

  const validate = () => {
    for (const f of form.fields || []) {
      if (["section", "rich", "image"].includes(f.type)) continue;
      if (!f.required) continue;
      const v = answers[f.name];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        toast.error(`Champ obligatoire : ${f.label}`);
        return false;
      }
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    if (submitting) return; // hard-guard against double-click
    setSubmitting(true);
    try {
      const { data } = await api.post(`/forms/${form.id}/submit`, { answers });
      setSubmitted(data.success_message || "Merci !");
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      if (status === 409) {
        // Server rejected because the user already answered — reflect it in the UI
        toast.error(detail || "Vous avez déjà répondu à ce formulaire.");
        setForm((f) => (f ? { ...f, already_answered: true, my_response_at: f.my_response_at || new Date().toISOString() } : f));
      } else {
        toast.error("Impossible d'envoyer votre réponse", { description: detail });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="ms-fade-up max-w-2xl mx-auto">
        <div className="ms-card p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#071B34]">{submitted}</h1>
          <p className="mt-2 text-sm text-[#475569]">Votre réponse a bien été enregistrée.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/dashboard" className="ms-btn-primary">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-fade-up max-w-2xl mx-auto space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <div className="ms-card p-6 md:p-8" data-testid={`public-form-${form.id}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-[#3BA4FF]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="ms-overline">Formulaire</div>
            <h1 className="text-2xl font-bold text-[#071B34] mt-1 tracking-tight">{form.title}</h1>
          </div>
        </div>
        {form.description && (
          <div className="ms-prose text-sm text-[#475569] mb-6 leading-relaxed" dangerouslySetInnerHTML={{ __html: form.description }} />
        )}

        <div className="space-y-4">
          {(form.fields || []).map((f) => (
            <FieldRenderer
              key={f.id}
              field={f}
              value={answers[f.name]}
              onChange={(v) => setValue(f.name, v)}
              onToggle={(opt) => toggleMulti(f.name, opt)}
            />
          ))}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          data-testid="form-submit"
          className="ms-btn-primary w-full mt-6 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {submitting ? "Envoi en cours…" : (form.submit_label || "Envoyer")}
        </button>
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, onToggle }) {
  if (field.type === "section") {
    return (
      <div className="pt-3 pb-1 border-b border-[#071B34]/5">
        <h3 className="text-base font-bold text-[#071B34]">{field.label}</h3>
        {field.help_text && <p className="mt-1 text-xs text-[#475569]">{field.help_text}</p>}
      </div>
    );
  }

  // Rich-text block — HTML preserved exactly as authored
  if (field.type === "rich") {
    return (
      <div className="ms-prose text-sm text-[#334155] leading-relaxed" data-testid="field-rich"
           dangerouslySetInnerHTML={{ __html: field.content_html || "" }} />
    );
  }

  // Image / banner block
  if (field.type === "image") {
    if (!field.image_url) return null;
    return (
      <figure className="rounded-xl overflow-hidden" data-testid="field-image">
        <img src={field.image_url} alt={field.image_alt || ""} className="w-full max-h-96 object-cover" />
        {field.image_caption && (
          <figcaption className="text-xs text-[#475569] italic text-center py-2 bg-[#F8FAFC]">
            {field.image_caption}
          </figcaption>
        )}
      </figure>
    );
  }

  const label = (
    <label className="block text-sm font-semibold text-[#071B34] mb-1.5">
      {field.label}
      {field.required && <span className="text-[#EF4444] ml-0.5">*</span>}
    </label>
  );
  const helper = field.help_text ? <p className="mt-1 text-[11px] text-[#475569]">{field.help_text}</p> : null;

  if (["text", "email", "tel", "url", "number", "date"].includes(field.type)) {
    return (
      <div>
        {label}
        <input
          type={field.type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          data-testid={`field-${field.name}`}
          className="ms-input"
        />
        {helper}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          data-testid={`field-${field.name}`}
          className="ms-input resize-none"
        />
        {helper}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div>
        {label}
        <input
          type="url"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="URL du fichier partagé (Google Drive, Dropbox, etc.)"
          className="ms-input"
        />
        {helper || <p className="mt-1 text-[11px] text-[#475569]">Collez l'URL d'un fichier partagé publiquement.</p>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`field-${field.name}`}
          className="ms-input"
        >
          <option value="">— Choisir —</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {helper}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div>
        {label}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(field.options || []).map((o) => (
            <label
              key={o}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                value === o
                  ? "bg-[#3BA4FF]/10 border-[#3BA4FF] text-[#1D70B8] font-semibold"
                  : "bg-white border-[#071B34]/10 hover:border-[#3BA4FF]/40 text-[#475569]"
              }`}
            >
              <input
                type="radio"
                name={field.name}
                checked={value === o}
                onChange={() => onChange(o)}
                className="h-4 w-4 accent-[#3BA4FF]"
              />
              {o}
            </label>
          ))}
        </div>
        {helper}
      </div>
    );
  }

  if (field.type === "checkbox") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div>
        {label}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(field.options || []).map((o) => (
            <label
              key={o}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                arr.includes(o)
                  ? "bg-[#3BA4FF]/10 border-[#3BA4FF] text-[#1D70B8] font-semibold"
                  : "bg-white border-[#071B34]/10 hover:border-[#3BA4FF]/40 text-[#475569]"
              }`}
            >
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={() => onToggle(o)}
                className="h-4 w-4 accent-[#3BA4FF]"
              />
              {o}
            </label>
          ))}
        </div>
        {helper}
      </div>
    );
  }

  return null;
}
