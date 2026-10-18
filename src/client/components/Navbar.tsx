import React from 'react';
import { useAuth } from '../authContext.js';
import {
  ShieldAlert,
  Plus,
  LayoutDashboard,
  Layers,
  LogOut,
  Building,
  KeyRound,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'dashboard' | 'items';
  setCurrentTab: (tab: 'dashboard' | 'items') => void;
  onOpenCreate: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenCreate,
}) => {
  const { user, logout, loginAsDemo } = useAuth();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-red-950 border border-red-800/80 flex items-center justify-center text-red-400 font-bold shadow-sm shadow-red-950/50">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  NEWTONITE
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    Ops Under Pressure
                  </span>
                </span>
                <p className="text-[11px] text-zinc-400 hidden sm:block">
                  High-Concurrency Operational State Engine
                </p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-zinc-800">
              <button
                onClick={() => setCurrentTab('dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  currentTab === 'dashboard'
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Triage Dashboard
              </button>
              <button
                onClick={() => setCurrentTab('items')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  currentTab === 'items'
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Work Items
                <span className="ml-1 text-[10px] font-mono bg-zinc-800 px-1 rounded text-zinc-400">
                  3,000+
                </span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800">
              <span className="text-[11px] text-zinc-400 px-2 font-mono flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-zinc-400" />
                Switch:
              </span>
              <button
                onClick={() => loginAsDemo('Admin')}
                className="px-2 py-0.5 text-xs rounded hover:bg-zinc-800 text-purple-400 hover:text-purple-300 font-medium"
                title="Switch to Alex Vance (Admin)"
              >
                Admin
              </button>
              <button
                onClick={() => loginAsDemo('Lead')}
                className="px-2 py-0.5 text-xs rounded hover:bg-zinc-800 text-blue-400 hover:text-blue-300 font-medium"
                title="Switch to Sarah Chen (Lead)"
              >
                Lead
              </button>
              <button
                onClick={() => loginAsDemo('Member')}
                className="px-2 py-0.5 text-xs rounded hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 font-medium"
                title="Switch to Dave Miller (Member)"
              >
                Member
              </button>
              <button
                onClick={() => loginAsDemo('Viewer')}
                className="px-2 py-0.5 text-xs rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-medium"
                title="Switch to Sam Taylor (Viewer)"
              >
                Viewer
              </button>
            </div>

            <button
              onClick={onOpenCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Incident / Task</span>
            </button>

            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-zinc-200 leading-tight">
                    {user.name.split(' ')[0]}
                  </div>
                  <div className="text-[10px] text-zinc-400 flex items-center justify-end gap-1 font-mono">
                    <Building className="w-2.5 h-2.5" />
                    {user.memberships.length} {user.memberships.length === 1 ? 'team' : 'teams'}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-bold text-zinc-300">
                  {user.name.charAt(0)}
                </div>

                <button
                  onClick={logout}
                  className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="md:hidden flex items-center gap-2 py-2 border-t border-zinc-900 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-3 py-1 text-xs rounded font-medium ${
              currentTab === 'dashboard'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentTab('items')}
            className={`px-3 py-1 text-xs rounded font-medium ${
              currentTab === 'items'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400'
            }`}
          >
            All Items (3k)
          </button>
          <div className="ml-auto flex items-center gap-1 text-[11px]">
            <button onClick={() => loginAsDemo('Admin')} className="px-1 text-purple-400">Admin</button>
            <button onClick={() => loginAsDemo('Lead')} className="px-1 text-blue-400">Lead</button>
            <button onClick={() => loginAsDemo('Member')} className="px-1 text-emerald-400">Member</button>
            <button onClick={() => loginAsDemo('Viewer')} className="px-1 text-zinc-400">Viewer</button>
          </div>
        </div>
      </div>
    </header>
  );
};
