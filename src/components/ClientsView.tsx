import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, getStatusBadgeStyle } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { 
  Search, 
  Plus, 
  Building2, 
  Trash2 
} from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import AddClientModal from './AddClientModal';

interface ClientsViewProps {
  onSelectClient: (clientId: string) => void;
  refreshKey?: number;
  onClientsMutated?: () => void;
}

export default function ClientsView({ onSelectClient, refreshKey = 0, onClientsMutated }: ClientsViewProps) {
  const { showToast } = useToast();
  const [clientsState, setClientsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [packageFilter, setPackageFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchClients();
  }, [refreshKey]);

  const fetchClients = async () => {
    setClientsState(prev => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      return { data: data || [], error };
    }, []);
    setClientsState({ data: res.data, error: res.error, isMissingTable: res.isMissingTable, loading: false });
  };

  const handleDeleteClient = async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this client? All associated tasks, payments and reports will be deleted.')) return;
    await supabase.from('clients').delete().eq('id', clientId);
    showToast('Client deleted', 'success');
    fetchClients();
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const clients = clientsState.data;

  const filteredClients = clients.filter(c => {
    const matchesSearch = 
      (c.business_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.contact_person || c.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.city || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesPackage = packageFilter === 'ALL' || c.package === packageFilter;
    const matchesType = typeFilter === 'ALL' || c.business_type === typeFilter;

    return matchesSearch && matchesStatus && matchesPackage && matchesType;
  });

  const uniquePackages = Array.from(new Set(clients.map(c => c.package).filter(Boolean)));
  const uniqueTypes = Array.from(new Set(clients.map(c => c.business_type).filter(Boolean)));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Clients Management</h1>
          <p className="text-sm text-slate-500">Manage active hospitality accounts, contracts, packages and renewals.</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5ECF6] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search business, contact, city..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Onboarding">Onboarding</option>
            <option value="Paused">Paused</option>
            <option value="Churned">Churned</option>
          </select>

          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Packages</option>
            {uniquePackages.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Business Types</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {clientsState.loading ? (
        <SkeletonTable />
      ) : clientsState.error ? (
        <ErrorCard title="Clients Management" error={clientsState.error} isMissingTable={clientsState.isMissingTable} onRetry={fetchClients} />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5ECF6] shadow-xs overflow-hidden">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-slate-600 font-medium">No clients found.</p>
              <p className="text-xs text-slate-400">Convert a lead or add your first client manually.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E5ECF6] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Business Name</th>
                    <th className="py-3.5 px-4">City</th>
                    <th className="py-3.5 px-4">Package</th>
                    <th className="py-3.5 px-4">Monthly Fee</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Renewal Date</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredClients.map((client) => {
                    const isRenewalSoon = client.renewal_date && (
                      client.renewal_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    );
                    const isOverdue = client.renewal_date && client.renewal_date < todayStr;

                    return (
                      <tr 
                        key={client.id}
                        onClick={() => onSelectClient(client.id)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors h-[52px]"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {(client.business_name || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-[#0A1F5C] text-xs">{client.business_name}</div>
                              <div className="text-slate-400 text-[11px]">{client.contact_person || client.contact_name || 'No contact'} • {client.business_type || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{client.city || '-'}</td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-[#1D4ED8] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 text-[10px]">
                            {client.package || 'Standard'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#0A1F5C]">
                          {formatINR(client.monthly_fee)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getStatusBadgeStyle(client.status)}`}>
                            {client.status || 'Active'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <span>{formatDate(client.renewal_date)}</span>
                            {(isRenewalSoon || isOverdue) && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                isOverdue ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {isOverdue ? 'Overdue' : 'Due Soon'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onSelectClient(client.id)}
                            className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] rounded-lg font-semibold transition-all"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => handleDeleteClient(client.id, e)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            title="Delete Client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Upgraded Add Client Modal */}
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onClientCreated={(newClient) => {
          setClientsState((prev) => ({
            ...prev,
            data: [newClient, ...prev.data.filter((c) => c.id !== newClient.id)],
          }));
          fetchClients();
          onClientsMutated?.();
        }}
        onViewClient={(clientId) => onSelectClient(clientId)}
      />
    </div>
  );
}
