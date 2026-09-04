import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import WelcomePopup from "@/components/WelcomePopup";
import OnboardingTour from "@/components/OnboardingTour";
import TodayEventsPopup from "@/components/TodayEventsPopup";
import { AppContext } from "@/contexts/AppContext";
import { api } from "@/lib/api";
import useLiveData from "@/hooks/useLiveData";

import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import PointsRepas from "@/pages/PointsRepas";
import Restaurant from "@/pages/Restaurant";
import Planning from "@/pages/Planning";
import Badgeage from "@/pages/Badgeage";
import Demandes from "@/pages/Demandes";
import Actualites from "@/pages/Actualites";
import Messagerie from "@/pages/Messagerie";
import Documents from "@/pages/Documents";
import Agenda from "@/pages/Agenda";
import Avantages from "@/pages/Avantages";
import { AvantagesCheckout, AvantagesOrders, AvantagesTicket } from "@/pages/AvantagesShop";
import Contacts from "@/pages/Contacts";
import Profil from "@/pages/Profil";
import ManagementShell from "@/pages/Management";
import Payslip from "@/pages/Payslip";
import NewsDetail, { EventDetail } from "@/pages/NewsDetail";
import PublicForm from "@/pages/PublicForm";
import NewslettersList, { NewsletterDetail, NewsletterEditor, NewsletterSent, NewsletterStats } from "@/pages/Newsletters";
import Salles from "@/pages/Salles";
import SalleReserver from "@/pages/SalleReserver";
import MesReservations from "@/pages/MesReservations";
import GalerieList, { GalerieAlbum } from "@/pages/Galerie";
import NotesDeFrais from "@/pages/NotesDeFrais";
import { HRDocView } from "@/pages/HRDocs";
import FormationsList from "@/pages/Formations";
import SupportITList, { TicketDetail, CentreAide } from "@/pages/Support";
import Ideas, { IdeaDetail, IdeaSubmit } from "@/pages/Ideas";
import Birthdays from "@/pages/Birthdays";
import BirthdayGate from "@/components/BirthdayGate";

function ProtectedShell() {
  const isOut = typeof window !== "undefined" && localStorage.getItem("ms_logged_out") === "1";
  if (isOut) return <Navigate to="/login" replace />;
  return (
    <>
      <Layout />
      <WelcomePopup />
      <OnboardingTour />
      <TodayEventsPopup />
    </>
  );
}

function App() {
  const [me, setMe] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem("adminMode") !== "false");

  const toggleAdminMode = () => {
    setAdminMode((v) => {
      const nv = !v;
      localStorage.setItem("adminMode", String(nv));
      return nv;
    });
  };

  const refreshMe = async () => {
    const { data } = await api.get("/me");
    setMe(data);
  };
  const refreshEmployees = async () => {
    const { data } = await api.get("/employees");
    setEmployees(data);
  };
  const refreshNotifications = async () => {
    const { data } = await api.get("/notifications");
    setNotifications(data);
  };

  useEffect(() => {
    refreshMe();
    refreshEmployees();
    refreshNotifications();
  }, []);

  // Live presence: ping every 60s while the tab is visible, and once on mount.
  // Refresh employees every 60s too so the sidebar/chat header reflect online
  // status changes without requiring a page reload.
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      api.post("/presence/ping").catch(() => {});
    };
    ping();
    const t1 = setInterval(ping, 60_000);
    const t2 = setInterval(() => {
      if (document.visibilityState === "visible") refreshEmployees();
    }, 60_000);
    // Poll notifications every 15s so an incoming message triggers the red
    // header badge (and messagerie unread counters) without any user action.
    const t3 = setInterval(() => {
      if (document.visibilityState === "visible") refreshNotifications();
    }, 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        ping();
        refreshNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Global live sync: when any mutation fires notifyLiveRefresh(["me"|"notifications"...])
  // the AppContext-level data reloads instantly, on this tab and other tabs.
  useLiveData(refreshMe, ["me"]);
  useLiveData(refreshEmployees, ["employees", "me"]);
  useLiveData(refreshNotifications, ["notifications"]);

  // Legacy DOM event bridge — pages (Messagerie, MeetingInviteBanner…)
  // dispatch `ms-notifications-refresh` after they mutate the read state
  // of message notifications. This ensures the header envelope badge
  // clears the moment a conversation is opened.
  useEffect(() => {
    const onRefresh = () => refreshNotifications();
    window.addEventListener("ms-notifications-refresh", onRefresh);
    return () => window.removeEventListener("ms-notifications-refresh", onRefresh);
  }, []);

  const findEmployee = (id) => employees.find((e) => e.id === id);

  return (
    <AppContext.Provider
      value={{
        me,
        employees,
        notifications,
        refreshMe,
        refreshEmployees,
        refreshNotifications,
        findEmployee,
        adminMode,
        toggleAdminMode,
      }}
    >
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/points-repas" element={<PointsRepas />} />
              <Route path="/restaurant" element={<Restaurant />} />
              <Route path="/rh/planning" element={<Planning />} />
              <Route path="/rh/badgeage" element={<Badgeage />} />
              <Route path="/rh/demandes" element={<Demandes />} />
              <Route path="/actualites" element={<Actualites />} />
              <Route path="/messagerie" element={<Messagerie />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/documents/payslip/:employeeId/:year/:month" element={<Payslip />} />
              <Route path="/actualites/:id" element={<NewsDetail />} />
              <Route path="/agenda/event/:id" element={<EventDetail />} />
              <Route path="/formulaires/:id" element={<PublicForm />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/newsletters" element={<NewslettersList />} />
              <Route path="/newsletters/new" element={<NewsletterEditor />} />
              <Route path="/newsletters/:id/edit" element={<NewsletterEditor />} />
              <Route path="/newsletters/:id/sent" element={<NewsletterSent />} />
              <Route path="/newsletters/:id/stats" element={<NewsletterStats />} />
              <Route path="/newsletters/:id" element={<NewsletterDetail />} />
              <Route path="/galerie" element={<GalerieList />} />
              <Route path="/galerie/:id" element={<GalerieAlbum />} />
              <Route path="/notes-de-frais" element={<NotesDeFrais />} />
              <Route path="/documents/rediger/:id" element={<HRDocView />} />
              <Route path="/formations" element={<FormationsList />} />
              <Route path="/support" element={<SupportITList />} />
              <Route path="/support/tickets/:id" element={<TicketDetail />} />
              <Route path="/aide" element={<CentreAide />} />
              <Route path="/avantages" element={<Avantages />} />
              <Route path="/salles" element={<Salles />} />
              <Route path="/salles/mes-reservations" element={<MesReservations />} />
              <Route path="/salles/:rid/reserver" element={<SalleReserver />} />
              <Route path="/avantages/checkout" element={<AvantagesCheckout />} />
              <Route path="/avantages/commandes" element={<AvantagesOrders />} />
              <Route path="/avantages/commandes/:oid/billet/:tid" element={<AvantagesTicket />} />
              <Route path="/idees" element={<Ideas />} />
              <Route path="/idees/nouveau" element={<IdeaSubmit />} />
              <Route path="/idees/:id" element={<IdeaDetail />} />
              <Route path="/anniversaires" element={<Birthdays />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/profil" element={<Profil />} />
              <Route path="/management/*" element={<ManagementShell />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <BirthdayGate />
        <Toaster position="top-right" richColors />
      </div>
    </AppContext.Provider>
  );
}

export default App;
