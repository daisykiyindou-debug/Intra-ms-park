import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Send, Smile, Paperclip, Phone, Video, Search, Users, Plus, X, ArrowLeft,
  Info, MoreVertical, MessageSquare, SlidersHorizontal, Star, Pencil, Trash2, Archive,
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
        const otherId = isDm ? (c.members_ids || []).find((id) => id !== me?.id) : null;
        const other = otherId ? findEmployee(otherId) : null;
        const displayName = c.name || (other ? `${other.first_name} ${other.last_name}` : "Conversation");
        const subtitle = other?.role || (c.is_group ? `${(c.members_ids || []).length} membres` : "");
        return {
          ...c,
          _display_name: displayName,
          _subtitle: subtitle,
          _avatar: other?.avatar || null,
          _kind: isDm ? "dm" : c.is_group ? "group" : "team",
        };
      })
      .sort((a, b) => (b.last_message_ts || b.created_at || "").localeCompare(a.last_message_ts || a.created_at || ""));
  }, [channels, me?.id, findEmployee]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (tab === "unread") list = list.filter((c) => (c.unread_count || 0) > 0);
    if (tab === "favorites") list = list.filter((c) => favorites.has(c.id));
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((c) => (c._display_name || "").toLowerCase().includes(needle) || (c.last_message_preview || "").toLowerCase().includes(needle));
    }
    return list;
  }, [conversations, tab, favorites, q]);

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
            <button
              className="h-10 w-10 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]"
              title="Filtres"
              aria-label="Filtres"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
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
                className={`w-full text-left px-3 py-3 border-b border-[#071B34]/5 transition-colors flex items-center gap-3 ${
                  active === c.id ? "bg-[#3BA4FF]/8" : "hover:bg-[#F4F7FA]"
                }`}
              >
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
                    <div className={`text-sm font-semibold truncate ${c.unread_count > 0 ? "text-[#071B34]" : "text-[#334155]"}`}>
                      {c._display_name}
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
        <section className={`flex flex-col ${!mobileShowChat ? "hidden lg:flex" : "flex"}`}>
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
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#071B34]/5">
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
                ) : (
                  <div className="h-11 w-11 rounded-full bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#071B34] truncate">{currentDisplay._display_name}</h2>
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
                  <IconBtn title="Appel audio"><Phone className="h-4 w-4" /></IconBtn>
                  <IconBtn title="Appel vidéo"><Video className="h-4 w-4" /></IconBtn>
                  <IconBtn title="Informations"><Info className="h-4 w-4" /></IconBtn>
                  <IconBtn title="Plus"><MoreVertical className="h-4 w-4" /></IconBtn>
                </div>
              </div>

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

function IconBtn({ children, title }) {
  return (
    <button
      title={title}
      className="h-9 w-9 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 inline-flex items-center justify-center text-[#475569]"
    >
      {children}
    </button>
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
