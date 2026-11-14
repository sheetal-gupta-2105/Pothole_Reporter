import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { PotholeReport, ReportPriority, ReportStatus, DuplicatePair } from '../../types/report';
import { BENGALURU_CENTER, BENGALURU_HOTSPOTS } from '../../utils/geo';
import { Filter, Layers, Navigation } from 'lucide-react';
import { Button } from '../common/Button';

// Fix Leaflet's default icon path issues in bundlers
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface LeafletMapProps {
  reports: PotholeReport[];
  duplicates?: DuplicatePair[];
  onSelectReport: (report: PotholeReport) => void;
  selectedCoordinates?: { lat: number; lng: number } | null;
  className?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  reports,
  duplicates = [],
  onSelectReport,
  selectedCoordinates,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | ReportPriority>('all');
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'duplicates_only' | 'unique_only'>('all');

  // Identify reports involved in pending duplicate pairs
  const duplicateReportIds = useMemo(() => {
    const ids = new Set<string>();
    duplicates.forEach((d) => {
      if (d.status === 'pending') {
        ids.add(d.primaryReportId);
        ids.add(d.incomingReportId);
      }
    });
    return ids;
  }, [duplicates]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [BENGALURU_CENTER.lat, BENGALURU_CENTER.lng],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | BBMP Civic Tech',
        maxZoom: 19,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Center on coordinates and display 50m candidate radius circle if passed as prop
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (radiusCircleRef.current) {
      radiusCircleRef.current.remove();
      radiusCircleRef.current = null;
    }

    if (selectedCoordinates) {
      map.setView(
        [selectedCoordinates.lat, selectedCoordinates.lng],
        16,
        { animate: true }
      );

      // Render 50m geographic search boundary circle
      radiusCircleRef.current = L.circle([selectedCoordinates.lat, selectedCoordinates.lng], {
        radius: 50,
        color: '#f59e0b',
        fillColor: '#fbbf24',
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '5, 5',
      }).addTo(map);
    }
  }, [selectedCoordinates]);

  // Update Markers when reports or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // Filter valid reports
    const validReports = reports.filter((r) => {
      if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return false;
      if (isNaN(r.latitude) || isNaN(r.longitude)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;

      const isDuplicate = duplicateReportIds.has(r.id) || (Boolean(r.duplicateCount) && (r.duplicateCount ?? 0) > 0);
      if (duplicateFilter === 'duplicates_only' && !isDuplicate) return false;
      if (duplicateFilter === 'unique_only' && isDuplicate) return false;

      return true;
    });

    validReports.forEach((report) => {
      // Create custom SVG marker pin based on priority
      const getPinColor = (p: ReportPriority) => {
        switch (p) {
          case 'critical':
            return '#dc2626'; // red-600
          case 'high':
            return '#ea580c'; // orange-600
          case 'medium':
            return '#d97706'; // amber-600
          case 'low':
            return '#475569'; // slate-600
        }
      };

      const pinColor = getPinColor(report.priority);
      const isFlaggedDuplicate = duplicateReportIds.has(report.id);

      const customIcon = L.divIcon({
        className: 'custom-pothole-pin',
        html: `
          <div style="position: relative; cursor: pointer; transform: translate(-50%, -100%);">
            <svg width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${
                isFlaggedDuplicate
                  ? `<circle cx="16" cy="16" r="15" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="4,2"/>`
                  : ''
              }
              <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26 16 38 16 38C16 38 32 26 32 16C32 7.16344 24.8366 0 16 0Z" fill="${pinColor}" stroke="#ffffff" stroke-width="2"/>
              <circle cx="16" cy="16" r="6" fill="#ffffff"/>
            </svg>
            ${
              isFlaggedDuplicate
                ? `<span style="position: absolute; top: -8px; left: -6px; background: #f59e0b; color: white; font-size: 8px; font-weight: bold; border-radius: 9999px; padding: 1px 4px; border: 1.5px solid white;">DUP</span>`
                : ''
            }
            ${
              report.duplicateCount && report.duplicateCount > 0
                ? `<span style="position: absolute; top: -6px; right: -6px; background: #ea580c; color: white; font-size: 10px; font-weight: bold; border-radius: 9999px; padding: 1px 5px; border: 1.5px solid white;">+${report.duplicateCount}</span>`
                : ''
            }
          </div>
        `,
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([report.latitude, report.longitude], {
        icon: customIcon,
        title: `${report.id}: ${report.roadName}`,
      });

      // Construct Popup Content
      const popupHtml = document.createElement('div');
      popupHtml.className = 'p-1 font-sans text-slate-900 max-w-xs';
      popupHtml.innerHTML = `
        <div style="margin-bottom: 8px; border-radius: 6px; overflow: hidden; height: 95px; background: #0f172a;">
          <img src="${report.imageUrl}" alt="${report.roadName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80'" />
        </div>
        ${
          isFlaggedDuplicate
            ? `<div style="margin-bottom: 6px; padding: 3px 6px; border-radius: 4px; background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px;">⚠ Flagged in Duplicate Review Queue</div>`
            : ''
        }
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-family: monospace; font-size: 11px; font-weight: bold; color: #475569;">${report.id}</span>
          <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${
            report.priority === 'critical' ? '#fee2e2; color: #991b1b' : '#fef3c7; color: #92400e'
          };">${report.priority}</span>
        </div>
        <h4 style="font-size: 13px; font-weight: bold; margin: 0 0 4px 0; line-height: 1.3;">${report.roadName}</h4>
        <p style="font-size: 11px; color: #64748b; margin: 0 0 8px 0;">${report.zone} • Ward #${report.wardNumber}</p>
        <button id="inspect-btn-${report.id}" style="width: 100%; font-size: 11px; font-weight: 600; background: #0f172a; color: white; padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer;">
          Inspect Full Report Details →
        </button>
      `;

      // Attach event listener to button inside popup
      const inspectBtn = popupHtml.querySelector(`#inspect-btn-${report.id}`);
      if (inspectBtn) {
        inspectBtn.addEventListener('click', () => {
          onSelectReport(report);
        });
      }

      marker.bindPopup(popupHtml);
      marker.addTo(markersGroup);
    });
  }, [reports, statusFilter, priorityFilter, duplicateFilter, duplicateReportIds, onSelectReport]);

  const validCount = reports.filter(
    (r) =>
      typeof r.latitude === 'number' &&
      !isNaN(r.latitude) &&
      (statusFilter === 'all' || r.status === statusFilter) &&
      (priorityFilter === 'all' || r.priority === priorityFilter)
  ).length;

  const handleJumpToHotspot = (lat: number, lng: number) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 15, { animate: true });
    }
  };

  const handleResetBengaluruView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([BENGALURU_CENTER.lat, BENGALURU_CENTER.lng], 12, {
        animate: true,
      });
    }
  };

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col ${className}`}>
      {/* Map Filter Controls Bar */}
      <div className="bg-white/95 backdrop-blur-md p-3 border-b border-slate-200 z-10 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Map Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ReportStatus)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In Review</option>
            <option value="verified">Verified Defect</option>
            <option value="scheduled">Scheduled</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | ReportPriority)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical Only</option>
            <option value="high">High Only</option>
            <option value="medium">Medium Only</option>
            <option value="low">Low Only</option>
          </select>

          <select
            value={duplicateFilter}
            onChange={(e) =>
              setDuplicateFilter(e.target.value as 'all' | 'duplicates_only' | 'unique_only')
            }
            className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            <option value="all">All Complaints</option>
            <option value="duplicates_only">Flagged Duplicates Only</option>
            <option value="unique_only">Unique Defects Only</option>
          </select>

          {(statusFilter !== 'all' || priorityFilter !== 'all' || duplicateFilter !== 'all') && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setPriorityFilter('all');
                setDuplicateFilter('all');
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium underline ml-1"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            {validCount} Defect Markers Plotted
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetBengaluruView}
            leftIcon={<Navigation className="h-3 w-3" />}
            className="text-xs py-1 px-2.5"
            title="Reset center to Bengaluru core"
          >
            Center City
          </Button>
        </div>
      </div>

      {/* Hotspots Quick Jump Strip */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-[11px] text-slate-500 whitespace-nowrap z-10">
        <span className="font-semibold text-slate-700 flex items-center gap-1">
          <Layers className="h-3 w-3" /> Jump to:
        </span>
        {BENGALURU_HOTSPOTS.slice(0, 5).map((hotspot) => (
          <button
            key={hotspot.name}
            onClick={() => handleJumpToHotspot(hotspot.lat, hotspot.lng)}
            className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 hover:border-slate-400 font-medium transition-colors"
          >
            {hotspot.name.split(' (')[0]}
          </button>
        ))}
      </div>

      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="flex-1 w-full min-h-[500px] z-0" />

      {/* Priority Legend Overlay */}
      <div className="absolute bottom-6 right-6 z-20 bg-white/95 backdrop-blur-md p-3 rounded-lg border border-slate-200 shadow-md text-xs space-y-1.5 hidden sm:block">
        <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider mb-1">
          Defect Severity
        </span>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-600" />
          <span className="text-slate-700 font-medium">Critical</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-orange-500" />
          <span className="text-slate-700 font-medium">High</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span className="text-slate-700 font-medium">Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-500" />
          <span className="text-slate-700 font-medium">Low / Resolved</span>
        </div>
      </div>
    </div>
  );
};
