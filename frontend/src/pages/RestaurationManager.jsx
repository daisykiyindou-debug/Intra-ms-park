import { useEffect, useMemo, useState } from "react";
import {
  UtensilsCrossed, Plus, Edit3, Trash2, Search, X, Save, Coins, Euro,
  MapPin, Tag, Filter, ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";
import ImageUpload from "@/components/ImageUpload";

const STORES = [
  { id: "soccer_bar", name: "Soccer Bar", emoji: "🍔" },
  { id: "donut_house", name: "Donut House", emoji: "🍩" },
  { id: "stand_crepes", name: "Stand Crêpes", emoji: "🥞" },
  { id: "stand_bonbons", name: "Stand Bonbons", emoji: "🍬" },
];

const STORE_LABEL = STORES.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});

const DEFAULT_CATEGORIES = [
  "Burgers", "Tacos", "Salades", "Finger Food", "Accompagnements",
  "Entrées", "Plats", "Desserts", "Pâtisserie", "Crêpes", "Bonbons",
  "Boissons", "Mocktails", "Salé", "Autres",
];

const ALLERGENS = ["gluten", "lait", "œuf", "soja", "fruits à coque", "arachide", "poisson", "crustacé"];

export default function RestaurationManager() {
  const { me, adminMode } = useApp();
  const canManage = !!me?.is_admin && adminMode !== false;

  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const { data } = await api.get("/admin/products");
      setItems(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [canManage]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (storeFilter !== "all" && p.store !== storeFilter) return false;
      if (q && !(`${p.name} ${p.description || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [items, q, storeFilter]);

  // Group by store for a scannable layout
  const grouped = useMemo(() => {
    const g = {};
    for (const p of filtered) {
      (g[p.store] = g[p.store] || []).push(p);
    }
    return g;
  }, [filtered]);

  const del = async (p) => {
    if (!window.confirm(`Supprimer « ${p.name} » ?`)) return;
    await api.delete(`/admin/products/${p.id}`);
    toast.success("Produit supprimé");
    load();
  };

  if (!canManage) {
    return (
      <div className="ms-card p-10 text-center">
        <UtensilsCrossed className="mx-auto h-10 w-10 text-[#94A3B8]" />
        <h2 className="mt-3 text-lg font-bold text-[#071B34]">Mode administrateur désactivé</h2>
        <p className="mt-2 text-sm text-[#475569]">
          Activez le mode administrateur (interrupteur en haut à droite) pour gérer la restauration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Administration › Restauration</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#B45309]">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34]">
                Menu Restauration
              </h1>
              <p className="text-sm text-[#475569] mt-0.5">
                Gérez les produits proposés dans la page Restauration des employés.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setEditing({})}
          data-testid="add-product-btn"
          className="ms-btn-primary"
        >
          <Plus className="h-4 w-4" /> Ajouter un produit
        </button>
      </div>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un produit…"
            data-testid="product-search"
            className="ms-input pl-9"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-4 w-4 text-[#475569] mx-1" />
          <button
            onClick={() => setStoreFilter("all")}
            data-testid="filter-store-all"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              storeFilter === "all"
                ? "bg-[#071B34] text-white"
                : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
            }`}
          >
            Tous ({items.length})
          </button>
          {STORES.map((s) => {
            const count = items.filter((p) => p.store === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => setStoreFilter(s.id)}
                data-testid={`filter-store-${s.id}`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  storeFilter === s.id
                    ? "bg-[#071B34] text-white"
                    : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                }`}
              >
                <span className="mr-1">{s.emoji}</span> {s.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {loading && items.length === 0 && (
        <div className="ms-card p-10 text-center text-sm text-[#475569]">Chargement…</div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="ms-card p-10 text-center text-sm text-[#475569]">
          Aucun produit dans cette catégorie.
        </div>
      )}

      {/* Grouped list */}
      <div className="space-y-6">
        {STORES.filter((s) => grouped[s.id]?.length).map((s) => (
          <section key={s.id} data-testid={`store-section-${s.id}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xl">{s.emoji}</span>
              <h2 className="text-base font-bold text-[#071B34]">{s.name}</h2>
              <span className="text-xs text-[#475569]">— {grouped[s.id].length} produit(s)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[s.id].map((p) => (
                <div
                  key={p.id}
                  className="ms-card overflow-hidden flex flex-col"
                  data-testid={`admin-product-${p.id}`}
                >
                  <div className="aspect-[16/10] bg-[#F4F7FA] relative overflow-hidden">
                    {p.image ? (
                      <img src={absoluteUrl(p.image)} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[#94A3B8]">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                    {p.available === false && (
                      <span className="absolute top-2 left-2 text-[10px] uppercase tracking-widest bg-[#EF4444] text-white px-2 py-0.5 rounded-full font-bold">
                        Indisponible
                      </span>
                    )}
                    <span className="absolute top-2 right-2 text-[10px] bg-white/95 text-[#071B34] px-2 py-0.5 rounded-full font-semibold">
                      {p.category}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-sm font-bold text-[#071B34] line-clamp-1">{p.name}</h3>
                    <p className="text-xs text-[#475569] mt-1 line-clamp-2">{p.description || "—"}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[#334155]">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]">
                        <Coins className="h-3.5 w-3.5" /> {p.points} pts
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#065F46]">
                        <Euro className="h-3.5 w-3.5" /> {Number(p.price_eur || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-1 pt-2 border-t border-[#071B34]/5">
                      <button
                        onClick={() => setEditing(p)}
                        data-testid={`edit-product-${p.id}`}
                        className="flex-1 text-xs rounded-lg bg-[#F4F7FA] hover:bg-[#3BA4FF]/10 px-2 py-1.5 inline-flex items-center justify-center gap-1"
                      >
                        <Edit3 className="h-3 w-3" /> Modifier
                      </button>
                      <button
                        onClick={() => del(p)}
                        data-testid={`delete-product-${p.id}`}
                        className="text-xs rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] px-2 py-1.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {editing && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, onClose, onSaved }) {
  const isNew = !product?.id;
  const [p, setP] = useState({
    name: product?.name || "",
    description: product?.description || "",
    store: product?.store || "soccer_bar",
    category: product?.category || "Plats",
    points: product?.points ?? 0,
    price_eur: product?.price_eur ?? 0,
    image: product?.image || "",
    allergens: product?.allergens || [],
    available: product?.available !== false,
  });
  const [saving, setSaving] = useState(false);

  const toggleAllergen = (a) => {
    setP((s) => ({
      ...s,
      allergens: s.allergens.includes(a)
        ? s.allergens.filter((x) => x !== a)
        : [...s.allergens, a],
    }));
  };

  const save = async () => {
    if (!p.name.trim()) { toast.error("Le nom du produit est requis"); return; }
    if (!p.store) { toast.error("Le lieu de récupération est requis"); return; }
    if (!p.category.trim()) { toast.error("La catégorie est requise"); return; }
    setSaving(true);
    try {
      const payload = {
        ...p,
        points: Number(p.points) || 0,
        price_eur: Number(p.price_eur) || 0,
      };
      if (isNew) await api.post("/admin/products", payload);
      else await api.put(`/admin/products/${product.id}`, payload);
      toast.success(isNew ? "Produit créé" : "Produit mis à jour");
      onSaved();
    } catch (err) {
      toast.error("Erreur", { description: err?.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          data-testid="product-editor"
          className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#071B34]">
              {isNew ? "Nouveau produit" : "Modifier le produit"}
            </h2>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-xl hover:bg-[#F4F7FA] flex items-center justify-center"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="ms-overline">Nom du produit *</label>
            <input
              value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })}
              placeholder="Ex : Burger Premium"
              data-testid="product-name"
              className="ms-input mt-1"
            />
          </div>

          <div>
            <label className="ms-overline">Description</label>
            <textarea
              rows={3}
              value={p.description}
              onChange={(e) => setP({ ...p, description: e.target.value })}
              placeholder="Description courte visible par les employés"
              data-testid="product-description"
              className="ms-input mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="ms-overline flex items-center gap-1"><MapPin className="h-3 w-3" /> Lieu de récupération *</label>
              <select
                value={p.store}
                onChange={(e) => setP({ ...p, store: e.target.value })}
                data-testid="product-store"
                className="ms-input mt-1"
              >
                {STORES.map((s) => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ms-overline flex items-center gap-1"><Tag className="h-3 w-3" /> Catégorie *</label>
              <input
                list="product-categories"
                value={p.category}
                onChange={(e) => setP({ ...p, category: e.target.value })}
                data-testid="product-category"
                className="ms-input mt-1"
                placeholder="Ex : Burgers, Desserts…"
              />
              <datalist id="product-categories">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className="ms-overline flex items-center gap-1"><Coins className="h-3 w-3" /> Points repas</label>
              <input
                type="number"
                min="0"
                value={p.points}
                onChange={(e) => setP({ ...p, points: e.target.value })}
                data-testid="product-points"
                className="ms-input mt-1"
              />
            </div>
            <div>
              <label className="ms-overline flex items-center gap-1"><Euro className="h-3 w-3" /> Prix (€)</label>
              <input
                type="number"
                min="0"
                step="0.10"
                value={p.price_eur}
                onChange={(e) => setP({ ...p, price_eur: e.target.value })}
                data-testid="product-price"
                className="ms-input mt-1"
              />
            </div>
          </div>

          <div>
            <label className="ms-overline">Photo du produit</label>
            <div className="mt-1">
              <ImageUpload
                value={p.image}
                onChange={(url) => setP({ ...p, image: url })}
                mode="single"
                testId="product-image"
              />
              <p className="text-[11px] text-[#475569] mt-1">
                Importez une photo depuis votre ordinateur ou votre téléphone.
              </p>
            </div>
          </div>

          <div>
            <label className="ms-overline">Allergènes</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALLERGENS.map((a) => {
                const on = p.allergens.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAllergen(a)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      on
                        ? "bg-[#F59E0B]/15 text-[#B45309] ring-1 ring-[#F59E0B]/40"
                        : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.available}
              onChange={(e) => setP({ ...p, available: e.target.checked })}
              data-testid="product-available"
            />
            Produit disponible à la commande
          </label>

          <div className="flex gap-2 justify-end pt-3 border-t border-[#071B34]/5">
            <button onClick={onClose} className="ms-btn-outline">Annuler</button>
            <button
              onClick={save}
              disabled={saving}
              data-testid="product-save"
              className="ms-btn-primary disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
}
