import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CreditCard, Check, Truck, ShoppingCart, Package, ChevronRight,
  Calendar, Copy, ClipboardList, Gift, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { api, absoluteUrl } from "@/lib/api";

const CART_KEY = "ms_cse_cart_v1";
const readCart = () => {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
};
const writeCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));

// ─────────────────────────────────────────
// Checkout — /avantages/checkout
// ─────────────────────────────────────────
export function AvantagesCheckout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(readCart);
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState("carte");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // order

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const discount = cart.reduce(
    (s, i) => s + Math.max(0, (i.unit_original || i.unit_price) - i.unit_price) * i.qty,
    0
  );

  const pay = async () => {
    if (cart.length === 0) { toast.error("Panier vide"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/cse/orders", {
        items: cart.map((c) => ({
          partner_id: c.partner_id,
          name: c.name,
          image: c.image,
          unit_price: c.unit_price,
          unit_original: c.unit_original,
          qty: c.qty,
        })),
        address: address.trim(),
        payment_method: payment,
      });
      setConfirmed(data);
      setCart([]);
      writeCart([]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Paiement impossible");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return (
      <div className="max-w-lg mx-auto ms-fade-up">
        <div className="ms-card p-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-[#10B981]/15 flex items-center justify-center">
            <Check className="h-10 w-10 text-[#10B981]" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#071B34]">Commande confirmée !</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Merci pour votre commande. Un e-mail de confirmation vous a été envoyé.
          </p>
          <div className="mt-6 rounded-2xl bg-[#F4F7FA] p-4 text-left space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Référence</div>
            <div className="font-mono text-lg font-bold text-[#071B34]" data-testid="order-reference">
              {confirmed.reference}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#071B34]/5 p-4">
            <div>
              <div className="text-xs text-[#475569]">Total réglé</div>
              <div className="text-2xl font-black text-[#071B34]">{Number(confirmed.total).toFixed(2)} €</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#475569]">{confirmed.items.length} article{confirmed.items.length > 1 ? "s" : ""}</div>
              <div className="text-xs text-[#94A3B8]">{new Date(confirmed.created_at).toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Link
              to="/avantages"
              className="rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 py-3 text-sm font-semibold text-[#334155]"
            >
              Retour aux avantages
            </Link>
            <Link
              to="/avantages/commandes"
              data-testid="cta-view-orders"
              className="rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white py-3 text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              Voir mes commandes <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 ms-fade-up">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/avantages")}
          className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold text-[#071B34]">Finaliser la commande</h1>
      </div>

      {cart.length === 0 ? (
        <div className="ms-card p-10 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-[#94A3B8]" />
          <div className="mt-3 text-sm font-semibold text-[#334155]">Votre panier est vide</div>
          <Link
            to="/avantages"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] px-4 h-10 text-sm font-bold text-white"
          >
            Retour aux avantages
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4">
          {/* Left: items + address + payment */}
          <div className="space-y-4">
            <div className="ms-card p-5">
              <h2 className="text-base font-bold text-[#071B34]">Articles ({cart.length})</h2>
              <div className="mt-3 space-y-3">
                {cart.map((it) => (
                  <div key={it.partner_id} className="flex items-center gap-3 pb-3 border-b border-[#071B34]/5 last:border-b-0 last:pb-0">
                    {it.image ? (
                      <img src={absoluteUrl(it.image)} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-[#F4F7FA] flex items-center justify-center text-[#94A3B8]">
                        <Gift className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#071B34] truncate">{it.name}</div>
                      <div className="text-xs text-[#475569]">Quantité : {it.qty}</div>
                    </div>
                    <div className="text-sm font-bold text-[#071B34]">{(it.unit_price * it.qty).toFixed(2)} €</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ms-card p-5">
              <h2 className="text-base font-bold text-[#071B34] inline-flex items-center gap-2">
                <Truck className="h-4 w-4" /> Adresse de livraison / retrait
              </h2>
              <p className="text-xs text-[#475569] mt-1">Optionnel — laissez vide pour un retrait en accueil MS Park.</p>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Ex : 12 rue de la République, 92350 Le Plessis-Robinson"
                data-testid="checkout-address"
                className="ms-input mt-3 resize-none"
              />
            </div>

            <div className="ms-card p-5">
              <h2 className="text-base font-bold text-[#071B34] inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Moyen de paiement
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { k: "carte", l: "Carte bancaire" },
                  { k: "prelevement", l: "Sur salaire" },
                ].map((m) => (
                  <button
                    key={m.k}
                    onClick={() => setPayment(m.k)}
                    data-testid={`pay-method-${m.k}`}
                    className={`rounded-xl border p-3 text-sm font-semibold text-left ${
                      payment === m.k
                        ? "border-[#3BA4FF] bg-[#3BA4FF]/5 text-[#1D70B8]"
                        : "border-[#071B34]/10 text-[#475569]"
                    }`}
                  >
                    {m.l}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[#94A3B8] italic">
                Simulation : aucun débit réel ne sera effectué.
              </p>
            </div>
          </div>

          {/* Right: summary */}
          <div className="ms-card p-5 space-y-3 h-max md:sticky md:top-24">
            <h2 className="text-base font-bold text-[#071B34] inline-flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Récapitulatif
            </h2>
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
            <div className="flex justify-between text-sm text-[#475569]">
              <span>Frais</span>
              <span className="font-semibold">Offerts</span>
            </div>
            <div className="pt-3 border-t border-[#071B34]/5 flex justify-between items-center">
              <span className="text-sm font-semibold text-[#334155]">Total</span>
              <span className="text-2xl font-black text-[#071B34]" data-testid="checkout-total">
                {subtotal.toFixed(2)} €
              </span>
            </div>
            <button
              onClick={pay}
              disabled={submitting}
              data-testid="checkout-pay"
              className="w-full h-12 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              {submitting ? "Paiement en cours…" : `Payer ${subtotal.toFixed(2)} €`}
            </button>
            <div className="text-[11px] text-[#94A3B8] text-center flex items-center justify-center gap-1">
              <Check className="h-3 w-3" /> Paiement sécurisé simulé
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Orders history — /avantages/commandes
// ─────────────────────────────────────────
export function AvantagesOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/cse/orders")
      .then((r) => setOrders(r.data))
      .finally(() => setLoading(false));
  }, []);

  const copyRef = (ref) => {
    navigator.clipboard.writeText(ref);
    toast.success("Référence copiée");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 ms-fade-up">
      <div className="flex items-center gap-2">
        <Link to="/avantages" className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="ms-overline">CSE &amp; Avantages › Mes commandes</div>
          <h1 className="text-2xl font-bold text-[#071B34]">Mes commandes</h1>
        </div>
      </div>

      {loading ? (
        <div className="ms-card p-10 text-center text-sm text-[#475569]">Chargement…</div>
      ) : orders.length === 0 ? (
        <div className="ms-card p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-[#94A3B8]" />
          <div className="mt-3 text-sm font-semibold text-[#334155]">Vous n&apos;avez pas encore passé de commande.</div>
          <Link
            to="/avantages"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] px-4 h-10 text-sm font-bold text-white"
          >
            Voir les avantages
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="ms-card p-5" data-testid={`order-${o.id}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Commande</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-[#071B34]">{o.reference}</span>
                    <button onClick={() => copyRef(o.reference)} className="h-7 w-7 rounded-lg hover:bg-[#F4F7FA] text-[#475569] inline-flex items-center justify-center" title="Copier la référence">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-[#94A3B8] inline-flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" /> {new Date(o.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
                <div className="text-right">
                  <span className="ms-chip !text-[10px] bg-[#10B981]/15 text-[#065F46]">
                    <Check className="h-3 w-3" /> {o.status === "confirmed" ? "Confirmée" : o.status}
                  </span>
                  <div className="mt-1 text-2xl font-black text-[#071B34]">{Number(o.total).toFixed(2)} €</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-[#071B34]/5 pt-3">
                {o.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {it.image ? (
                      <img src={absoluteUrl(it.image)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-[#F4F7FA] flex items-center justify-center text-[#94A3B8]">
                        <Gift className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#071B34] truncate">{it.name}</div>
                      <div className="text-xs text-[#475569]">{it.qty} × {Number(it.unit_price).toFixed(2)} €</div>
                    </div>
                    <div className="text-sm font-bold text-[#071B34]">{Number(it.line_total).toFixed(2)} €</div>
                  </div>
                ))}
              </div>
              {(o.discount_total > 0 || o.address || o.payment_method) && (
                <div className="mt-3 pt-3 border-t border-[#071B34]/5 text-xs text-[#475569] space-y-1">
                  {o.discount_total > 0 && <div>Réductions appliquées : <span className="font-semibold text-[#10B981]">- {Number(o.discount_total).toFixed(2)} €</span></div>}
                  {o.payment_method && <div>Paiement : <span className="font-semibold text-[#334155]">{o.payment_method === "prelevement" ? "Sur salaire" : "Carte bancaire"}</span></div>}
                  {o.address && <div>Livraison : <span className="font-semibold text-[#334155]">{o.address}</span></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
