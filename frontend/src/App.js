import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
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
import Contacts from "@/pages/Contacts";
import Profil from "@/pages/Profil";
import ManagementShell from "@/pages/Management";
import Payslip from "@/pages/Payslip";
import NewsDetail, { EventDetail } from "@/pages/NewsDetail";
import PublicForm from "@/pages/PublicForm";
import NewslettersList, { NewsletterDetail, NewsletterEditor } from "@/pages/Newsletters";
import GalerieList, { GalerieAlbum } from "@/pages/Galerie";
import NotesDeFrais from "@/pages/NotesDeFrais";
import { HRDocView } from "@/pages/HRDocs";

function ProtectedShell() {
  const isOut = typeof window !== "undefined" && localStorage.getItem("ms_logged_out") === "1";
  if (isOut) return <Navigate to="/login" replace />;
  return <Layout />;
}

function App() {
  const [me, setMe] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [notifications, setNotifications] = useState([]);

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

  // Global live sync: when any mutation fires notifyLiveRefresh(["me"|"notifications"...])
  // the AppContext-level data reloads instantly, on this tab and other tabs.
  useLiveData(refreshMe, ["me"]);
  useLiveData(refreshEmployees, ["employees", "me"]);
  useLiveData(refreshNotifications, ["notifications"]);

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
              <Route path="/newsletters/:id" element={<NewsletterDetail />} />
              <Route path="/galerie" element={<GalerieList />} />
              <Route path="/galerie/:id" element={<GalerieAlbum />} />
              <Route path="/notes-de-frais" element={<NotesDeFrais />} />
              <Route path="/documents/rediger/:id" element={<HRDocView />} />
              <Route path="/avantages" element={<Avantages />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/profil" element={<Profil />} />
              <Route path="/management/*" element={<ManagementShell />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </AppContext.Provider>
  );
}

export default App;
