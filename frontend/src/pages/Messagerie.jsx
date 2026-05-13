import { useEffect, useRef, useState } from "react";
import { Hash, Lock, Send, Smile, Paperclip, Phone, Video, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

export default function Messagerie() {
  const { me, findEmployee } = useApp();
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState("ch-accueil");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get("/channels").then((r) => setChannels(r.data));
  }, []);

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

  const currentChannel = channels.find((c) => c.id === active);

  return (
    <div className="space-y-4 ms-fade-up">
      <div>
        <div className="ms-overline">Messagerie</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#071B34] mt-1">Canaux d'équipe</h1>
      </div>

      <div className="ms-card overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[70vh]">
        {/* Channels list */}
        <aside className="md:col-span-3 border-r border-[#071B34]/5 bg-[#F8FAFC] flex flex-col">
          <div className="p-3 border-b border-[#071B34]/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
              <input
                placeholder="Rechercher canal…"
                data-testid="search-channels"
                className="ms-input pl-9 text-sm"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
            {channels.map((c) => {
              const isActive = c.id === active;
              const Icon = c.icon === "lock" ? Lock : Hash;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  data-testid={`channel-${c.id}`}
                  className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-[#3BA4FF]/12 text-[#071B34] font-semibold"
                      : "text-[#475569] hover:bg-[#071B34]/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{c.name}</span>
                  {c.unread > 0 && (
                    <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white px-1">
                      {c.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Conversation */}
        <section className="md:col-span-9 flex flex-col">
          {currentChannel && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#071B34]/5">
              <div className="flex items-center gap-2">
                {currentChannel.icon === "lock" ? (
                  <Lock className="h-4 w-4 text-[#475569]" />
                ) : (
                  <Hash className="h-4 w-4 text-[#475569]" />
                )}
                <h3 className="text-base font-bold text-[#071B34]">{currentChannel.name}</h3>
                <span className="ms-chip bg-[#F4F7FA] text-[#475569] !uppercase-none">
                  {currentChannel.members} membres
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button data-testid="call-audio" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                  <Phone className="h-4 w-4 text-[#475569]" />
                </button>
                <button data-testid="call-video" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5">
                  <Video className="h-4 w-4 text-[#475569]" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-sm text-[#475569] py-12">
                Pas encore de message dans ce canal.
              </div>
            )}
            {messages.map((m) => {
              const isMe = m.author_id === me?.id;
              const author = findEmployee(m.author_id);
              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-3 ${isMe ? "justify-end" : ""}`}
                  data-testid={`msg-${m.id}`}
                >
                  {!isMe && (
                    <img
                      src={author?.avatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
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
              placeholder={`Message dans #${currentChannel?.name || ""}`}
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
    </div>
  );
}
