import React, { useEffect, useState } from 'react';
import Sidebar, { TabType } from './components/Sidebar';
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { ToastProvider } from './components/Toast';
import DashboardView from './components/DashboardView';
import LeadsView from './components/LeadsView';
import ClientsView from './components/ClientsView';
import ClientDetailView from './components/ClientDetailView';
import TasksView from './components/TasksView';
import PaymentsView from './components/PaymentsView';
import RenewalsView from './components/RenewalsView';
import SourcesReportView from './components/SourcesReportView';
import ProposalsListView from './components/ProposalsListView';
import ProposalEditorView from './components/ProposalEditorView';
import ContractsListView from './components/ContractsListView';
import ContractDetailView from './components/ContractDetailView';
import AddLeadModal from './components/AddLeadModal';
import AddClientModal from './components/AddClientModal';
import TaskModal from './components/TaskModal';
import AddPaymentModal from './components/AddPaymentModal';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [returnTab, setReturnTab] = useState<TabType>('proposals');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [proposalPrefill, setProposalPrefill] = useState<{ type: 'lead' | 'client'; id: string } | null>(null);
  const [activeContractId, setActiveContractId] = useState<string | null>(null);
  const [contractPrefill, setContractPrefill] = useState<{ clientId?: string | null; proposalId?: string | null } | null>(null);
  const [contractReturnTab, setContractReturnTab] = useState<TabType>('contracts');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [leadsRefreshKey, setLeadsRefreshKey] = useState(0);
  const [clientsRefreshKey, setClientsRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [proposalsRefreshKey, setProposalsRefreshKey] = useState(0);
  const [contractsRefreshKey, setContractsRefreshKey] = useState(0);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  // Global "+ New" Modal State
  const [newModalType, setNewModalType] = useState<'lead' | 'client' | 'task' | 'payment' | null>(null);

  useEffect(() => {
    // Keyboard shortcut Ctrl+K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNavigate = (tab: TabType, clientId?: string) => {
    if (tab === 'proposal-editor') {
      setReturnTab(currentTab === 'proposal-editor' ? 'proposals' : currentTab);
      setCurrentTab('proposal-editor');
      return;
    }
    if (tab === 'contract-detail') {
      setContractReturnTab(currentTab === 'contract-detail' ? 'contracts' : currentTab);
      setCurrentTab('contract-detail');
      return;
    }
    if (clientId) {
      setSelectedClientId(clientId);
      setActiveContractId(null);
      setContractPrefill(null);
      setCurrentTab('client-detail');
    } else {
      setSelectedClientId(null);
      setActiveProposalId(null);
      setProposalPrefill(null);
      setActiveContractId(null);
      setContractPrefill(null);
      setCurrentTab(tab);
    }
  };

  const handleOpenContract = (
    contractId?: string,
    prefillClientId?: string,
    prefillProposalId?: string
  ) => {
    setContractReturnTab(currentTab === 'contract-detail' ? 'contracts' : currentTab);
    setActiveContractId(contractId || null);
    setContractPrefill(
      prefillClientId || prefillProposalId
        ? { clientId: prefillClientId || null, proposalId: prefillProposalId || null }
        : null
    );
    setCurrentTab('contract-detail');
  };

  const handleOpenNewAction = (type: 'lead' | 'client' | 'task' | 'payment' | 'proposal' | 'contract') => {
    if (type === 'proposal') {
      setReturnTab(currentTab === 'proposal-editor' ? 'proposals' : currentTab);
      setActiveProposalId(null);
      setProposalPrefill(null);
      setCurrentTab('proposal-editor');
      return;
    }
    if (type === 'contract') {
      handleOpenContract();
      return;
    }
    setNewModalType(type);
  };

  const handleCreateProposalFromSource = (type: 'lead' | 'client', id: string) => {
    setReturnTab(currentTab === 'proposal-editor' ? 'proposals' : currentTab);
    setActiveProposalId(null);
    setProposalPrefill({ type, id });
    setCurrentTab('proposal-editor');
  };

  if (currentTab === 'proposal-editor') {
    return (
      <ToastProvider>
        <ProposalEditorView
          proposalId={activeProposalId}
          prefillType={proposalPrefill?.type}
          prefillId={proposalPrefill?.id}
          onBack={() => {
            setActiveProposalId(null);
            setProposalPrefill(null);
            setCurrentTab(returnTab === 'proposal-editor' ? 'proposals' : returnTab);
          }}
          onOpenProposal={(newId) => {
            setActiveProposalId(newId);
            setProposalPrefill(null);
          }}
          onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
          onProposalSaved={() => {
            setProposalsRefreshKey((k) => k + 1);
            setLeadsRefreshKey((k) => k + 1);
            setClientsRefreshKey((k) => k + 1);
          }}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F6F8FC] flex flex-col lg:flex-row antialiased">
        <Sidebar 
          currentTab={currentTab} 
          onTabChange={handleNavigate}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar 
            currentTab={currentTab}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenNewModal={handleOpenNewAction}
          />

          <main className="flex-1 pb-20 lg:pb-12 overflow-x-hidden">
            {currentTab === 'dashboard' && (
              <DashboardView
                onNavigate={handleNavigate}
                onOpenNewModal={handleOpenNewAction}
                refreshKey={leadsRefreshKey + clientsRefreshKey + tasksRefreshKey + paymentsRefreshKey + contractsRefreshKey}
              />
            )}
            {currentTab === 'leads' && (
              <LeadsView 
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)} 
                onCreateProposal={handleCreateProposalFromSource}
                refreshKey={leadsRefreshKey}
                openLeadId={openLeadId}
                onClearOpenLeadId={() => setOpenLeadId(null)}
                onLeadsMutated={() => setLeadsRefreshKey((k) => k + 1)}
              />
            )}
            {currentTab === 'clients' && (
              <ClientsView
                onSelectClient={(id) => handleNavigate('client-detail', id)}
                refreshKey={clientsRefreshKey}
                onClientsMutated={() => setClientsRefreshKey((k) => k + 1)}
              />
            )}
            {currentTab === 'client-detail' && selectedClientId && (
              <ClientDetailView
                clientId={selectedClientId}
                onBack={() => setCurrentTab('clients')}
                onCreateProposal={handleCreateProposalFromSource}
                onOpenContract={handleOpenContract}
                onTasksMutated={() => setTasksRefreshKey((k) => k + 1)}
                onPaymentsMutated={() => setPaymentsRefreshKey((k) => k + 1)}
              />
            )}
            {currentTab === 'tasks' && (
              <TasksView 
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
                refreshKey={tasksRefreshKey}
                onTasksMutated={() => setTasksRefreshKey((k) => k + 1)}
              />
            )}
            {currentTab === 'payments' && (
              <PaymentsView 
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
                refreshKey={paymentsRefreshKey}
                onPaymentsMutated={() => setPaymentsRefreshKey((k) => k + 1)}
              />
            )}
            {currentTab === 'renewals' && (
              <RenewalsView 
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
                onOpenContract={handleOpenContract}
                refreshKey={clientsRefreshKey + paymentsRefreshKey + contractsRefreshKey}
              />
            )}
            {currentTab === 'sources' && <SourcesReportView />}
            {currentTab === 'proposals' && (
              <ProposalsListView 
                refreshKey={proposalsRefreshKey}
                onOpenEditor={(id, pType, pId) => {
                  setReturnTab('proposals');
                  setActiveProposalId(id || null);
                  setProposalPrefill(pType && pId ? { type: pType, id: pId } : null);
                  setCurrentTab('proposal-editor');
                }}
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
              />
            )}
            {currentTab === 'contracts' && (
              <ContractsListView
                refreshKey={contractsRefreshKey}
                onOpenContract={handleOpenContract}
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
              />
            )}
            {currentTab === 'contract-detail' && (
              <ContractDetailView
                contractId={activeContractId}
                prefillClientId={contractPrefill?.clientId}
                prefillProposalId={contractPrefill?.proposalId}
                onBack={() => {
                  setActiveContractId(null);
                  setContractPrefill(null);
                  setCurrentTab(
                    contractReturnTab === 'contract-detail' ? 'contracts' : contractReturnTab
                  );
                }}
                onOpenContract={(newId) => {
                  setActiveContractId(newId);
                  setContractPrefill(null);
                }}
                onOpenClientProfile={(clientId) => handleNavigate('client-detail', clientId)}
                onContractSaved={() => {
                  setContractsRefreshKey((k) => k + 1);
                  setClientsRefreshKey((k) => k + 1);
                }}
              />
            )}
          </main>
        </div>

        <CommandPalette 
          isOpen={commandPaletteOpen} 
          onClose={() => setCommandPaletteOpen(false)}
          onNavigate={handleNavigate}
        />

        {/* Global "+ New" Lead Modal */}
        <AddLeadModal
          isOpen={newModalType === 'lead'}
          onClose={() => setNewModalType(null)}
          onLeadCreated={() => setLeadsRefreshKey((k) => k + 1)}
          onOpenExistingLead={(existing) => {
            setNewModalType(null);
            setOpenLeadId(existing.id);
            setCurrentTab('leads');
          }}
          onViewLead={(newLead) => {
            setNewModalType(null);
            setOpenLeadId(newLead.id);
            setCurrentTab('leads');
          }}
        />

        {/* Global "+ New" Client Modal */}
        <AddClientModal
          isOpen={newModalType === 'client'}
          onClose={() => setNewModalType(null)}
          onClientCreated={() => setClientsRefreshKey((k) => k + 1)}
          onViewClient={(clientId) => {
            setNewModalType(null);
            handleNavigate('client-detail', clientId);
          }}
        />

        {/* Global "+ New" Task Modal */}
        <TaskModal
          isOpen={newModalType === 'task'}
          onClose={() => setNewModalType(null)}
          onTaskCreated={() => setTasksRefreshKey((k) => k + 1)}
          onViewClient={(clientId) => {
            setNewModalType(null);
            handleNavigate('client-detail', clientId);
          }}
        />

        {/* Global "+ New" Payment Modal */}
        <AddPaymentModal
          isOpen={newModalType === 'payment'}
          onClose={() => setNewModalType(null)}
          onPaymentCreated={() => setPaymentsRefreshKey((k) => k + 1)}
          onViewClient={(clientId) => {
            setNewModalType(null);
            handleNavigate('client-detail', clientId);
          }}
        />
      </div>
    </ToastProvider>
  );
}
