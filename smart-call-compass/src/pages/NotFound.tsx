
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md p-8">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-2xl font-semibold text-slate-800 mb-6">Страница не найдена</p>
        <p className="text-slate-600 mb-8">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <Button asChild className="gap-2">
          <a href="/">
            <FileText className="h-4 w-4" />
            Вернуться на главную
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
