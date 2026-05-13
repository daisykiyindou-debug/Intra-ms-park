import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Plus, Minus, X, QrCode, Clock, MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const STORES = [
  { id: "soccer_bar", name: "Soccer Bar", emoji: "🍔", color: "#F59E0B" },
  { id: "donut_house", name: "Donut House", emoji: "🍩", color: "#EC4899" },
  { id: "stand_crepes", name: "Stand Crêpes", emoji: "🥞", color: "#A78BFA" },
  { id: "stand_bonbons", name: "Stand Bonbons", emoji: "🍬", color: "#3BA4FF" },
];

const PICKUP_TIMES = ["12:30", "13:00", "13:30", "18:30", "19:00", "19:30"];

export default function Restaurant() {
  const [activeStore, setActiveStore] = useState("soccer_bar");
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [cart, setCart] = useState({}); // { product_id: { product, qty } }
  const [pickupTime, setPickupTime] = useState(PICKUP_TIMES[0]);
  const [balance, setBalance] = useState(null);
  const [order, setOrder] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    api.get(`/menu?store=${activeStore}`).then((r) => {
      setProducts(r.data);
      setActiveCategory("Tous");
    });
  }, [activeStore]);

  useEffect(() => {
    api.get("/meal-points/today").then((r) => setBalance(r.data));
  }, []);

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
  const pointsUsed = Math.min(remaining, totalPoints);
  const pointsToPayEur = totalPoints > 0 ? (totalEur * (totalPoints - pointsUsed)) / totalPoints : 0;

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
    if (cartItems.length === 0) return;
    try {
      const { data } = await api.post("/orders", {
        items: cartItems.map((ci) => ({ product_id: ci.product.id, quantity: ci.qty })),
        pickup_point: pickupPoint,
        pickup_time: pickupTime,
      });
      setOrder(data);
      setCart({});
      setDrawerOpen(false);
      const fresh = await api.get("/meal-points/today");
      setBalance(fresh.data);
      toast.success("Commande validée !", { description: `QR ${data.qr_code}` });
    } catch (e) {
      toast.error("Échec de la commande");
    }
  };

  const activeStoreMeta = STORES.find((s) => s.id === activeStore);

  return (
    <div className="space-y-6 ms-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ms-overline">Menu digital restauration</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Commandez avec vos points repas
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

      {/* Balance banner */}
      {balance && (
        <div className="ms-card p-4 flex flex-wrap items-center gap-4 bg-gradient-to-r from-[#3BA4FF]/8 to-transparent">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3BA4FF]/15 text-[#3BA4FF]">
            🍴
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#475569]">Solde points repas du jour</div>
            <div className="text-2xl font-bold text-[#071B34]">
              {balance.remaining}{" "}
              <span className="text-sm text-[#475569] font-medium">/ {balance.credited_points || balance.daily_quota} pts</span>
            </div>
          </div>
          <div className="text-xs text-[#475569]">Expire à 23h59</div>
        </div>
      )}

      {/* Stores tabs */}
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

      {/* Category sub-tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            data-testid={`cat-${c}`}
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

      {/* Products grid */}
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
              {p.allergens?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.allergens.map((a) => (
                    <span
                      key={a}
                      className="text-[10px] uppercase tracking-wider rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[#475569]"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                {cart[p.id] ? (
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => updateQty(p, -1)}
                      data-testid={`dec-${p.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F7FA] hover:bg-[#071B34]/5"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-bold w-5 text-center">{cart[p.id].qty}</span>
                    <button
                      onClick={() => updateQty(p, +1)}
                      data-testid={`inc-${p.id}`}
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
                <span
                  className="ms-chip"
                  style={{ background: `${activeStoreMeta.color}1A`, color: activeStoreMeta.color }}
                >
                  {p.category}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cart drawer */}
      {drawerOpen && (
        <button
          onClick={() => setDrawerOpen(false)}
          data-testid="cart-overlay"
          aria-label="Fermer le panier"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        />
      )}
      <aside
        data-testid="cart-drawer"
        className={`fixed right-0 top-0 z-50 h-screen w-full max-w-md transform bg-white shadow-2xl transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6 border-b border-[#071B34]/5">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#3BA4FF]" />
            <h2 className="text-lg font-bold text-[#071B34]">Mon panier</h2>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            data-testid="close-cart"
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-5rem-13rem)] p-4 space-y-2">
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
        {/* Summary */}
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-[#071B34]/5 bg-white space-y-3">
          <div>
            <div className="text-xs font-semibold text-[#475569] mb-2">Heure de retrait</div>
            <div className="flex flex-wrap gap-1.5">
              {PICKUP_TIMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setPickupTime(t)}
                  data-testid={`time-${t}`}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    pickupTime === t
                      ? "bg-[#3BA4FF] text-white"
                      : "bg-[#F4F7FA] text-[#475569] hover:bg-[#071B34]/5"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-[#F4F7FA] p-3 space-y-1 text-sm">
            <Row label="Total points" value={`${totalPoints} pts`} />
            <Row label="Points utilisés" value={`${pointsUsed} pts`} color="#10B981" />
            {pointsToPayEur > 0 && (
              <Row label="Reste à payer" value={`${pointsToPayEur.toFixed(2)} €`} color="#EF4444" bold />
            )}
          </div>
          <button
            onClick={() => placeOrder(activeStore)}
            disabled={cartItems.length === 0}
            data-testid="place-order"
            className="ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Valider la commande {pointsToPayEur > 0 ? "(+ CB)" : "(100% points)"}
          </button>
        </div>
      </aside>

      {/* Order confirmation modal */}
      {order && (
        <button
          onClick={() => setOrder(null)}
          aria-label="Fermer"
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
            <p className="text-sm text-[#475569] mt-2">
              Présentez ce QR code lors du retrait.
            </p>
            <div className="mt-5 flex flex-col items-center">
              <div className="inline-flex h-40 w-40 items-center justify-center rounded-2xl bg-[#071B34] text-white">
                <QrCode className="h-32 w-32" />
              </div>
              <div className="mt-3 font-mono text-xs text-[#475569]">{order.qr_code}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-[#F4F7FA] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
                  <Clock className="inline h-3 w-3" /> Heure
                </div>
                <div className="text-sm font-bold text-[#071B34]">{order.pickup_time}</div>
              </div>
              <div className="rounded-xl bg-[#F4F7FA] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#475569] font-semibold">
                  <MapPin className="inline h-3 w-3" /> Lieu
                </div>
                <div className="text-sm font-bold text-[#071B34]">{order.pickup_point.replace("_", " ")}</div>
              </div>
            </div>
            <button onClick={() => setOrder(null)} className="ms-btn-primary w-full mt-5">
              Compris
            </button>
          </div>
        </button>
      )}
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
