import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, X, QrCode, Clock, MapPin, CheckCircle2,
  ListOrdered, PackageCheck, Sparkles, AlertTriangle, CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const STORES = [
  { id: "soccer_bar", name: "Soccer Bar", emoji: "🍔" },
  { id: "donut_house", name: "Donut House", emoji: "🍩" },
  { id: "stand_crepes", name: "Stand Crêpes", emoji: "🥞" },
  { id: "stand_bonbons", name: "Stand Bonbons", emoji: "🍬" },
];

const STATUS_META = {
  preparing: { label: "En préparation", color: "#F59E0B", bg: "#FEF3C7" },
  ready: { label: "Prête à retirer", color: "#3BA4FF", bg: "#E0F2FE" },
  picked_up: { label: "Récupérée", color: "#10B981", bg: "#D1FAE5" },
  cancelled: { label: "Annulée", color: "#64748B", bg: "#F1F5F9" },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Restaurant() {
  const [tab, setTab] = useState("menu");
  const [activeStore, setActiveStore] = useState("soccer_bar");
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [cart, setCart] = useState({});
  const [pickupDate, setPickupDate] = useState(todayIso());
  const [pickupTime, setPickupTime] = useState("12:30");
  const [balance, setBalance] = useState(null);
  const [orderConfirm, setOrderConfirm] = useState(null);
  const [orders, setOrders] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayInfo, setDayInfo] = useState(null);

  const refreshBalance = () => api.get("/meal-points/today").then((r) => setBalance(r.data));
  const refreshOrders = () => api.get("/orders").then((r) => setOrders(r.data));

  useEffect(() => {
    api.get(`/menu?store=${activeStore}`).then((r) => {
      setProducts(r.data);
      setActiveCategory("Tous");
    });
  }, [activeStore]);

  useEffect(() => {
    refreshBalance();
    refreshOrders();
  }, []);

  useEffect(() => {
    api.get(`/schedule/day?day=${pickupDate}`).then((r) => setDayInfo(r.data));
  }, [pickupDate]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["Tous", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo(
    () => (activeCategory === "Tous" ? products : products.filter((p) => p.category === activeCategory)),
    [products, activeCategory]
  );

  const cartItems = Object.values(cart);
  const totalPoints = cartItems.reduce((s, ci) => s + ci.product.points * ci.qty, 0);
  const totalEur = cartItems.reduce((s, ci) => s + ci.product.price_eur * ci.qty, 0);
  const remaining = balance?.remaining || 0;
  const isToday = pickupDate === todayIso();
  const isWorkingDay = dayInfo?.is_working_day;
  const canOrder = isWorkingDay;
  // Points apply only if pickup is today
  const pointsUsable = isToday ? remaining : 0;
  const pointsUsed = Math.min(pointsUsable, totalPoints);
  const pointsToPayEur =
    totalPoints > 0 ? (totalEur * (totalPoints - pointsUsed)) / totalPoints : 0;

  const updateQty = (product, delta) => {
    setCart((prev) => {
      const cur = prev[product.id]?.qty || 0;
      const next = cur + delta;
      if (next <= 0) {
        const { [product.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [product.id]: { product, qty: next } };
    });
  };

  const placeOrder = async (pickupPoint) => {
    if (!canOrder) {
      toast.error("Commande indisponible", {
        description: "Vous ne pouvez commander que sur vos jours de travail planifiés.",
      });
      return;
    }
    if (cartItems.length === 0) return;
    try {
      const { data } = await api.post("/orders", {
        items: cartItems.map((ci) => ({ product_id: ci.product.id, quantity: ci.qty })),
        pickup_point: pickupPoint,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
      });
      setOrderConfirm(data);
      setCart({});
      setDrawerOpen(false);
      await refreshBalance();
      await refreshOrders();
      toast.success("Commande validée !", { description: `QR ${data.qr_code}` });
    } catch (e) {
      toast.error("Échec de la commande");
    }
  };

  const markPickedUp = async (oid) => {
    await api.post(`/orders/${oid}/pickup`);
    toast.success("Commande marquée récupérée");
    refreshOrders();
  };

  const cancelOrder = async (oid) => {
    await api.post(`/orders/${oid}/cancel`);
    toast.success("Commande annulée, points remboursés");
    refreshOrders();
    refreshBalance();
  };

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Restauration MS Park</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Menu digital & commandes
          </h1>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          data-testid="open-cart"
          className="relative ms-btn-primary"
        >
          <ShoppingCart className="h-4 w-4" />
          Panier
          {cartItems.length > 0 && (
            <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#3BA4FF] px-1">
              {cartItems.reduce((s, ci) => s + ci.qty, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl bg-white border border-[#071B34]/8 p-1">
        <button
          onClick={() => setTab("menu")}
          data-testid="tab-menu"
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            tab === "menu" ? "bg-[#071B34] text-white shadow-md" : "text-[#475569]"
          }`}
        >
          <Sparkles className="inline h-3.5 w-3.5 mr-1.5" /> Menu
        </button>
        <button
          onClick={() => setTab("orders")}
          data-testid="tab-orders"
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            tab === "orders" ? "bg-[#071B34] text-white shadow-md" : "text-[#475569]"
          }`}
        >
          <ListOrdered className="inline h-3.5 w-3.5 mr-1.5" /> Mes commandes
          {orders.filter((o) => o.status === "preparing" || o.status === "ready").length > 0 && (
            <span className="ml-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#3BA4FF] text-white text-[9px] font-bold px-1">
              {orders.filter((o) => o.status === "preparing" || o.status === "ready").length}
            </span>
          )}
        </button>
      </div>

      {/* CLEAR balance banner */}
      {balance && tab === "menu" && (
        <div className="ms-card p-5 flex flex-wrap items-center gap-4 bg-gradient-to-r from-[#3BA4FF]/8 to-transparent border border-[#3BA4FF]/15">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-3xl">
            🍴
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#475569] uppercase tracking-wider font-semibold">
              Solde aujourd'hui
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-[#071B34] leading-tight">
              Il vous reste{" "}
              <span className="text-[#3BA4FF]">{balance.remaining} points</span>{" "}
              <span className="text-base text-[#475569] font-medium">
                / {balance.credited_points || balance.daily_quota} pts
              </span>
            </div>
            <div className="text-xs text-[#475569] mt-0.5">
              Expire à 23h59 · non cumulables
            </div>
          </div>
        </div>
      )}

      {tab === "menu" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {STORES.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStore(s.id)}
                data-testid={`store-${s.id}`}
                className={`shrink-0 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all ${
                  activeStore === s.id
                    ? "bg-[#071B34] text-white shadow-lg shadow-[#071B34]/20"
                    : "bg-white border border-[#071B34]/8 text-[#071B34] hover:border-[#3BA4FF]"
                }`}
              >
                <span className="text-lg">{s.emoji}</span>
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  activeCategory === c
                    ? "bg-[#3BA4FF] text-white"
                    : "bg-white border border-[#071B34]/8 text-[#475569] hover:bg-[#F4F7FA]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleProducts.map((p) => (
              <div
                key={p.id}
                className="ms-card ms-card-hover overflow-hidden group"
                data-testid={`product-${p.id}`}
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-[#F4F7FA]">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-md px-2.5 py-1 text-xs font-bold text-[#071B34] shadow-md">
                    <span className="text-[#3BA4FF]">●</span> {p.points} pts
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#071B34]">{p.name}</h4>
                      <p className="text-xs text-[#475569] mt-0.5 line-clamp-2">{p.description}</p>
                    </div>
                    <span className="text-xs text-[#475569] whitespace-nowrap">
                      {p.price_eur.toFixed(2)} €
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {cart[p.id] ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => updateQty(p, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-sm font-bold w-5 text-center">{cart[p.id].qty}</span>
                        <button
                          onClick={() => updateQty(p, +1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateQty(p, +1)}
                        data-testid={`add-${p.id}`}
                        className="ms-btn-primary !px-4 !py-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" /> Ajouter
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <OrdersList orders={orders} onPickup={markPickedUp} onCancel={cancelOrder} />
      )}

      {/* Cart drawer */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        />
      )}
      <aside
        data-testid="cart-drawer"
        className={`fixed right-0 top-0 z-50 h-screen w-full max-w-md transform bg-white shadow-2xl transition-transform duration-300 flex flex-col ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6 border-b border-[#071B34]/5 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#3BA4FF]" />
            <h2 className="text-lg font-bold text-[#071B34]">Mon panier</h2>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Points status banner inside cart */}
        {balance && (
          <div
            className={`px-5 py-3 ${
              pointsUsable > 0
                ? "bg-[#10B981]/10 border-b border-[#10B981]/20"
                : "bg-[#FEE2E2] border-b border-[#EF4444]/20"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {pointsUsable > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
                  <span className="text-[#065F46] font-semibold">
                    Points disponibles : {pointsUsable} pts
                  </span>
                  <span className="text-[#475569] ml-auto text-xs">aujourd'hui</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
                  <span className="text-[#B91C1C] font-semibold leading-tight">
                    {isToday
                      ? "Vous n'avez plus de points disponibles aujourd'hui. Le paiement sera intégralement en CB et en euros."
                      : "Les points ne sont valables que le jour même. Pour cette date, paiement uniquement en CB."}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cartItems.length === 0 && (
            <div className="text-center py-12">
              <ShoppingCart className="mx-auto h-10 w-10 text-[#3BA4FF]/40" />
              <p className="mt-3 text-sm text-[#475569]">Votre panier est vide</p>
            </div>
          )}
          {cartItems.map(({ product, qty }) => (
            <div key={product.id} className="flex gap-3 rounded-2xl bg-[#F4F7FA] p-3">
              <img src={product.image} alt={product.name} className="h-16 w-16 rounded-xl object-cover" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#071B34]">{product.name}</div>
                <div className="text-xs text-[#475569]">
                  {product.points} pts · {product.price_eur.toFixed(2)} €
                </div>
                <div className="mt-2 inline-flex items-center gap-2">
                  <button
                    onClick={() => updateQty(product, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-bold w-5 text-center">{qty}</span>
                  <button
                    onClick={() => updateQty(product, +1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3BA4FF] text-white"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="text-right text-sm font-bold text-[#071B34]">
                {product.points * qty} pts
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#071B34]/5 p-5 space-y-3 bg-white shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569] mb-1">
                Date de retrait
              </div>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                data-testid="pickup-date"
                min={todayIso()}
                className="ms-input text-sm py-2"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569] mb-1">
                Heure de retrait
              </div>
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                data-testid="pickup-time"
                className="ms-input text-sm py-2"
              />
            </div>
          </div>

          {/* OFF day warning */}
          {dayInfo && !isWorkingDay && (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444]/20 p-3">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
                <div className="text-[#B91C1C]">
                  <strong>Jour OFF / congé / hors planning</strong>
                  <br />
                  Vous ne pouvez commander que sur vos jours de travail planifiés
                  (mercredi → dimanche). Aucune commande possible — ni avec points, ni en CB.
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-1 text-sm">
            <Row label="Total commande" value={`${totalPoints} pts (${totalEur.toFixed(2)} €)`} />
            <Row
              label={isToday ? "Points utilisés" : "Points utilisés (jour J uniquement)"}
              value={`${pointsUsed} pts`}
              color="#10B981"
            />
            {pointsToPayEur > 0 && (
              <Row
                label="Reste à payer (CB)"
                value={`${pointsToPayEur.toFixed(2)} €`}
                color="#EF4444"
                bold
              />
            )}
          </div>

          <button
            onClick={() => placeOrder(activeStore)}
            disabled={cartItems.length === 0 || !canOrder}
            data-testid="place-order"
            className="ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {canOrder ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Valider la commande {pointsToPayEur > 0 ? " + CB" : ""}
              </>
            ) : (
              <>
                <X className="h-4 w-4" /> Indisponible (jour non travaillé)
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Order confirmation modal */}
      {orderConfirm && (
        <div
          role="dialog"
          onClick={() => setOrderConfirm(null)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="order-modal"
            className="ms-card max-w-md w-full p-8 text-center"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold text-[#071B34]">Commande confirmée !</h3>
            <p className="text-sm text-[#475569] mt-2">Présentez ce QR code lors du retrait.</p>
            <div className="mt-5 flex flex-col items-center">
              <div className="inline-flex h-40 w-40 items-center justify-center rounded-2xl bg-[#071B34] text-white">
                <QrCode className="h-32 w-32" />
              </div>
              <div className="mt-3 font-mono text-xs text-[#475569]">{orderConfirm.qr_code}</div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-left">
              <Mini label="Date">
                {new Date(orderConfirm.pickup_date).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </Mini>
              <Mini label="Heure">{orderConfirm.pickup_time}</Mini>
              <Mini label="Lieu">{orderConfirm.pickup_point.replace("_", " ")}</Mini>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setOrderConfirm(null);
                  setTab("orders");
                }}
                className="ms-btn-outline flex-1"
              >
                Voir mes commandes
              </button>
              <button onClick={() => setOrderConfirm(null)} className="ms-btn-primary flex-1">
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersList({ orders, onPickup, onCancel }) {
  if (orders.length === 0) {
    return (
      <div className="ms-card p-12 text-center">
        <PackageCheck className="mx-auto h-12 w-12 text-[#3BA4FF]/40" />
        <h3 className="mt-3 text-lg font-bold text-[#071B34]">Aucune commande</h3>
        <p className="mt-1 text-sm text-[#475569]">
          Direction le menu pour passer votre première commande !
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const meta = STATUS_META[o.status];
        const pickupDate = new Date(o.pickup_date);
        const total = o.items.reduce((s, i) => s + i.quantity, 0);
        return (
          <div key={o.id} className="ms-card ms-card-hover p-5" data-testid={`order-${o.id}`}>
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex shrink-0 -space-x-3">
                {o.items.slice(0, 3).map((it, idx) => (
                  <img
                    key={idx}
                    src={it.image}
                    alt={it.name}
                    className="h-14 w-14 rounded-xl object-cover ring-2 ring-white shadow-sm"
                  />
                ))}
                {o.items.length > 3 && (
                  <div className="h-14 w-14 rounded-xl bg-[#071B34] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white shadow-sm">
                    +{o.items.length - 3}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-[#071B34]">
                        Commande #{o.id.slice(0, 8).toUpperCase()}
                      </h4>
                      <span className="ms-chip" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1 truncate">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} ({total} article
                      {total > 1 ? "s" : ""})
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#475569]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {pickupDate.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        à {o.pickup_time}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {o.pickup_point.replace("_", " ")}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#071B34]">
                        {o.points_used} pts
                        {o.surcharge_eur > 0 && ` + ${o.surcharge_eur.toFixed(2)} €`}
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:flex shrink-0 h-14 w-14 items-center justify-center rounded-xl bg-[#071B34] text-white">
                    <QrCode className="h-8 w-8" />
                  </div>
                </div>
                {o.status !== "picked_up" && o.status !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => onPickup(o.id)}
                      data-testid={`pickup-${o.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Marquer récupérée
                    </button>
                    <button
                      onClick={() => onCancel(o.id)}
                      data-testid={`cancel-${o.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5 px-3 py-1.5 text-xs font-semibold text-[#475569] transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                )}
                {o.picked_up_at && (
                  <div className="mt-2 text-[11px] text-[#10B981] font-semibold">
                    ✓ Récupérée le{" "}
                    {new Date(o.picked_up_at).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#475569]">{label}</span>
      <span
        className={`text-sm ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: color || "#071B34" }}
      >
        {value}
      </span>
    </div>
  );
}

function Mini({ label, children }) {
  return (
    <div className="rounded-xl bg-[#F4F7FA] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">{label}</div>
      <div className="text-xs font-bold text-[#071B34] mt-0.5 truncate">{children}</div>
    </div>
  );
}
