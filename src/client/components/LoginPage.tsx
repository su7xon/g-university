import React, { useState } from 'react';
import { useAuth } from '../authContext.js';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, loginAsDemo, isLoading } = useAuth();
  const [email, setEmail] = useState('alex.admin@newtonite.internal');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Check credentials.');
    }
  };

  const handleQuickDemo = async (role: 'Admin' | 'Lead' | 'Member' | 'Viewer') => {
    setError(null);
    try {
      await loginAsDemo(role);
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-xl bg-red-950 border border-red-800 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/60">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
          NEWTONITE
        </h1>
        <p className="text-xs text-zinc-400 uppercase tracking-widest font-mono">
          Operations Under Pressure
        </p>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          High-integrity operational state engine designed to replace chaotic chat/sheets with strict concurrency guarantees.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-zinc-900/60 border border-zinc-800 py-8 px-6 shadow-xl rounded-xl sm:px-10 space-y-6">
          
          {error && (
            <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-mono text-zinc-400 uppercase">
              1-Click Demo Evaluation Personas
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickDemo('Admin')}
                disabled={isLoading}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-purple-600/80 text-left transition group"
              >
                <div className="font-semibold text-purple-400 group-hover:text-purple-300">Admin</div>
                <div className="text-[10px] text-zinc-400 font-mono">Alex Vance • 4 Teams</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('Lead')}
                disabled={isLoading}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-blue-600/80 text-left transition group"
              >
                <div className="font-semibold text-blue-400 group-hover:text-blue-300">Team Lead</div>
                <div className="text-[10px] text-zinc-400 font-mono">Sarah Chen • Infra</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('Member')}
                disabled={isLoading}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-emerald-600/80 text-left transition group"
              >
                <div className="font-semibold text-emerald-400 group-hover:text-emerald-300">Member</div>
                <div className="text-[10px] text-zinc-400 font-mono">Dave Miller • SRE</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('Viewer')}
                disabled={isLoading}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-left transition group"
              >
                <div className="font-semibold text-zinc-400 group-hover:text-zinc-200">Viewer</div>
                <div className="text-[10px] text-zinc-400 font-mono">Sam Taylor • Audit</div>
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-zinc-900 text-zinc-400 font-mono text-[10px] uppercase">
                Or Sign In With Email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">EMAIL ADDRESS</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-3 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">PASSWORD</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 font-mono">Default: password123</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Operations Console'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
