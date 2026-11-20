import React from 'react';

export function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#E5ECF6] shadow-xs space-y-3 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-3 bg-slate-200 rounded-md w-24" />
        <div className="w-8 h-8 rounded-xl bg-slate-200" />
      </div>
      <div className="h-8 bg-slate-200 rounded-md w-16 my-2" />
      <div className="h-3 bg-slate-100 rounded-md w-32" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs animate-pulse">
      <div className="p-4 bg-slate-50 border-b flex gap-4">
        <div className="h-4 bg-slate-200 rounded w-1/4" />
        <div className="h-4 bg-slate-200 rounded w-1/6" />
        <div className="h-4 bg-slate-200 rounded w-1/6" />
        <div className="h-4 bg-slate-200 rounded w-1/4" />
      </div>
      <div className="divide-y divide-slate-100">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-2 w-1/3">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
            <div className="h-6 bg-slate-200 rounded-full w-20" />
            <div className="h-6 bg-slate-200 rounded-full w-16" />
            <div className="h-4 bg-slate-200 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
