import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3, Eye, LogOut, Settings, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/use-alerts";
import { TriggeredAlertsBanner } from "@/components/TriggeredAlertsBanner";

const navItems = [
  { to: "/", label: "Portfolio", icon: BarChart3 },
  { to: "/watchlist", label: "Watchlist", icon: Eye },
  { to: "/screens", label: "Screens", icon: FileSearch },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const { unacknowledgedAlerts, acknowledgeAlert, acknowledgeAllAlerts } = useAlerts();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <TrendingUp className="h-5 w-5 text-sidebar-primary" />
          <span className="font-semibold">Portfolio Manager</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3 space-y-1">
          <div className="flex items-center justify-between px-3">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <TriggeredAlertsBanner
          alerts={unacknowledgedAlerts}
          onDismiss={acknowledgeAlert}
          onDismissAll={acknowledgeAllAlerts}
        />
        {children}
      </main>
    </div>
  );
}
