import React from 'react';
import {
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  MapPin,
  MessageCircle,
  Globe,
  Calendar,
  Trash2,
  Building2,
  Link2,
} from 'lucide-react';
import { formatDate } from '../lib/utils';
import {
  TASK_STATUS_OPTIONS,
  parseTaskPlatforms,
  getInitials,
  getPriorityBadgeStyle,
  getApprovalBadgeStyle,
  getTodayLocalDate,
} from '../lib/taskOptions';

interface TaskCardProps {
  task: any;
  showClientName?: boolean;
  onOpenTask: (task: any) => void;
  onStatusChange: (taskId: string, newStatus: string, existingCompletedAt?: string | null) => void;
  onDeleteTask?: (taskId: string) => void;
  onOpenClientProfile?: (clientId: string) => void;
}

function renderPlatformIcon(platform: string) {
  const key = platform.trim().toLowerCase();
  const baseClass =
    'w-5 h-5 rounded-md flex items-center justify-center border shrink-0';

  if (key === 'instagram') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-pink-50 text-pink-600 border-pink-200`}
      >
        <Instagram className="w-3 h-3" />
      </span>
    );
  }
  if (key === 'facebook') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-blue-50 text-blue-600 border-blue-200`}
      >
        <Facebook className="w-3 h-3" />
      </span>
    );
  }
  if (key === 'linkedin') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-indigo-50 text-indigo-700 border-indigo-200`}
      >
        <Linkedin className="w-3 h-3" />
      </span>
    );
  }
  if (key === 'youtube') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-rose-50 text-rose-600 border-rose-200`}
      >
        <Youtube className="w-3 h-3" />
      </span>
    );
  }
  if (key === 'google business profile') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-emerald-50 text-emerald-700 border-emerald-200`}
      >
        <MapPin className="w-3 h-3" />
      </span>
    );
  }
  if (key === 'whatsapp') {
    return (
      <span
        key={platform}
        title={platform}
        className={`${baseClass} bg-green-50 text-green-700 border-green-200`}
      >
        <MessageCircle className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span
      key={platform}
      title={platform}
      className={`${baseClass} bg-slate-100 text-slate-600 border-slate-200`}
    >
      <Globe className="w-3 h-3" />
    </span>
  );
}

export default function TaskCard({
  task,
  showClientName = false,
  onOpenTask,
  onStatusChange,
  onDeleteTask,
  onOpenClientProfile,
}: TaskCardProps) {
  const todayStr = getTodayLocalDate();
  const isOverdue = Boolean(
    task.due_date &&
      task.due_date < todayStr &&
      task.status !== 'Published' &&
      task.status !== 'Approved'
  );
  const isToday = task.due_date === todayStr && task.status !== 'Published';
  const platforms = parseTaskPlatforms(task.platform);
  const initials = getInitials(task.assigned_to);
  const clientName = task.clients?.business_name || null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenTask(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenTask(task);
        }
      }}
      className="bg-white p-3.5 rounded-xl border border-[#DCEBFF] hover:border-[#1D4ED8] shadow-xs hover:shadow-md space-y-2.5 group cursor-pointer transition-all text-left focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40"
    >
      {/* Top Row: Type + Priority + Delete */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-[#1D4ED8] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
            {task.task_type || 'Task'}
          </span>
          {task.priority && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getPriorityBadgeStyle(
                task.priority
              )}`}
            >
              {task.priority}
            </span>
          )}
          {task.approval_status && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${getApprovalBadgeStyle(
                task.approval_status
              )}`}
            >
              {task.approval_status}
            </span>
          )}
        </div>

        {onDeleteTask && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteTask(task.id);
            }}
            aria-label="Delete task"
            className="text-slate-300 hover:text-rose-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5 rounded shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Task Title */}
      <p className="text-[13px] font-semibold text-[#0A1F5C] leading-snug line-clamp-2 group-hover:text-[#1D4ED8] transition-colors">
        {task.title || 'Untitled Task'}
      </p>

      {/* Optional Client Name on Global Board */}
      {showClientName && clientName && (
        <div className="flex items-center">
          {onOpenClientProfile && task.client_id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenClientProfile(task.client_id);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-[#1D4ED8] truncate"
            >
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{clientName}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 truncate">
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{clientName}</span>
            </span>
          )}
        </div>
      )}

      {/* Platform Icons + Creative Indicator */}
      {(platforms.length > 0 || task.creative_link || task.content_format) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {platforms.map((p) => renderPlatformIcon(p))}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            {task.content_format && (
              <span className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#E5ECF6] rounded text-[10px] font-medium text-slate-600">
                {task.content_format}
              </span>
            )}
            {task.creative_link && (
              <span title="Creative link attached" className="text-[#1D4ED8]">
                <Link2 className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Row: Due Date Chip, Assigned Initials, Quick Status */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F1F5FB]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
              isOverdue
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : isToday
                ? 'bg-blue-50 text-[#1D4ED8] border-blue-200'
                : 'bg-[#F8FAFF] text-slate-600 border-[#E5ECF6]'
            }`}
          >
            <Calendar className="w-2.5 h-2.5 shrink-0" />
            <span>{task.due_date ? formatDate(task.due_date) : 'No date'}</span>
          </span>

          {initials && (
            <span
              title={`Assigned to: ${task.assigned_to}`}
              className="w-6 h-6 rounded-full bg-[#EEF2F8] border border-[#DCEBFF] text-[#0A1F5C] text-[10px] font-bold flex items-center justify-center shrink-0"
            >
              {initials}
            </span>
          )}
        </div>

        <select
          value={task.status || 'To do'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, e.target.value, task.completed_at);
          }}
          aria-label="Change task status"
          className="bg-[#F8FAFF] border border-[#DCEBFF] rounded-md px-1.5 py-0.5 text-[10px] text-[#0A1F5C] font-semibold focus:outline-none focus:border-[#1D4ED8] max-w-[105px]"
        >
          {TASK_STATUS_OPTIONS.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
