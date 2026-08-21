import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CreditCard, Check, Truck, ShoppingCart, Package, ChevronRight,
  Calendar, Copy, ClipboardList, Gift, Receipt, Mail as MailIcon, QrCode, Download, Printer,
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
  const [email, setEmail] = useState("");
  const [payment, setPayment] = useState("carte");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // order

  // Pre-fill email from /me
  useEffect(() => {
    api.get("/me").then((r) => {
      if (!email && r.data?.email) setEmail(r.data.email);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const discount = cart.reduce(
    (s, i) => s + Math.max(0, (i.unit_original || i.unit_price) - i.unit_price) * i.qty,
    0
  );

  const pay = async () => {
    if (cart.length === 0) { toast.error("Panier vide"); return; }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Adresse e-mail valide requise pour recevoir vos e-billets");
      return;
    }
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
        email: email.trim(),
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
            Merci pour votre commande.{" "}
            {confirmed.email && (
              <>Un e-mail de confirmation avec vos e-billets a été envoyé à{" "}
              <strong className="text-[#071B34]">{confirmed.email}</strong>.</>
            )}
          </p>
          <div className="mt-6 rounded-2xl bg-[#F4F7FA] p-4 text-left space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Référence</div>
            <div className="font-mono text-lg font-bold text-[#071B34]" data-testid="order-reference">
              {confirmed.reference}
            </div>
          </div>
          {(confirmed.tickets || []).length > 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-[#3BA4FF]/40 bg-[#3BA4FF]/5 p-4 text-left">
              <div className="text-[10px] uppercase tracking-widest text-[#1D70B8] font-semibold flex items-center gap-1">
                <QrCode className="h-3 w-3" /> Vos e-billets ({confirmed.tickets.length})
              </div>
              <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                {confirmed.tickets.map((t) => (
                  <Link
                    key={t.id}
                    to={`/avantages/commandes/${confirmed.id}/billet/${t.id}`}
                    data-testid={`ticket-link-${t.id}`}
                    className="flex items-center gap-2 rounded-lg bg-white/70 hover:bg-white p-2 text-xs"
                  >
                    <QrCode className="h-4 w-4 text-[#3BA4FF] shrink-0" />
                    <span className="flex-1 truncate font-semibold text-[#071B34]">{t.name}</span>
                    <span className="font-mono text-[10px] text-[#475569]">{t.code}</span>
                    <ChevronRight className="h-3 w-3 text-[#94A3B8]" />
                  </Link>
                ))}
              </div>
            </div>
          )}
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
                <MailIcon className="h-4 w-4" /> E-mail de confirmation
              </h2>
              <p className="text-xs text-[#475569] mt-1">
                Vos e-billets seront envoyés à cette adresse. Vous pouvez la modifier.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.com"
                data-testid="checkout-email"
                className="ms-input mt-3"
                required
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
              {(o.discount_total > 0 || o.address || o.payment_method || o.email) && (
                <div className="mt-3 pt-3 border-t border-[#071B34]/5 text-xs text-[#475569] space-y-1">
                  {o.discount_total > 0 && <div>Réductions appliquées : <span className="font-semibold text-[#10B981]">- {Number(o.discount_total).toFixed(2)} €</span></div>}
                  {o.payment_method && <div>Paiement : <span className="font-semibold text-[#334155]">{o.payment_method === "prelevement" ? "Sur salaire" : "Carte bancaire"}</span></div>}
                  {o.address && <div>Livraison : <span className="font-semibold text-[#334155]">{o.address}</span></div>}
                  {o.email && <div className="inline-flex items-center gap-1"><MailIcon className="h-3 w-3" /> Envoyé à <span className="font-semibold text-[#334155]">{o.email}</span></div>}
                </div>
              )}
              {(o.tickets || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#071B34]/5">
                  <div className="text-[10px] uppercase tracking-widest text-[#1D70B8] font-semibold mb-2 inline-flex items-center gap-1">
                    <QrCode className="h-3 w-3" /> E-billets ({o.tickets.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {o.tickets.map((t) => (
                      <Link
                        key={t.id}
                        to={`/avantages/commandes/${o.id}/billet/${t.id}`}
                        data-testid={`order-ticket-${t.id}`}
                        className="flex items-center gap-2 rounded-xl border border-[#3BA4FF]/20 bg-[#3BA4FF]/5 hover:bg-[#3BA4FF]/10 p-2"
                      >
                        <QrCode className="h-5 w-5 text-[#3BA4FF]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[#071B34] truncate">{t.name}</div>
                          <div className="font-mono text-[10px] text-[#475569]">{t.code}</div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-[#94A3B8]" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────
// E-ticket page — /avantages/commandes/:oid/billet/:tid
// ─────────────────────────────────────────
import { useParams } from "react-router-dom";

export function AvantagesTicket() {
  const { oid, tid } = useParams();
  const [order, setOrder] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/cse/orders/${oid}`)
      .then((r) => {
        setOrder(r.data);
        const t = (r.data.tickets || []).find((x) => x.id === tid);
        if (!t) setError("Billet introuvable");
        setTicket(t || null);
      })
      .catch((err) => setError(err?.response?.data?.detail || "Commande introuvable"));
  }, [oid, tid]);

  const printTicket = () => window.print();

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="ms-card p-8 text-center">
          <div className="text-sm text-[#B91C1C]">{error}</div>
          <Link to="/avantages/commandes" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#3BA4FF]">
            <ArrowLeft className="h-4 w-4" /> Retour aux commandes
          </Link>
        </div>
      </div>
    );
  }
  if (!order || !ticket) {
    return <div className="ms-card p-10 text-center text-sm text-[#475569]">Chargement du billet…</div>;
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/avantages/commandes" className="inline-flex items-center gap-1 text-sm font-semibold text-[#475569] hover:text-[#071B34]">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <button
          onClick={printTicket}
          data-testid="ticket-print"
          className="inline-flex items-center gap-1 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white text-sm font-bold px-3 h-10"
        >
          <Printer className="h-4 w-4" /> Imprimer / PDF
        </button>
      </div>

      <div className="rounded-3xl overflow-hidden shadow-2xl bg-white" data-testid="ticket-content">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-[#071B34] via-[#0B2545] to-[#3BA4FF] p-6 text-white">
          <div className="text-[10px] uppercase tracking-widest opacity-80">E-billet MS Park CSE</div>
          <h1 className="mt-1 text-2xl font-black leading-tight">{ticket.name}</h1>
          <div className="mt-1 text-sm opacity-90">Commande {order.reference}</div>
          <Gift className="absolute -right-2 -bottom-4 h-24 w-24 text-white/10" />
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="rounded-2xl border border-dashed border-[#3BA4FF]/40 bg-[#3BA4FF]/5 p-4 text-center">
            <div className="text-[10px] uppercase tracking-widest text-[#1D70B8] font-semibold">Code d&apos;accès</div>
            <div className="mt-2 font-mono text-2xl font-black text-[#071B34] tracking-wider break-all">
              {ticket.code}
            </div>
            <div className="mt-3 mx-auto h-24 w-24 rounded-xl bg-white flex items-center justify-center border-2 border-[#071B34]/10">
              <QrCode className="h-16 w-16 text-[#071B34]" />
            </div>
            <div className="mt-2 text-[10px] text-[#94A3B8]">Présentez ce code lors de la validation</div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Prix payé</dt>
              <dd className="font-bold text-[#071B34]">{Number(ticket.unit_price).toFixed(2)} €</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Émis le</dt>
              <dd className="font-semibold text-[#334155]">{new Date(order.created_at).toLocaleDateString("fr-FR")}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-widest text-[#475569] font-semibold">Titulaire</dt>
              <dd className="font-semibold text-[#334155]">{order.email || "Retrait sur place"}</dd>
            </div>
          </dl>
          <div className="pt-3 border-t border-[#071B34]/5 text-[10px] text-[#94A3B8] leading-relaxed">
            Billet nominatif, non remboursable. À présenter avec une pièce d&apos;identité si demandé.
            Ce billet a été émis par le CSE MS Park.
          </div>
        </div>
      </div>
    </div>
  );
}
