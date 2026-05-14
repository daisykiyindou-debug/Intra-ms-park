import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import { AppContext } from "@/contexts/AppContext";
import { api } from "@/lib/api";

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

  const findEmployee = (id) => employees.find((e) => e.id === id);

  return (
    <AppContext.Provider
      value={{
        me,
        employees,
        notifications,
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
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/avantages" element={<Avantages />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/profil" element={<Profil />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </AppContext.Provider>
  );
}

export default App;
