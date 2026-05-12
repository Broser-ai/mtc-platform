"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard",  icon: "◉",  label: "Dashboard",   group: "main" },
  { href: "/chat",       icon: "◮",  label: "Chat",        group: "main" },
  { href: "/projects",   icon: "△",  label: "Projects",    group: "main" },
  { href: "/executions", icon: "▫",  label: "Executions",  group: "main" },
  { href: "/browse/departments", icon: "◦", label: "Departments", group: "browse" },
  { href: "/browse/masters",     icon: "◦", label: "Masters",     group: "browse" },
  { href: "/browse/skills",      icon: "◦", label: "Skills",      group: "browse" },
  { href: "/browse/bundles",     icon: "◦", label: "Output Bundles", group: "browse" },
  { href: "/browse/workflows",   icon: "◦", label: "Workflows",   group: "browse" },
  { href: "/browse/connectors",  icon: "◦", label: "Connectors",  group: "browse" },
  { href: "/settings",   icon: "◠",  label: "Settings",    group: "footer" },
];

export function Sidebar({ stats }: { stats?: Record<string, number> }) {
  const pathname = usePathname();

  const mainItems = NAV.filter(n => n.group === "main");
  const browseItems = NAV.filter(n => n.group === "browse");
  const footerItems = NAV.filter(n => n.group === "footer");

  const NavLink = ({ item, count }: { item: typeof NAV[0]; count?: number }) => {
    const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
    return (
      <Link
        href={item.href}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
          active
            ? "bg-indigo-600/20 text-white"
            : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
        }`}
      >
        <span className={`text-xs ${active ? "text-indigo-400" : "text-gray-600"}`}>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {typeof count === "number" && (
          <span className={`text-[10px] font-mono ${active ? "text-indigo-300" : "text-gray-600"}`}>
            {count}
          </span>
        )}
      </Link>
    );
  };

  const statForLabel = (label: string): number | undefined => {
    if (!stats) return undefined;
    const map: Record<string, string> = {
      "Departments": "departments",
      "Masters": "masters",
      "Skills": "skills",
      "Output Bundles": "bundles",
      "Workflows": "workflows",
      "Connectors": "connectors",
    };
    return stats[map[label]];
  };

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-800 bg-[#0a0a0f] shrink-0">
      {/* Logo / brand */}
      <div className="flex items-center gap-3 border-b border-gray-800 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white">
          M
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">MTC</p>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">Master Team Console</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {mainItems.map(item => <NavLink key={item.href} item={item} />)}
        </div>

        <div>
          <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-gray-600">Browse Catalog</p>
          <div className="space-y-1">
            {browseItems.map(item => (
              <NavLink key={item.href} item={item} count={statForLabel(item.label)} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-3 py-3 space-y-1">
        {footerItems.map(item => <NavLink key={item.href} item={item} />)}
      </div>
    </aside>
  );
}
