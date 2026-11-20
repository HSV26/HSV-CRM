import React, { useState } from 'react';
import { AlertCircle, RefreshCw, Key, Database } from 'lucide-react';
import { updateSupabaseConfig } from '../lib/supabase';

interface ErrorCardProps {
  title: string;
  error: string;
  isMissingTable: boolean;
  onRetry: () => void;
}

export default function ErrorCard({ title, error, isMissingTable, onRetry }: ErrorCardProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput && keyInput) {
      updateSupabaseConfig(urlInput, keyInput);
    }
  };

  const isFetchError = error.includes('Failed to fetch') || error.includes('NetworkError');

  return (
    <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-xs space-y-4">
      <div className="flex items-start space-x-3">
        <div className="p-2 rounded-xl bg-rose-50 text-rose-600 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1 w-full">
          <h3 className="text-sm font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">{title}</h3>
          
          {isFetchError ? (
            <p className="text-xs text-rose-700 font-medium">
              Could not connect to Supabase (Failed to fetch). Please check your Supabase URL and Anon Key configuration.
            </p>
          ) : isMissingTable ? (
            <p className="text-xs text-rose-700 font-medium">
              This table is missing in Supabase. Please run the CRM SQL migration script in your Supabase SQL Editor.
            </p>
          ) : (
            <p className="text-xs text-rose-600">Could not load data successfully.</p>
          )}

          <p className="text-[11px] text-slate-400 font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
            Error: {error}
          </p>
        </div>
      </div>

      {isFetchError && !showConfig && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-blue-900">
            <Key className="w-4 h-4 text-[#1D4ED8]" />
            <span>Need to configure your Supabase project credentials?</span>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="px-3 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold"
          >
            Configure Supabase
          </button>
        </div>
      )}

      {showConfig && (
        <form onSubmit={handleSaveConfig} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
          <h4 className="font-bold text-[#0A1F5C] flex items-center space-x-1.5">
            <Database className="w-4 h-4 text-[#1D4ED8]" />
            <span>Enter Supabase Credentials</span>
          </h4>
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Supabase Project URL</label>
            <input
              type="text"
              required
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-[11px]"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Supabase Anon Key</label>
            <input
              type="password"
              required
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="eyJhbGciOi..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-[11px]"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#1D4ED8] text-white rounded-lg font-semibold"
            >
              Save & Connect
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end">
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
