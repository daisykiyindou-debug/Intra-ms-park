import { X, Check, Bell, FileText, MessageCircle, Calendar, Megaphone, CheckCircle2, Cake, Lightbulb } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { api } from "@/lib/api";
import { notifyLiveRefresh } from "@/hooks/useLiveData";

const icons = {
  "check-circle": CheckCircle2,
  calendar: Calendar,
  megaphone: Megaphone,
  "file-text": FileText,
  "message-circle": MessageCircle,
  cake: Cake,
  lightbulb: Lightbulb,
  bell: Bell,
};

export default function NotificationsDrawer({ open, onClose }) {
  const { notifications, refreshNotifications } = useApp();
  const navigate = useNavigate();
  // Only show UNREAD notifications — opening one removes it from the list
  const visible = notifications.filter((n) => !n.read);

  const markAll = async () => {
    await api.post("/notifications/read-all");
    await refreshNotifications();
    notifyLiveRefresh(["notifications"]);
  };

  const openNotification = async (n) => {
    // Optimistic close + navigate first for snappy UX
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        /* ignore — still navigate */
      }
    }
    await refreshNotifications();
    notifyLiveRefresh(["notifications"]);
    onClose?.();
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <>
      {open && (
        <button
          aria-label="Fermer notifications"
          onClick={onClose}
          data-testid="notif-overlay"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        />
      )}
      <aside
        data-testid="notif-drawer"
        className={`fixed right-0 top-0 z-50 h-screen w-full max-w-md transform bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 h-20 border-b border-[#071B34]/5">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#3BA4FF]" />
            <h2 className="text-lg font-bold text-[#071B34]">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAll}
              data-testid="mark-all-read"
              className="text-xs font-semibold text-[#3BA4FF] hover:underline"
            >
              Tout marquer lu
            </button>
            <button
              onClick={onClose}
              data-testid="close-notif"
              className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#071B34]/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto h-[calc(100vh-5rem)] p-4 space-y-2">
          {visible.length === 0 && (
            <div className="text-center py-12 text-[#475569]">
              <Bell className="h-10 w-10 mx-auto mb-3 text-[#94A3B8]" />
              <div className="text-sm font-semibold text-[#071B34]">Tout est à jour</div>
              <div className="text-xs mt-1">Aucune nouvelle notification.</div>
            </div>
          )}
          {visible.map((n) => {
            const Icon = icons[n.icon] || Bell;
            const text = n.content || n.message || "";
            const clickable = Boolean(n.link);
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                data-testid={`notif-${n.id}`}
                title={clickable ? "Ouvrir" : "Marquer comme lu"}
                className="group w-full text-left flex gap-3 rounded-2xl p-4 transition-all duration-200 bg-[#3BA4FF]/[0.06] hover:bg-[#3BA4FF]/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3BA4FF]/15">
                  <Icon className="h-4.5 w-4.5 text-[#3BA4FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-[#071B34]">{n.title}</div>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3BA4FF]" />
                  </div>
                  <div className="text-xs text-[#475569] mt-0.5 line-clamp-2">{text}</div>
                  {clickable && (
                    <div className="text-[10px] font-semibold text-[#3BA4FF] mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      Ouvrir →
                    </div>
                  )}
                </div>
                <Check className="h-4 w-4 text-[#3BA4FF] opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
