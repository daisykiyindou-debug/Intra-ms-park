import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Edit3, Trash2, X, Save, Tag, Percent, Ticket,
  Building2, Calendar, ImagePlus, Copy, Gift,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl } from "@/lib/api";
import ImageUpload from "@/components/ImageUpload";
import PortalModal from "@/components/PortalModal";

const CATEGORIES = [
  "Loisirs", "Cinéma", "Voyages", "Restauration", "Sport",
  "Bien-être", "Shopping", "Culture", "Famille", "Interne", "Autres",
];

const TYPES = [
  { k: "code", l: "Code promotionnel", i: Copy,
    desc: "L'utilisateur copie le code en un clic pour l'utiliser chez le partenaire." },
  { k: "discount", l: "Réduction (prix affiché)", i: Percent,
    desc: "Affiche l'ancien et le nouveau prix + le pourcentage de remise." },
  { k: "product", l: "Produit / Billet à acheter", i: Ticket,
    desc: "Ajoute l'article au panier. L'utilisateur passe commande via l'espace CSE." },
];

const emptyForm = () => ({
  name: "",
  partner: "",
  description: "",
  image: "",
  category: "Loisirs",
  type: "code",
  original_price: "",
  discount_price: "",
  discount_pct: "",
  promo_code: "",
  conditions: "",
  valid_until: "",
});

export default function PartnersManager() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editor, setEditor] = useState(null); // null | { form, id? }

  const load = () => api.get("/partners").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (q && !`${p.name} ${p.partner || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, cat, q]);

  const openCreate = () => setEditor({ form: emptyForm(), id: null });
  const openEdit = (p) => setEditor({
    id: p.id,
    form: {
      name: p.name || "",
      partner: p.partner || "",
      description: p.description || "",
      image: p.image || "",
      category: p.category || "Loisirs",
      type: p.type || "code",
      original_price: p.original_price ?? "",
      discount_price: p.discount_price ?? "",
      discount_pct: p.discount_pct ?? "",
      promo_code: p.promo_code || "",
      conditions: p.conditions || "",
      valid_until: p.valid_until || "",
    },
  });

  const del = async (p) => {
    if (!window.confirm(`Supprimer l'avantage "${p.name}" ?`)) return;
    try {
      await api.delete(`/admin/partners/${p.id}`);
      toast.success("Avantage supprimé");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Suppression impossible");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Administration › CSE &amp; Avantages</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Gestion des avantages CSE
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Créez et publiez les avantages, codes promo et produits en vente pour vos collaborateurs.
          </p>
        </div>
        <button
          onClick={openCreate}
          data-testid="partner-create-btn"
          className="ms-btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Nouvel avantage
        </button>
      </div>

      <div className="ms-card p-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un avantage…"
            data-testid="partner-search"
            className="ms-input pl-9"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          data-testid="partner-cat-filter"
          className="ms-input max-w-[220px]"
        >
          <option value="all">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="ms-card col-span-full p-10 text-center text-sm text-[#475569]">
            Aucun avantage. Cliquez sur &quot;Nouvel avantage&quot; pour en créer un.
          </div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="ms-card overflow-hidden flex flex-col" data-testid={`partner-card-${p.id}`}>
            <div className="relative aspect-[16/9] bg-[#F4F7FA]">
              {p.image ? (
                <img src={absoluteUrl(p.image)} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[#94A3B8]">
                  <Gift className="h-10 w-10" />
                </div>
              )}
              <span className="absolute top-3 left-3 ms-chip bg-white/95 text-[#071B34]">
                <Tag className="h-3 w-3" /> {p.category}
              </span>
              <span className={`absolute top-3 right-3 ms-chip ${
                p.type === "product" ? "bg-[#F59E0B]/95 text-white" :
                p.type === "discount" ? "bg-[#10B981]/95 text-white" : "bg-[#3BA4FF]/95 text-white"
              }`}>
                {p.type === "product" ? <Ticket className="h-3 w-3" /> : p.type === "discount" ? <Percent className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {p.type === "product" ? "Produit" : p.type === "discount" ? "Réduction" : "Code promo"}
              </span>
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <h3 className="text-base font-bold text-[#071B34] line-clamp-1">{p.name}</h3>
              {p.partner && <div className="text-xs text-[#475569] mt-0.5 inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partner}</div>}
              <p className="text-xs text-[#475569] mt-2 line-clamp-2 flex-1">{p.description}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                {p.type === "product" && p.discount_price != null && (
                  <span className="font-bold text-[#F59E0B]">{Number(p.discount_price).toFixed(2)} €</span>
                )}
                {p.discount_pct ? <span className="ms-chip !text-[10px] bg-[#EF4444]/10 text-[#B91C1C]">-{p.discount_pct}%</span> : null}
                {p.original_price ? (
                  <span className="text-[#94A3B8] line-through">{Number(p.original_price).toFixed(2)} €</span>
                ) : null}
                {p.valid_until && (
                  <span className="ms-chip !text-[10px] bg-[#F4F7FA] text-[#334155]">
                    <Calendar className="h-3 w-3" /> Jusqu&apos;au {p.valid_until}
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2 pt-3 border-t border-[#071B34]/5">
                <button
                  onClick={() => openEdit(p)}
                  data-testid={`partner-edit-${p.id}`}
                  className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-2 py-1.5 inline-flex items-center justify-center gap-1 text-[#334155] font-semibold"
                >
                  <Edit3 className="h-3 w-3" /> Modifier
                </button>
                <button
                  onClick={() => del(p)}
                  data-testid={`partner-del-${p.id}`}
                  className="text-xs rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] px-2 py-1.5"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editor && (
        <PortalModal>
          <PartnerEditor
            editor={editor}
            onClose={() => setEditor(null)}
            onSaved={() => { setEditor(null); load(); }}
          />
        </PortalModal>
      )}
    </div>
  );
}

function PartnerEditor({ editor, onClose, onSaved }) {
  const [f, setF] = useState(editor.form);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  // Auto-compute discount_pct when both prices are set
  const autoPct = useMemo(() => {
    const o = parseFloat(f.original_price);
    const d = parseFloat(f.discount_price);
    if (!isNaN(o) && !isNaN(d) && o > 0 && d < o) {
      return Math.round(((o - d) / o) * 100);
    }
    return null;
  }, [f.original_price, f.discount_price]);

  const save = async () => {
    if (!f.name.trim()) { toast.error("Nom requis"); return; }
    if (!f.description.trim()) { toast.error("Description requise"); return; }
    if (f.type === "product" && (!f.discount_price || parseFloat(f.discount_price) <= 0)) {
      toast.error("Prix de vente requis pour un produit");
      return;
    }
    if (f.type === "code" && !f.promo_code.trim()) {
      toast.error("Code promotionnel requis");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(),
        partner: f.partner.trim(),
        description: f.description.trim(),
        image: f.image || "",
        category: f.category,
        type: f.type,
        original_price: f.original_price === "" ? null : parseFloat(f.original_price),
        discount_price: f.discount_price === "" ? null : parseFloat(f.discount_price),
        discount_pct: f.discount_pct === "" ? (autoPct ?? null) : parseInt(f.discount_pct, 10),
        promo_code: f.promo_code.trim(),
        conditions: f.conditions.trim(),
        valid_until: f.valid_until || "",
      };
      if (editor.id) {
        await api.put(`/admin/partners/${editor.id}`, payload);
        toast.success("Avantage mis à jour");
      } else {
        await api.post("/admin/partners", payload);
        toast.success("Avantage créé");
      }
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  };

  const typeMeta = TYPES.find((t) => t.k === f.type) || TYPES[0];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="partner-editor"
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-[#071B34]/5 flex items-center justify-between">
          <div>
            <div className="ms-overline">Avantage CSE</div>
            <h2 className="text-lg font-bold text-[#071B34]">
              {editor.id ? "Modifier l'avantage" : "Nouvel avantage"}
            </h2>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Image */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Photo</label>
            <div className="mt-1">
              <ImageUpload
                value={f.image}
                onChange={(v) => set("image", v)}
                testId="partner-image"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Nom / titre *</label>
              <input
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ex : Cinéma Pathé Vélizy"
                data-testid="partner-name"
                className="ms-input mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Partenaire</label>
              <input
                value={f.partner}
                onChange={(e) => set("partner", e.target.value)}
                placeholder="Ex : Groupe Pathé"
                data-testid="partner-partner"
                className="ms-input mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Description *</label>
            <textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Réduction sur toutes les séances du lundi au jeudi…"
              data-testid="partner-description"
              className="ms-input mt-1 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Catégorie</label>
              <select
                value={f.category}
                onChange={(e) => set("category", e.target.value)}
                data-testid="partner-category"
                className="ms-input mt-1"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Date de validité</label>
              <input
                type="date"
                value={f.valid_until}
                onChange={(e) => set("valid_until", e.target.value)}
                data-testid="partner-valid-until"
                className="ms-input mt-1"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569] block mb-2">
              Type d&apos;avantage
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.k}
                  onClick={() => set("type", t.k)}
                  data-testid={`partner-type-${t.k}`}
                  className={`text-left rounded-2xl border p-3 transition-all ${
                    f.type === t.k
                      ? "border-[#3BA4FF] bg-[#3BA4FF]/5 ring-2 ring-[#3BA4FF]/20"
                      : "border-[#071B34]/10 hover:border-[#3BA4FF]/30"
                  }`}
                >
                  <div className="inline-flex items-center gap-1.5 text-sm font-bold text-[#071B34]">
                    <t.i className="h-4 w-4" /> {t.l}
                  </div>
                  <div className="mt-1 text-[11px] text-[#475569] leading-snug">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-[#475569] italic inline-flex items-center gap-1">
              <typeMeta.i className="h-3 w-3" /> {typeMeta.desc}
            </div>
          </div>

          {/* Price / discount block */}
          {f.type !== "code" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Prix d&apos;origine (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.original_price}
                  onChange={(e) => set("original_price", e.target.value)}
                  placeholder="0.00"
                  data-testid="partner-original-price"
                  className="ms-input mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">Prix remisé (€) {f.type === "product" && "*"}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.discount_price}
                  onChange={(e) => set("discount_price", e.target.value)}
                  placeholder="0.00"
                  data-testid="partner-discount-price"
                  className="ms-input mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">
                  Remise (%) {autoPct !== null && !f.discount_pct && <span className="text-[#3BA4FF]">auto : {autoPct}%</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={f.discount_pct}
                  onChange={(e) => set("discount_pct", e.target.value)}
                  placeholder={autoPct !== null ? String(autoPct) : "0"}
                  data-testid="partner-discount-pct"
                  className="ms-input mt-1"
                />
              </div>
            </div>
          )}

          {/* Promo code */}
          {(f.type === "code" || f.type === "discount") && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">
                Code promotionnel {f.type === "code" && "*"}
              </label>
              <input
                value={f.promo_code}
                onChange={(e) => set("promo_code", e.target.value)}
                placeholder="Ex : MSPARK2026"
                data-testid="partner-promo-code"
                className="ms-input mt-1 font-mono"
              />
            </div>
          )}

          {/* Conditions */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-[#475569]">
              Conditions d&apos;utilisation
            </label>
            <textarea
              value={f.conditions}
              onChange={(e) => set("conditions", e.target.value)}
              rows={2}
              placeholder="Valable une fois par salarié. Non cumulable avec d'autres offres…"
              data-testid="partner-conditions"
              className="ms-input mt-1 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-[#071B34]/5 p-4 flex items-center gap-2 bg-[#F4F7FA]/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-white hover:bg-[#F4F7FA] border border-[#071B34]/10 text-sm font-semibold text-[#334155] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            data-testid="partner-save"
            className="flex-1 h-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : (editor.id ? "Enregistrer" : "Créer l'avantage")}
          </button>
        </div>
      </div>
    </div>
  );
}
