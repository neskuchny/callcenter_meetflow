import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

const navItems = [
  { 
    name: "Звонки", 
    path: "/calls", 
    icon: FileText 
  }
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <div className="h-full w-64 border-r bg-slate-50">
      <div className="flex h-full flex-col">
        <div className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    location.pathname === item.path
                      ? "bg-primary text-primary-foreground"
                      : "text-slate-700 hover:bg-slate-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              АП
            </div>
            <div>
              <div className="font-medium">Администратор</div>
              <div className="text-xs text-slate-500">admin@example.com</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppSidebar;
