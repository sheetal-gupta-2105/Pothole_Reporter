import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../common/Card';
import type { PotholeReport, ReportPriority } from '../../types/report';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface PriorityChartProps {
  reports: PotholeReport[];
}

export const PriorityChart: React.FC<PriorityChartProps> = ({ reports }) => {
  const priorities: {
    key: ReportPriority;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    barColor: string;
    textColor: string;
  }[] = [
    {
      key: 'critical',
      label: 'Critical Hazard',
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      barColor: 'bg-red-600',
      textColor: 'text-red-700',
    },
    {
      key: 'high',
      label: 'High Severity',
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      barColor: 'bg-orange-500',
      textColor: 'text-orange-700',
    },
    {
      key: 'medium',
      label: 'Medium Severity',
      icon: Info,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      barColor: 'bg-amber-500',
      textColor: 'text-amber-700',
    },
    {
      key: 'low',
      label: 'Low / Minor',
      icon: CheckCircle2,
      color: 'text-slate-500',
      bgColor: 'bg-slate-100',
      barColor: 'bg-slate-400',
      textColor: 'text-slate-700',
    },
  ];

  const total = reports.length || 1;
  const calculatedScores = reports
    .map((report) => report.priorityScore)
    .filter((score): score is number =>
      typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
    );
  const averageScore = calculatedScores.length > 0
    ? calculatedScores.reduce((sum, score) => sum + score, 0) / calculatedScores.length
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Priority Overview</CardTitle>
        <span className="text-xs text-slate-500 font-medium">
          Calculated scores and citizen selections
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-700">Average calculated priority score</span>
            <span className="font-bold text-slate-900">
              {averageScore === null ? 'Unavailable' : `${averageScore.toFixed(1)}/100`}
            </span>
          </div>
          {averageScore !== null && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Average calculated priority score"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={averageScore}
            >
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${averageScore}%` }} />
            </div>
          )}
          <p className="text-[10px] text-slate-500">
            {calculatedScores.length} of {reports.length} reports have an available score; null or invalid scores are omitted.
          </p>
        </section>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Citizen-selected priority
          </p>
        {priorities.map((item) => {
          const count = reports.filter((r) => r.priority === item.key).length;
          const percentage = Math.round((count / total) * 100);
          const Icon = item.icon;

          return (
            <div key={item.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-4 w-4 ${item.color}`} />
                  <span className="font-semibold text-slate-800">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{count}</span>
                  <span className="text-slate-400 font-mono">({percentage}%)</span>
                </div>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${item.barColor} rounded-full transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
        </div>
      </CardContent>
    </Card>
  );
};
