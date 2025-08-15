import React, { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (location.pathname === "/" || location.pathname === "/dashboard") return "dashboard";
    if (location.pathname === "/calls") return "calls";
    return "dashboard";
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    switch (value) {
      case "dashboard":
        navigate("/dashboard");
        break;
      case "calls":
        navigate("/calls");
        break;
      default:
        navigate("/dashboard");
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-slate-100 p-6">
          <div className="mb-6">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-[400px]">
              <TabsList>
                <TabsTrigger value="dashboard">Дашборд</TabsTrigger>
                <TabsTrigger value="calls">Таблица звонков</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
