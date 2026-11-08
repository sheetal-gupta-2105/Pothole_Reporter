import React, { useState } from 'react';
import {
  RotateCcw,
  Download,
  Database,
  Sliders,
  Shield,
  Layers,
  MapPin,
  User,
  CheckCircle2,
} from 'lucide-react';
import { useReports } from '../context/ReportContext';
import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { exportReportsAsJSON, exportReportsAsGeoJSON } from '../utils/export';

export const SettingsPage: React.FC = () => {
  const {
    reports,
    duplicates,
    resetToDefaults,
    loadStressTestData,
    showToast,
  } = useReports();
  const { user, profile, isConfigured, isDemoUser } = useAuth();

  // Settings State
  const [similarityThreshold, setSimilarityThreshold] = useState(85);
  const [duplicateRadiusMeters, setDuplicateRadiusMeters] = useState(40);
  const [autoEscalateCritical, setAutoEscalateCritical] = useState(true);

  const handleSaveSettings = () => {
    showToast('success', 'Settings Saved', 'Detection thresholds and demo parameters updated.');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            System Administration
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
          Application Settings & Demo Controls
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Manage local client testbed data, simulated detection parameters, and export registries.
        </p>
      </div>

      {/* Demo Data Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-700" />
            <CardTitle>Demo Data & Local State Management</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            All reports and duplicate cluster records are stored locally in your browser
            (<code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">localStorage</code>
            ). You can reset to the original deterministic Bengaluru dataset or load extended
            records.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Reset Deterministic Dataset
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Restores 9 default Bengaluru reports and 2 pending duplicate pairs. Clears user-submitted demo complaints.
                </p>
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefaults}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  className="w-full text-xs"
                >
                  Reset Demo Dataset
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Load Extended Ward Dataset
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Injects additional simulated reports across South, West, and East zones for testing pagination and map density.
                </p>
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadStressTestData}
                  leftIcon={<Layers className="h-3.5 w-3.5 text-blue-600" />}
                  className="w-full text-xs"
                >
                  Load Extended Dataset (+4 records)
                </Button>
              </div>
            </div>
          </div>

          {/* Export Section */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 font-medium">
              Active ledger: <strong>{reports.length}</strong> reports,{' '}
              <strong>{duplicates.length}</strong> duplicate pairs.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReportsAsGeoJSON(reports)}
                leftIcon={<MapPin className="h-3.5 w-3.5 text-slate-500" />}
                className="text-xs"
              >
                Export GeoJSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReportsAsJSON(reports)}
                leftIcon={<Download className="h-3.5 w-3.5 text-slate-500" />}
                className="text-xs"
              >
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Simulated AI & Duplicate Parameters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-slate-700" />
            <CardTitle>Simulated AI & Duplicate Detection Thresholds</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Duplicate GPS radius */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-800">
                Spatial Clustering Radius (meters)
              </label>
              <span className="font-mono font-bold text-slate-900">
                {duplicateRadiusMeters} meters
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={duplicateRadiusMeters}
              onChange={(e) => setDuplicateRadiusMeters(Number(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              New submissions within this spatial distance from an active defect are flagged for duplicate review.
            </p>
          </div>

          {/* Visual Embedding Similarity */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-800">
                Simulated Visual Similarity Cutoff (%)
              </label>
              <span className="font-mono font-bold text-slate-900">
                {similarityThreshold}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={98}
              step={1}
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              Simulated cosine similarity threshold between defect imagery embeddings.
            </p>
          </div>

          {/* Auto Escalate */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-800 block">
                Auto-Escalate Arterial Corridor Reports
              </label>
              <p className="text-[11px] text-slate-400">
                Automatically tags Outer Ring Road and Silk Board crater reports as Critical Priority.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoEscalateCritical}
              onChange={(e) => setAutoEscalateCritical(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="primary" size="sm" onClick={handleSaveSettings} className="text-xs">
            Save Parameter Changes
          </Button>
        </CardFooter>
      </Card>

      {/* Citizen Profile & Authentication Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-slate-700" />
              <CardTitle>Citizen Profile & Authentication</CardTitle>
            </div>
            {isConfigured && !isDemoUser ? (
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Supabase Auth Active
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Demo Session Mode
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Citizen Name</span>
              <p className="font-bold text-slate-900 mt-0.5">{profile?.fullName || 'Citizen Reporter'}</p>
              <span className="text-[11px] text-slate-500">Civic Contributor</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Account Email</span>
              <p className="font-bold text-slate-900 mt-0.5 truncate">{user?.email || 'citizen.demo@bengaluru.gov.in'}</p>
              <span className="text-[11px] text-slate-500">
                {user?.email_confirmed_at ? 'Email Verified' : (isDemoUser ? 'Local Demo' : 'Pending Verification')}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Citizen UUID</span>
              <p className="font-mono text-[11px] font-semibold text-slate-800 mt-0.5 truncate">
                {user?.id || 'demo-user-id'}
              </p>
              <span className="text-[11px] text-slate-500">Supabase Auth ID</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Architecture & Tech Stack Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-700" />
            <CardTitle>Architecture & Technical Specifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                Frontend Framework
              </span>
              <p className="font-bold text-slate-900 mt-0.5">React 19 + TypeScript</p>
              <span className="text-[11px] text-slate-500">Vite 8 Build Engine</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                UI & Styling
              </span>
              <p className="font-bold text-slate-900 mt-0.5">Tailwind CSS v4</p>
              <span className="text-[11px] text-slate-500">Lucide React Icons</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                Geographic Engine
              </span>
              <p className="font-bold text-slate-900 mt-0.5">Leaflet 1.9 + OSM</p>
              <span className="text-[11px] text-slate-500">Haversine Spatial Proximity</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                Target Municipality
              </span>
              <p className="font-bold text-slate-900 mt-0.5">BBMP Bengaluru</p>
              <span className="text-[11px] text-slate-500">8 Municipal Zones</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                Persistence Tier
              </span>
              <p className="font-bold text-slate-900 mt-0.5">Client LocalStorage</p>
              <span className="text-[11px] text-slate-500">FastAPI & Supabase Ready</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 text-[10px] uppercase font-bold">
                Implementation Phase
              </span>
              <p className="font-bold text-slate-900 mt-0.5">Phase 3.2: Citizen Auth</p>
              <span className="text-[11px] text-slate-500">Supabase JWT + Session Auth</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
