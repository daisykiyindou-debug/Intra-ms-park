import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Hash, Lock, Send, Smile, Paperclip, Phone, Video, Search, User, Users, Plus, X } from "lucide-react";
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
  const bottomRef = useRef(null);

  const loadChannels = () => api.get("/channels").then((r) => setChannels(r.data));

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => {
    api.get(`/channels/${active}/messages`).then((r) => setMessages(r.data));
  }, [active]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    setGroupModal(false);
    setGroupName("");
    setGroupMembers([]);
    setEmpSearch("");
    toast.success(`Groupe "${data.name}" créé`);
    setSearchParams({ ch: data.id });
  };

  const currentChannel = channels.find((c) => c.id === active);
  const teamChannels = channels.filter((c) => !c.is_dm && !c.is_group);
  const groupChannels = channels.filter((c) => c.is_group);
  const dmChannels = channels.filter((c) => c.is_dm);

  const employeeOptions = employees
    .filter((e) => e.id !== me?.id)
    .filter((e) =>
      empSearch
        ? `${e.first_name} ${e.last_name} ${e.role}`.toLowerCase().includes(empSearch.toLowerCase())
        : true
    );

  const toggleMember = (id) => {
    setGroupMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4 ms-fade-up">
      <div>
        <div className="ms-overline">Messagerie</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">
          Discussions internes
        </h1>
      </div>

      <div className="ms-card overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[72vh]">
        <aside className="md:col-span-3 border-r border-[#071B34]/5 bg-[#F8FAFC] flex flex-col">
          <div className="p-3 border-b border-[#071B34]/5 space-y-2">
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
          <div className="overflow-y-auto flex-1 p-2">
            <div className="ms-overline px-3 mt-1 mb-1">Canaux</div>
            {teamChannels.map((c) => (
              <ChannelBtn key={c.id} channel={c} active={active === c.id} onClick={() => setActive(c.id)} />
            ))}
            {groupChannels.length > 0 && (
              <>
                <div className="ms-overline px-3 mt-4 mb-1">Groupes</div>
                {groupChannels.map((c) => (
                  <ChannelBtn key={c.id} channel={c} active={active === c.id} onClick={() => setActive(c.id)} />
                ))}
              </>
            )}
            {dmChannels.length > 0 && (
              <>
                <div className="ms-overline px-3 mt-4 mb-1">Messages directs</div>
                {dmChannels.map((c) => (
                  <ChannelBtn
                    key={c.id}
                    channel={c}
                    active={active === c.id}
                    onClick={() => setActive(c.id)}
                  />
                ))}
              </>
            )}
          </div>
        </aside>

        <section className="md:col-span-9 flex flex-col">
          {currentChannel && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
              <div className="flex items-center gap-2">
                {currentChannel.is_dm ? (
                  <img
                    src={currentChannel.avatar}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : currentChannel.icon === "lock" ? (
                  <Lock className="h-4 w-4 text-[#475569]" />
                ) : (
                  <Hash className="h-4 w-4 text-[#475569]" />
                )}
                <h3 className="text-base font-bold text-[#071B34]">{currentChannel.name}</h3>
                {!currentChannel.is_dm && (
                  <span className="text-xs text-[#475569]">{currentChannel.members} membres</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                  <Phone className="h-4 w-4 text-[#475569]" />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                  <Video className="h-4 w-4 text-[#475569]" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-sm text-[#475569] py-12">
                Pas encore de message. Lancez la discussion !
              </div>
            )}
            {messages.map((m) => {
              const isMe = m.author_id === me?.id;
              const author = findEmployee(m.author_id);
              return (
                <div key={m.id} className={`flex items-end gap-3 ${isMe ? "justify-end" : ""}`}>
                  {!isMe && (
                    <img src={author?.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  )}
                  <div className={`max-w-md ${isMe ? "items-end" : ""}`}>
                    {!isMe && (
                      <div className="text-xs font-semibold text-[#071B34] mb-1">
                        {author?.first_name} {author?.last_name}
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm ${
                        isMe
                          ? "bg-[#3BA4FF] text-white rounded-br-md"
                          : "bg-[#F4F7FA] text-[#071B34] rounded-bl-md"
                      }`}
                    >
                      {m.content}
                    </div>
                    <div className={`text-[10px] text-[#475569] mt-1 ${isMe ? "text-right" : ""}`}>
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

          <form onSubmit={send} className="border-t border-[#071B34]/5 p-3 flex items-center gap-2">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <Paperclip className="h-4 w-4 text-[#475569]" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message dans ${currentChannel?.is_dm ? "" : "#"}${currentChannel?.name || ""}`}
              data-testid="msg-input"
              className="ms-input flex-1"
            />
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
              <Smile className="h-4 w-4 text-[#475569]" />
            </button>
            <button type="submit" data-testid="send-msg" className="ms-btn-primary !px-4">
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
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-lg w-full p-6">
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
            <div className="relative mb-3">
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
            <div className="max-h-96 overflow-y-auto space-y-1">
              {employeeOptions.map((e) => (
                <button
                  key={e.id}
                  onClick={() => startDM(e.id)}
                  data-testid={`pick-${e.id}`}
                  className="flex items-center gap-3 w-full rounded-xl hover:bg-[#F4F7FA] p-2 text-left transition-colors"
                >
                  <img src={e.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#071B34]">
                      {e.first_name} {e.last_name}
                    </div>
                    <div className="text-xs text-[#475569]">{e.role}</div>
                  </div>
                  <span
                    className={`h-2 w-2 rounded-full ${
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
          <div onClick={(e) => e.stopPropagation()} className="ms-card max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
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
            <div className="space-y-3">
              <div>
                <label className="ms-overline">Nom du groupe</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  data-testid="group-name"
                  placeholder="Ex. Équipe Karting weekend"
                  className="ms-input mt-2"
                />
              </div>
              <div>
                <label className="ms-overline">Membres ({groupMembers.length} sélectionnés)</label>
                <div className="relative mt-2 mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
                  <input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="ms-input pl-10"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl border border-[#071B34]/5 p-2">
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
                          className="h-4 w-4 accent-[#3BA4FF]"
                        />
                        <img src={e.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#071B34]">
                            {e.first_name} {e.last_name}
                          </div>
                          <div className="text-[11px] text-[#475569]">{e.role}</div>
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
                className="ms-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Créer le groupe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelBtn({ channel, active, onClick }) {
  const Icon = channel.icon === "lock"
    ? Lock
    : channel.is_dm
    ? User
    : channel.is_group
    ? Users
    : Hash;
  return (
    <button
      onClick={onClick}
      data-testid={`channel-${channel.id}`}
      className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-[#3BA4FF]/12 text-[#071B34] font-semibold"
          : "text-[#475569] hover:bg-[#071B34]/5"
      }`}
    >
      {channel.is_dm ? (
        <img src={channel.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      <span className="flex-1 text-left truncate">{channel.name}</span>
      {channel.unread > 0 && (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white px-1">
          {channel.unread}
        </span>
      )}
    </button>
  );
}
