import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Send, Smile, Paperclip, Phone, Video, Search, Users, Plus, X, ArrowLeft,
  Info, MoreVertical, MessageSquare, SlidersHorizontal, Star, Pencil, Trash2, Archive,
  Cake, Check, BellOff, CheckCheck, User as UserIcon, FileText, Image as ImageIcon,
  UserPlus, UserMinus, Camera, Receipt, ThumbsUp,
  Briefcase, Megaphone, UserCog, Landmark, Shield, ChevronRight, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { absoluteUrl } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

// A small handpicked set of 20 emojis for the chat picker
const QUICK_EMOJIS = [
  "😀", "😂", "🥰", "😎", "🤩", "😍", "😉", "🤔", "😮", "😴",
  "👍", "🙏", "👏", "🎉", "🔥", "💯", "❤️", "🚀", "✨", "🍕",
];

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

// Human-friendly "last seen" text based on an ISO timestamp.
// - < 2 min → "En ligne"
// - < 60 min → "il y a X min"
// - same day → "aujourd'hui à HHhMM"
// - other day → "le JJ/MM/YYYY à HHhMM"
function formatLastSeen(iso) {
  if (!iso) return "Hors ligne";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Hors ligne";
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 2) return "En ligne";
  if (diffMin < 60) return `Dernière connexion il y a ${diffMin} min`;
  const hhmm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  if (d.toDateString() === now.toDateString()) {
    return `Dernière connexion aujourd'hui à ${hhmm}`;
  }
  const date = d.toLocaleDateString("fr-FR");
  return `Dernière connexion le ${date} à ${hhmm}`;
}

// Format a read-receipt tag ("Vu à HHhMM" or "Vu le JJ/MM/YYYY à HHhMM").
function formatReadAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Vu à ${hhmm}`;
  return `Vu le ${d.toLocaleDateString("fr-FR")} à ${hhmm}`;
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [addMember, setAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]); // [{url,name,type}]
  const [uploading, setUploading] = useState(false);
  const [filterKind, setFilterKind] = useState("all"); // all | dm | group | unread | archived
  // Corporate canals catalog (Service RH, Communication, etc.)
  const [corpCatalog, setCorpCatalog] = useState([]);
  // Absence auto-reply settings modal
  const [showAbsence, setShowAbsence] = useState(false);
  const [absence, setAbsence] = useState({
    auto_from_planning: true,
    manual_enabled: false,
    manual_start: "",
    manual_end: "",
    message: "",
  });
  const [absenceLoading, setAbsenceLoading] = useState(false);
  // Multi-select for bulk archive/delete
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Multi-select for individual messages inside the active chat
  const [msgSelectMode, setMsgSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState(() => new Set());
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  const toggleFav = (cid) => {
    const next = new Set(favorites);
    next.has(cid) ? next.delete(cid) : next.add(cid);
    setFavorites(next);
    localStorage.setItem("msgFavs", JSON.stringify(Array.from(next)));
  };

  const loadChannels = () => api.get("/channels").then((r) => setChannels(r.data));

  useEffect(() => { loadChannels(); }, []);

  // Sync `active` with the URL — when the user clicks a message notification while
  // already on /messagerie, the ?ch= query changes and we need to open that conversation.
  useEffect(() => {
    const ch = searchParams.get("ch");
    if (ch && ch !== active) {
      setActive(ch);
      setMobileShowChat(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-select the first conversation if none selected
  useEffect(() => {
    if (!active && channels.length > 0) {
      const first = channels
        .filter((c) => !c.archived)
        .sort((a, b) => (b.last_message_ts || "").localeCompare(a.last_message_ts || ""))[0];
      if (first) setActive(first.id);
    }
  }, [active, channels]);

  const reload = useCallback(() => {
    if (!active) return Promise.resolve();
    return api.get(`/channels/${active}/messages`).then((r) => {
      setMessages(r.data);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }).catch((err) => {
      const status = err?.response?.status;
      if (status === 404 || status === 403) {
        toast.error("Conversation introuvable ou accès refusé");
        setMessages([]);
        setActive(null);
        // Clean stale ?ch param from the URL
        const next = new URLSearchParams(searchParams);
        next.delete("ch");
        setSearchParams(next, { replace: true });
        // Refresh notifications so the stale link disappears
        window.dispatchEvent(new CustomEvent("ms-notifications-refresh"));
      }
    });
  }, [active, searchParams, setSearchParams]);

  useEffect(() => {
    if (!active) return;
    reload();
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
        // Official system channels (Service RH, etc.) keep their own name and
        // identity — they must never be overridden with the other member's name.
        const isOfficial = c.is_official || (typeof c.id === "string" && c.id.startsWith("rh-"));
        // For DMs we ALWAYS use the other member's identity (never c.name)
        // so the displayed avatar and displayed name are always coherent —
        // EXCEPT for official system channels which keep their own name.
        const displayName = isOfficial
          ? (c.name || "Service RH")
          : isDm
          ? (other ? `${other.first_name} ${other.last_name}` : (c.name || "Conversation"))
          : (c.name || "Conversation");
        const subtitle = isOfficial
          ? "Ressources Humaines"
          : isDm
          ? (other?.role || "")
          : (c.is_group ? `${(c.members_ids || []).length} membres` : "Conversation d'équipe");
        return {
          ...c,
          _display_name: displayName,
          _subtitle: subtitle,
          _avatar: isOfficial ? null : (isDm ? (other?.avatar || null) : (c.avatar_url || null)),
          _other: other,
          _is_official: isOfficial,
          _kind: isOfficial ? "official" : (isDm ? "dm" : c.is_group ? "group" : "team"),
          _is_birthday: !isOfficial && isBirthdayToday(other),
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
    if (!active) return;
    const content = draft.trim();
    if (!content && pendingAttachments.length === 0) return;
    try {
      const { data } = await api.post(`/channels/${active}/messages`, {
        content,
        attachments: pendingAttachments,
      });
      setMessages((m) => [...m, data]);
      setDraft("");
      setPendingAttachments([]);
      setShowEmoji(false);
      inputRef.current?.focus();
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'envoyer le message");
    }
  };

  const insertEmoji = (emoji) => {
    setDraft((d) => d + emoji);
    inputRef.current?.focus();
  };

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        const { data } = await api.post("/uploads", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploaded.push({
          url: data.url,
          name: data.name || f.name,
          type: data.content_type || f.type || "",
          size: data.size || f.size || 0,
        });
      }
      setPendingAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec de l'envoi du fichier");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !active) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: up } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await api.patch(`/channels/${active}`, { avatar_url: up.url });
      toast.success("Photo du groupe mise à jour");
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de mettre à jour la photo");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const addMemberToGroup = async (empId) => {
    if (!active) return;
    try {
      await api.post(`/channels/${active}/members`, { employee_id: empId });
      toast.success("Membre ajouté");
      setAddMember(false);
      setAddMemberSearch("");
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'ajouter ce membre");
    }
  };

  const removeMemberFromGroup = async (empId) => {
    if (!active) return;
    if (!window.confirm("Retirer ce membre du groupe ?")) return;
    try {
      await api.delete(`/channels/${active}/members/${empId}`);
      toast.success("Membre retiré");
      loadChannels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible de retirer ce membre");
    }
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

  // ─── Bulk archive / delete for the selected conversations
  const toggleSelected = (cid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid); else next.add(cid);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Archiver ${ids.length} conversation${ids.length > 1 ? "s" : ""} ?`)) return;
    try {
      await Promise.all(ids.map((cid) => api.post(`/channels/${cid}/archive`).catch(() => null)));
      toast.success(`${ids.length} conversation${ids.length > 1 ? "s archivées" : " archivée"}`);
      if (active && selectedIds.has(active)) setActive(null);
      exitSelectMode();
      loadChannels();
    } catch {
      toast.error("Impossible d'archiver certaines conversations");
    }
  };
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer définitivement ${ids.length} conversation${ids.length > 1 ? "s" : ""} et leur historique ?`)) return;
    try {
      await Promise.all(ids.map((cid) => api.delete(`/channels/${cid}`).catch(() => null)));
      toast.success(`${ids.length} conversation${ids.length > 1 ? "s supprimées" : " supprimée"}`);
      if (active && selectedIds.has(active)) setActive(null);
      exitSelectMode();
      loadChannels();
    } catch {
      toast.error("Impossible de supprimer certaines conversations");
    }
  };

  // ─── Message-level multi-selection (inside active chat) ───
  const toggleMsgSelected = (mid) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid); else next.add(mid);
      return next;
    });
  };
  const exitMsgSelectMode = () => {
    setMsgSelectMode(false);
    setSelectedMsgIds(new Set());
  };
  const bulkDeleteMessages = async () => {
    const ids = Array.from(selectedMsgIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer définitivement ${ids.length} message${ids.length > 1 ? "s" : ""} ?`)) return;
    try {
      const results = await Promise.allSettled(ids.map((mid) => api.delete(`/messages/${mid}`)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = ids.length - ok;
      if (ok > 0) toast.success(`${ok} message${ok > 1 ? "s supprimés" : " supprimé"}`);
      if (failed > 0) toast.error(`${failed} message${failed > 1 ? "s n'ont" : " n'a"} pas pu être supprimé${failed > 1 ? "s" : ""}`);
      exitMsgSelectMode();
      reload();
    } catch {
      toast.error("Impossible de supprimer les messages");
    }
  };
  // Reset message-selection when switching conversation
  useEffect(() => {
    exitMsgSelectMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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

  // Load the 5 corporate canals catalog when the "Canaux" tab opens
  useEffect(() => {
    if (composer === "corporate" && corpCatalog.length === 0) {
      api.get("/channels/corporate/catalog")
        .then((r) => setCorpCatalog(r.data))
        .catch(() => setCorpCatalog([]));
    }
  }, [composer, corpCatalog.length]);

  // Load absence-reply settings when the modal opens
  useEffect(() => {
    if (showAbsence) {
      api.get("/me/absence-reply")
        .then((r) => setAbsence({
          auto_from_planning: !!r.data.auto_from_planning,
          manual_enabled: !!r.data.manual_enabled,
          manual_start: r.data.manual_start || "",
          manual_end: r.data.manual_end || "",
          message: r.data.message || "",
        }))
        .catch(() => {});
    }
  }, [showAbsence]);

  const saveAbsence = async () => {
    setAbsenceLoading(true);
    try {
      await api.put("/me/absence-reply", {
        auto_from_planning: absence.auto_from_planning,
        manual_enabled: absence.manual_enabled,
        manual_start: absence.manual_start || null,
        manual_end: absence.manual_end || null,
        message: absence.message,
      });
      toast.success("Message d'absence enregistré");
      setShowAbsence(false);
    } catch {
      toast.error("Impossible d'enregistrer");
    } finally {
      setAbsenceLoading(false);
    }
  };

  const openCorporate = async (canalKey) => {
    try {
      const { data } = await api.post("/channels/corporate", { canal_key: canalKey });
      setActive(data.id);
      setSearchParams({ ch: data.id });
      setComposer(null);
      setMobileShowChat(true);
      // Refresh channels so the new corporate canal appears in the sidebar
      loadChannels();
      // Reset catalog so `already_open` refreshes next time
      setCorpCatalog([]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'ouvrir le canal");
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

  // Id of the last own message that has been read by the DM peer.
  // We only render the "Vu à HHhMM" tag on THAT message to avoid clutter.
  const lastReadOwnMsgId = useMemo(() => {
    if (!currentDisplay || currentDisplay._kind !== "dm") return null;
    let id = null;
    for (const m of messages) {
      if (m.author_id === me?.id && m.read_at) id = m.id;
    }
    return id;
  }, [messages, currentDisplay, me?.id]);

  return (
    <div className="ms-fade-up">
      <div className="ms-card overflow-hidden grid grid-cols-1 lg:grid-cols-[340px_1fr] h-[calc(100vh-160px)]">
        {/* ── LEFT column: conversations ── */}
        <aside className={`border-r border-[#071B34]/5 flex flex-col min-h-0 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
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
              onClick={() => setShowAbsence(true)}
              className="h-10 w-10 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 text-[#475569] inline-flex items-center justify-center"
              title="Message d'absence"
              data-testid="msg-absence-open"
            >
              <BellOff className="h-4 w-4" />
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
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              data-testid="msg-select-toggle"
              className={`ml-auto pb-3 text-xs font-semibold transition-colors ${
                selectMode ? "text-[#B91C1C]" : "text-[#475569] hover:text-[#3BA4FF]"
              }`}
            >
              {selectMode ? "Annuler" : "Sélectionner"}
            </button>
          </div>

          {/* Conversations list — fills the full sidebar height, scrolls internally.
              min-h-0 is required so `flex-1` can shrink and enable overflow. */}
          <div className="flex-1 min-h-0 overflow-y-auto" data-testid="msg-conv-list">
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-[#475569]">
                Aucune conversation.
              </div>
            )}
            {filtered.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
              <button
                key={c.id}
                onClick={() => {
                  if (selectMode) { toggleSelected(c.id); return; }
                  setActive(c.id); setSearchParams({ ch: c.id }); setMobileShowChat(true);
                }}
                data-testid={`msg-conv-${c.id}`}
                className={`w-full text-left px-3 py-3 border-b border-[#071B34]/5 transition-all flex items-center gap-3 relative ${
                  selectMode && checked
                    ? "bg-[#FEE2E2]/40"
                    : active === c.id
                    ? "bg-gradient-to-r from-[#3BA4FF]/15 to-[#3BA4FF]/5"
                    : "hover:bg-[#F4F7FA]"
                }`}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    aria-label="Sélectionner la conversation"
                    data-testid={`msg-conv-check-${c.id}`}
                    className="h-4 w-4 accent-[#B91C1C] shrink-0 pointer-events-none"
                  />
                )}
                {!selectMode && active === c.id && (
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
              );
            })}
          </div>
          {/* Bulk actions bar — only in select mode */}
          {selectMode && (
            <div className="border-t border-[#071B34]/5 bg-[#F8FAFC] px-3 py-2 flex items-center gap-2" data-testid="msg-bulk-bar">
              <span className="text-xs font-semibold text-[#475569] mr-auto">
                {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
              </span>
              <button
                onClick={bulkArchive}
                disabled={selectedIds.size === 0}
                data-testid="msg-bulk-archive"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white ring-1 ring-[#071B34]/10 text-[#334155] text-xs font-semibold hover:bg-[#F4F7FA] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Archive className="h-3.5 w-3.5" /> Archiver
              </button>
              <button
                onClick={bulkDelete}
                disabled={selectedIds.size === 0}
                data-testid="msg-bulk-delete"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold hover:bg-[#FCA5A5] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}
        </aside>

        {/* ── RIGHT column: chat ── */}
        <section className={`flex flex-col relative min-h-0 min-w-0 ${!mobileShowChat ? "hidden lg:flex" : "flex"}`}>
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
                    {currentDisplay._kind === "dm" && currentDisplay._other?.is_online && (
                      <span
                        data-testid="msg-header-online-dot"
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#10B981] ring-2 ring-white"
                      />
                    )}
                  </div>
                ) : currentDisplay._kind === "dm" ? (
                  <div className="relative">
                    <div className="h-11 w-11 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold">
                      {initials(currentDisplay._display_name)}
                    </div>
                    {currentDisplay._other?.is_online && (
                      <span
                        data-testid="msg-header-online-dot"
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#10B981] ring-2 ring-white"
                      />
                    )}
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
                  <div className="text-xs text-[#475569] truncate" data-testid="msg-header-presence">
                    {currentDisplay._kind === "dm"
                      ? formatLastSeen(currentDisplay._other?.last_seen_at)
                      : currentDisplay._subtitle}
                  </div>
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
                          onClick={() => { setMsgSelectMode(true); setShowActions(false); }}
                          data-testid="msg-select-msgs"
                          className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#F4F7FA] text-[#334155]"
                        >
                          <ListChecks className="h-4 w-4" /> Sélectionner des messages
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
                    <div className="relative">
                      {currentDisplay._avatar ? (
                        <img src={currentDisplay._avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
                      ) : currentDisplay._kind === "dm" ? (
                        <div className="h-20 w-20 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] flex items-center justify-center font-bold text-2xl">
                          {initials(currentDisplay._display_name)}
                        </div>
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
                          <Users className="h-8 w-8" />
                        </div>
                      )}
                      {currentDisplay._kind !== "dm" && (
                        <>
                          <button
                            onClick={() => avatarInputRef.current?.click()}
                            data-testid="msg-change-avatar"
                            title="Changer la photo"
                            className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-[#3BA4FF] hover:bg-[#2A8DE0] text-white flex items-center justify-center shadow-lg ring-2 ring-white"
                          >
                            <Camera className="h-4 w-4" />
                          </button>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            onChange={onPickAvatar}
                            className="hidden"
                            data-testid="msg-avatar-input"
                          />
                        </>
                      )}
                    </div>
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

                  {/* Group / team member management */}
                  {currentDisplay._kind !== "dm" && (
                    <div className="p-4 border-t border-[#071B34]/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs uppercase tracking-widest font-semibold text-[#475569]">
                          Membres ({(currentDisplay.members_ids || []).length})
                        </div>
                        {currentDisplay._kind === "group" && (
                          <button
                            onClick={() => setAddMember(true)}
                            data-testid="msg-add-member-btn"
                            className="text-xs font-semibold text-[#1D70B8] hover:underline inline-flex items-center gap-1"
                          >
                            <UserPlus className="h-3.5 w-3.5" /> Ajouter
                          </button>
                        )}
                      </div>
                      <div className="space-y-1 max-h-64 overflow-y-auto pr-1" data-testid="msg-members-list">
                        {(currentDisplay.members_ids || []).length === 0 && (
                          <div className="text-xs text-[#94A3B8] py-2">Aucun membre.</div>
                        )}
                        {(currentDisplay.members_ids || []).map((mid) => {
                          const m = findEmployee(mid);
                          if (!m) return null;
                          const isMe = mid === me?.id;
                          return (
                            <div
                              key={mid}
                              data-testid={`msg-member-${mid}`}
                              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[#F4F7FA] group"
                            >
                              {m.avatar
                                ? <img src={m.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                                : <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center">{initials(m.first_name)}</div>}
                              <div className="flex-1 min-w-0 text-left">
                                <div className="text-sm font-semibold text-[#071B34] truncate">
                                  {m.first_name} {m.last_name} {isMe && <span className="text-[10px] text-[#94A3B8] font-normal">(vous)</span>}
                                </div>
                                <div className="text-xs text-[#475569] truncate">{m.role || "—"}</div>
                              </div>
                              {currentDisplay._kind === "group" && !isMe && (
                                <button
                                  onClick={() => removeMemberFromGroup(mid)}
                                  data-testid={`msg-remove-${mid}`}
                                  title="Retirer du groupe"
                                  className="opacity-0 group-hover:opacity-100 h-8 w-8 rounded-lg hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center transition-opacity"
                                >
                                  <UserMinus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-4 space-y-2 border-t border-[#071B34]/5">
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
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-6 space-y-4 bg-white">
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
                        const isSystemRh = m.author_id === "system-rh";
                        const author = isSystemRh ? null : findEmployee(m.author_id);
                        const msgChecked = selectedMsgIds.has(m.id);
                        const canSelectMsg = msgSelectMode && mine && !isSystemRh;
                        return (
                          <div
                            key={m.id}
                            onClick={() => { if (canSelectMsg) toggleMsgSelected(m.id); }}
                            className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${
                              msgSelectMode ? (canSelectMsg ? "cursor-pointer" : "opacity-60") : ""
                            } ${msgChecked ? "bg-[#FEE2E2]/30 -mx-2 px-2 py-1 rounded-lg" : ""}`}
                            data-testid={`msg-row-${m.id}`}
                          >
                            {msgSelectMode && mine && (
                              <input
                                type="checkbox"
                                checked={msgChecked}
                                readOnly
                                aria-label="Sélectionner le message"
                                data-testid={`msg-check-${m.id}`}
                                className="h-4 w-4 accent-[#B91C1C] shrink-0 pointer-events-none order-last ml-1"
                              />
                            )}
                            {!mine && (
                              isSystemRh
                                ? <div className="h-7 w-7 rounded-full bg-[#3BA4FF] text-white text-[10px] font-bold flex items-center justify-center shrink-0" data-testid="msg-avatar-service-rh">RH</div>
                                : author?.avatar
                                ? <img src={author.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                                : <div className="h-7 w-7 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {initials(author?.first_name)}
                                  </div>
                            )}
                            <div className={`relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                              mine
                                ? "bg-[#DBEAFE] text-[#0B2545] rounded-br-sm"
                                : "bg-[#F1F5F9] text-[#0B2545] rounded-bl-sm"
                            }`}>
                              {m.content && (
                                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                              )}
                              {(m.attachments || []).length > 0 && (
                                <div className={`${m.content ? "mt-2" : ""} space-y-1.5`}>
                                  {(m.attachments || []).map((a, i) => (
                                    <MessageAttachment key={i} att={a} />
                                  ))}
                                </div>
                              )}
                              <div className={`mt-1 text-[10px] ${mine ? "text-[#1D4ED8]/70" : "text-[#94A3B8]"} text-right`}>
                                {new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                {m.edited && <span className="ml-1 italic" data-testid="msg-edited">· Modifié</span>}
                                {m.is_auto_reply && (
                                  <span className="ml-1 italic text-[#F59E0B]" data-testid="msg-auto-reply">· Réponse automatique</span>
                                )}
                                {mine && <span className="ml-1">✓✓</span>}
                              </div>
                              {mine && m.id === lastReadOwnMsgId && (
                                <div className="mt-0.5 text-[10px] text-[#1D4ED8]/70 text-right italic" data-testid="msg-read-receipt">
                                  {formatReadAt(m.read_at)}
                                </div>
                              )}
                              {/* Persistent tiny like-count badge, only if reactions exist */}
                              {(m.like_count || (m.liked_by || []).length) > 0 && (
                                <span
                                  data-testid="msg-like-badge"
                                  className={`absolute -bottom-2 ${mine ? "-left-1" : "-right-1"} inline-flex items-center gap-0.5 rounded-full bg-white shadow ring-1 ring-[#071B34]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1D70B8]`}
                                >
                                  <ThumbsUp className="h-3 w-3 fill-current" />
                                  {(m.like_count || (m.liked_by || []).length)}
                                </span>
                              )}
                            </div>
                            {/* Hover-only actions row (like + edit), rendered OUTSIDE the bubble for a subtle look */}
                            <MessageActions m={m} mine={mine} onChanged={reload} />
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

              {/* Message bulk actions bar — visible only in msgSelectMode */}
              {msgSelectMode && (
                <div className="border-t border-[#071B34]/5 bg-[#F8FAFC] px-3 py-2 flex items-center gap-2" data-testid="msg-bulk-msg-bar">
                  <span className="text-xs font-semibold text-[#475569] mr-auto">
                    {selectedMsgIds.size} message{selectedMsgIds.size > 1 ? "s" : ""} sélectionné{selectedMsgIds.size > 1 ? "s" : ""}
                    <span className="ml-2 text-[10px] font-normal text-[#94A3B8]">(vos messages uniquement)</span>
                  </span>
                  <button
                    onClick={exitMsgSelectMode}
                    data-testid="msg-bulk-msg-cancel"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white ring-1 ring-[#071B34]/10 text-[#334155] text-xs font-semibold hover:bg-[#F4F7FA]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={bulkDeleteMessages}
                    disabled={selectedMsgIds.size === 0}
                    data-testid="msg-bulk-msg-delete"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold hover:bg-[#FCA5A5] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              )}

              {/* Composer */}
              <div className="border-t border-[#071B34]/5 bg-white">
                {pendingAttachments.length > 0 && (
                  <div className="px-3 pt-3 flex flex-wrap gap-2" data-testid="msg-pending-attachments">
                    {pendingAttachments.map((a, i) => {
                      const isImg = (a.type || "").startsWith("image/");
                      return (
                        <div key={i} className="relative rounded-xl border border-[#071B34]/10 bg-[#F4F7FA] p-2 pr-8 flex items-center gap-2 max-w-[220px]">
                          {isImg ? (
                            <img src={absoluteUrl(a.url)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-white text-[#3BA4FF] flex items-center justify-center">
                              <FileText className="h-5 w-5" />
                            </div>
                          )}
                          <div className="text-xs text-[#0B2545] truncate max-w-[120px]" title={a.name}>{a.name}</div>
                          <button
                            onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white shadow hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center"
                            aria-label="Retirer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="p-3 flex items-center gap-2 relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={onPickFiles}
                    className="hidden"
                    data-testid="msg-file-input"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    data-testid="msg-attach"
                    title="Joindre un fichier"
                    className="h-10 w-10 rounded-xl bg-[#F4F7FA] hover:bg-[#071B34]/5 disabled:opacity-40 inline-flex items-center justify-center text-[#475569]"
                    aria-label="Joindre"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder={uploading ? "Envoi du fichier…" : "Écrire un message…"}
                      data-testid="msg-input"
                      className="w-full h-11 pl-4 pr-11 rounded-xl bg-[#F4F7FA] focus:bg-white focus:ring-2 focus:ring-[#3BA4FF]/30 outline-none text-sm"
                    />
                    <button
                      onClick={() => setShowEmoji((s) => !s)}
                      data-testid="msg-emoji-btn"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg inline-flex items-center justify-center transition-colors ${showEmoji ? "bg-[#3BA4FF]/15 text-[#1D70B8]" : "hover:bg-[#071B34]/5 text-[#475569]"}`}
                      aria-label="Emoji"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    {showEmoji && (
                      <div
                        className="absolute right-0 bottom-12 z-40 w-64 rounded-2xl bg-white shadow-2xl ring-1 ring-[#071B34]/10 p-3"
                        data-testid="msg-emoji-panel"
                      >
                        <div className="text-[10px] uppercase tracking-widest font-semibold text-[#475569] mb-2">
                          Insérer un emoji
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {QUICK_EMOJIS.map((emo) => (
                            <button
                              key={emo}
                              onClick={() => insertEmoji(emo)}
                              data-testid={`msg-emoji-${emo}`}
                              className="h-9 w-full text-xl rounded-lg hover:bg-[#F4F7FA]"
                              type="button"
                            >
                              {emo}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={send}
                    disabled={(!draft.trim() && pendingAttachments.length === 0) || uploading}
                    data-testid="msg-send"
                    className="h-11 w-11 rounded-xl bg-[#3BA4FF] hover:bg-[#2A8DE0] disabled:opacity-40 disabled:cursor-not-allowed text-white inline-flex items-center justify-center transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
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
                { k: "corporate", l: "Canaux" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setComposer(t.k)}
                  data-testid={`msg-compose-tab-${t.k}`}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    composer === t.k ? "bg-[#3BA4FF] text-white" : "bg-[#F4F7FA] text-[#475569]"
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              {composer === "corporate" ? (
                <div className="space-y-2" data-testid="msg-corporate-list">
                  <div className="text-xs text-[#475569] px-1 pb-1">
                    Écrivez à un service. Seuls ses membres reçoivent votre message et peuvent y répondre.
                  </div>
                  {corpCatalog.length === 0 && (
                    <div className="text-center text-sm text-[#94A3B8] py-6">Chargement…</div>
                  )}
                  {corpCatalog.map((c) => {
                    const Icon = ({
                      "briefcase": Briefcase,
                      "megaphone": Megaphone,
                      "user-cog": UserCog,
                      "landmark": Landmark,
                      "shield": Shield,
                    })[c.icon] || Briefcase;
                    return (
                      <button
                        key={c.key}
                        onClick={() => openCorporate(c.key)}
                        data-testid={`msg-corp-${c.key}`}
                        className="w-full text-left rounded-xl px-3 py-3 hover:bg-[#F4F7FA] flex items-center gap-3 transition-colors border border-transparent hover:border-[#3BA4FF]/20"
                      >
                        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-[#3BA4FF]/15 to-[#4338CA]/10 text-[#1D70B8] flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#071B34] flex items-center gap-1.5">
                            {c.name}
                            {c.already_open && (
                              <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full">Ouvert</span>
                            )}
                          </div>
                          <div className="text-xs text-[#475569] truncate">
                            {c.description} · {c.recipient_count} destinataire{c.recipient_count > 1 ? "s" : ""}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#94A3B8] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Add member to group modal */}
      {addMember && currentDisplay && currentDisplay._kind === "group" && (
        <div
          onClick={() => setAddMember(false)}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" data-testid="msg-add-member-modal">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
              <h3 className="text-base font-bold text-[#071B34]">Ajouter des membres</h3>
              <button onClick={() => setAddMember(false)} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <input
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  placeholder="Rechercher un collègue…"
                  data-testid="msg-add-member-search"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#F4F7FA] outline-none text-sm"
                />
              </div>
              <div className="mt-2 space-y-1 max-h-80 overflow-y-auto pr-1">
                {(employees || [])
                  .filter((e) => !e.is_super_admin)
                  .filter((e) => !(currentDisplay.members_ids || []).includes(e.id))
                  .filter((e) => {
                    if (!addMemberSearch.trim()) return true;
                    const n = addMemberSearch.toLowerCase();
                    return `${e.first_name} ${e.last_name} ${e.role || ""}`.toLowerCase().includes(n);
                  })
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => addMemberToGroup(e.id)}
                      data-testid={`msg-add-member-${e.id}`}
                      className="w-full flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#F4F7FA]"
                    >
                      {e.avatar
                        ? <img src={e.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <div className="h-8 w-8 rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] text-[10px] font-bold flex items-center justify-center">{initials(e.first_name)}</div>}
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-semibold text-[#071B34] truncate">{e.first_name} {e.last_name}</div>
                        <div className="text-xs text-[#475569] truncate">{e.role || "—"}</div>
                      </div>
                      <UserPlus className="h-4 w-4 text-[#3BA4FF]" />
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Absence auto-reply settings modal */}
      {showAbsence && (
        <div
          onClick={() => setShowAbsence(false)}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            data-testid="msg-absence-modal"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
              <div>
                <h3 className="text-base font-bold text-[#071B34]">Message d&apos;absence</h3>
                <p className="text-xs text-[#475569]">Une réponse automatique sera envoyée sur vos DM.</p>
              </div>
              <button onClick={() => setShowAbsence(false)} className="h-9 w-9 rounded-lg hover:bg-[#F4F7FA] inline-flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={absence.auto_from_planning}
                  onChange={(e) => setAbsence((a) => ({ ...a, auto_from_planning: e.target.checked }))}
                  data-testid="msg-absence-auto"
                  className="mt-1 h-4 w-4 accent-[#3BA4FF]"
                />
                <div>
                  <div className="text-sm font-semibold text-[#071B34]">Activer automatiquement selon mon planning</div>
                  <div className="text-xs text-[#475569]">Se déclenche lors d&apos;un congé validé ou d&apos;un jour OFF.</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={absence.manual_enabled}
                  onChange={(e) => setAbsence((a) => ({ ...a, manual_enabled: e.target.checked }))}
                  data-testid="msg-absence-manual"
                  className="mt-1 h-4 w-4 accent-[#3BA4FF]"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#071B34]">Activer maintenant pour une période précise</div>
                  <div className="text-xs text-[#475569] mb-2">Écrase la logique automatique pendant cette période.</div>
                  {absence.manual_enabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="ms-overline">Du</label>
                        <input
                          type="date"
                          value={absence.manual_start}
                          onChange={(e) => setAbsence((a) => ({ ...a, manual_start: e.target.value }))}
                          data-testid="msg-absence-start"
                          className="ms-input mt-1"
                        />
                      </div>
                      <div>
                        <label className="ms-overline">Au</label>
                        <input
                          type="date"
                          value={absence.manual_end}
                          onChange={(e) => setAbsence((a) => ({ ...a, manual_end: e.target.value }))}
                          data-testid="msg-absence-end"
                          className="ms-input mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </label>
              <div>
                <label className="ms-overline">Message envoyé automatiquement</label>
                <textarea
                  value={absence.message}
                  onChange={(e) => setAbsence((a) => ({ ...a, message: e.target.value }))}
                  placeholder="Bonjour, je suis actuellement en congé jusqu'au…"
                  rows={5}
                  data-testid="msg-absence-message"
                  className="ms-input mt-1 resize-y"
                />
                <div className="text-[11px] text-[#94A3B8] mt-1">Envoyé une fois par heure au maximum pour chaque contact.</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#071B34]/5 flex items-center justify-end gap-2">
              <button onClick={() => setShowAbsence(false)} className="px-3 py-2 rounded-xl text-sm text-[#475569] hover:bg-[#F4F7FA]">
                Annuler
              </button>
              <button
                onClick={saveAbsence}
                disabled={absenceLoading}
                data-testid="msg-absence-save"
                className="ms-btn-primary"
              >
                {absenceLoading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageActions({ m, mine, onChanged }) {
  const { me } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content || "");
  const likedByMe = (m.liked_by || []).includes(me?.id);
  const likeCount = m.like_count || (m.liked_by || []).length;
  // Editable window: within 10 minutes of creation
  const ageMin = (Date.now() - new Date(m.ts).getTime()) / 60000;
  const canEdit = mine && ageMin < 10 && m.author_id !== "system-rh";

  const toggleLike = async () => {
    try {
      await api.post(`/messages/${m.id}/like`);
      onChanged?.();
    } catch (_) { /* ignore */ }
  };

  const saveEdit = async () => {
    const c = (draft || "").trim();
    if (!c || c === m.content) { setEditing(false); return; }
    try {
      await api.put(`/messages/${m.id}`, { content: c });
      setEditing(false);
      onChanged?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Impossible de modifier ce message";
      window.alert(msg);
    }
  };

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-2" data-testid="msg-edit-form">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
          className="ms-input text-xs flex-1" autoFocus />
        <button onClick={saveEdit} className="text-[10px] font-semibold text-[#1D70B8]" data-testid="msg-edit-save">Enregistrer</button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-[#475569]">Annuler</button>
      </div>
    );
  }

  return (
    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 text-[#94A3B8]" data-testid="msg-actions">
      <button
        onClick={toggleLike}
        data-testid="msg-like-btn"
        title={likedByMe ? "Retirer le like" : "J'aime"}
        className={`inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#F4F7FA] transition-colors ${likedByMe ? "text-[#1D70B8]" : ""}`}
      >
        <ThumbsUp className={`h-3.5 w-3.5 ${likedByMe ? "fill-current" : ""}`} />
      </button>
      {canEdit && (
        <button
          onClick={() => { setDraft(m.content || ""); setEditing(true); }}
          data-testid="msg-edit-btn"
          title="Modifier"
          className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#F4F7FA] hover:text-[#3BA4FF] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function MessageAttachment({ att }) {
  const type = att?.type || "";
  const name = att?.name || "Fichier";
  const kind = att?.kind || "";
  const rawUrl = att?.url || "";
  const description = att?.description || "";

  // Payslip attachment — clickable in-app card that opens the payslip viewer
  if (kind === "payslip") {
    return (
      <Link
        to={rawUrl}
        data-testid="msg-attachment-payslip"
        className="group flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#3BA4FF]/10 to-[#3BA4FF]/5 hover:from-[#3BA4FF]/20 hover:to-[#3BA4FF]/10 ring-1 ring-[#3BA4FF]/25 px-3 py-2.5 text-[#0B2545] transition-colors"
      >
        <div className="h-10 w-10 rounded-lg bg-[#3BA4FF] text-white flex items-center justify-center shrink-0">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1D70B8]">Fiche de paie</div>
          <div className="text-sm font-bold text-[#071B34] truncate">{name}</div>
          <div className="text-[11px] text-[#3BA4FF] mt-0.5 group-hover:underline">Ouvrir ma fiche de paie →</div>
        </div>
      </Link>
    );
  }

  // Onboarding "link" attachment — in-app navigation card
  if (kind === "link") {
    return (
      <Link
        to={rawUrl}
        data-testid="msg-attachment-link"
        className="group flex items-center gap-3 rounded-xl bg-white hover:bg-[#F1F5F9] ring-1 ring-[#071B34]/10 px-3 py-2 text-[#0B2545] transition-colors"
      >
        <div className="h-9 w-9 rounded-lg bg-[#3BA4FF]/12 text-[#1D70B8] flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#071B34] truncate group-hover:text-[#1D70B8]">{name} →</div>
          {description && (
            <div className="text-[11px] text-[#475569] truncate">{description}</div>
          )}
        </div>
      </Link>
    );
  }

  const url = absoluteUrl(rawUrl);
  const isImage = type.startsWith("image/");
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" data-testid="msg-attachment-image">
        <img
          src={url}
          alt={name}
          className="max-h-56 max-w-full rounded-lg border border-black/5 object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download
      data-testid="msg-attachment-file"
      className="flex items-center gap-2 rounded-lg bg-white/70 hover:bg-white ring-1 ring-black/5 px-2.5 py-1.5 text-xs text-[#0B2545]"
    >
      <FileText className="h-4 w-4 shrink-0 text-[#3BA4FF]" />
      <span className="truncate max-w-[180px]">{name}</span>
    </a>
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
