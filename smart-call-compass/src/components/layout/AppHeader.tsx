
import React from "react";
import { Bell, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AppHeader = () => {
  return (
    <header className="border-b bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center">
          <h1 className="text-xl font-bold text-primary mr-6">Smart Call Compass</h1>
          <div className="hidden md:flex relative max-w-md flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск звонков..."
              className="pl-8 bg-slate-50"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon">
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
            АП
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
