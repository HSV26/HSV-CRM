import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, getSourceBadgeStyle } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function SourcesReportView() {
  const [leadsState, setLeadsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [clientsState, setClientsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  
  const [dateRange, setDateRange] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLeadsState(prev => ({ ...prev, loading: true }));
    setClientsState(prev => ({ ...prev, loading: true }));

    const [leadsRes, clientsRes] = await Promise.all([
      safeQuery(async () => {
        const { data, error } = await supabase.from('leads').select('*');
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase.from('clients').select('*');
        return { data: data || [], error };
      }, [])
    ]);

    setLeadsState({ data: leadsRes.data, error: leadsRes.error, isMissingTable: leadsRes.isMissingTable, loading: false });
    setClientsState({ data: clientsRes.data, error: clientsRes.error, isMissingTable: clientsRes.isMissingTable, loading: false });
  };

  const filterDate = new Date();
  if (dateRange === 'MONTH') {
    filterDate.setMonth(filterDate.getMonth() - 1);
  } else if (dateRange === '3MONTHS') {
    filterDate.setMonth(filterDate.getMonth() - 3);
  }

  const leads = leadsState.data;
  const clients = clientsState.data;

  const filteredLeads = leads.filter(l => {
    if (dateRange === 'ALL') return true;
    if (!l.created_at) return true;
    return new Date(l.created_at) >= filterDate;
  });

  const sourceMap: Record<string, { totalLeads: number; wonLeads: number; totalWonValue: number; mrr: number }> = {};

  filteredLeads.forEach(l => {
    const src = l.source || l.lead_source || 'Other';
    if (!sourceMap[src]) sourceMap[src] = { totalLeads: 0, wonLeads: 0, totalWonValue: 0, mrr: 0 };
    sourceMap[src].totalLeads += 1;
    if (l.status === 'Won' || l.pipeline_stage === 'Won') {
      sourceMap[src].wonLeads += 1;
      sourceMap[src].totalWonValue += Number(l.deal_value) || 0;
    }
  });

  clients.forEach(c => {
    const src = c.source || 'Other';
    if (!sourceMap[src]) sourceMap[src] = { totalLeads: 0, wonLeads: 0, totalWonValue: 0, mrr: 0 };
    if (c.status === 'Active') {
      sourceMap[src].mrr += Number(c.monthly_fee) || 0;
    }
  });

  const sourceRows = Object.entries(sourceMap).map(([source, data]) => {
    const conversionRate = data.totalLeads > 0 ? ((data.wonLeads / data.totalLeads) * 100).toFixed(1) : '0.0';
    return { source, ...data, conversionRate };
  }).sort((a, b) => b.totalLeads - a.totalLeads);

  const totalLeadsCount = sourceRows.reduce((sum, r) => sum + r.totalLeads, 0);

  const loading = leadsState.loading || clientsState.loading;
  const error = leadsState.error || clientsState.error;
  const isMissingTable = leadsState.isMissingTable || clientsState.isMissingTable;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Lead Sources Performance Report</h1>
          <p className="text-sm text-slate-500">Analyze acquisition channels, conversion rates and generated revenue.</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-3 py-2 bg-white border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700 shadow-xs"
        >
          <option value="ALL">All Time</option>
          <option value="MONTH">Past 1 Month</option>
          <option value="3MONTHS">Past 3 Months</option>
        </select>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : error ? (
        <ErrorCard title="Sources Report" error={error} isMissingTable={isMissingTable} onRetry={fetchData} />
      ) : sourceRows.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-[#E5ECF6]">
          No lead source data available.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Bar Chart */}
          <div className="bg-white rounded-2xl p-6 border border-[#E5ECF6] shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Leads Distribution by Channel</h2>
            <div className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceRows}>
                  <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => [`${val} leads`, 'Total Leads']} />
                  <Bar dataKey="totalLeads" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-3.5 px-4">Source Channel</th>
                  <th className="py-3.5 px-4">Total Leads</th>
                  <th className="py-3.5 px-4">Won Deals</th>
                  <th className="py-3.5 px-4">Conversion Rate</th>
                  <th className="py-3.5 px-4">Total Won Value</th>
                  <th className="py-3.5 px-4 text-right">Current MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceRows.map(row => (
                  <tr key={row.source} className="hover:bg-slate-50/50 h-[52px]">
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getSourceBadgeStyle(row.source)}`}>
                        {row.source}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0A1F5C]">{row.totalLeads}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">{row.wonLeads}</td>
                    <td className="py-3 px-4 font-medium text-slate-700">{row.conversionRate}%</td>
                    <td className="py-3 px-4 font-bold text-[#0A1F5C]">{formatINR(row.totalWonValue)}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatINR(row.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
