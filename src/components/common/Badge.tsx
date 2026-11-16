import React from 'react';
import type { ReportPriority, ReportStatus, BBMPZone } from '../../types/report';
import { getStatusBadgeConfig, getPriorityBadgeConfig } from '../../utils/formatters';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface StatusBadgeProps {
  status: ReportStatus;
  size?: 'sm' | 'md';
  isDuplicate?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', isDuplicate = false }) => {
  const config = getStatusBadgeConfig(status);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';
  const duplicateClasses = 'bg-orange-50 text-orange-800 border-orange-200';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${isDuplicate ? duplicateClasses : `${config.bg} ${config.text} ${config.border}`} ${sizeClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isDuplicate ? 'bg-orange-500' : config.dot}`} />
      <span>{isDuplicate ? 'Confirmed duplicate' : config.label}</span>
    </span>
  );
};

interface PriorityBadgeProps {
  priority: ReportPriority;
  size?: 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'md' }) => {
  const config = getPriorityBadgeConfig(priority);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  const renderIcon = () => {
    switch (priority) {
      case 'critical':
        return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
      case 'high':
        return <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />;
      case 'medium':
        return <Info className="h-3.5 w-3.5 text-amber-600" />;
      case 'low':
        return <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      {renderIcon()}
      <span>{config.label}</span>
    </span>
  );
};

export const ZoneBadge: React.FC<{ zone: BBMPZone }> = ({ zone }) => {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
      {zone}
    </span>
  );
};
