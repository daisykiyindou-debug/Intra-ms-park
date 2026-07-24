import { useEffect, useMemo, useState } from "react";
import {
  QrCode, Tag, Copy, Check, ExternalLink, Gift, ShoppingCart, Plus, Minus,
  X, Percent, Ticket, Building2, Calendar, ChevronRight, ArrowLeft, Trash2,
  Search, Package, ClipboardList, Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { api, absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import PortalModal from "@/components/PortalModal";

const CART_KEY = "ms_cse_cart_v1";
const readCart = () => {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
};
const writeCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));

const CATEGORIES = [
  "Loisirs", "Cinéma", "Voyages", "Restauration", "Sport",
  "Bien-être", "Shopping", "Culture", "Famille", "Interne", "Autres",
];

export default function Avantages() {
  const navigate = useNavigate();
  const { me, adminMode } = useApp();
  const isAdmin = !!me?.is_admin && adminMode !== false;
  const [partners, setPartners] = useState([]);
  const [copied, setCopied] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [cart, setCart] = useState(readCart);
  const [typeFilter, setTypeFilter] = useState("all"); // all | code | discount | product
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/partners").then((r) => setPartners(r.data));
  }, []);

  // Persist cart
  useEffect(() => { writeCart(cart); }, [cart]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const cartDiscount = cart.reduce(
    (s, i) => s + Math.max(0, (i.unit_original || i.unit_price) - i.unit_price) * i.qty,
    0
  );

  const addToCart = (p) => {
    if (p.type !== "product") return;
    const unit = Number(p.discount_price ?? p.original_price ?? 0);
    if (!unit) { toast.error("Ce produit n'a pas de prix"); return; }
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.partner_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          partner_id: p.id,
          name: p.name,
          image: p.image,
          unit_price: unit,
          unit_original: p.original_price ? Number(p.original_price) : null,
          qty: 1,
        },
      ];
    });
    toast.success(`${p.name} ajouté au panier`);
  };

  const updateQty = (pid, delta) => {
    setCart((prev) => prev
      .map((i) => i.partner_id === pid ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  };
  const removeItem = (pid) => setCart((prev) => prev.filter((i) => i.partner_id !== pid));
  const clearCart = () => setCart([]);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    toast.success("Code copié !");
    setTimeout(() => setCopied(null), 2000);
  };

  const filtered = useMemo(() => {
    return partners.filter((p) => {
      if (typeFilter !== "all" && (p.type || "code") !== typeFilter) return false;
      if (cat !== "all" && p.category !== cat) return false;
      if (q && !`${p.name} ${p.partner || ""} ${p.description || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [partners, typeFilter, cat, q]);

  const typeCounts = useMemo(() => ({
    all: partners.length,
    code: partners.filter((p) => (p.type || "code") === "code").length,
    discount: partners.filter((p) => p.type === "discount").length,
    product: partners.filter((p) => p.type === "product").length,
  }), [partners]);

  return (
    <div className="space-y-6 ms-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ms-overline">Vie de l&apos;entreprise › CSE &amp; Avantages</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            CSE &amp; Avantages
          </h1>
          <p className="text-sm text-[#475569] mt-2 max-w-2xl">
            Profitez de réductions exclusives chez nos partenaires, achetez billets et produits directement depuis votre espace CSE.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Link
              to="/management/avantages"
              data-testid="cse-admin-link"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] hover:opacity-90 px-3 h-11 text-sm font-bold text-white shadow-md"
            >
              <Settings className="h-4 w-4" /> Gérer les avantages
            </Link>
          )}
          <Link
            to="/avantages/commandes"
            data-testid="cse-orders-link"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 h-11 text-sm font-semibold text-[#334155]"
          >
            <ClipboardList className="h-4 w-4" /> Mes commandes
          </Link>
          <button
            onClick={() => setShowCart(true)}
            data-testid="cse-cart-btn"
            className="relative inline-flex items-center gap-2 rounded-xl bg-[#071B34] hover:bg-[#0B2545] px-4 h-11 text-sm font-bold text-white"
          >
            <ShoppingCart className="h-4 w-4" /> Panier
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* MS Group CSE — plateforme externe partenaires */}
      <a
        href="https://ms-group-rewards.preview.emergentagent.com"
        target="_blank"
        rel="noreferrer"
        data-testid="cse-ms-group-link"
        className="relative block overflow-hidden rounded-3xl bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#1D70B8] p-6 shadow-lg transition-transform hover:-translate-y-0.5"
      >
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#3BA4FF]/25 blur-2xl" />
        <div className="absolute -right-4 bottom-0 h-24 w-24 rounded-full bg-[#A78BFA]/25 blur-2xl" />
        <div className="relative flex items-start gap-4 flex-wrap">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
            <Gift className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-[220px] text-white">
            <div className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">
              Plateforme externe · Groupe
            </div>
            <div className="mt-1 text-xl md:text-2xl font-bold leading-tight">
              CSE MS Group — Rewards &amp; Avantages
            </div>
            <p className="mt-1 text-sm text-white/80 max-w-lg">
              Accédez à l&apos;espace CSE du groupe MS Group : billetterie, chèques cadeaux, séjours et catalogue de partenaires nationaux.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#071B34] shadow-md">
            Ouvrir le portail <ExternalLink className="h-4 w-4" />
          </div>
        </div>
      </a>

      {/* Filters */}
      <div className="ms-card p-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un avantage…"
            data-testid="avantage-search"
            className="ms-input pl-9"
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} data-testid="avantage-cat" className="ms-input max-w-[220px]">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { k: "all", l: "Tous", i: Gift },
          { k: "code", l: "Codes promo", i: Copy },
          { k: "discount", l: "Réductions", i: Percent },
          { k: "product", l: "Produits & billets", i: Ticket },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTypeFilter(t.k)}
            data-testid={`filter-type-${t.k}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              typeFilter === t.k
                ? "bg-[#071B34] text-white"
                : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
            }`}
          >
            <t.i className="h-3.5 w-3.5" /> {t.l}
            <span className={`inline-flex items-center justify-center h-4 min-w-[16px] rounded-full text-[10px] font-bold px-1 ${
              typeFilter === t.k ? "bg-white/20 text-white" : "bg-[#3BA4FF]/15 text-[#1D70B8]"
            }`}>{typeCounts[t.k] || 0}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 && (
          <div className="ms-card col-span-full p-10 text-center text-sm text-[#475569]">
            Aucun avantage ne correspond à votre recherche.
          </div>
        )}
        {filtered.map((p) => (
          <PartnerCard
            key={p.id}
            p={p}
            copied={copied}
            onCopy={copyCode}
            onOpenDetail={() => setDetail(p)}
            onAddToCart={() => addToCart(p)}
          />
        ))}
      </div>

      {detail && (
        <PortalModal>
          <PartnerDetail
            p={detail}
            copied={copied}
            onCopy={copyCode}
            onAddToCart={() => { addToCart(detail); setDetail(null); setShowCart(true); }}
            onClose={() => setDetail(null)}
          />
        </PortalModal>
      )}

      {showCart && (
        <PortalModal>
          <CartDrawer
            cart={cart}
            subtotal={cartSubtotal}
            discount={cartDiscount}
            onClose={() => setShowCart(false)}
            onQty={updateQty}
            onRemove={removeItem}
            onClear={clearCart}
            onCheckout={() => { setShowCart(false); navigate("/avantages/checkout"); }}
          />
        </PortalModal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Card
// ─────────────────────────────────────────
function PartnerCard({ p, copied, onCopy, onOpenDetail, onAddToCart }) {
  const type = p.type || "code";
  const imgSrc = p.image ? absoluteUrl(p.image) : "";
  return (
    <div className="ms-card ms-card-hover overflow-hidden flex flex-col" data-testid={`partner-${p.id}`}>
      <button onClick={onOpenDetail} className="relative aspect-[16/9] overflow-hidden bg-[#071B34] text-left">
        {imgSrc ? (
          <img src={imgSrc} alt={p.name} className="h-full w-full object-cover opacity-80 transition-transform duration-500 hover:scale-110" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/40">
            <Gift className="h-12 w-12" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#071B34] via-transparent to-transparent" />
        <div className="absolute top-3 left-3">
          <span className="ms-chip bg-white/95 text-[#071B34] backdrop-blur-md shadow-md">
            <Tag className="h-3 w-3" /> {p.category}
          </span>
        </div>
        {p.discount && (
          <div className="absolute bottom-3 right-3 rounded-2xl bg-[#3BA4FF] px-4 py-2 text-2xl font-extrabold text-white shadow-lg">
            {p.discount}
          </div>
        )}
      </button>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`ms-chip !text-[10px] ${
            type === "product" ? "bg-[#F59E0B]/15 text-[#B45309]" :
            type === "discount" ? "bg-[#10B981]/15 text-[#065F46]" : "bg-[#3BA4FF]/15 text-[#1D70B8]"
          }`}>
            {type === "product" ? <Ticket className="h-3 w-3" /> : type === "discount" ? <Percent className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {type === "product" ? "Produit / billet" : type === "discount" ? "Réduction" : "Code promo"}
          </span>
          {p.valid_until && (
            <span className="text-[10px] text-[#94A3B8] inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Jusqu&apos;au {p.valid_until}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-bold text-[#071B34]">{p.name}</h3>
        {p.partner && <div className="text-xs text-[#475569] inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partner}</div>}
        <p className="text-sm text-[#475569] mt-2 line-clamp-3 flex-1">{p.description}</p>

        {/* Type-specific footer */}
        {type === "product" ? (
          <div className="mt-4 flex items-end justify-between gap-2">
            <div>
              {p.original_price ? (
                <div className="text-[11px] text-[#94A3B8] line-through">{Number(p.original_price).toFixed(2)} €</div>
              ) : null}
              <div className="text-xl font-black text-[#071B34]">
                {p.discount_price != null ? `${Number(p.discount_price).toFixed(2)} €` : "—"}
              </div>
            </div>
            <button
              onClick={onAddToCart}
              data-testid={`add-to-cart-${p.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold px-3 py-2"
            >
              <ShoppingCart className="h-4 w-4" /> Ajouter
            </button>
          </div>
        ) : (p.promo_code || p.qr_code) ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F4F7FA] p-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#071B34] text-white">
              <QrCode className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">Code partenaire</div>
              <div className="font-mono text-xs text-[#071B34] truncate">{p.promo_code || p.qr_code}</div>
            </div>
            <button
              onClick={() => onCopy(p.promo_code || p.qr_code)}
              data-testid={`copy-${p.id}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white hover:bg-[#3BA4FF]/10"
            >
              {copied === (p.promo_code || p.qr_code) ? (
                <Check className="h-4 w-4 text-[#10B981]" />
              ) : (
                <Copy className="h-4 w-4 text-[#475569]" />
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDetail}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-2 text-sm font-semibold text-[#334155]"
          >
            Voir le détail <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────
function PartnerDetail({ p, copied, onCopy, onAddToCart, onClose }) {
  const type = p.type || "code";
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="partner-detail"
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="relative">
          {p.image ? (
            <img src={absoluteUrl(p.image)} alt={p.name} className="w-full h-56 object-cover" />
          ) : (
            <div className="w-full h-40 bg-gradient-to-br from-[#071B34] to-[#3BA4FF] flex items-center justify-center">
              <Gift className="h-12 w-12 text-white/60" />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 hover:bg-white text-[#071B34] inline-flex items-center justify-center shadow"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="ms-chip bg-[#3BA4FF]/12 text-[#1D70B8]">
              <Tag className="h-3 w-3" /> {p.category}
            </span>
            <span className={`ms-chip ${
              type === "product" ? "bg-[#F59E0B]/15 text-[#B45309]" :
              type === "discount" ? "bg-[#10B981]/15 text-[#065F46]" : "bg-[#3BA4FF]/15 text-[#1D70B8]"
            }`}>
              {type === "product" ? "Produit / billet" : type === "discount" ? "Réduction" : "Code promo"}
            </span>
            {p.valid_until && (
              <span className="text-[11px] text-[#475569] inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Valable jusqu&apos;au {p.valid_until}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#071B34]">{p.name}</h2>
            {p.partner && <div className="text-sm text-[#475569] inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partner}</div>}
          </div>

          {(p.original_price || p.discount_price || p.discount_pct) && (
            <div className="rounded-2xl border border-[#071B34]/5 bg-[#F4F7FA] p-4 flex items-center gap-4 flex-wrap">
              {p.discount_price != null && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">
                    {type === "product" ? "Prix" : "Après réduction"}
                  </div>
                  <div className="text-2xl font-black text-[#071B34]">{Number(p.discount_price).toFixed(2)} €</div>
                </div>
              )}
              {p.original_price && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Prix d&apos;origine</div>
                  <div className="text-lg text-[#94A3B8] line-through">{Number(p.original_price).toFixed(2)} €</div>
                </div>
              )}
              {p.discount_pct ? (
                <div className="ml-auto">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EF4444] text-white text-sm font-bold px-3 py-1.5">
                    <Percent className="h-3.5 w-3.5" /> -{p.discount_pct}%
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold mb-1">Description</div>
            <p className="text-sm text-[#334155] whitespace-pre-wrap">{p.description}</p>
          </div>

          {p.conditions && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold mb-1">Conditions</div>
              <p className="text-sm text-[#334155] whitespace-pre-wrap">{p.conditions}</p>
            </div>
          )}

          {(type === "code" || type === "discount") && (p.promo_code || p.qr_code) && (
            <div className="rounded-2xl border border-dashed border-[#3BA4FF]/40 bg-[#3BA4FF]/5 p-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#071B34] text-white">
                <QrCode className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Votre code</div>
                <div className="font-mono text-lg text-[#071B34] font-bold truncate">
                  {p.promo_code || p.qr_code}
                </div>
              </div>
              <button
                onClick={() => onCopy(p.promo_code || p.qr_code)}
                data-testid={`detail-copy-${p.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white text-sm font-bold px-3 py-2"
              >
                {copied === (p.promo_code || p.qr_code)
                  ? <><Check className="h-4 w-4" /> Copié</>
                  : <><Copy className="h-4 w-4" /> Copier</>}
              </button>
            </div>
          )}
        </div>

        {type === "product" && (
          <div className="border-t border-[#071B34]/5 p-4 flex items-center gap-2 bg-[#F4F7FA]/50">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-white hover:bg-[#F4F7FA] border border-[#071B34]/10 text-sm font-semibold text-[#334155]"
            >
              Continuer à explorer
            </button>
            <button
              onClick={onAddToCart}
              data-testid={`detail-add-to-cart-${p.id}`}
              className="flex-1 h-11 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" /> Ajouter au panier
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Cart drawer
// ─────────────────────────────────────────
function CartDrawer({ cart, subtotal, discount, onClose, onQty, onRemove, onClear, onCheckout }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="cse-cart-drawer"
        className="bg-white w-full max-w-md h-full overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="px-5 py-4 border-b border-[#071B34]/5 flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-[#3BA4FF]" />
          <div className="flex-1">
            <div className="text-sm font-bold text-[#071B34]">Mon panier</div>
            <div className="text-xs text-[#475569]">{cart.length} article{cart.length > 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <Package className="mx-auto h-10 w-10 text-[#94A3B8]" />
              <div className="mt-3 text-sm font-semibold text-[#334155]">Votre panier est vide</div>
              <div className="text-xs text-[#475569] mt-1">Ajoutez des produits ou billets depuis les avantages.</div>
            </div>
          ) : cart.map((it) => (
            <div key={it.partner_id} className="flex items-start gap-3 rounded-2xl border border-[#071B34]/5 p-3">
              {it.image ? (
                <img src={absoluteUrl(it.image)} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-[#F4F7FA] flex items-center justify-center text-[#94A3B8]">
                  <Gift className="h-6 w-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#071B34] line-clamp-1">{it.name}</div>
                <div className="mt-0.5 text-xs text-[#475569]">
                  {it.unit_price.toFixed(2)} €
                  {it.unit_original && it.unit_original > it.unit_price && (
                    <span className="ml-1 line-through text-[#94A3B8]">{it.unit_original.toFixed(2)} €</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => onQty(it.partner_id, -1)}
                    data-testid={`cart-decr-${it.partner_id}`}
                    className="h-7 w-7 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-sm font-bold text-[#071B34] w-6 text-center">{it.qty}</span>
                  <button
                    onClick={() => onQty(it.partner_id, 1)}
                    data-testid={`cart-incr-${it.partner_id}`}
                    className="h-7 w-7 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemove(it.partner_id)}
                    data-testid={`cart-rm-${it.partner_id}`}
                    className="ml-auto h-7 w-7 rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center"
                    aria-label="Retirer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-sm font-bold text-[#071B34] text-right shrink-0">
                {(it.unit_price * it.qty).toFixed(2)} €
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-[#071B34]/5 p-4 space-y-2 bg-[#F4F7FA]/50">
            <div className="flex justify-between text-sm text-[#475569]">
              <span>Sous-total</span>
              <span className="font-semibold">{subtotal.toFixed(2)} €</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-[#10B981]">
                <span>Réductions appliquées</span>
                <span className="font-semibold">- {discount.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#071B34] pt-2 border-t border-[#071B34]/5">
              <span>Total</span>
              <span data-testid="cart-total">{subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClear}
                className="flex-1 h-11 rounded-xl bg-white hover:bg-[#F4F7FA] border border-[#071B34]/10 text-sm font-semibold text-[#334155]"
              >
                Vider
              </button>
              <button
                onClick={onCheckout}
                data-testid="cart-checkout"
                className="flex-1 h-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                Passer commande <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
