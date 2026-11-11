import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  LogOut,
  Menu,
  Plus,
} from "lucide-react";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResponsiveDialog } from "@/components/dialogs";
import { Logo } from "@/components/shared";
import { initials, signOutAndLeave, useMyProfile, ROLE_LABELS, type AppRole, type MyProfile } from "./session";
import { mobileTabs, SECTION_LABELS, titleForPath, visibleNav, type NavSection } from "./nav";
import { listReviewQueue } from "@/features/review/api";

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {ROLE_LABELS[role]}
    </Badge>
  );
}

function AccountBlock({ profile, onSignOut }: { profile: MyProfile; onSignOut: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border pt-3">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
          {initials(profile)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{profile.full_name || profile.email}</p>
        <p className="truncate text-xs text-sidebar-foreground/60">{profile.email}</p>
        <RoleBadge role={profile.role} />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onSignOut}
        aria-label="Abmelden"
        className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}

function SidebarNav({ role, collapsed, reviewCount = 0 }: { role: AppRole; collapsed: boolean; reviewCount?: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = visibleNav(role);
  const sections: NavSection[] = ["arbeit", "konto", "verwaltung"];
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
      {sections.map((section) => {
        const list = items.filter((i) => i.section === section);
        if (list.length === 0) return null;
        return (
          <div key={section}>
            {!collapsed && (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                {SECTION_LABELS[section]}
              </p>
            )}
            <ul className="space-y-0.5">
              {list.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to as string}
                      title={item.label}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <item.icon className="size-5 shrink-0" aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.to === "/ausbilder" && reviewCount > 0 && <Badge variant="secondary" className="ml-auto">{reviewCount}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ShortcutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Tastenkürzel" description="Diese Kürzel funktionieren am PC.">
      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between gap-4">
          <span>Neuer Bericht</span>
          <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">N</kbd>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span>Suche</span>
          <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">/</kbd>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span>Diese Übersicht</span>
          <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">?</kbd>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        „Neuer Bericht“ und „Suche“ werden aktiv, sobald die Berichte-Seiten aus dem nächsten Baustein existieren.
      </p>
    </ResponsiveDialog>
  );
}

export function AppShell() {
  const { data: profile, isLoading } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const { data: reviewCount = 0 } = useQuery({
    queryKey: ["review", "queue-count"],
    queryFn: async () => (await listReviewQueue()).length,
    enabled: !!profile && profile.role !== "azubi",
    refetchInterval: 60_000,
  });
  const title = titleForPath(pathname);
  const tabs = useMemo(() => (profile ? mobileTabs(profile.role) : []), [profile]);

  const signOut = () => void signOutAndLeave(queryClient, (opts) => void navigate(opts));

  // Tastenkürzel am PC: ? öffnet die Übersicht. N und / folgen mit den Berichte-Seiten.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const bell = <NotificationBell userId={profile.id} />;

  const avatarMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-9 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-label="Konto-Menü">
          {initials(profile)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{profile.full_name || profile.email}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{profile.email}</p>
          <div className="mt-1">
            <RoleBadge role={profile.role} />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profil">Mein Profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4" /> Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Seitenleiste ab Tablet */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex",
          collapsed ? "w-[72px]" : "w-[264px]",
          "transition-[width] duration-200",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-2")}>
          {collapsed ? (
            <img src="/favicon.png" alt="Azuvera" className="size-8 rounded-lg" />
          ) : (
            <span className="inline-flex items-center gap-2">
              <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
              <span className="text-lg font-bold tracking-tight text-sidebar-foreground">Azuvera</span>
            </span>
          )}
        </div>
        <SidebarNav role={profile.role} collapsed={collapsed} reviewCount={reviewCount} />
        <div className="space-y-2 p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            className="w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:hidden"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            {!collapsed && "Einklappen"}
          </Button>
          {!collapsed && <AccountBlock profile={profile} onSignOut={signOut} />}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Abmelden"
              className="mx-auto flex text-sidebar-foreground/70 hover:bg-sidebar-accent"
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </aside>

      {/* Inhalt */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kopfzeile auf dem Handy */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden">
          <Link to="/dashboard" aria-label="Azuvera Start" className="rounded-md">
            <Logo size={26} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">{title}</h1>
          <div className="flex items-center gap-1">
            {bell}
            {avatarMenu}
          </div>
        </header>

        {/* Kopfzeile ab Tablet */}
        <header className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b bg-background/90 px-6 py-3 backdrop-blur md:flex">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setShortcutsOpen(true)} aria-label="Tastenkürzel">
              <Keyboard className="size-5" />
            </Button>
            {bell}
            {avatarMenu}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
          <Outlet />
        </main>

        {/* Tab-Leiste auf dem Handy */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Hauptnavigation"
        >
          <div className="grid grid-cols-5">
            {tabs.map((tab, i) =>
              tab === null ? (
                <button
                  key="mehr"
                  onClick={() => setMoreOpen(true)}
                  className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
                >
                  <Menu className="size-5" aria-hidden />
                  Mehr
                </button>
              ) : tab.to ? (
                <Link
                  key={tab.label}
                  to={tab.to}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
                    pathname === tab.to ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="relative"><tab.icon className="size-5" aria-hidden />{tab.to === "/ausbilder" && reviewCount > 0 && <span className="absolute -right-3 -top-2 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{reviewCount > 99 ? "99+" : reviewCount}</span>}</span>
                  {tab.label}
                </Link>
              ) : tab.accent ? (
                <div key={tab.label} className="flex items-center justify-center">
                  <span
                    className="grid size-12 -translate-y-2 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-elegant opacity-40"
                    title="Neuer Bericht (folgt mit dem Berichte-Baustein)"
                    aria-disabled
                  >
                    <Plus className="size-6" aria-hidden />
                  </span>
                </div>
              ) : (
                <span key={i} aria-hidden />
              ),
            )}
          </div>
        </nav>
      </div>

      {/* „Mehr“-Sheet auf dem Handy */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-sidebar text-sidebar-foreground">
          <SheetHeader>
            <SheetTitle className="text-sidebar-foreground">Menü</SheetTitle>
          </SheetHeader>
          <div onClick={() => setMoreOpen(false)}>
            <SidebarNav role={profile.role} collapsed={false} reviewCount={reviewCount} />
          </div>
          <div className="px-2 pb-4">
            <AccountBlock profile={profile} onSignOut={signOut} />
          </div>
        </SheetContent>
      </Sheet>

      <ShortcutDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
