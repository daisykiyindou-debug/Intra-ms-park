import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, X, QrCode, Clock, MapPin, CheckCircle2,
  ListOrdered, PackageCheck, Sparkles, AlertTriangle, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const STORES = [
  { id: "soccer_bar", name: "Soccer Bar", emoji: "🍔" },
  { id: "donut_house", name: "Donut House", emoji: "🍩" },
  { id: "stand_crepes", name: "Stand Crêpes", emoji: "🥞" },
  { id: "stand_bonbons", name: "Stand Bonbons", emoji: "🍬" },
];

const STORE_LABEL = {
  soccer_bar: "Soccer Bar",
  donut_house: "Donut House",
  stand_crepes: "Stand Crêpes",
  stand_bonbons: "Stand Bonbons",
};

const STATUS_META = {
  preparing: { label: "En préparation", color: "#F59E0B", bg: "#FEF3C7", step: 1 },
  ready: { label: "Prête à retirer", color: "#3BA4FF", bg: "#E0F2FE", step: 2 },
  picked_up: { label: "Récupérée", color: "#10B981", bg: "#D1FAE5", step: 3 },
  cancelled: { label: "Annulée", color: "#64748B", bg: "#F1F5F9", step: 0 },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function Restaurant() {
  const [tab, setTab] = useState("menu");
  const [activeStore, setActiveStore] = useState("soccer_bar");
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [cart, setCart] = useState({}); // { product_id: { product, qty } }
  const [pickupDate, setPickupDate] = useState(todayIso());
  // default pickup time: +1h30 from now
  const [pickupTime, setPickupTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 90);
    return d.toTimeString().slice(0, 5);
  });
  const [balance, setBalance] = useState(null);
  const [orderConfirm, setOrderConfirm] = useState(null);
  const [orders, setOrders] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayInfo, setDayInfo] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

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
    const t = setInterval(refreshOrders, 15000);
    return () => clearInterval(t);
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
  const cartStore = cartItems[0]?.product.store; // first item's store = cart store
  const totalPoints = cartItems.reduce((s, ci) => s + ci.product.points * ci.qty, 0);
  const totalEur = cartItems.reduce((s, ci) => s + ci.product.price_eur * ci.qty, 0);
  const remaining = balance?.remaining || 0;
  const isToday = pickupDate === todayIso();
  const isWorkingDay = dayInfo?.is_working_day;
  const canOrder = isWorkingDay;
  const pointsUsable = isToday ? remaining : 0;
  const pointsUsed = Math.min(pointsUsable, totalPoints);
  const pointsToPayEur =
    totalPoints > 0 ? (totalEur * (totalPoints - pointsUsed)) / totalPoints : 0;

  // Validate pickup time (must be future AND +60min from now if today)
  const minPickupTime = useMemo(() => {
    if (!isToday) return "00:00";
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return d.toTimeString().slice(0, 5);
  }, [isToday]);
  const timeTooSoon = isToday && pickupTime < minPickupTime;

  const updateQty = (product, delta) => {
    setCart((prev) => {
      // Enforce single-store cart
      if (delta > 0 && cartItems.length > 0 && cartStore && product.store !== cartStore) {
        toast.error("Un seul point de retrait à la fois", {
          description: `Videz votre panier pour commander chez ${STORE_LABEL[product.store]}.`,
        });
        return prev;
      }
      const cur = prev[product.id]?.qty || 0;
      const next = cur + delta;
      if (next <= 0) {
        const { [product.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [product.id]: { product, qty: next } };
    });
  };

  const placeOrder = async () => {
    if (!canOrder) {
      toast.error("Commande indisponible", {
        description: "Vous ne pouvez commander que sur vos jours de travail planifiés.",
      });
      return;
    }
    if (cartItems.length === 0) return;
    if (timeTooSoon) {
      toast.error("Heure de retrait trop tôt", {
        description: `Prévoyez au moins 1 h pour la préparation (≥ ${minPickupTime}).`,
      });
      return;
    }
    try {
      const { data } = await api.post("/orders", {
        items: cartItems.map((ci) => ({ product_id: ci.product.id, quantity: ci.qty })),
        pickup_point: cartStore,
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
    toast.success("Commande récupérée ✅", {
      description: "Profitez bien de votre repas !",
    });
    await refreshOrders();
    setSelectedOrder((s) => (s ? { ...s, status: "picked_up", picked_up_at: new Date().toISOString() } : null));
  };

  const cancelOrder = async (oid) => {
    await api.post(`/orders/${oid}/cancel`);
    toast.success("Commande annulée, points remboursés");
    refreshOrders();
    refreshBalance();
    setSelectedOrder(null);
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

      <div className="inline-flex rounded-xl bg-white border border-[#071B34]/8 p-1">
        <button
          onClick={() => setTab("menu")}
          data-testid="tab-menu"
          className={`px-4 py-2 text-sm font-semibold rounded-lg ${
            tab === "menu" ? "bg-[#071B34] text-white shadow-md" : "text-[#475569]"
          }`}
        >
          <Sparkles className="inline h-3.5 w-3.5 mr-1.5" /> Menu
        </button>
        <button
          onClick={() => setTab("orders")}
          data-testid="tab-orders"
          className={`px-4 py-2 text-sm font-semibold rounded-lg ${
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

      {balance && tab === "menu" && (
        <div className="ms-card p-5 flex flex-wrap items-center gap-4 bg-gradient-to-r from-[#3BA4FF]/8 to-transparent border border-[#3BA4FF]/15">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-3xl">🍴</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#475569] uppercase tracking-wider font-semibold">Solde aujourd'hui</div>
            <div className="text-2xl md:text-3xl font-extrabold text-[#071B34] leading-tight">
              Il vous reste <span className="text-[#3BA4FF]">{balance.remaining} points</span>{" "}
              <span className="text-base text-[#475569] font-medium">
                / {balance.credited_points || balance.daily_quota} pts
              </span>
            </div>
            <div className="text-xs text-[#475569] mt-0.5">Expire à 23h59 · non cumulables</div>
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
              <div key={p.id} className="ms-card ms-card-hover overflow-hidden group" data-testid={`product-${p.id}`}>
                <div className="relative aspect-[5/4] overflow-hidden bg-[#F4F7FA]">
                  <img src={p.image} alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
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
                    <span className="text-xs text-[#475569] whitespace-nowrap">{p.price_eur.toFixed(2)} €</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {cart[p.id] ? (
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => updateQty(p, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-sm font-bold w-5 text-center">{cart[p.id].qty}</span>
                        <button onClick={() => updateQty(p, +1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3BA4FF] text-white hover:bg-[#2A8DE0]">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => updateQty(p, +1)} data-testid={`add-${p.id}`} className="ms-btn-primary !px-4 !py-2 text-xs">
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
        <OrdersList orders={orders} onClick={(o) => setSelectedOrder(o)} />
      )}

      {/* Cart drawer */}
      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cartItems={cartItems}
        cartStore={cartStore}
        balance={balance}
        pointsUsable={pointsUsable}
        pointsUsed={pointsUsed}
        pointsToPayEur={pointsToPayEur}
        totalPoints={totalPoints}
        totalEur={totalEur}
        pickupDate={pickupDate}
        setPickupDate={setPickupDate}
        pickupTime={pickupTime}
        setPickupTime={setPickupTime}
        minPickupTime={minPickupTime}
        timeTooSoon={timeTooSoon}
        canOrder={canOrder}
        dayInfo={dayInfo}
        isToday={isToday}
        updateQty={updateQty}
        placeOrder={placeOrder}
      />

      {/* Order confirmation modal */}
      {orderConfirm && (
        <OrderQRModal
          order={orderConfirm}
          onClose={() => setOrderConfirm(null)}
          onSeeOrders={() => {
            setOrderConfirm(null);
            setTab("orders");
          }}
        />
      )}

      {/* Existing order detail modal */}
      {selectedOrder && (
        <OrderQRModal
          order={selectedOrder}
          isDetail
          onClose={() => setSelectedOrder(null)}
          onPickup={() => markPickedUp(selectedOrder.id)}
          onCancel={() => cancelOrder(selectedOrder.id)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────── Cart Drawer

function CartDrawer({
  open, onClose, cartItems, cartStore, balance, pointsUsable, pointsUsed, pointsToPayEur,
  totalPoints, totalEur, pickupDate, setPickupDate, pickupTime, setPickupTime,
  minPickupTime, timeTooSoon, canOrder, dayInfo, isToday, updateQty, placeOrder,
}) {
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        />
      )}
      <aside
        data-testid="cart-drawer"
        style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
        className="fixed right-0 top-0 z-50 h-screen w-full sm:w-[420px] bg-white shadow-2xl transition-transform duration-300 ease-out flex flex-col"
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-[#071B34]/5 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#3BA4FF]" />
            <h2 className="text-base font-bold text-[#071B34]">Mon panier</h2>
            {cartStore && (
              <span className="ms-chip bg-[#3BA4FF]/12 text-[#1D70B8] !uppercase-none">
                <MapPin className="h-3 w-3" /> {STORE_LABEL[cartStore]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {balance && (
          <div
            className={`px-5 py-2.5 text-sm ${
              pointsUsable > 0
                ? "bg-[#10B981]/10 border-b border-[#10B981]/20 text-[#065F46]"
                : "bg-[#FEE2E2] border-b border-[#EF4444]/20 text-[#B91C1C]"
            }`}
          >
            {pointsUsable > 0 ? (
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Points disponibles aujourd'hui : {pointsUsable} pts
              </div>
            ) : (
              <div className="flex items-start gap-2 font-semibold leading-tight">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {isToday
                  ? "Vous n'avez plus de points disponibles aujourd'hui. Le paiement sera intégralement en CB et en euros."
                  : "Les points ne sont valables que le jour même. Pour cette date, paiement uniquement en CB."}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
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
                  <button onClick={() => updateQty(product, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-bold w-5 text-center">{qty}</span>
                  <button onClick={() => updateQty(product, +1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3BA4FF] text-white">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="text-right text-sm font-bold text-[#071B34]">{product.points * qty} pts</div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#071B34]/5 p-4 space-y-3 bg-white shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569] mb-1">Date de retrait</div>
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
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569] mb-1">Heure de retrait</div>
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                data-testid="pickup-time"
                min={isToday ? minPickupTime : "00:00"}
                className="ms-input text-sm py-2"
              />
            </div>
          </div>

          <div className="rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/20 p-2.5 flex items-start gap-2 text-xs text-[#B45309]">
            <Timer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Anticipez !</strong> Prévoyez au moins 1 h pour que la cuisine prépare votre
              commande. Évitez les heures de service ({STORE_LABEL[cartStore] || "le restaurant"}{" "}
              est très fréquenté entre 12h et 14h).
            </span>
          </div>

          {dayInfo && !dayInfo.is_working_day && (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444]/20 p-3 text-xs text-[#B91C1C]">
              <strong>Jour OFF / hors planning</strong>
              <br />
              Aucune commande possible — ni avec points, ni en CB.
            </div>
          )}

          {timeTooSoon && (
            <div className="rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/30 p-2.5 text-xs text-[#B45309] flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Heure trop tôt — minimum <strong>{minPickupTime}</strong> pour laisser le temps à la cuisine.
            </div>
          )}

          <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-1 text-sm">
            <Row label="Total commande" value={`${totalPoints} pts (${totalEur.toFixed(2)} €)`} />
            <Row
              label={isToday ? "Points utilisés" : "Points utilisés (J uniquement)"}
              value={`${pointsUsed} pts`}
              color="#10B981"
            />
            {pointsToPayEur > 0 && (
              <Row label="Reste à payer (CB)" value={`${pointsToPayEur.toFixed(2)} €`} color="#EF4444" bold />
            )}
          </div>

          <button
            onClick={placeOrder}
            disabled={cartItems.length === 0 || !canOrder || timeTooSoon}
            data-testid="place-order"
            className="ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            {!canOrder ? "Indisponible (jour OFF)" : timeTooSoon ? "Heure trop tôt" : "Valider la commande"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ───────────────────────────────────────── QR / detail modal

function OrderQRModal({ order, onClose, onPickup, onCancel, onSeeOrders, isDetail }) {
  const meta = STATUS_META[order.status];
  const pickupDate = new Date(order.pickup_date);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="order-modal"
        className="ms-card max-w-md w-full p-7 text-center max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="ms-chip" style={{ background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status pipeline */}
        <div className="mt-2 mb-4 grid grid-cols-3 gap-1.5">
          {[
            { k: 1, l: "En préparation", icon: Timer },
            { k: 2, l: "Prête", icon: PackageCheck },
            { k: 3, l: "Récupérée", icon: CheckCircle2 },
          ].map((s, i) => {
            const active = meta.step >= s.k;
            return (
              <div key={s.k} className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#475569]"
                  }`}
                >
                  <s.icon className="h-4 w-4" />
                </div>
                <span className={`text-[10px] font-semibold ${active ? "text-[#071B34]" : "text-[#475569]"}`}>
                  {s.l}
                </span>
              </div>
            );
          })}
        </div>

        {order.status === "picked_up" ? (
          <div className="rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20 p-5 text-left">
            <div className="flex items-center gap-2 font-bold text-[#065F46]">
              <CheckCircle2 className="h-5 w-5" /> Commande récupérée !
            </div>
            <p className="text-sm text-[#065F46]/80 mt-1">
              Récupérée le{" "}
              {new Date(order.picked_up_at).toLocaleString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Bon appétit !
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold text-[#071B34]">
              {isDetail ? "Détail de la commande" : "Commande confirmée !"}
            </h3>
            <p className="text-sm text-[#475569] mt-1">Présentez ce QR code lors du retrait.</p>
            <div className="mt-5 flex flex-col items-center">
              <div className="inline-flex h-40 w-40 items-center justify-center rounded-2xl bg-[#071B34] text-white">
                <QrCode className="h-32 w-32" />
              </div>
              <div className="mt-3 font-mono text-xs text-[#475569]">{order.qr_code}</div>
            </div>
          </>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2 text-left">
          <Mini label="Date">
            {pickupDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </Mini>
          <Mini label="Heure">{order.pickup_time}</Mini>
          <Mini label="Lieu">{STORE_LABEL[order.pickup_point] || order.pickup_point}</Mini>
        </div>

        <div className="mt-4 rounded-xl bg-[#F4F7FA] p-3 text-left space-y-1">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-[#071B34] truncate">
                {it.quantity}× {it.name}
              </span>
              <span className="font-semibold text-[#475569]">{it.subtotal_points} pts</span>
            </div>
          ))}
          <div className="pt-2 mt-1 border-t border-[#071B34]/5 flex justify-between text-sm font-bold text-[#071B34]">
            <span>Total</span>
            <span>
              {order.points_used} pts{order.surcharge_eur > 0 && ` + ${order.surcharge_eur.toFixed(2)} €`}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          {isDetail && order.status !== "picked_up" && order.status !== "cancelled" && (
            <>
              <button onClick={onPickup} data-testid="pickup-action" className="ms-btn-primary flex-1 !bg-[#10B981] hover:!bg-[#059669] shadow-[0_4px_14px_rgba(16,185,129,0.35)]">
                <CheckCircle2 className="h-4 w-4" /> Récupérée (fictif)
              </button>
              <button onClick={onCancel} data-testid="cancel-action" className="ms-btn-outline">
                Annuler
              </button>
            </>
          )}
          {!isDetail && (
            <>
              <button onClick={onSeeOrders} className="ms-btn-outline flex-1">
                Voir mes commandes
              </button>
              <button onClick={onClose} className="ms-btn-primary flex-1">
                Compris
              </button>
            </>
          )}
          {isDetail && (order.status === "picked_up" || order.status === "cancelled") && (
            <button onClick={onClose} className="ms-btn-primary w-full">
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Orders list

function OrdersList({ orders, onClick }) {
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
        return (
          <button
            key={o.id}
            onClick={() => onClick(o)}
            data-testid={`order-${o.id}`}
            className="ms-card ms-card-hover p-5 w-full text-left"
          >
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
                        #{o.id.slice(0, 8).toUpperCase()}
                      </h4>
                      <span className="ms-chip" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1 truncate">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
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
                        {STORE_LABEL[o.pickup_point] || o.pickup_point}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#071B34]">
                        {o.points_used} pts
                        {o.surcharge_eur > 0 && ` + ${o.surcharge_eur.toFixed(2)} €`}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center">
                    <div className="h-14 w-14 rounded-xl bg-[#071B34] text-white flex items-center justify-center">
                      <QrCode className="h-8 w-8" />
                    </div>
                    <span className="mt-1 text-[10px] font-semibold text-[#3BA4FF]">Voir QR</span>
                  </div>
                </div>
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
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#475569]">{label}</span>
      <span className={`text-sm ${bold ? "font-bold" : "font-semibold"}`} style={{ color: color || "#071B34" }}>
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
