import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Send, Smile, Paperclip, Phone, Video, Search, Users, Plus, X, ArrowLeft,
  Info, MoreVertical, MessageSquare, SlidersHorizontal, Star, Pencil, Trash2, Archive,
  Cake, Check, BellOff, CheckCheck, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === y.toDateString()) return "Hier";
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
  return d.toLocaleDateString("fr-FR");
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Helper — is today the person's birthday? (based on birth_date on the employee)
function isBirthdayToday(emp) {
  if (!emp?.birth_date) return false;
  const bd = new Date(emp.birth_date);
  const now = new Date();
  return bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth();
}

export default function Messagerie() {
  const { me, employees, findEmployee } = useApp();
  const [channels, setChannels] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCh = searchParams.get("ch") || null;
  const [active, setActive] = useState(initialCh);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("all"); // all | unread | favorites
  const [q, setQ] = useState("");
  const [composer, setComposer] = useState(null); // "dm" | "group" | null
  const [empSearch, setEmpSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [favorites, setFavorites] = useState(
    () => new Set(JSON.parse(localStorage.getItem("msgFavs") || "[]"))
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [filterKind, setFilterKind] = useState("all"); // all | dm | group | unread | archived
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const toggleFav = (cid) => {
    const next = new Set(favorites);
    next.has(cid) ? next.delete(cid) : next.add(cid);
    setFavorites(next);
    localStorage.setItem("msgFavs", JSON.stringify(Array.from(next)));
  };

  const loadChannels = () => api.get("/channels").then((r) => setChannels(r.data));

  useEffect(() => { loadChannels(); }, []);

  // Auto-select the first conversation if none selected
  useEffect(() => {
    if (!active && channels.length > 0) {
      const first = channels
        .filter((c) => !c.archived)
        .sort((a, b) => (b.last_message_ts || "").localeCompare(a.last_message_ts || ""))[0];
      if (first) setActive(first.id);
    }
  }, [active, channels]);

  useEffect(() => {
    if (!active) return;
    api.get(`/channels/${active}/messages`).then((r) => {
      setMessages(r.data);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    });
    // Mark as read → this clears the badge + the header notification counter
    api.post(`/channels/${active}/read`).then(() => {
      loadChannels();
      window.dispatchEvent(new CustomEvent("ms-notifications-refresh"));
    }).catch(() => {});
  }, [active]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Rich decorated list of conversations
  const conversations = useMemo(() => {
    return channels
      .filter((c) => !c.archived)
      .map((c) => {
        const isDm = c.is_dm;
        // Resolve the "other" participant. Prefer members_ids when present,
        // fall back to the encoded DM id pattern `dm-<employee_id>`.
        let otherId = null;
        if (isDm) {
          if (Array.isArray(c.members_ids)) {
            otherId = c.members_ids.find((id) => id !== me?.id);
          }
          if (!otherId && typeof c.id === "string" && c.id.startsWith("dm-")) {
            const enc = c.id.slice(3);
            if (enc && enc !== me?.id) otherId = enc;
          }
        }
        const other = otherId ? findEmployee(otherId) : null;
        // For DMs we ALWAYS use the other member's identity (never c.name)
        // so the displayed avatar and displayed name are always coherent.
        const displayName = isDm
          ? (other ? `${other.first_name} ${other.last_name}` : (c.name || "Conversation"))
          : (c.name || "Conversation");
        const subtitle = isDm
          ? (other?.role || "")
          : (c.is_group ? `${(c.members_ids || []).length} membres` : "Conversation d'équipe");
        return {
          ...c,
          _display_name: displayName,
          _subtitle: subtitle,
          _avatar: isDm ? (other?.avatar || null) : null,
          _other: other,
          _kind: isDm ? "dm" : c.is_group ? "group" : "team",
          _is_birthday: isBirthdayToday(other),
        };
      })
      .sort((a, b) => (b.last_message_ts || b.created_at || "").localeCompare(a.last_message_ts || a.created_at || ""));
  }, [channels, me?.id, findEmployee]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (tab === "unread") list = list.filter((c) => (c.unread_count || 0) > 0);
    if (tab === "favorites") list = list.filter((c) => favorites.has(c.id));
    if (filterKind === "dm") list = list.filter((c) => c._kind === "dm");
    if (filterKind === "group") list = list.filter((c) => c._kind === "group" || c._kind === "team");
    if (filterKind === "unread") list = list.filter((c) => (c.unread_count || 0) > 0);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((c) => (c._display_name || "").toLowerCase().includes(needle) || (c.last_message_preview || "").toLowerCase().includes(needle));
    }
    return list;
  }, [conversations, tab, favorites, q, filterKind]);

  const counts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.reduce((s, c) => s + (c.unread_count || 0), 0),
    favorites: conversations.filter((c) => favorites.has(c.id)).length,
  }), [conversations, favorites]);

  const currentChannel = channels.find((c) => c.id === active);
  const currentDisplay = useMemo(() => conversations.find((c) => c.id === active), [conversations, active]);

  const send = async () => {
    if (!draft.trim() || !active) return;
    const { data } = await api.post(`/channels/${active}/messages`, { content: draft.trim() });
    setMessages((m) => [...m, data]);
    setDraft("");
    inputRef.current?.focus();
    loadChannels();
  };

  const archiveActive = async () => {
    if (!active) return;
    if (!window.confirm("Archiver cette conversation ? Elle n'apparaîtra plus dans vos messages.")) return;
    try {
      await api.post(`/channels/${active}/archive`);
      toast.success("Conversation archivée");
      setActive(null);
      setShowActions(false);
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'archiver");
    }
  };

  const deleteActive = async () => {
    if (!active) return;
    if (!window.confirm("Supprimer définitivement cette conversation et son historique ?")) return;
    try {
      await api.delete(`/channels/${active}`);
      toast.success("Conversation supprimée");
      setActive(null);
      setShowActions(false);
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de supprimer");
    }
  };

  const startDm = async (empId) => {
    try {
      const { data } = await api.post("/channels/dm", { employee_id: empId });
      setActive(data.id);
      setSearchParams({ ch: data.id });
      setComposer(null);
      setEmpSearch("");
      setMobileShowChat(true);
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'ouvrir la conversation");
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) {
      toast.error("Nommez le groupe et ajoutez au moins un membre");
      return;
    }
    try {
      const { data } = await api.post("/channels/group", {
        name: groupName.trim(),
        member_ids: groupMembers,
      });
      setActive(data.id);
      setSearchParams({ ch: data.id });
      setComposer(null);
      setGroupName("");
      setGroupMembers([]);
      setMobileShowChat(true);
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de créer le groupe");
    }
  };

  const otherEmployees = useMemo(
    () => (employees || []).filter((e) => e.id !== me?.id && !e.is_super_admin),
    [employees, me?.id]
  );
  const filteredEmployees = useMemo(() => {
    if (!empSearch.trim()) return otherEmployees;
    const n = empSearch.toLowerCase();
    return otherEmployees.filter((e) => `${e.first_name} ${e.last_name} ${e.role || ""}`.toLowerCase().includes(n));
  }, [otherEmployees, empSearch]);

  // Group messages by day for the "Aujourd'hui / date" separator
  const messagesByDay = useMemo(() => {
    const groups = [];
    for (const m of messages) {
      const day = (m.ts || "").slice(0, 10);
      let g = groups[groups.length - 1];
      if (!g || g.day !== day) {
        g = { day, items: [] };
        groups.push(g);
      }
      g.items.push(m);
    }
    return groups;
  }, [messages]);

  return (
    <div className="ms-fade-up">
      <div className="ms-card overflow-hidden grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-[calc(100vh-160px)]">
        {/* ── LEFT column: conversations ── */}
        <aside className={`border-r border-[#071B34]/5 flex flex-col ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
          {/* Search + compose */}
          <div className="p-3 border-b border-[#071B34]/5 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une conversation…"
                data-testid="msg-search"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#F4F7FA] focus:bg-white focus:ring-2 focus:ring-[#3BA4FF]/30 outline-none text-sm"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={`h-10 w-10 rounded-xl inline-flex items-center justify-center transition-colors ${
                  showFilters || filterKind !== "all"
                    ? "bg-[#3BA4FF]/15 text-[#1D70B8]"
                    : "bg-[#F4F7FA] hover:bg-[#071B34]/5 text-[#475569]"
                }`}
                title="Filtres"
                aria-label="Filtres"
                data-testid="msg-filter"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {showFilters && (
                <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl bg-white shadow-lg ring-1 ring-[#071B34]/10 overflow-hidden">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-semibold text-[#475569] border-b border-[#071B34]/5">
                    Filtrer par type
                  </div>
                  {[
                    { k: "all", l: "Toutes les conversations", i: MessageSquare },
                    { k: "dm", l: "Messages privés (1-1)", i: UserIcon },
                    { k: "group", l: "Groupes & équipes", i: Users },
                    { k: "unread", l: "Non lues seulement", i: BellOff },
                  ].map((o) => (
                    <button
                      key={o.k}
                      onClick={() => { setFilterKind(o.k); setShowFilters(false); }}
                      data-testid={`msg-filter-${o.k}`}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#F4F7FA] ${filterKind === o.k ? "bg-[#3BA4FF]/8 text-[#1D70B8] font-semibold" : "text-[#334155]"}`}
                    >
                      <o.i className="h-4 w-4" /> {o.l}
                      {filterKind === o.k && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setComposer("dm")}
              className="h-10 w-10 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white inline-flex items-center justify-center"
              title="Nouveau message"
              data-testid="msg-compose"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-3 pt-2 border-b border-[#071B34]/5 flex items-center gap-4">
            {[
              { k: "all", l: "Toutes", n: counts.all },
              { k: "unread", l: "Non lues", n: counts.unread },
              { k: "favorites", l: "Favoris", n: counts.favorites },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                data-testid={`msg-tab-${t.k}`}
                className={`relative pb-3 text-sm font-semibold transition-colors ${
                  tab === t.k ? "text-[#3BA4FF]" : "text-[#475569] hover:text-[#071B34]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {t.l}
                  {t.n > 0 && (
                    <span className={`inline-flex items-center justify-center h-4 min-w-[16px] rounded-full text-[10px] font-bold px-1 ${tab === t.k ? "bg-[#3BA4FF] text-white" : "bg-[#3BA4FF]/15 text-[#1D70B8]"}`}>
                      {t.n}
                    </span>
                  )}
                </span>
                {tab === t.k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#3BA4FF] rounded-t" />}
              </button>
            ))}
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-[#475569]">
                Aucune conversation.
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActive(c.id); setSearchParams({ ch: c.id }); setMobileShowChat(true); }}
                data-testid={`msg-conv-${c.id}`}
                className={`w-full text-left px-3 py-3 border-b border-[#071B34]/5 transition-all flex items-center gap-3 relative ${
                  active === c.id
                    ? "bg-gradient-to-r from-[#3BA4FF]/15 to-[#3BA4FF]/5"
                    : "hover:bg-[#F4F7FA]"
                }`}
              >
                {active === c.id && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#3BA4FF]" />
                )}
                {c._avatar ? (
                  <img src={c._avatar} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
                ) : c._kind === "group" || c._kind === "team" ? (
                  <div className="h-11 w-11 rounded-full bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="h-11 w-11 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold shrink-0">
                    {initials(c._display_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`text-sm font-semibold truncate inline-flex items-center gap-1.5 ${c.unread_count > 0 ? "text-[#071B34]" : active === c.id ? "text-[#0B2545]" : "text-[#334155]"}`}>
                      {c._display_name}
                      {c._is_birthday && (
                        <span
                          title={`Anniversaire de ${c._display_name} aujourd'hui !`}
                          className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-gradient-to-br from-[#F0ABFC] to-[#A78BFA] text-white"
                        >
                          <Cake className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] shrink-0">
                      {formatTimestamp(c.last_message_ts || c.created_at)}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <div className={`text-xs truncate ${c.unread_count > 0 ? "text-[#071B34] font-semibold" : "text-[#94A3B8]"}`}>
                      {c.last_message_preview || (c._subtitle || "Nouveau contact")}
                    </div>
                    {c.unread_count > 0 && (
                      <span
                        data-testid={`msg-unread-${c.id}`}
                        className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[#3BA4FF] text-white text-[10px] font-bold px-1.5 shrink-0"
                      >
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── RIGHT column: chat ── */}
        <section className={`flex flex-col relative ${!mobileShowChat ? "hidden lg:flex" : "flex"}`}>
          {!currentDisplay ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="h-16 w-16 rounded-2xl bg-[#3BA4FF]/10 text-[#3BA4FF] flex items-center justify-center">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#071B34]">Sélectionnez une conversation</h3>
              <p className="mt-1 text-sm text-[#475569]">Ou démarrez-en une nouvelle avec vos collègues.</p>
              <button
                onClick={() => setComposer("dm")}
                className="mt-4 ms-btn-primary"
              >
                <Pencil className="h-4 w-4" /> Nouveau message
              </button>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#071B34]/5 relative">
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="lg:hidden h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {currentDisplay._avatar ? (
                  <div className="relative">
                    <img src={currentDisplay._avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#10B981] ring-2 ring-white" />
                  </div>
                ) : currentDisplay._kind === "dm" ? (
                  <div className="h-11 w-11 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold">
                    {initials(currentDisplay._display_name)}
                  </div>
                ) : (
                  <div className="h-11 w-11 rounded-full bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#071B34] truncate inline-flex items-center gap-1.5">
                      {currentDisplay._display_name}
                      {currentDisplay._is_birthday && (
                        <span
                          title={`Anniversaire de ${currentDisplay._display_name} aujourd'hui !`}
                          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gradient-to-br from-[#F0ABFC] to-[#A78BFA] text-white shadow-sm animate-pulse"
                          data-testid={`msg-header-cake-${currentDisplay.id}`}
                        >
                          <Cake className="h-3 w-3" />
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={() => toggleFav(currentDisplay.id)}
                      className="shrink-0"
                      aria-label="Favori"
                      data-testid={`msg-fav-${currentDisplay.id}`}
                    >
                      <Star className={`h-4 w-4 ${favorites.has(currentDisplay.id) ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#94A3B8]"}`} />
                    </button>
                  </div>
                  <div className="text-xs text-[#475569] truncate">{currentDisplay._subtitle}</div>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn title="Appel audio" onClick={() => toast.info("Appel audio bientôt disponible")}><Phone className="h-4 w-4" /></IconBtn>
                  <IconBtn title="Appel vidéo" onClick={() => toast.info("Appel vidéo bientôt disponible")}><Video className="h-4 w-4" /></IconBtn>
                  <IconBtn title="Informations" onClick={() => setShowInfo((s) => !s)} testid="msg-info-btn"><Info className="h-4 w-4" /></IconBtn>
                  <div className="relative">
                    <IconBtn title="Plus" onClick={() => setShowActions((s) => !s)} testid="msg-more-btn"><MoreVertical className="h-4 w-4" /></IconBtn>
                    {showActions && (
                      <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl bg-white shadow-lg ring-1 ring-[#071B34]/10 overflow-hidden">
                        <button
                          onClick={() => { toggleFav(currentDisplay.id); setShowActions(false); }}
                          className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#F4F7FA] text-[#334155]"
                        >
                          <Star className="h-4 w-4" />
                          {favorites.has(currentDisplay.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                        </button>
                        <button
                          onClick={archiveActive}
                          data-testid="msg-archive"
                          className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#F4F7FA] text-[#334155]"
                        >
                          <Archive className="h-4 w-4" /> Archiver la conversation
                        </button>
                        <button
                          onClick={deleteActive}
                          data-testid="msg-delete"
                          className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#FEE2E2] text-[#B91C1C]"
                        >
                          <Trash2 className="h-4 w-4" /> Supprimer la conversation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Info side panel */}
              {showInfo && (
                <div className="absolute right-0 top-[57px] z-20 w-80 max-w-full bg-white shadow-2xl border-l border-[#071B34]/10 h-[calc(100%-57px)] overflow-y-auto" data-testid="msg-info-panel">
                  <div className="px-4 py-3 border-b border-[#071B34]/5 flex items-center justify-between">
                    <div className="text-sm font-bold text-[#071B34]">Informations</div>
                    <button onClick={() => setShowInfo(false)} className="h-8 w-8 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4 flex flex-col items-center text-center border-b border-[#071B34]/5">
                    {currentDisplay._avatar ? (
                      <img src={currentDisplay._avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold text-2xl">
                        {initials(currentDisplay._display_name)}
                      </div>
                    )}
                    <h3 className="mt-3 text-lg font-bold text-[#071B34] inline-flex items-center gap-1.5">
                      {currentDisplay._display_name}
                      {currentDisplay._is_birthday && <Cake className="h-4 w-4 text-[#A78BFA]" />}
                    </h3>
                    <div className="text-xs text-[#475569]">{currentDisplay._subtitle}</div>
                  </div>
                  <dl className="divide-y divide-[#071B34]/5 px-4">
                    {currentDisplay._other?.email && (
                      <InfoRow label="Email" value={currentDisplay._other.email} />
                    )}
                    {currentDisplay._other?.phone && (
                      <InfoRow label="Téléphone" value={currentDisplay._other.phone} />
                    )}
                    {currentDisplay._other?.department && (
                      <InfoRow label="Service" value={currentDisplay._other.department} />
                    )}
                    {currentDisplay._other?.role && (
                      <InfoRow label="Poste" value={currentDisplay._other.role} />
                    )}
                    {currentDisplay._kind !== "dm" && (
                      <InfoRow label="Membres" value={(currentDisplay.members_ids || []).length} />
                    )}
                    <InfoRow label="Type" value={currentDisplay._kind === "dm" ? "Message privé" : currentDisplay._kind === "group" ? "Groupe" : "Équipe"} />
                    <InfoRow label="Créée le" value={currentDisplay.created_at ? new Date(currentDisplay.created_at).toLocaleDateString("fr-FR") : "—"} />
                  </dl>
                  <div className="p-4 space-y-2">
                    <button
                      onClick={() => toggleFav(currentDisplay.id)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 py-2 text-sm font-semibold text-[#334155]"
                    >
                      <Star className={`h-4 w-4 ${favorites.has(currentDisplay.id) ? "fill-[#F59E0B] text-[#F59E0B]" : ""}`} />
                      {favorites.has(currentDisplay.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                    </button>
                    <button
                      onClick={archiveActive}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 py-2 text-sm font-semibold text-[#334155]"
                    >
                      <Archive className="h-4 w-4" /> Archiver
                    </button>
                    <button
                      onClick={deleteActive}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl text-[#B91C1C] hover:bg-[#FEE2E2] py-2 text-sm font-semibold"
                    >
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-white">
                {messagesByDay.length === 0 && (
                  <div className="text-center text-sm text-[#94A3B8] py-6">
                    Aucun message. Envoyez le premier !
                  </div>
                )}
                {messagesByDay.map((g) => (
                  <div key={g.day}>
                    <div className="flex items-center justify-center my-2">
                      <span className="text-[11px] uppercase tracking-widest text-[#94A3B8] font-semibold bg-white px-3">
                        {dayLabel(g.day)}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {g.items.map((m) => {
                        const mine = m.author_id === me?.id;
                        const author = findEmployee(m.author_id);
                        return (
                          <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                            {!mine && (
                              author?.avatar
                                ? <img src={author.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                                : <div className="h-7 w-7 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {initials(author?.first_name)}
                                  </div>
                            )}
                            <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                              mine
                                ? "bg-[#DBEAFE] text-[#0B2545] rounded-br-sm"
                                : "bg-[#F1F5F9] text-[#0B2545] rounded-bl-sm"
                            }`}>
                              <div className="whitespace-pre-wrap break-words">{m.content}</div>
                              <div className={`mt-1 text-[10px] ${mine ? "text-[#1D4ED8]/70" : "text-[#94A3B8]"} text-right`}>
                                {new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                {mine && <span className="ml-1">✓✓</span>}
                              </div>
                            </div>
                            {mine && (
                              me?.avatar
                                ? <img src={me.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                                : <div className="h-7 w-7 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {initials(me?.first_name)}
                                  </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer */}
              <div className="border-t border-[#071B34]/5 p-3 flex items-center gap-2 bg-white">
                <button className="h-10 w-10 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]" aria-label="Joindre">
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Écrire un message…"
                    data-testid="msg-input"
                    className="w-full h-11 pl-4 pr-11 rounded-xl bg-[#F4F7FA] focus:bg-white focus:ring-2 focus:ring-[#3BA4FF]/30 outline-none text-sm"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]"
                    aria-label="Emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={send}
                  disabled={!draft.trim()}
                  data-testid="msg-send"
                  className="h-11 w-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-40 disabled:cursor-not-allowed text-white inline-flex items-center justify-center transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Compose modal (DM + group tabs) */}
      {composer && (
        <div onClick={() => setComposer(null)} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
              <h3 className="text-base font-bold text-[#071B34]">Nouveau message</h3>
              <button onClick={() => setComposer(null)} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 px-5 pt-3">
              {[
                { k: "dm", l: "Contact" },
                { k: "group", l: "Groupe" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setComposer(t.k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    composer === t.k ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#475569]"
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              {composer === "group" && (
                <div>
                  <label className="ms-overline">Nom du groupe</label>
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ex : Équipe accueil"
                    className="ms-input mt-1"
                  />
                </div>
              )}
              <div>
                <label className="ms-overline">
                  {composer === "group" ? "Membres" : "Contact"}
                </label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                  <input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Rechercher un collègue…"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#F4F7FA] outline-none text-sm"
                  />
                </div>
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1">
                  {filteredEmployees.map((e) => {
                    const isSelected = groupMembers.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        onClick={() => {
                          if (composer === "dm") startDm(e.id);
                          else setGroupMembers((m) => isSelected ? m.filter((x) => x !== e.id) : [...m, e.id]);
                        }}
                        className={`w-full flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#F4F7FA] ${isSelected ? "bg-[#3BA4FF]/8" : ""}`}
                      >
                        {e.avatar
                          ? <img src={e.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                          : <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center">{initials(e.first_name)}</div>}
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-semibold text-[#071B34] truncate">{e.first_name} {e.last_name}</div>
                          <div className="text-xs text-[#475569] truncate">{e.role || "—"}</div>
                        </div>
                        {composer === "group" && isSelected && <span className="text-xs font-bold text-[#3BA4FF]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {composer === "group" && (
                <button onClick={createGroup} className="w-full ms-btn-primary">
                  <Plus className="h-4 w-4" /> Créer le groupe
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, testid }) {
  return (
    <button
      title={title}
      onClick={onClick}
      data-testid={testid}
      className="h-9 w-9 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]"
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-[#475569] text-xs uppercase tracking-widest font-semibold">{label}</dt>
      <dd className="text-[#071B34] font-semibold text-right truncate max-w-[60%]">{value}</dd>
    </div>
  );
}

function dayLabel(day) {
  if (!day) return "";
  const d = new Date(day + "T00:00:00");
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
