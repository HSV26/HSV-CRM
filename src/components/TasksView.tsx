import React, { useEffect, useMemo, useState } from 'react';
import { safeQuery } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { Search, Plus, RotateCcw } from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import TaskCard from './TaskCard';
import TaskModal, { TaskClientOption } from './TaskModal';
import {
  TASK_PLATFORM_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskMatchesPlatform,
  computeCompletedAt,
  getTodayLocalDate,
} from '../lib/taskOptions';
import { getOffsetDateInput } from '../lib/leadOptions';

interface TasksViewProps {
  onOpenClientProfile: (clientId: string) => void;
  refreshKey?: number;
  onTasksMutated?: () => void;
}

export default function TasksView({
  onOpenClientProfile,
  refreshKey = 0,
  onTasksMutated,
}: TasksViewProps) {
  const { showToast } = useToast();
  const [tasksState, setTasksState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [clients, setClients] = useState<TaskClientOption[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [assignedToFilter, setAssignedToFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  const fetchData = async () => {
    setTasksState((prev) => ({ ...prev, loading: true }));
    const [tasksRes, clientsRes] = await Promise.all([
      safeQuery(async () => {
        const { data, error } = await supabase
          .from('client_tasks')
          .select('*, clients(business_name)')
          .order('due_date', { ascending: true });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase
          .from('clients')
          .select('id, business_name')
          .order('business_name', { ascending: true });
        return { data: data || [], error };
      }, []),
    ]);

    setTasksState({
      data: tasksRes.data,
      error: tasksRes.error,
      isMissingTable: tasksRes.isMissingTable,
      loading: false,
    });
    setClients(clientsRes.data);
  };

  const handleStatusChange = async (
    taskId: string,
    newStatus: string,
    existingCompletedAt?: string | null
  ) => {
    const completed_at = computeCompletedAt(newStatus, existingCompletedAt);
    const { error } = await supabase
      .from('client_tasks')
      .update({ status: newStatus, completed_at })
      .eq('id', taskId);

    if (error) {
      showToast('Could not update task: ' + error.message, 'error');
    } else {
      showToast('Task status updated', 'success');
      setTasksState((prev) => ({
        ...prev,
        data: prev.data.map((t) =>
          t.id === taskId ? { ...t, status: newStatus, completed_at } : t
        ),
      }));
      onTasksMutated?.();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from('client_tasks').delete().eq('id', taskId);
    if (error) {
      showToast('Could not delete task: ' + error.message, 'error');
    } else {
      showToast('Task deleted', 'success');
      setTasksState((prev) => ({
        ...prev,
        data: prev.data.filter((t) => t.id !== taskId),
      }));
      onTasksMutated?.();
    }
  };

  const todayStr = getTodayLocalDate();
  const weekLaterStr = getOffsetDateInput(7);

  const tasks = tasksState.data;

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const val = (t.assigned_to || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !q ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.clients?.business_name || '').toLowerCase().includes(q) ||
        (t.assigned_to || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q);

      const matchesClient = clientFilter === 'ALL' || t.client_id === clientFilter;
      const matchesPlatform = taskMatchesPlatform(t.platform, platformFilter);
      const matchesPriority =
        priorityFilter === 'ALL' ||
        (t.priority || '').toLowerCase() === priorityFilter.toLowerCase();

      let matchesAssignee = true;
      if (assignedToFilter === 'UNASSIGNED') {
        matchesAssignee = !(t.assigned_to || '').trim();
      } else if (assignedToFilter !== 'ALL') {
        matchesAssignee =
          (t.assigned_to || '').trim().toLowerCase() === assignedToFilter.toLowerCase();
      }

      let matchesDate = true;
      if (dateFilter === 'TODAY') {
        matchesDate = t.due_date === todayStr;
      } else if (dateFilter === 'WEEK') {
        matchesDate = Boolean(t.due_date && t.due_date >= todayStr && t.due_date <= weekLaterStr);
      } else if (dateFilter === 'OVERDUE') {
        matchesDate = Boolean(
          t.due_date &&
            t.due_date < todayStr &&
            t.status !== 'Published' &&
            t.status !== 'Approved'
        );
      }

      return (
        matchesSearch &&
        matchesClient &&
        matchesPlatform &&
        matchesPriority &&
        matchesAssignee &&
        matchesDate
      );
    });
  }, [
    tasks,
    searchQuery,
    clientFilter,
    platformFilter,
    priorityFilter,
    assignedToFilter,
    dateFilter,
    todayStr,
    weekLaterStr,
  ]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      clientFilter !== 'ALL' ||
      platformFilter !== 'ALL' ||
      priorityFilter !== 'ALL' ||
      assignedToFilter !== 'ALL' ||
      dateFilter !== 'ALL'
  );

  const resetFilters = () => {
    setSearchQuery('');
    setClientFilter('ALL');
    setPlatformFilter('ALL');
    setPriorityFilter('ALL');
    setAssignedToFilter('ALL');
    setDateFilter('ALL');
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
            Global Tasks Board
          </h1>
          <p className="text-sm text-slate-500">
            All content tasks and deliverables across every hospitality client.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingTask(null);
            setIsTaskModalOpen(true);
          }}
          className="tactile-btn-primary px-4 py-2.5 text-xs flex items-center justify-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5ECF6] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search task, client, or assignee..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              aria-label="Filter by client"
              className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            >
              <option value="ALL">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || 'Unnamed'}
                </option>
              ))}
            </select>

            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              aria-label="Filter by platform"
              className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            >
              <option value="ALL">All Platforms</option>
              {TASK_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
              className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            >
              <option value="ALL">All Priorities</option>
              {TASK_PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
              aria-label="Filter by assignee"
              className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            >
              <option value="ALL">All Assignees</option>
              <option value="UNASSIGNED">Unassigned</option>
              {assigneeOptions.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by due date"
              className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            >
              <option value="ALL">All Due Dates</option>
              <option value="OVERDUE">Overdue</option>
              <option value="TODAY">Due Today</option>
              <option value="WEEK">This Week</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-[#1D4ED8] bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5-Column Tasks Board */}
      {tasksState.loading ? (
        <SkeletonTable />
      ) : tasksState.error ? (
        <ErrorCard
          title="Global Tasks Board"
          error={tasksState.error}
          isMissingTable={tasksState.isMissingTable}
          onRetry={fetchData}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
          {TASK_STATUS_OPTIONS.map((col) => {
            const colTasks = filteredTasks.filter((t) => (t.status || 'To do') === col);
            return (
              <div
                key={col}
                className="bg-slate-50/90 rounded-2xl p-3.5 border border-[#E5ECF6] space-y-3 flex flex-col min-h-[420px]"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-[#E5ECF6]">
                  <span className="text-xs font-bold text-[#0A1F5C]">{col}</span>
                  <span className="text-[11px] font-semibold bg-blue-100 text-[#1D4ED8] px-2 py-0.5 rounded-full tabular-nums">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      showClientName={true}
                      onOpenTask={(clicked) => {
                        setEditingTask(clicked);
                        setIsTaskModalOpen(true);
                      }}
                      onStatusChange={handleStatusChange}
                      onDeleteTask={handleDeleteTask}
                      onOpenClientProfile={onOpenClientProfile}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-10 text-[11px] text-slate-400 italic">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        taskToEdit={editingTask}
        clientsList={clients}
        onTaskCreated={(newTask) => {
          setTasksState((prev) => ({
            ...prev,
            data: [...prev.data, newTask].sort((a, b) =>
              (a.due_date || '9999-99-99').localeCompare(b.due_date || '9999-99-99')
            ),
          }));
          onTasksMutated?.();
        }}
        onTaskUpdated={(updated) => {
          setTasksState((prev) => ({
            ...prev,
            data: prev.data.map((t) => (t.id === updated.id ? updated : t)),
          }));
          onTasksMutated?.();
        }}
        onTaskDeleted={(deletedId) => {
          setTasksState((prev) => ({
            ...prev,
            data: prev.data.filter((t) => t.id !== deletedId),
          }));
          onTasksMutated?.();
        }}
        onViewClient={onOpenClientProfile}
      />
    </div>
  );
}
