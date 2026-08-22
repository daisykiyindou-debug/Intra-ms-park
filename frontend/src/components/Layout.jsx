import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import NotificationsDrawer from "@/components/NotificationsDrawer";
import MeetingInviteBanner from "@/components/MeetingInviteBanner";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <MeetingInviteBanner />
      <div className="md:pl-72">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onNotifClick={() => setNotifOpen(true)}
        />
        <main className="px-4 md:px-8 lg:px-10 py-6 md:py-8" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
