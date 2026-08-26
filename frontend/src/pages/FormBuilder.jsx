import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ClipboardList, Plus, Trash2, Save, X, GripVertical, ArrowUp, ArrowDown, Copy,
  FileText, BarChart3, Eye, ExternalLink, Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatDateFr } from "@/lib/api";
import useLiveData, { notifyLiveRefresh } from "@/hooks/useLiveData";
import RichTextEditor from "@/components/RichTextEditor";

const FIELD_TYPES = [
  { v: "section", label: "Titre / paragraphe", icon: "H", desc: "Séparateur de section (non-interactif)" },
  { v: "rich", label: "Bloc texte enrichi", icon: "¶", desc: "Paragraphe rédigé avec gras, listes, liens… (non-interactif)" },
  { v: "image", label: "Image / bannière", icon: "🖼", desc: "Visuel ou bannière à insérer entre les questions" },
  { v: "text", label: "Texte court", icon: "T" },
  { v: "textarea", label: "Texte long", icon: "¶" },
  { v: "email", label: "E-mail", icon: "@" },
  { v: "tel", label: "Téléphone", icon: "📞" },
  { v: "number", label: "Nombre", icon: "#" },
  { v: "url", label: "URL", icon: "🔗" },
  { v: "date", label: "Date", icon: "📅" },
  { v: "select", label: "Liste déroulante", icon: "▾" },
  { v: "radio", label: "Boutons radio (choix unique)", icon: "◉" },
  { v: "checkbox", label: "Cases à cocher (multi)", icon: "☑" },
  { v: "file", label: "Fichier (URL)", icon: "📎" },
];

function newField(type = "text") {
  const meta = FIELD_TYPES.find((f) => f.v === type);
  return {
    id: `f-${Math.random().toString(36).slice(2, 9)}`,
    type,
    label: meta ? meta.label : "Champ",
    name: "",
    required: false,
    placeholder: "",
    help_text: "",
    // Rich-text content HTML (for `rich` blocks) and image URL/alt (for `image` blocks)
    content_html: type === "rich" ? "<p>Rédigez votre bloc de texte ici…</p>" : "",
    image_url: "",
    image_alt: "",
    image_caption: "",
    options: ["radio", "checkbox", "select"].includes(type) ? ["Option 1", "Option 2"] : null,
  };
}

// ────────────────────────────────────── List of forms + entry point
export default function FormBuilder() {
  const [forms, setForms] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | form object
  const [viewingResponses, setViewingResponses] = useState(null);

  const load = () => api.get("/admin/forms").then((r) => setForms(r.data));
  useLiveData(load, ["forms"]);

  const removeForm = async (f) => {
    if (!window.confirm(`Supprimer le formulaire "${f.title}" et toutes ses réponses ?`)) return;
    try {
      await api.delete(`/admin/forms/${f.id}`);
      toast.success("Formulaire supprimé");
      load();
      notifyLiveRefresh(["forms"]);
    } catch {
      toast.error("Impossible de supprimer");
    }
  };

  const duplicateForm = async (f) => {
    try {
      await api.post("/admin/forms", {
        title: `${f.title} (copie)`,
        description: f.description,
        fields: f.fields.map((x) => ({ ...x, id: undefined })),
        active: false,
        submit_label: f.submit_label,
        success_message: f.success_message,
      });
      toast.success("Formulaire dupliqué");
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <div className="space-y-5">
      <div className="ms-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="ms-overline">Formulaires personnalisés</div>
          <h3 className="text-lg font-bold text-[#071B34] mt-1">Construisez vos propres formulaires</h3>
          <p className="text-xs text-[#475569] mt-1 max-w-2xl">
            Inscription, contact, candidature, réservation, sondage… Créez un formulaire, ajoutez vos champs, puis
            liez-le à un bouton du carrousel, de l'agenda ou d'une actualité.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          data-testid="form-create"
          className="ms-btn-primary"
        >
          <Plus className="h-4 w-4" /> Nouveau formulaire
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {forms.length === 0 && (
          <div className="col-span-2 ms-card p-10 text-center text-sm text-[#475569]">
            Aucun formulaire pour le moment. Cliquez sur "Nouveau formulaire" pour commencer.
          </div>
        )}
        {forms.map((f) => (
          <div key={f.id} className="ms-card p-5 space-y-3" data-testid={`form-row-${f.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardList className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                  <h4 className="font-bold text-[#071B34] truncate">{f.title}</h4>
                  <span
                    className="ms-chip"
                    style={{
                      background: f.active ? "#D1FAE5" : "#F1F5F9",
                      color: f.active ? "#065F46" : "#64748B",
                    }}
                  >
                    {f.active ? "Actif" : "Désactivé"}
                  </span>
                </div>
                {f.description && (
                  <p className="text-xs text-[#475569] mt-1 line-clamp-2">{f.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-[#475569]">
              <span>{f.fields?.length || 0} champ(s)</span>
              <span>·</span>
              <span>{f.response_count || 0} réponse(s)</span>
              <span>·</span>
              <span>Créé le {formatDateFr((f.created_at || "").slice(0, 10))}</span>
            </div>

            <div className="rounded-lg bg-[#F4F7FA] p-2 text-[10px] font-mono text-[#475569] flex items-center justify-between">
              <span>URL publique : /formulaires/{f.id.slice(0, 8)}…</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/formulaires/${f.id}`);
                  toast.success("URL copiée");
                }}
                className="text-[#3BA4FF] font-semibold"
              >
                Copier
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setEditing(f)}
                data-testid={`form-edit-${f.id}`}
                className="ms-btn-outline text-xs !py-1.5"
              >
                Modifier
              </button>
              <button
                onClick={() => setViewingResponses(f)}
                data-testid={`form-view-responses-${f.id}`}
                className="text-xs font-bold rounded-lg px-3 py-1.5 bg-[#3BA4FF]/12 text-[#1D70B8] hover:bg-[#3BA4FF]/25 inline-flex items-center gap-1"
              >
                <BarChart3 className="h-3 w-3" /> Résultats ({f.response_count || 0})
              </button>
              <Link
                to={`/formulaires/${f.id}`}
                target="_blank"
                className="text-xs font-bold rounded-lg px-3 py-1.5 bg-[#F4F7FA] hover:bg-[#071B34]/5 text-[#475569] inline-flex items-center gap-1"
              >
                <Eye className="h-3 w-3" /> Aperçu
              </Link>
              <button
                onClick={() => duplicateForm(f)}
                className="text-xs rounded-lg px-3 py-1.5 bg-[#F4F7FA] hover:bg-[#071B34]/5 text-[#475569] inline-flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Dupliquer
              </button>
              <button
                onClick={() => removeForm(f)}
                className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-[#FEE2E2] text-[#EF4444] hover:bg-[#EF4444]/20 inline-flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <FormEditor
          form={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); notifyLiveRefresh(["forms"]); }}
        />
      )}

      {viewingResponses && (
        <ResponsesModal
          form={viewingResponses}
          onClose={() => setViewingResponses(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────── Field renderer for the live preview
function PreviewField({ field }) {
  if (field.type === "section") {
    return (
      <div className="pt-3">
        <h4 className="text-base font-bold text-[#071B34]">{field.label || "Section"}</h4>
        {field.help_text && (
          <p className="text-xs text-[#475569] mt-1">{field.help_text}</p>
        )}
      </div>
    );
  }
  if (field.type === "rich") {
    return (
      <div className="rounded-lg border border-dashed border-[#071B34]/10 bg-[#F8FAFC] p-3">
        <div className="ms-overline mb-1 text-[#94A3B8]">Bloc texte enrichi</div>
        <div className="ms-prose text-sm" dangerouslySetInnerHTML={{ __html: field.content_html || "<p><em>Bloc de texte vide</em></p>" }} />
      </div>
    );
  }
  if (field.type === "image") {
    return (
      <div className="rounded-lg border border-dashed border-[#071B34]/10 bg-[#F8FAFC] p-3">
        <div className="ms-overline mb-1 text-[#94A3B8]">Image / bannière</div>
        {field.image_url ? (
          <>
            <img src={field.image_url} alt={field.image_alt || ""} className="w-full rounded-lg max-h-40 object-cover" />
            {field.image_caption && <div className="text-[10px] text-[#475569] mt-1 italic text-center">{field.image_caption}</div>}
          </>
        ) : (
          <div className="text-xs text-[#94A3B8] italic">Aucune image renseignée</div>
        )}
      </div>
    );
  }
  const commonInput =
    "w-full rounded-lg border border-[#071B34]/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#3BA4FF]/30 focus:border-[#3BA4FF]";
  return (
    <div>
      <label className="text-xs font-semibold text-[#071B34] flex items-center gap-1">
        {field.label || "Champ"}
        {field.required && <span className="text-[#EF4444]">*</span>}
      </label>
      {field.help_text && (
        <div className="text-[10px] text-[#475569] mt-0.5 mb-1.5">{field.help_text}</div>
      )}
      <div className="mt-1">
        {field.type === "textarea" ? (
          <textarea rows={3} placeholder={field.placeholder} className={commonInput} disabled />
        ) : field.type === "select" ? (
          <select className={commonInput} disabled>
            <option>— Choisir —</option>
            {(field.options || []).map((o, i) => <option key={i}>{o}</option>)}
          </select>
        ) : field.type === "radio" ? (
          <div className="space-y-1">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-xs text-[#071B34]">
                <input type="radio" disabled className="accent-[#3BA4FF]" /> {o}
              </label>
            ))}
          </div>
        ) : field.type === "checkbox" ? (
          <div className="space-y-1">
            {(field.options || []).map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-xs text-[#071B34]">
                <input type="checkbox" disabled className="accent-[#3BA4FF]" /> {o}
              </label>
            ))}
          </div>
        ) : (
          <input
            type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}
            placeholder={field.placeholder}
            className={commonInput}
            disabled
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────── Form editor (create/edit)
function FormEditor({ form, onClose, onSaved }) {
  const isNew = !form;
  const [title, setTitle] = useState(form?.title || "");
  const [description, setDescription] = useState(form?.description || "");
  const [submitLabel, setSubmitLabel] = useState(form?.submit_label || "Envoyer");
  const [successMessage, setSuccessMessage] = useState(form?.success_message || "Merci ! Votre formulaire a bien été envoyé.");
  const [active, setActive] = useState(form?.active ?? true);
  const [fields, setFields] = useState(form?.fields ? [...form.fields] : [
    { ...newField("text"), label: "Prénom", name: "first_name", required: true, placeholder: "Auto-rempli si connecté" },
    { ...newField("text"), label: "Nom", name: "last_name", required: true, placeholder: "Auto-rempli si connecté" },
  ]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const addField = (type) => setFields((f) => [...f, newField(type)]);
  const updateField = (i, patch) => setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeField = (i) => setFields((f) => f.filter((_, idx) => idx !== i));
  const moveField = (i, dir) => {
    setFields((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const c = [...f];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Titre requis");
    if (fields.length === 0) return toast.error("Ajoutez au moins un champ");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: fields.map((f) => ({
          ...f,
          options: ["select", "radio", "checkbox"].includes(f.type)
            ? (f.options || []).filter((o) => o.trim())
            : null,
        })),
        active,
        submit_label: submitLabel || "Envoyer",
        success_message: successMessage || "Merci !",
      };
      if (isNew) {
        await api.post("/admin/forms", payload);
        toast.success("Formulaire créé");
      } else {
        await api.put(`/admin/forms/${form.id}`, payload);
        toast.success("Formulaire mis à jour");
      }
      onSaved();
    } catch (err) {
      toast.error("Erreur", { description: err.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100]"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-md w-full h-full cursor-default"
      />
      {/* Modal — pinned to all 4 sides with a safe margin, guaranteed centered/visible */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-3 md:inset-6 lg:inset-8 rounded-2xl bg-white shadow-2xl border border-[#071B34]/5 overflow-hidden flex flex-col"
        data-testid="form-editor"
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[#071B34]/5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ms-overline">{isNew ? "Nouveau formulaire" : "Modifier le formulaire"}</div>
            <h3 className="text-lg md:text-xl font-bold text-[#071B34] mt-1 truncate">
              {title.trim() || "Constructeur de formulaire"}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              data-testid="toggle-preview"
              className="hidden lg:inline-flex ms-btn-outline text-xs !py-1.5"
              title="Afficher/masquer l'aperçu"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Masquer aperçu" : "Afficher aperçu"}
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — three independently-scrollable columns on desktop */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Column 1 — Settings + palette (sticky) */}
          <aside className="lg:w-[320px] lg:shrink-0 lg:border-r border-[#071B34]/5 overflow-y-auto p-5 space-y-4 bg-[#F8FAFC]">
            <div>
              <label className="ms-overline">Titre du formulaire</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="form-title"
                placeholder="Ex. Inscription séminaire 2026"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Description (optionnel — texte enrichi)</label>
              <div className="mt-2">
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Contexte, instructions, deadline… (gras, listes, liens, alignement autorisés)"
                  testId="form-description"
                />
              </div>
            </div>
            <div>
              <label className="ms-overline">Texte du bouton d'envoi</label>
              <input
                value={submitLabel}
                onChange={(e) => setSubmitLabel(e.target.value)}
                placeholder="Envoyer, Confirmer, S'inscrire…"
                className="ms-input mt-2"
              />
            </div>
            <div>
              <label className="ms-overline">Message de confirmation</label>
              <textarea
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                rows={2}
                placeholder="Merci ! Votre réponse a bien été enregistrée."
                className="ms-input mt-2 resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="form-active"
                className="h-4 w-4 accent-[#3BA4FF]"
              />
              Formulaire actif (accessible aux employés)
            </label>

            <div className="pt-3 border-t border-[#071B34]/5">
              <div className="ms-overline mb-2">Ajouter un champ</div>
              <div className="grid grid-cols-2 gap-1.5">
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => addField(t.v)}
                    data-testid={`add-field-${t.v}`}
                    className="text-[11px] text-left rounded-lg bg-white hover:bg-[#3BA4FF]/10 hover:text-[#1D70B8] px-2 py-1.5 font-semibold flex items-center gap-1.5 border border-[#071B34]/5"
                  >
                    <span className="text-sm">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Column 2 — Fields editor */}
          <section className="flex-1 min-w-0 overflow-y-auto p-5 space-y-2">
            <div className="ms-overline flex items-center justify-between">
              <span>Champs du formulaire ({fields.length})</span>
              <span className="text-[10px] normal-case font-normal text-[#94A3B8]">
                Glissez, réordonnez avec les flèches
              </span>
            </div>
            {fields.length === 0 && (
              <div className="ms-card p-8 text-center text-sm text-[#475569]">
                Aucun champ. Cliquez sur un type dans la colonne de gauche.
              </div>
            )}
            {fields.map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                index={i}
                total={fields.length}
                onChange={(patch) => updateField(i, patch)}
                onRemove={() => removeField(i)}
                onMove={(dir) => moveField(i, dir)}
              />
            ))}
          </section>

          {/* Column 3 — Live preview (desktop only, toggleable) */}
          {showPreview && (
            <aside className="hidden lg:block lg:w-[380px] lg:shrink-0 lg:border-l border-[#071B34]/5 overflow-y-auto p-5 bg-[#F4F7FA]">
              <div className="ms-overline mb-3 flex items-center gap-1.5">
                <Eye className="h-3 w-3" /> Aperçu employé
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
                <div>
                  <h4 className="text-base font-bold text-[#071B34]">{title || "Titre du formulaire"}</h4>
                  {description && (
                    <p className="text-xs text-[#475569] mt-1 whitespace-pre-wrap">{description}</p>
                  )}
                </div>
                <div className="space-y-3">
                  {fields.length === 0 ? (
                    <div className="text-xs text-[#94A3B8] italic">Ajoutez des champs pour prévisualiser…</div>
                  ) : (
                    fields.map((f) => <PreviewField key={f.id} field={f} />)
                  )}
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full rounded-lg bg-[#3BA4FF] text-white text-sm font-semibold py-2.5 opacity-90"
                >
                  {submitLabel || "Envoyer"}
                </button>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-3 text-center">
                Ceci est un aperçu — les champs ne sont pas interactifs.
              </p>
            </aside>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-[#071B34]/5 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="ms-btn-outline">Annuler</button>
          <button
            onClick={save}
            disabled={saving}
            data-testid="form-save"
            className="ms-btn-primary disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : isNew ? "Créer le formulaire" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ────────────────────────────────────── One field row in the editor
function FieldRow({ field, index, total, onChange, onRemove, onMove }) {
  const isSection = field.type === "section";
  const isRich = field.type === "rich";
  const isImage = field.type === "image";
  const isDecorative = isSection || isRich || isImage;
  const hasOptions = ["select", "radio", "checkbox"].includes(field.type);
  return (
    <div className="rounded-xl border border-[#071B34]/5 p-3 bg-white" data-testid={`field-row-${index}`}>
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="h-4 w-4 text-[#94A3B8]" />
        <span className="text-[10px] font-mono bg-[#F4F7FA] text-[#475569] rounded px-1.5 py-0.5">
          {field.type}
        </span>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={isSection ? "Titre de section" : "Libellé du champ"}
          className="flex-1 text-sm font-semibold border-none focus:outline-none focus:ring-0 bg-transparent"
        />
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#071B34]/5 disabled:opacity-30"
            title="Monter"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#071B34]/5 disabled:opacity-30"
            title="Descendre"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <button
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#FEE2E2] text-[#EF4444]"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!isDecorative && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={field.placeholder || ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            placeholder="Placeholder"
            className="ms-input !py-1.5 !text-xs"
          />
          <input
            value={field.name || ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nom technique (auto)"
            className="ms-input !py-1.5 !text-xs"
          />
        </div>
      )}

      {isRich && (
        <div className="mt-2">
          <RichTextEditor
            value={field.content_html || ""}
            onChange={(v) => onChange({ content_html: v })}
            placeholder="Rédigez ici votre bloc (gras, listes, liens, alignement…)"
          />
        </div>
      )}

      {isImage && (
        <div className="mt-2 grid grid-cols-1 gap-2">
          <input
            value={field.image_url || ""}
            onChange={(e) => onChange({ image_url: e.target.value })}
            placeholder="URL de l'image (https://…)"
            data-testid={`field-image-url-${index}`}
            className="ms-input !py-1.5 !text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={field.image_alt || ""}
              onChange={(e) => onChange({ image_alt: e.target.value })}
              placeholder="Texte alternatif"
              className="ms-input !py-1.5 !text-xs"
            />
            <input
              value={field.image_caption || ""}
              onChange={(e) => onChange({ image_caption: e.target.value })}
              placeholder="Légende (facultatif)"
              className="ms-input !py-1.5 !text-xs"
            />
          </div>
          {field.image_url && (
            <img src={field.image_url} alt={field.image_alt || ""} className="rounded-lg w-full max-h-32 object-cover" />
          )}
        </div>
      )}

      {!isRich && !isImage && (
        <input
          value={field.help_text || ""}
          onChange={(e) => onChange({ help_text: e.target.value })}
          placeholder={isSection ? "Paragraphe (facultatif)" : "Texte d'aide (facultatif)"}
          className="ms-input !py-1.5 !text-xs mt-2"
        />
      )}

      {hasOptions && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold mb-1">Options</div>
          {(field.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <input
                value={opt}
                onChange={(e) => {
                  const arr = [...(field.options || [])];
                  arr[i] = e.target.value;
                  onChange({ options: arr });
                }}
                placeholder={`Option ${i + 1}`}
                className="ms-input !py-1 !text-xs"
              />
              <button
                onClick={() => onChange({ options: (field.options || []).filter((_, j) => j !== i) })}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#FEE2E2] text-[#EF4444] shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ options: [...(field.options || []), ""] })}
            className="text-[11px] font-semibold text-[#3BA4FF] hover:text-[#1D70B8]"
          >
            + Ajouter une option
          </button>
        </div>
      )}

      {!isSection && (
        <label className="flex items-center gap-2 text-[11px] mt-2">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#3BA4FF]"
          />
          Champ obligatoire
        </label>
      )}
    </div>
  );
}

// ────────────────────────────────────── Responses viewer
function ResponsesModal({ form, onClose }) {
  const [tab, setTab] = useState("stats"); // "stats" | "individual"
  const [responses, setResponses] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get(`/admin/forms/${form.id}/responses`).then((r) => setResponses(r.data));
    api.get(`/admin/forms/${form.id}/stats`).then((r) => setStats(r.data)).catch(() => setStats(null));
  }, [form.id]);

  const nonDecorativeFields = form.fields.filter((f) => !["section", "rich", "image"].includes(f.type));
  const exportCsv = () => {
    if (responses.length === 0) return;
    const cols = ["Employé", "Date", ...nonDecorativeFields.map((f) => f.label)];
    const rows = responses.map((r) => [
      r.employee_name || "",
      r.submitted_at || "",
      ...nonDecorativeFields.map((f) => {
        const v = r.answers?.[f.name];
        return Array.isArray(v) ? v.join(" · ") : (v ?? "");
      }),
    ]);
    const csv = [cols, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${form.title.replace(/[^a-z0-9]/gi, "_")}.csv`;
    a.click();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ms-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="form-responses-modal"
      >
        <div className="p-5 border-b border-[#071B34]/5 flex items-start justify-between">
          <div>
            <div className="ms-overline">Réponses</div>
            <h3 className="text-lg font-bold text-[#071B34] mt-1">{form.title}</h3>
            <p className="text-xs text-[#475569] mt-1">
              {responses.length} réponse(s) reçue(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={responses.length === 0}
              className="ms-btn-outline text-xs !py-1.5 disabled:opacity-40"
            >
              <FileText className="h-3 w-3" /> Exporter CSV
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-5 pt-4 flex gap-1.5 border-b border-[#071B34]/5">
          {[
            { k: "stats", l: "Vue statistiques" },
            { k: "individual", l: `Réponses individuelles (${responses.length})` },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`stats-tab-${t.k}`}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                tab === t.k ? "bg-[#3BA4FF]/10 text-[#1D70B8]" : "text-[#475569] hover:bg-[#F4F7FA]"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === "stats" ? (
            <StatsView stats={stats} form={form} />
          ) : responses.length === 0 ? (
            <div className="text-center py-12 text-sm text-[#475569]">
              Aucune réponse pour le moment.
            </div>
          ) : (
            responses.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#071B34]/5 p-4 hover:shadow-sm transition-shadow" data-testid={`response-${r.id}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#3BA4FF]" />
                    <strong className="text-sm text-[#071B34]">{r.employee_name || "Anonyme"}</strong>
                  </div>
                  <span className="text-[10px] text-[#475569]">{formatDateFr(r.submitted_at.slice(0, 10))} · {r.submitted_at.slice(11, 16)}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {nonDecorativeFields.map((f) => {
                    const v = r.answers?.[f.name];
                    const display = Array.isArray(v) ? v.join(" · ") : (v ?? "—");
                    return (
                      <div key={f.id} className="text-xs">
                        <span className="text-[#475569] font-semibold">{f.label} :</span>{" "}
                        <span className="text-[#071B34]">{display || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ────────────────────────────────────── Stats view (aggregated results per question)
function StatsView({ stats, form }) {
  if (!stats) return <div className="text-center py-12 text-sm text-[#475569]">Chargement des statistiques…</div>;
  const s = stats.summary;
  return (
    <div className="space-y-4" data-testid="form-stats-view">
      {/* Summary card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Destinataires" value={s.total_recipients} />
        <SummaryCard label="Réponses" value={s.total_responses} />
        <SummaryCard label="Taux de participation" value={`${s.participation_rate}%`} accent />
        <SummaryCard label="N'ont pas répondu" value={s.non_respondents.length} muted />
      </div>

      {/* Non-respondents */}
      {s.non_respondents.length > 0 && (
        <details className="rounded-xl bg-[#F8FAFC] p-3">
          <summary className="cursor-pointer text-xs font-bold text-[#475569]">
            👥 Voir les {s.non_respondents.length} personne{s.non_respondents.length > 1 ? "s" : ""} qui n'ont pas encore répondu
          </summary>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.non_respondents.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-[#071B34]/10 px-2 py-1 text-[11px] text-[#334155]">
                <img src={e.avatar} alt="" className="h-4 w-4 rounded-full object-cover" />
                {e.first_name} {e.last_name}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Questions */}
      {stats.questions.length === 0 && (
        <div className="text-center py-8 text-sm text-[#475569]">Aucune question analysable dans ce formulaire.</div>
      )}
      {stats.questions.map((q) => (
        <QuestionStats key={q.field_id} q={q} />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, accent, muted }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-[#3BA4FF]/10 text-[#1D70B8]" : muted ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#F4F7FA] text-[#334155]"}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function QuestionStats({ q }) {
  return (
    <div className="rounded-2xl border border-[#071B34]/5 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#475569]">{typeLabel(q.type)}</div>
          <h3 className="text-sm font-bold text-[#071B34] mt-0.5">{q.label}</h3>
        </div>
        <span className="ms-chip bg-[#F4F7FA] text-[#475569] shrink-0">
          {q.answered_count} réponse{q.answered_count > 1 ? "s" : ""}
        </span>
      </div>

      {/* Choice / multi-choice */}
      {(q.type === "radio" || q.type === "select" || q.type === "checkbox") && (
        <>
          {(q.options || []).length === 0 || q.answered_count === 0 ? (
            <div className="text-xs text-[#94A3B8] italic">Aucune donnée à afficher.</div>
          ) : (
            <div className="space-y-2">
              {q.options.map((opt) => (
                <div key={opt.option}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[#334155]">{opt.option}</span>
                    <span className="tabular-nums text-[#475569]">
                      <strong className="text-[#071B34]">{opt.percent}%</strong> — {opt.count} réponse{opt.count > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F4F7FA] overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#3BA4FF] to-[#1D70B8] transition-all" style={{ width: `${opt.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {q.top && q.top.count > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-1 font-semibold">
                ✨ Majoritaire : {q.top.option} — {q.top.percent}%
              </span>
              {q.bottom && q.bottom.count === 0 && q.type !== "checkbox" && (
                <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1 font-semibold">
                  Aucun choix pour : {q.bottom.option}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* Numeric / rating */}
      {q.type === "number" && (
        <>
          {q.average == null ? (
            <div className="text-xs text-[#94A3B8] italic">Aucune donnée numérique.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <MiniStat label="Moyenne" value={q.average} accent />
                <MiniStat label="Note la + donnée" value={q.mode} />
                <MiniStat label="Min" value={q.min} />
                <MiniStat label="Max" value={q.max} />
              </div>
              <div className="space-y-1">
                {q.distribution.map((d) => (
                  <div key={d.value} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-right font-semibold tabular-nums text-[#334155]">{d.value}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F4F7FA] overflow-hidden">
                      <div className="h-full bg-[#3BA4FF]" style={{ width: `${d.percent}%` }} />
                    </div>
                    <span className="w-14 text-[#475569] tabular-nums">{d.count} · {d.percent}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Text / textarea */}
      {(q.type === "text" || q.type === "textarea" || q.type === "email" || q.type === "tel" || q.type === "url" || q.type === "file") && (
        <>
          {(q.top_words || []).length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#475569] mb-1.5">Mots récurrents</div>
              <div className="flex flex-wrap gap-1.5">
                {q.top_words.map((w) => (
                  <span key={w.word} className="rounded-full bg-[#3BA4FF]/10 text-[#1D70B8] px-2 py-0.5 text-[11px] font-semibold">
                    {w.word} · {w.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#475569] mb-1.5">Toutes les réponses</div>
          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {(q.samples || []).length === 0 ? (
              <div className="text-xs text-[#94A3B8] italic">Aucune réponse.</div>
            ) : (
              q.samples.map((v, i) => (
                <div key={i} className="text-xs bg-[#F8FAFC] rounded-lg px-2 py-1.5 text-[#334155]">{v}</div>
              ))
            )}
          </div>
        </>
      )}

      {/* Date */}
      {q.type === "date" && (
        <div className="flex flex-wrap gap-1.5">
          {(q.samples || []).map((v, i) => (
            <span key={i} className="rounded-full bg-[#F4F7FA] px-2 py-0.5 text-[11px] text-[#334155]">{v}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }) {
  return (
    <div className={`rounded-lg p-2 ${accent ? "bg-emerald-50 text-emerald-800" : "bg-[#F4F7FA] text-[#334155]"}`}>
      <div className="text-[9px] uppercase tracking-widest font-bold opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value ?? "—"}</div>
    </div>
  );
}

function typeLabel(t) {
  return {
    text: "Texte court", textarea: "Texte long", email: "E-mail", tel: "Téléphone",
    number: "Note / nombre", url: "URL", date: "Date",
    select: "Choix unique", radio: "Choix unique", checkbox: "Choix multiple",
    file: "Fichier",
  }[t] || t;
}
