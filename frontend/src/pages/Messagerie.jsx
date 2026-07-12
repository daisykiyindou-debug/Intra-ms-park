import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Hash, Lock, Send, Smile, Paperclip, Phone, Video, Search, User, Users,
  Plus, X, MoreVertical, Archive, Trash2, ArchiveRestore, ArrowLeft, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

export default function Messagerie() {
  const { me, employees, findEmployee } = useApp();
  const [channels, setChannels] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCh = searchParams.get("ch") || "ch-accueil";
  const [active, setActive] = useState(initialCh);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [dmModal, setDmModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [empSearch, setEmpSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(null); // channel id of opened context menu
  const [showArchived, setShowArchived] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  const loadChannels = () => api.get("/channels").then((r) => setChannels(r.data));

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => {
    if (!active) return;
    api.get(`/channels/${active}/messages`).then((r) => {
      setMessages(r.data);
      // Scroll to bottom when channel changes (inside the scroll container, not the whole page)
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    });
  }, [active]);
  useEffect(() => {
    // Scroll inside the chat scroll container, never the page
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Close 3-dot menu on outside click
  useEffect(() => {
    const onClick = () => setMenuOpen(null);
    if (menuOpen) {
      document.addEventListener("click", onClick);
      return () => document.removeEventListener("click", onClick);
    }
  }, [menuOpen]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const { data } = await api.post(`/channels/${active}/messages`, { content: draft });
    setMessages((prev) => [...prev, data]);
    setDraft("");
  };

  const startDM = async (empId) => {
    const { data } = await api.post("/channels/dm", { employee_id: empId });
    await loadChannels();
    setActive(data.id);
    setMobileShowChat(true);
    setDmModal(false);
    setEmpSearch("");
    setSearchParams({ ch: data.id });
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) {
      toast.error("Nom et au moins 1 membre requis");
      return;
    }
    const { data } = await api.post("/channels/group", {
      name: groupName.trim(),
      member_ids: groupMembers,
    });
    await loadChannels();
    setActive(data.id);
    setMobileShowChat(true);
    setGroupModal(false);
    setGroupName("");
    setGroupMembers([]);
    setEmpSearch("");
    toast.success(`Groupe "${data.name}" créé`);
    setSearchParams({ ch: data.id });
  };

  const toggleArchive = async (ch) => {
    const { data } = await api.post(`/channels/${ch.id}/archive`);
    toast.success(data.archived ? "Conversation archivée" : "Conversation restaurée");
    await loadChannels();
    setMenuOpen(null);
  };

  const deleteChannel = async (ch) => {
    try {
      await api.delete(`/channels/${ch.id}`);
      toast.success("Conversation supprimée");
      if (active === ch.id) {
        setActive("ch-accueil");
        setSearchParams({ ch: "ch-accueil" });
      }
      await loadChannels();
    } catch (e) {
      toast.error("Suppression impossible");
    }
    setConfirmDelete(null);
    setMenuOpen(null);
  };

  const currentChannel = channels.find((c) => c.id === active);
  const teamChannels = channels.filter((c) => !c.is_dm && !c.is_group && !c.archived);
  const groupChannels = channels.filter((c) => c.is_group && !c.archived);
  const dmChannels = channels.filter((c) => c.is_dm && !c.archived);
  const archivedChannels = channels.filter((c) => c.archived);

  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.id !== me?.id)
        .filter((e) =>
          empSearch
            ? `${e.first_name} ${e.last_name} ${e.role}`.toLowerCase().includes(empSearch.toLowerCase())
            : true
        ),
    [employees, me, empSearch]
  );

  const toggleMember = (id) => {
    setGroupMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const onSelectChannel = (cid) => {
    setActive(cid);
    setSearchParams({ ch: cid });
    setMobileShowChat(true);
  };

  // Responsive: on mobile show either sidebar OR chat
  return (
    <div className="ms-fade-up h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)] flex flex-col">
      <div className="flex items-end justify-between gap-3 pb-4 shrink-0">
        <div>
          <div className="ms-overline">Messagerie</div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
            Discussions internes
          </h1>
        </div>
      </div>

      <div className="ms-card overflow-hidden grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0">
        {/* SIDEBAR */}
        <aside
          className={`md:col-span-4 lg:col-span-3 border-r border-[#071B34]/5 bg-[#F8FAFC] flex flex-col min-h-0 ${
            mobileShowChat ? "hidden md:flex" : "flex"
          }`}
          data-testid="msg-sidebar"
        >
          <div className="p-3 border-b border-[#071B34]/5 space-y-2 shrink-0">
            <button
              onClick={() => setDmModal(true)}
              data-testid="new-dm"
              className="ms-btn-primary w-full text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Discussion directe
            </button>
            <button
              onClick={() => setGroupModal(true)}
              data-testid="new-group"
              className="ms-btn-outline w-full text-xs"
            >
              <Users className="h-3.5 w-3.5" /> Créer un groupe
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-2 min-h-0">
            <div className="ms-overline px-3 mt-1 mb-1">Canaux</div>
            {teamChannels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                active={active === c.id}
                onClick={() => onSelectChannel(c.id)}
                menuOpen={menuOpen === c.id}
                onMenuClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(menuOpen === c.id ? null : c.id);
                }}
              />
            ))}
            {groupChannels.length > 0 && (
              <>
                <div className="ms-overline px-3 mt-4 mb-1">Groupes</div>
                {groupChannels.map((c) => (
                  <ChannelRow
                    key={c.id}
                    channel={c}
                    active={active === c.id}
                    onClick={() => onSelectChannel(c.id)}
                    menuOpen={menuOpen === c.id}
                    onMenuClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === c.id ? null : c.id);
                    }}
                    onArchive={() => toggleArchive(c)}
                    onDelete={() => setConfirmDelete(c)}
                  />
                ))}
              </>
            )}
            {dmChannels.length > 0 && (
              <>
                <div className="ms-overline px-3 mt-4 mb-1">Messages directs</div>
                {dmChannels.map((c) => (
                  <ChannelRow
                    key={c.id}
                    channel={c}
                    active={active === c.id}
                    onClick={() => onSelectChannel(c.id)}
                    menuOpen={menuOpen === c.id}
                    onMenuClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === c.id ? null : c.id);
                    }}
                    onArchive={() => toggleArchive(c)}
                    onDelete={() => setConfirmDelete(c)}
                  />
                ))}
              </>
            )}
            {/* Archived section */}
            {archivedChannels.length > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  data-testid="toggle-archived"
                  className="mt-4 mb-1 flex items-center gap-2 w-full px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#475569] hover:text-[#071B34]"
                >
                  <Archive className="h-3 w-3" />
                  Archivées ({archivedChannels.length})
                  <span className="ml-auto">{showArchived ? "−" : "+"}</span>
                </button>
                {showArchived &&
                  archivedChannels.map((c) => (
                    <ChannelRow
                      key={c.id}
                      channel={c}
                      active={active === c.id}
                      onClick={() => onSelectChannel(c.id)}
                      menuOpen={menuOpen === c.id}
                      onMenuClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === c.id ? null : c.id);
                      }}
                      onArchive={() => toggleArchive(c)}
                      onDelete={() => setConfirmDelete(c)}
                      dimmed
                    />
                  ))}
              </>
            )}
          </div>
        </aside>

        {/* CHAT AREA */}
        <section
          className={`md:col-span-8 lg:col-span-9 flex flex-col min-h-0 min-w-0 ${
            mobileShowChat ? "flex" : "hidden md:flex"
          }`}
          data-testid="chat-area"
        >
          {currentChannel && (
            <div className="flex items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-[#071B34]/5 shrink-0 bg-white">
              <button
                onClick={() => setMobileShowChat(false)}
                className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5 shrink-0"
                data-testid="chat-back"
              >
                <ArrowLeft className="h-4 w-4 text-[#475569]" />
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {currentChannel.is_dm ? (
                  <img
                    src={currentChannel.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                  />
                ) : currentChannel.is_group ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3BA4FF]/15 text-[#1D70B8] shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                ) : currentChannel.icon === "lock" ? (
                  <Lock className="h-4 w-4 text-[#475569] shrink-0" />
                ) : (
                  <Hash className="h-4 w-4 text-[#475569] shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="text-sm md:text-base font-bold text-[#071B34] truncate">
                    {currentChannel.name}
                  </h3>
                  {!currentChannel.is_dm && (
                    <div className="text-[11px] text-[#475569]">
                      {currentChannel.members} membres
                      {currentChannel.archived && " · archivée"}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5" title="Appel audio (bientôt)">
                  <Phone className="h-4 w-4 text-[#475569]" />
                </button>
                <button className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5" title="Appel vidéo (bientôt)">
                  <Video className="h-4 w-4 text-[#475569]" />
                </button>
              </div>
            </div>
          )}

          {/* MESSAGES SCROLL CONTAINER - critical: min-h-0 + overflow-y-auto */}
          <div
            ref={scrollRef}
            data-testid="messages-scroll"
            className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-5 py-4 space-y-3 min-h-0 bg-[#F8FAFC]"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-sm text-[#475569] py-12">
                <MessageSquare className="h-10 w-10 text-[#3BA4FF]/40 mb-3" />
                Pas encore de message. Lancez la discussion !
              </div>
            )}
            {messages.map((m, idx) => {
              const isMe = m.author_id === me?.id;
              const author = findEmployee(m.author_id);
              const prev = messages[idx - 1];
              const showAuthor = !prev || prev.author_id !== m.author_id;
              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-2 ${isMe ? "justify-end" : ""}`}
                  data-testid={`msg-${m.id}`}
                >
                  {!isMe && (
                    <div className="w-8 shrink-0">
                      {showAuthor && (
                        <img
                          src={author?.avatar}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] sm:max-w-[70%] md:max-w-[60%] min-w-0 flex flex-col ${
                      isMe ? "items-end" : "items-start"
                    }`}
                  >
                    {!isMe && showAuthor && (
                      <div className="text-[11px] font-semibold text-[#071B34] mb-1 ml-1">
                        {author?.first_name} {author?.last_name}
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm break-words whitespace-pre-wrap ${
                        isMe
                          ? "bg-[#3BA4FF] text-white rounded-br-md"
                          : "bg-white border border-[#071B34]/5 text-[#071B34] rounded-bl-md"
                      }`}
                      style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                    >
                      {m.content}
                    </div>
                    <div
                      className={`text-[10px] text-[#475569] mt-1 px-1 ${
                        isMe ? "text-right" : "text-left"
                      }`}
                    >
                      {new Date(m.ts).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* COMPOSER */}
          <form
            onSubmit={send}
            className="border-t border-[#071B34]/5 p-2.5 md:p-3 flex items-center gap-2 bg-white shrink-0"
          >
            <button
              type="button"
              className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#071B34]/5 shrink-0"
              title="Joindre un fichier (bientôt)"
            >
              <Paperclip className="h-4 w-4 text-[#475569]" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message dans ${currentChannel?.is_dm ? "" : "#"}${
                currentChannel?.name || ""
              }`}
              data-testid="msg-input"
              className="ms-input flex-1 min-w-0"
            />
            <button
              type="button"
              className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#071B34]/5 shrink-0"
              title="Emoji (bientôt)"
            >
              <Smile className="h-4 w-4 text-[#475569]" />
            </button>
            <button
              type="submit"
              data-testid="send-msg"
              className="ms-btn-primary !px-4 shrink-0"
              disabled={!draft.trim()}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>

      {/* New DM modal */}
      {dmModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDmModal(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="ms-overline">Nouvelle discussion</div>
                <h3 className="text-xl font-bold text-[#071B34] mt-1">Choisir un employé</h3>
              </div>
              <button
                onClick={() => setDmModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
              <input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Rechercher un employé…"
                data-testid="search-emp"
                className="ms-input pl-10"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {employeeOptions.map((e) => (
                <button
                  key={e.id}
                  onClick={() => startDM(e.id)}
                  data-testid={`pick-${e.id}`}
                  className="flex items-center gap-3 w-full rounded-xl hover:bg-[#F4F7FA] p-2 text-left transition-colors"
                >
                  <img src={e.avatar} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#071B34] truncate">
                      {e.first_name} {e.last_name}
                    </div>
                    <div className="text-xs text-[#475569] truncate">{e.role}</div>
                  </div>
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      e.available ? "bg-[#10B981]" : "bg-[#94A3B8]"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Group creation modal */}
      {groupModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setGroupModal(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between mb-4 shrink-0">
              <div>
                <div className="ms-overline">Nouveau groupe</div>
                <h3 className="text-xl font-bold text-[#071B34] mt-1">Créer un groupe de discussion</h3>
              </div>
              <button
                onClick={() => setGroupModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
              <div className="shrink-0">
                <label className="ms-overline">Nom du groupe</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  data-testid="group-name"
                  placeholder="Ex. Équipe Karting weekend"
                  className="ms-input mt-2"
                />
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <label className="ms-overline shrink-0">
                  Membres ({groupMembers.length} sélectionnés)
                </label>
                <div className="relative mt-2 mb-2 shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
                  <input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="ms-input pl-10"
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 rounded-xl border border-[#071B34]/5 p-2 min-h-0">
                  {employeeOptions.map((e) => {
                    const checked = groupMembers.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        onClick={() => toggleMember(e.id)}
                        data-testid={`group-pick-${e.id}`}
                        className={`flex items-center gap-3 w-full rounded-lg p-2 text-left transition-colors ${
                          checked ? "bg-[#3BA4FF]/12" : "hover:bg-[#F4F7FA]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="h-4 w-4 accent-[#3BA4FF] shrink-0"
                        />
                        <img src={e.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#071B34] truncate">
                            {e.first_name} {e.last_name}
                          </div>
                          <div className="text-[11px] text-[#475569] truncate">{e.role}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={createGroup}
                data-testid="create-group"
                disabled={!groupName.trim() || groupMembers.length === 0}
                className="ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Créer le groupe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ms-card max-w-md w-full p-6"
            data-testid="confirm-delete-modal"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEE2E2] text-[#EF4444]">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-[#071B34]">Supprimer la conversation ?</h3>
            <p className="mt-1 text-sm text-[#475569]">
              "<strong>{confirmDelete.name}</strong>" et tous ses messages seront définitivement
              supprimés. Cette action est irréversible.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="ms-btn-outline flex-1">
                Annuler
              </button>
              <button
                onClick={() => deleteChannel(confirmDelete)}
                data-testid="confirm-delete"
                className="ms-btn-primary flex-1 !bg-[#EF4444] hover:!bg-[#DC2626] shadow-[0_4px_14px_rgba(239,68,68,0.35)]"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelRow({ channel, active, onClick, menuOpen, onMenuClick, onArchive, onDelete, dimmed }) {
  const canManage = channel.is_dm || channel.is_group;
  const Icon = channel.icon === "lock"
    ? Lock
    : channel.is_dm
    ? User
    : channel.is_group
    ? Users
    : Hash;
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        data-testid={`channel-${channel.id}`}
        className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm transition-colors ${
          active
            ? "bg-[#3BA4FF]/12 text-[#071B34] font-semibold"
            : "text-[#475569] hover:bg-[#071B34]/5"
        } ${dimmed ? "opacity-60" : ""}`}
      >
        {channel.is_dm ? (
          <img src={channel.avatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 text-left truncate">{channel.name}</span>
        {channel.unread > 0 && !channel.archived && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white px-1 shrink-0">
            {channel.unread}
          </span>
        )}
        {canManage && (
          <span
            onClick={onMenuClick}
            data-testid={`menu-${channel.id}`}
            className="opacity-0 group-hover:opacity-100 hover:bg-[#071B34]/10 rounded-md p-0.5 shrink-0 cursor-pointer"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {canManage && menuOpen && (
        <div
          className="absolute right-2 top-full mt-1 z-20 w-48 rounded-xl bg-white border border-[#071B34]/8 shadow-xl overflow-hidden ms-fade-up"
          onClick={(e) => e.stopPropagation()}
          data-testid={`menu-pop-${channel.id}`}
        >
          <button
            onClick={onArchive}
            data-testid={`archive-${channel.id}`}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#071B34] hover:bg-[#F4F7FA] transition-colors"
          >
            {channel.archived ? (
              <>
                <ArchiveRestore className="h-4 w-4 text-[#475569]" /> Restaurer
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 text-[#475569]" /> Archiver
              </>
            )}
          </button>
          <button
            onClick={onDelete}
            data-testid={`delete-${channel.id}`}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#EF4444] hover:bg-[#FEE2E2] transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
