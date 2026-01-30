import React from 'react';
import { Brain } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Brain className="w-12 h-12 text-cyan-400" />
            <h1 className="text-4xl font-bold text-white">Synapse</h1>
          </div>
          <p className="text-slate-400 text-sm">Your Personal Knowledge Graph</p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-lg p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-slate-400 text-sm mb-6">{subtitle}</p>
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Powered by Supabase & Google Gemini AI
        </p>
      </div>
    </div>
  );
};
