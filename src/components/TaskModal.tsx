import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  CheckSquare,
  CalendarClock,
  FileText,
  Flag,
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Search,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeQuery } from '../lib/db';
import { useToast } from './Toast';
import {
  TASK_TYPE_OPTIONS,
  TASK_PLATFORM_OPTIONS,
  CONTENT_FORMAT_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  APPROVAL_STATUS_OPTIONS,
  parseTaskPlatforms,
  serializeTaskPlatforms,
  isValidOptionalUrl,
  computeCompletedAt,
  getQuickDueDates,
} from '../lib/taskOptions';

export interface TaskClientOption {
  id: string;
  business_name: string | null;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: any | null;
  defaultClientId?: string | null;
  clientsList?: TaskClientOption[];
  onTaskCreated?: (task: any) => void;
  onTaskUpdated?: (task: any) => void;
  onTaskDeleted?: (taskId: string) => void;
  onViewClient?: (clientId: string) => void;
}

type SectionKey = 'task' | 'schedule' | 'content' | 'status';

const STEPS: { key: SectionKey; label: string }[] = [
  { key: 'task', label: 'Task' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'content', label: 'Content' },
  { key: 'status', label: 'Status' },
];

export default function TaskModal({
  isOpen,
  onClose,
  taskToEdit = null,
  defaultClientId = null,
  clientsList,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onViewClient,
}: TaskModalProps) {
  const { showToast } = useToast();
  const isEditMode = Boolean(taskToEdit?.id);

  // Refs for focus, scroll, and auto-save tracking
  const openerRef = useRef<HTMLElement | null>(null);
  const skipRestoreFocusRef = useRef(false);
  const clientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const clientDropdownRef = useRef<HTMLDivElement | null>(null);
  const clientSearchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    task: null,
    schedule: null,
    content: null,
    status: null,
  });

  // Clients list state
  const [clients, setClients] = useState<TaskClientOption[]>(clientsList || []);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // 1. TASK
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<string>('Post');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [contentFormat, setContentFormat] = useState('');

  // 2. SCHEDULE
  const [dueDate, setDueDate] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('');
  const [priority, setPriority] = useState<string>('Medium');
  const [assignedTo, setAssignedTo] = useState('');

  // 3. CONTENT
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [creativeLink, setCreativeLink] = useState('');
  const [notes, setNotes] = useState('');

  // 4. STATUS
  const [status, setStatus] = useState<string>('To do');
  const [approvalStatus, setApprovalStatus] = useState('');

  // UI & Validation state
  const [activeStep, setActiveStep] = useState<SectionKey>('task');
  const [fieldErrors, setFieldErrors] = useState<{
    clientId?: string;
    title?: string;
    dueDate?: string;
    creativeLink?: string;
  }>({});
  const [submittingMode, setSubmittingMode] = useState<'close' | 'another' | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit auto-save state
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const completedAtRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editInitializedRef = useRef(false);

  const quickDueDates = useMemo(() => getQuickDueDates(), [isOpen]);

  const buildSnapshot = () =>
    JSON.stringify({
      clientId,
      title: title.trim(),
      taskType: taskType || 'Post',
      platforms,
      contentFormat,
      dueDate,
      publishDate,
      publishTime,
      priority: priority || 'Medium',
      assignedTo: assignedTo.trim(),
      caption,
      hashtags,
      creativeLink: creativeLink.trim(),
      notes,
      status: status || 'To do',
      approvalStatus,
    });

  const resetForCreate = (keepSelection = false) => {
    if (!keepSelection) {
      setClientId(defaultClientId || '');
      setTaskType('Post');
      setPlatforms([]);
    }
    setTitle('');
    setContentFormat('');
    setDueDate('');
    setPublishDate('');
    setPublishTime('');
    setPriority('Medium');
    setAssignedTo('');
    setCaption('');
    setHashtags('');
    setCreativeLink('');
    setNotes('');
    setStatus('To do');
    setApprovalStatus('');
    setFieldErrors({});
    setClientDropdownOpen(false);
    setClientSearch('');
    setShowDiscardConfirm(false);
    setConfirmDelete(false);
    setAutoSaveState('idle');
    setAutoSaveError(null);
    setActiveStep('task');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  // Initialize form on open & restore focus on close
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      skipRestoreFocusRef.current = false;
      editInitializedRef.current = false;
      setSubmittingMode(null);

      if (clientsList && clientsList.length > 0) {
        setClients(clientsList);
      } else {
        setClientsLoading(true);
        safeQuery(async () => {
          const { data, error } = await supabase
            .from('clients')
            .select('id, business_name')
            .order('business_name', { ascending: true });
          return { data: data || [], error };
        }, []).then((res) => {
          setClients(res.data);
          setClientsLoading(false);
        });
      }

      if (taskToEdit?.id) {
        const initClientId = taskToEdit.client_id || defaultClientId || '';
        const initTitle = taskToEdit.title || '';
        const initType = taskToEdit.task_type || 'Post';
        const initPlatforms = parseTaskPlatforms(taskToEdit.platform);
        const initFormat = taskToEdit.content_format || '';
        const initDue = taskToEdit.due_date || '';
        const initPubDate = taskToEdit.publish_date || '';
        const initPubTime = taskToEdit.publish_time ? String(taskToEdit.publish_time).slice(0, 5) : '';
        const initPriority = taskToEdit.priority || 'Medium';
        const initAssigned = taskToEdit.assigned_to || '';
        const initCaption = taskToEdit.caption || '';
        const initHashtags = taskToEdit.hashtags || '';
        const initCreative = taskToEdit.creative_link || '';
        const initNotes = taskToEdit.notes || '';
        const initStatus = taskToEdit.status || 'To do';
        const initApproval = taskToEdit.approval_status || '';

        setClientId(initClientId);
        setTitle(initTitle);
        setTaskType(initType);
        setPlatforms(initPlatforms);
        setContentFormat(initFormat);
        setDueDate(initDue);
        setPublishDate(initPubDate);
        setPublishTime(initPubTime);
        setPriority(initPriority);
        setAssignedTo(initAssigned);
        setCaption(initCaption);
        setHashtags(initHashtags);
        setCreativeLink(initCreative);
        setNotes(initNotes);
        setStatus(initStatus);
        setApprovalStatus(initApproval);
        setFieldErrors({});
        setClientDropdownOpen(false);
        setClientSearch('');
        setShowDiscardConfirm(false);
        setConfirmDelete(false);
        setAutoSaveState('saved');
        setAutoSaveError(null);
        setActiveStep('task');
        completedAtRef.current = taskToEdit.completed_at || null;
        lastSavedSnapshotRef.current = JSON.stringify({
          clientId: initClientId,
          title: initTitle.trim(),
          taskType: initType,
          platforms: initPlatforms,
          contentFormat: initFormat,
          dueDate: initDue,
          publishDate: initPubDate,
          publishTime: initPubTime,
          priority: initPriority,
          assignedTo: initAssigned.trim(),
          caption: initCaption,
          hashtags: initHashtags,
          creativeLink: initCreative.trim(),
          notes: initNotes,
          status: initStatus,
          approvalStatus: initApproval,
        });
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
        setTimeout(() => {
          editInitializedRef.current = true;
          titleInputRef.current?.focus();
        }, 25);
      } else {
        resetForCreate(false);
        completedAtRef.current = null;
        lastSavedSnapshotRef.current = '';
        setTimeout(() => {
          if (defaultClientId) {
            titleInputRef.current?.focus();
          } else {
            clientTriggerRef.current?.focus();
          }
        }, 25);
      }
    } else {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (openerRef.current) {
        const toFocus = openerRef.current;
        const shouldSkip = skipRestoreFocusRef.current;
        openerRef.current = null;
        skipRestoreFocusRef.current = false;
        if (!shouldSkip) {
          setTimeout(() => {
            toFocus?.focus?.();
          }, 0);
        }
      }
    }
  }, [isOpen, taskToEdit?.id, defaultClientId]);

  useEffect(() => {
    if (isOpen && clientsList && clientsList.length > 0) {
      setClients(clientsList);
    }
  }, [isOpen, clientsList]);

  // Outside click closes searchable client dropdown
  useEffect(() => {
    if (!clientDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [clientDropdownOpen]);

  // Focus search input when client dropdown opens
  useEffect(() => {
    if (clientDropdownOpen) {
      setTimeout(() => {
        clientSearchInputRef.current?.focus();
      }, 15);
    }
  }, [clientDropdownOpen]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId]
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.business_name || '').toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const isPublishBeforeDue = Boolean(publishDate && dueDate && publishDate < dueDate);

  const isDirtyInCreate = useMemo(() => {
    if (isEditMode) return false;
    return Boolean(
      (clientId && clientId !== (defaultClientId || '')) ||
        title.trim() ||
        taskType !== 'Post' ||
        platforms.length > 0 ||
        contentFormat ||
        dueDate ||
        publishDate ||
        publishTime ||
        priority !== 'Medium' ||
        assignedTo.trim() ||
        caption.trim() ||
        hashtags.trim() ||
        creativeLink.trim() ||
        notes.trim() ||
        status !== 'To do' ||
        approvalStatus
    );
  }, [
    isEditMode,
    clientId,
    defaultClientId,
    title,
    taskType,
    platforms,
    contentFormat,
    dueDate,
    publishDate,
    publishTime,
    priority,
    assignedTo,
    caption,
    hashtags,
    creativeLink,
    notes,
    status,
    approvalStatus,
  ]);

  const buildPayload = () => {
    const nextCompletedAt = computeCompletedAt(status, completedAtRef.current);
    return {
      client_id: clientId,
      title: title.trim(),
      task_type: taskType || 'Post',
      platform: serializeTaskPlatforms(platforms),
      content_format: contentFormat || null,
      due_date: dueDate,
      publish_date: publishDate || null,
      publish_time: publishTime || null,
      priority: priority || 'Medium',
      assigned_to: assignedTo.trim() || null,
      caption: caption.trim() || null,
      hashtags: hashtags.trim() || null,
      creative_link: creativeLink.trim() || null,
      notes: notes.trim() || null,
      status: status || 'To do',
      approval_status: approvalStatus || null,
      completed_at: nextCompletedAt,
    };
  };

  const validateFields = (focusInvalid = false): boolean => {
    const errors: typeof fieldErrors = {};

    if (!clientId) {
      errors.clientId = 'Please select a Client.';
    }
    if (!title.trim()) {
      errors.title = 'Please enter a Task Title.';
    }
    if (!dueDate) {
      errors.dueDate = 'Please select a Due date.';
    }
    if (creativeLink.trim() && !isValidOptionalUrl(creativeLink)) {
      errors.creativeLink = 'Please enter a valid URL starting with http:// or https://.';
    }

    setFieldErrors(errors);

    if (focusInvalid) {
      if (errors.clientId) {
        jumpToSection('task');
        clientTriggerRef.current?.focus();
        return false;
      }
      if (errors.title) {
        jumpToSection('task');
        titleInputRef.current?.focus();
        return false;
      }
      if (errors.dueDate) {
        jumpToSection('schedule');
        return false;
      }
      if (errors.creativeLink) {
        jumpToSection('content');
        return false;
      }
    }

    return Object.keys(errors).length === 0;
  };

  // Perform update in Edit mode
  const performAutoSave = async (snapshotToSave: string) => {
    if (!taskToEdit?.id) return;
    if (!validateFields(false)) {
      setAutoSaveState('error');
      setAutoSaveError('Fix required fields before changes can be saved.');
      return;
    }

    setAutoSaveState('saving');
    setAutoSaveError(null);

    try {
      const payload = buildPayload();
      const { data, error } = await supabase
        .from('client_tasks')
        .update(payload)
        .eq('id', taskToEdit.id)
        .select('*, clients(business_name)')
        .single();

      if (error || !data) {
        setAutoSaveState('error');
        setAutoSaveError(error?.message || 'Could not auto-save changes');
        return;
      }

      completedAtRef.current = data.completed_at || null;
      lastSavedSnapshotRef.current = snapshotToSave;
      setAutoSaveState('saved');
      setAutoSaveError(null);
      onTaskUpdated?.(data);
    } catch (err: any) {
      setAutoSaveState('error');
      setAutoSaveError(err?.message || 'Unexpected save error');
    }
  };

  // Debounced auto-save watcher in Edit mode
  useEffect(() => {
    if (!isOpen || !isEditMode || !editInitializedRef.current) return;

    const currentSnapshot = buildSnapshot();
    if (currentSnapshot === lastSavedSnapshotRef.current) return;

    if (!clientId || !title.trim() || !dueDate || (creativeLink.trim() && !isValidOptionalUrl(creativeLink))) {
      setAutoSaveState('error');
      setAutoSaveError('Please fill required fields and valid URLs to save.');
      return;
    }

    setAutoSaveState('saving');
    setAutoSaveError(null);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      performAutoSave(currentSnapshot);
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    isOpen,
    isEditMode,
    clientId,
    title,
    taskType,
    platforms,
    contentFormat,
    dueDate,
    publishDate,
    publishTime,
    priority,
    assignedTo,
    caption,
    hashtags,
    creativeLink,
    notes,
    status,
    approvalStatus,
  ]);

  const attemptClose = async () => {
    if (submittingMode || deleting) return;

    if (isEditMode) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const currentSnapshot = buildSnapshot();
      if (currentSnapshot !== lastSavedSnapshotRef.current) {
        if (validateFields(true)) {
          await performAutoSave(currentSnapshot);
        } else {
          return;
        }
      }
      onClose();
      return;
    }

    if (isDirtyInCreate) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Global keyboard shortcuts (Esc & Ctrl+Enter)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (clientDropdownOpen) {
          setClientDropdownOpen(false);
          clientTriggerRef.current?.focus();
          return;
        }
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          attemptClose();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isEditMode) {
        e.preventDefault();
        if (!submittingMode) {
          saveNewTask('close');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const containerTop = container.getBoundingClientRect().top;

    if (container.scrollHeight - container.clientHeight - scrollTop < 24) {
      setActiveStep('status');
      return;
    }

    let current: SectionKey = 'task';
    for (const step of STEPS) {
      const el = sectionRefs.current[step.key];
      if (!el) continue;
      const offsetFromTop = el.getBoundingClientRect().top - containerTop;
      if (offsetFromTop <= 80) {
        current = step.key;
      }
    }
    setActiveStep(current);
  };

  const jumpToSection = (key: SectionKey) => {
    setActiveStep(key);
    const el = sectionRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const togglePlatform = (chip: string) => {
    setPlatforms((prev) =>
      prev.includes(chip) ? prev.filter((item) => item !== chip) : [...prev, chip]
    );
  };

  const saveNewTask = async (mode: 'close' | 'another') => {
    if (submittingMode || isEditMode) return;
    if (!validateFields(true)) return;

    setSubmittingMode(mode);
    try {
      const payload = buildPayload();
      const { data, error } = await supabase
        .from('client_tasks')
        .insert(payload)
        .select('*, clients(business_name)')
        .single();

      if (error || !data) {
        showToast('Could not add task: ' + (error?.message || 'Unknown error'), 'error');
        setSubmittingMode(null);
        return;
      }

      const { error: activityError } = await supabase.from('client_activities').insert({
        client_id: clientId,
        type: 'Task created',
        note: `Task created: ${title.trim()}`,
      });
      if (activityError) {
        console.error('Could not insert client_activities row:', activityError);
      }

      const createdClientId = clientId;
      showToast(
        'Task added',
        'success',
        onViewClient
          ? {
              label: 'View client',
              onClick: () => {
                skipRestoreFocusRef.current = true;
                onClose();
                onViewClient(createdClientId);
              },
            }
          : undefined
      );

      onTaskCreated?.(data);

      if (mode === 'another') {
        resetForCreate(true);
        setSubmittingMode(null);
        setTimeout(() => {
          titleInputRef.current?.focus();
        }, 25);
      } else {
        setSubmittingMode(null);
        onClose();
      }
    } catch (err: any) {
      showToast('Could not add task: ' + (err?.message || 'Unexpected error'), 'error');
      setSubmittingMode(null);
    }
  };

  const handleDelete = async () => {
    if (!taskToEdit?.id || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('client_tasks').delete().eq('id', taskToEdit.id);
      if (error) {
        showToast('Could not delete task: ' + error.message, 'error');
        setDeleting(false);
        return;
      }
      showToast('Task deleted', 'success');
      onTaskDeleted?.(taskToEdit.id);
      setDeleting(false);
      onClose();
    } catch (err: any) {
      showToast('Could not delete task: ' + (err?.message || 'Unexpected error'), 'error');
      setDeleting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditMode) {
      saveNewTask('close');
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        e.preventDefault();
      }
    }
  };

  const inputBaseClass = (filled: boolean, hasError?: boolean) =>
    `w-full h-[44px] px-3.5 rounded-xl border text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none ${
      filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } ${
      hasError
        ? 'border-rose-500 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/20'
        : 'border-[#DCEBFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={attemptClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="bg-white w-full sm:max-w-[720px] max-h-[92dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#DCEBFF] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between gap-3 shrink-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3
                id="task-modal-title"
                className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg"
              >
                {isEditMode ? 'Edit Content Task' : 'Add New Task'}
              </h3>
              {isEditMode && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                    autoSaveState === 'saving'
                      ? 'bg-blue-50 text-[#1D4ED8] border-blue-200'
                      : autoSaveState === 'error'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {autoSaveState === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {autoSaveState === 'saving'
                    ? 'Saving...'
                    : autoSaveState === 'error'
                    ? 'Needs attention'
                    : 'Saved'}
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-600 truncate">
              {isEditMode
                ? 'Changes auto-save as you edit deliverables, schedule, or approval status.'
                : 'Schedule deliverables, creative briefs, and approval status for a client.'}
            </p>
          </div>

          <button
            type="button"
            onClick={attemptClose}
            className="p-2 text-slate-500 hover:text-[#0A1F5C] hover:bg-[#F8FAFF] rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slim Step Indicator */}
        <nav
          aria-label="Task form sections"
          className="px-5 sm:px-6 py-2.5 bg-[#F8FAFF] border-b border-[#E5ECF6] shrink-0"
        >
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((step, index) => {
              const isActive = activeStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => jumpToSection(step.key)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[12px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
                    isActive
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-[#DCEBFF] hover:text-[#1D4ED8] hover:border-[#3B82F6]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[11px] flex items-center justify-center font-bold shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#EEF2F8] text-[#0A1F5C]'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{step.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Discard Confirmation Strip (Add mode) */}
        {showDiscardConfirm && !isEditMode && (
          <div
            role="alertdialog"
            aria-label="Discard changes confirmation"
            className="px-5 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 shrink-0"
          >
            <p className="text-[13px] font-semibold text-amber-900">
              Discard this task? Unsaved details will be lost.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Auto-save error banner in Edit mode */}
        {isEditMode && autoSaveError && (
          <div className="px-5 sm:px-6 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-[12px] font-medium text-rose-800 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{autoSaveError}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 bg-[#F8FAFF]"
        >
          <form
            id="task-modal-form"
            onSubmit={handleFormSubmit}
            onKeyDown={handleFormKeyDown}
            noValidate
            className="space-y-6"
          >
            {/* SECTION 1: TASK */}
            <section
              ref={(el) => {
                sectionRefs.current.task = el;
              }}
              className="space-y-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  1. Task
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Searchable Client Dropdown */}
                <div className="space-y-1.5 sm:col-span-2" ref={clientDropdownRef}>
                  <label
                    htmlFor="task-client-trigger"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Client <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <button
                      id="task-client-trigger"
                      ref={clientTriggerRef}
                      type="button"
                      onClick={() => setClientDropdownOpen((prev) => !prev)}
                      aria-expanded={clientDropdownOpen}
                      aria-invalid={Boolean(fieldErrors.clientId)}
                      className={`w-full h-[44px] px-3.5 rounded-xl border text-[16px] sm:text-[14px] flex items-center justify-between gap-2 transition-all focus:outline-none ${
                        selectedClient ? 'bg-white shadow-2xs text-[#0A1F5C] font-medium' : 'bg-[#F8FAFF] text-[#94A3B8]'
                      } ${
                        fieldErrors.clientId
                          ? 'border-rose-500 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/20'
                          : 'border-[#DCEBFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
                      }`}
                    >
                      <span className="truncate">
                        {selectedClient
                          ? selectedClient.business_name || 'Unnamed client'
                          : clientsLoading
                          ? 'Loading clients...'
                          : 'Search and select a client...'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>

                    {clientDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DCEBFF] rounded-xl shadow-xl z-30 overflow-hidden">
                        <div className="p-2 border-b border-[#E5ECF6] bg-[#F8FAFF] flex items-center gap-2">
                          <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                          <input
                            ref={clientSearchInputRef}
                            type="text"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredClients.length > 0) {
                                  const pick = filteredClients[0];
                                  setClientId(pick.id);
                                  setClientDropdownOpen(false);
                                  setClientSearch('');
                                  setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
                                }
                              }
                            }}
                            placeholder="Type client name..."
                            className="w-full py-1.5 pr-2 bg-transparent text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none"
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {filteredClients.length === 0 ? (
                            <div className="px-4 py-4 text-center text-[13px] text-slate-500">
                              No clients match "{clientSearch}".
                            </div>
                          ) : (
                            filteredClients.map((c) => {
                              const isSelected = c.id === clientId;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setClientId(c.id);
                                    setClientDropdownOpen(false);
                                    setClientSearch('');
                                    setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
                                  }}
                                  className={`w-full px-3.5 py-2.5 text-left text-[13px] flex items-center justify-between transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 text-[#1D4ED8] font-semibold'
                                      : 'text-[#0A1F5C] hover:bg-[#F8FAFF]'
                                  }`}
                                >
                                  <span className="truncate">{c.business_name || 'Unnamed client'}</span>
                                  {isSelected && <Check className="w-4 h-4 text-[#1D4ED8] shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {fieldErrors.clientId && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.clientId}</p>
                  )}
                </div>

                {/* Task Title */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="task-title"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Task Title <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="task-title"
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (fieldErrors.title && e.target.value.trim()) {
                        setFieldErrors((prev) => ({ ...prev, title: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (!title.trim()) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          title: 'Please enter a Task Title.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.title)}
                    placeholder="Reel: Poolside Sunset Tour & Cocktails"
                    className={inputBaseClass(Boolean(title.trim()), Boolean(fieldErrors.title))}
                  />
                  {fieldErrors.title && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.title}</p>
                  )}
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-type"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Type
                  </label>
                  <select
                    id="task-type"
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className={`${inputBaseClass(Boolean(taskType))} font-medium`}
                  >
                    {TASK_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="text-[#0A1F5C]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content format */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-content-format"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Content format
                  </label>
                  <select
                    id="task-content-format"
                    value={contentFormat}
                    onChange={(e) => setContentFormat(e.target.value)}
                    className={`${inputBaseClass(Boolean(contentFormat))} font-medium ${
                      contentFormat ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select format</option>
                    {CONTENT_FORMAT_OPTIONS.map((fmt) => (
                      <option key={fmt} value={fmt} className="text-[#0A1F5C]">
                        {fmt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Platform Multi-select Chips */}
              <div className="space-y-2">
                <span className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Platform
                </span>
                <div className="flex flex-wrap gap-2">
                  {TASK_PLATFORM_OPTIONS.map((chip) => {
                    const selected = platforms.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => togglePlatform(chip)}
                        aria-pressed={selected}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 ${
                          selected
                            ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white shadow-xs'
                            : 'bg-white border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF]'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span>{chip}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* SECTION 2: SCHEDULE */}
            <section
              ref={(el) => {
                sectionRefs.current.schedule = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  2. Schedule
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Due Date */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="task-due-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Due date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="task-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      if (fieldErrors.dueDate && e.target.value) {
                        setFieldErrors((prev) => ({ ...prev, dueDate: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (!dueDate) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          dueDate: 'Please select a Due date.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.dueDate)}
                    className={`${inputBaseClass(Boolean(dueDate), Boolean(fieldErrors.dueDate))} font-medium ${
                      dueDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {fieldErrors.dueDate && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.dueDate}</p>
                  )}

                  {/* Quick Due Date Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[12px] font-medium text-slate-600 mr-1">Quick set:</span>
                    {quickDueDates.map((btn) => {
                      const isActive = dueDate === btn.value;
                      return (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => {
                            setDueDate(btn.value);
                            setFieldErrors((prev) => ({ ...prev, dueDate: undefined }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 ${
                            isActive
                              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                              : 'bg-white text-[#0A1F5C] border-[#DCEBFF] hover:border-[#1D4ED8] hover:text-[#1D4ED8]'
                          }`}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Publish Date */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-publish-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Publish date
                  </label>
                  <input
                    id="task-publish-date"
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    className={`${inputBaseClass(Boolean(publishDate))} font-medium ${
                      publishDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {isPublishBeforeDue && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2 text-[12px]">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Publish date is before the due date. You can still save if intentional.</span>
                    </div>
                  )}
                </div>

                {/* Publish Time */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-publish-time"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Publish time
                  </label>
                  <input
                    id="task-publish-time"
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className={`${inputBaseClass(Boolean(publishTime))} font-medium ${
                      publishTime ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-priority"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={`${inputBaseClass(Boolean(priority))} font-medium`}
                  >
                    {TASK_PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p} className="text-[#0A1F5C]">
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assigned To */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-assigned-to"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Assigned to
                  </label>
                  <input
                    id="task-assigned-to"
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Sarvesh"
                    className={inputBaseClass(Boolean(assignedTo.trim()))}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 3: CONTENT */}
            <section
              ref={(el) => {
                sectionRefs.current.content = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  3. Content
                </h4>
              </div>

              <div className="space-y-4">
                {/* Caption with live character count */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="task-caption"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      Caption
                    </label>
                    <span className="text-[12px] font-medium text-slate-500 tabular-nums">
                      {caption.length} {caption.length === 1 ? 'char' : 'chars'}
                    </span>
                  </div>
                  <textarea
                    id="task-caption"
                    rows={3}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Golden hour by the infinity pool. Book your weekend escape..."
                    className={`w-full min-h-[88px] p-3.5 rounded-xl border border-[#DCEBFF] text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 ${
                      caption.trim() ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
                    }`}
                  />
                </div>

                {/* Hashtags */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-hashtags"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Hashtags
                  </label>
                  <input
                    id="task-hashtags"
                    type="text"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#GoaResorts #LuxuryStay #SunsetVibes"
                    className={inputBaseClass(Boolean(hashtags.trim()))}
                  />
                </div>

                {/* Creative Link */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-creative-link"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Creative link (Drive or Canva URL)
                  </label>
                  <input
                    id="task-creative-link"
                    type="url"
                    value={creativeLink}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCreativeLink(next);
                      if (fieldErrors.creativeLink && isValidOptionalUrl(next)) {
                        setFieldErrors((prev) => ({ ...prev, creativeLink: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (creativeLink.trim() && !isValidOptionalUrl(creativeLink)) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          creativeLink: 'Please enter a valid URL starting with http:// or https://.',
                        }));
                      } else {
                        setFieldErrors((prev) => ({ ...prev, creativeLink: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.creativeLink)}
                    placeholder="https://drive.google.com/... or https://www.canva.com/..."
                    className={inputBaseClass(Boolean(creativeLink.trim()), Boolean(fieldErrors.creativeLink))}
                  />
                  {fieldErrors.creativeLink && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.creativeLink}</p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-notes"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Notes
                  </label>
                  <textarea
                    id="task-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Shot list details, music track reference, or internal notes..."
                    className={`w-full min-h-[72px] p-3.5 rounded-xl border border-[#DCEBFF] text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 ${
                      notes.trim() ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
                    }`}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 4: STATUS */}
            <section
              ref={(el) => {
                sectionRefs.current.status = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  4. Status
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Status */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Status
                  </label>
                  <select
                    id="task-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={`${inputBaseClass(Boolean(status))} font-medium`}
                  >
                    {TASK_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st} className="text-[#0A1F5C]">
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Approval Status */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-approval-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Approval status
                  </label>
                  <select
                    id="task-approval-status"
                    value={approvalStatus}
                    onChange={(e) => setApprovalStatus(e.target.value)}
                    className={`${inputBaseClass(Boolean(approvalStatus))} font-medium ${
                      approvalStatus ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select approval status</option>
                    {APPROVAL_STATUS_OPTIONS.map((ap) => (
                      <option key={ap} value={ap} className="text-[#0A1F5C]">
                        {ap}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#E5ECF6] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          {isEditMode ? (
            <>
              <div className="flex items-center gap-2">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                    className="px-3 py-2 rounded-xl text-[13px] font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl">
                    <span className="text-[12px] font-semibold text-rose-800">Delete task?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-semibold"
                    >
                      {deleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="px-2 py-1 bg-white border border-rose-200 text-rose-800 rounded-lg text-[11px] font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {onViewClient && clientId && (
                  <button
                    type="button"
                    onClick={() => {
                      skipRestoreFocusRef.current = true;
                      onClose();
                      onViewClient(clientId);
                    }}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-[#1D4ED8] hover:bg-blue-50 transition-colors"
                  >
                    <span>View client</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={attemptClose}
                  disabled={deleting}
                  className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60"
                >
                  <span>Done</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="hidden sm:inline text-[12px] text-slate-500">
                Tip: Press{' '}
                <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">
                  Ctrl
                </kbd>{' '}
                +{' '}
                <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">
                  Enter
                </kbd>{' '}
                to save
              </span>
              <div className="flex items-center justify-end gap-2.5 ml-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={attemptClose}
                  disabled={Boolean(submittingMode)}
                  className="tactile-btn-secondary px-4 py-2.5 text-[13px] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveNewTask('another')}
                  disabled={Boolean(submittingMode)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF] text-[13px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40"
                >
                  {submittingMode === 'another' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingMode === 'another' ? 'Saving...' : 'Save and add another'}</span>
                </button>
                <button
                  type="submit"
                  form="task-modal-form"
                  disabled={Boolean(submittingMode)}
                  className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50"
                >
                  {submittingMode === 'close' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingMode === 'close' ? 'Saving...' : 'Create Task'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
