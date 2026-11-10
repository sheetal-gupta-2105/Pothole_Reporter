import React, {
  createContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from 'react';
import type {
  PotholeReport,
  DuplicatePair,
  ReportStatus,
  ReportPriority,
} from '../types/report';
import { INITIAL_REPORTS } from '../data/mockReports';
import { INITIAL_DUPLICATE_PAIRS } from '../data/mockDuplicates';
import { calculateDistanceMeters } from '../utils/geo';
import { useAuth } from '../hooks/useAuth';
import { clearSignedUrlCache } from '../services/storage';
import {
  fetchSupabaseReports,
  createSupabaseReport,
  updateSupabaseReportStatus,
  updateSupabaseReportPriority,
  deleteSupabaseReport,
  type CreateReportInput,
} from '../services/reports';

interface ToastState {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
}

export interface ReportContextType {
  reports: PotholeReport[];
  duplicates: DuplicatePair[];
  toasts: ToastState[];
  isLoading: boolean;
  error: string | null;
  isLiveSync: boolean;
  showToast: (type: ToastState['type'], title: string, message?: string) => void;
  removeToast: (id: string) => void;
  refreshReports: () => Promise<void>;
  addReport: (
    reportData: Omit<PotholeReport, 'id' | 'createdAt' | 'updatedAt' | 'duplicateCount'>
  ) => PotholeReport;
  createReport: (input: CreateReportInput) => Promise<PotholeReport>;
  updateReportStatus: (id: string, status: ReportStatus) => Promise<void>;
  updateReportPriority: (id: string, priority: ReportPriority) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  confirmDuplicate: (pairId: string, notes?: string) => void;
  rejectDuplicate: (pairId: string, notes?: string) => void;
  resetToDefaults: () => void;
  loadStressTestData: () => void;
  getReportById: (id: string) => PotholeReport | undefined;
}

export const ReportContext = createContext<ReportContextType | undefined>(undefined);

const STORAGE_REPORTS_KEY = 'blr_pothole_reports_v1';
const STORAGE_DUPLICATES_KEY = 'blr_pothole_duplicates_v1';

export const ReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isConfigured, isDemoUser } = useAuth();
  const currentIdentity = isDemoUser ? 'demo' : user?.id ?? null;
  const activeIdentityRef = useRef<string | null>(currentIdentity);
  const reportRequestIdRef = useRef(0);
  const identityGenerationRef = useRef(0);

  const [reports, setReports] = useState<PotholeReport[]>(() => {
    if (user && !isDemoUser) {
      return [];
    }

    const saved = localStorage.getItem(STORAGE_REPORTS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return INITIAL_REPORTS;
  });

  const [duplicates, setDuplicates] = useState<DuplicatePair[]>(() => {
    if (!isDemoUser) {
      return INITIAL_DUPLICATE_PAIRS;
    }

    const saved = localStorage.getItem(STORAGE_DUPLICATES_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return INITIAL_DUPLICATE_PAIRS;
  });

  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveSync, setIsLiveSync] = useState<boolean>(false);

  useLayoutEffect(() => {
    if (activeIdentityRef.current === currentIdentity) {
      return () => {
        reportRequestIdRef.current += 1;
      };
    }

    activeIdentityRef.current = currentIdentity;
    identityGenerationRef.current += 1;
    reportRequestIdRef.current += 1;
    clearSignedUrlCache();
    setIsLiveSync(false);
    setIsLoading(false);
    setError(null);

    if (currentIdentity === 'demo') {
      const savedReports = localStorage.getItem(STORAGE_REPORTS_KEY);
      const savedDuplicates = localStorage.getItem(STORAGE_DUPLICATES_KEY);

      try {
        setReports(savedReports ? JSON.parse(savedReports) : INITIAL_REPORTS);
      } catch {
        setReports(INITIAL_REPORTS);
      }

      try {
        setDuplicates(savedDuplicates ? JSON.parse(savedDuplicates) : INITIAL_DUPLICATE_PAIRS);
      } catch {
        setDuplicates(INITIAL_DUPLICATE_PAIRS);
      }
    } else if (currentIdentity === null) {
      setReports(INITIAL_REPORTS);
      setDuplicates(INITIAL_DUPLICATE_PAIRS);
    } else {
      setReports([]);
      setDuplicates(INITIAL_DUPLICATE_PAIRS);
    }

    return () => {
      reportRequestIdRef.current += 1;
    };
  }, [currentIdentity]);

  const isIdentityCurrent = (identity: string | null, generation: number) =>
    activeIdentityRef.current === identity && identityGenerationRef.current === generation;

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastState['type'], title: string, message?: string) => {
      const id = `${Math.random().toString(36).slice(2, 9)}-${title.slice(0, 5)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  // Fetch reports from Supabase when authenticated
  const loadLiveReports = useCallback(
    async (forceRefresh = false) => {
      if (!isConfigured || isDemoUser || !user) {
        setIsLiveSync(false);
        setIsLoading(false);

        if (!user && !isDemoUser) {
          clearSignedUrlCache();
          setReports(INITIAL_REPORTS);
        }
        return;
      }

      const requestId = ++reportRequestIdRef.current;
      const requestedUserId = user.id;

      setIsLoading(true);
      setError(null);

      try {
        const liveReports = await fetchSupabaseReports(forceRefresh);

        if (
          requestId !== reportRequestIdRef.current ||
          activeIdentityRef.current !== requestedUserId
        ) {
          return;
        }

        setReports(liveReports);
        setIsLiveSync(true);
      } catch (err) {
        if (
          requestId !== reportRequestIdRef.current ||
          activeIdentityRef.current !== requestedUserId
        ) {
          return;
        }

        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to fetch reports from Supabase';

        setError(msg);
        setIsLiveSync(false);
        console.warn('[Pothole Reporter] Supabase fetch error:', msg);
      } finally {
        if (requestId === reportRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isConfigured, isDemoUser, user]
  );

  useEffect(() => {
    void loadLiveReports(false);
  }, [loadLiveReports]);

  const refreshReports = useCallback(async () => {
    await loadLiveReports(true);
  }, [loadLiveReports]);

  // Persist demo reports to localStorage only when in demo mode
  useEffect(() => {
    if (!isLiveSync && isDemoUser) {
      localStorage.setItem(STORAGE_REPORTS_KEY, JSON.stringify(reports));
    }
  }, [reports, isLiveSync, isDemoUser]);

  useEffect(() => {
    if (isDemoUser) {
      localStorage.setItem(STORAGE_DUPLICATES_KEY, JSON.stringify(duplicates));
    }
  }, [duplicates, isDemoUser]);

  const getReportById = (id: string) => reports.find((r) => r.id === id);

  /**
   * Real Supabase Report Creation with Storage Upload & Rollback
   */
  const createReport = async (input: CreateReportInput): Promise<PotholeReport> => {
    const initiatingIdentity = currentIdentity;
    const initiatingGeneration = identityGenerationRef.current;

    if (isConfigured && !isDemoUser && user) {
      try {
        const created = await createSupabaseReport(input);

        if (!isIdentityCurrent(initiatingIdentity, initiatingGeneration)) {
          return created;
        }

        // Check simulated proximity for duplicate warning
        const nearbyReport = reports.find((r) => {
          const dist = calculateDistanceMeters(
            input.latitude,
            input.longitude,
            r.latitude,
            r.longitude
          );
          return dist <= 50;
        });

        if (nearbyReport) {
          const distance = calculateDistanceMeters(
            input.latitude,
            input.longitude,
            nearbyReport.latitude,
            nearbyReport.longitude
          );
          const simulatedSimilarity = Math.min(98, Math.max(72, Math.round(100 - distance * 0.5)));

          const newPair: DuplicatePair = {
            id: `DUP-PAIR-${Math.floor(100 + Math.random() * 900)}`,
            primaryReportId: nearbyReport.id,
            incomingReportId: created.id,
            distanceMeters: distance,
            simulatedVisualSimilarity: simulatedSimilarity,
            clusterConfidence: Math.round((simulatedSimilarity + (100 - distance)) / 2),
            status: 'pending',
          };

          setDuplicates((prev) => [newPair, ...prev]);
          showToast(
            'warning',
            'Potential Duplicate Flagged',
            `New submission is within ${distance}m of existing defect ${nearbyReport.id}. Added to review queue.`
          );
        } else {
          showToast(
            'success',
            'Report Persisted in Supabase',
            `Successfully stored in public.reports and images saved to private storage.`
          );
        }

        setReports((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Database submission failed.';
        if (isIdentityCurrent(initiatingIdentity, initiatingGeneration)) {
          showToast('error', 'Report Submission Failed', msg);
        }
        throw err;
      }
    }

    // Fallback for demo session / unconfigured
    const originalFilePreview =
      input.originalFile instanceof File
        ? URL.createObjectURL(input.originalFile)
        : '/samples/sample1.jpg';

    const fallbackReport = addReport({
      roadName: input.roadName,
      zone: input.zone,
      wardNumber: input.wardNumber,
      description: input.description,
      status: 'submitted',
      priority: input.priority,
      latitude: input.latitude,
      longitude: input.longitude,
      imageUrl: originalFilePreview,
      reporterName: input.reporterName,
      reporterContact: input.reporterContact,
      realAiDetection: input.realAiDetection,
    });

    return fallbackReport;
  };

  /**
   * Legacy / Demo Synchronous Add Report Helper
   */
  const addReport = (
    reportData: Omit<PotholeReport, 'id' | 'createdAt' | 'updatedAt' | 'duplicateCount'>
  ): PotholeReport => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newId = `BLR-2026-${randomSuffix}`;
    const nowIso = new Date().toISOString();

    const createdReport: PotholeReport = {
      ...reportData,
      id: newId,
      createdAt: nowIso,
      updatedAt: nowIso,
      duplicateCount: 0,
      isLiveRecord: false,
    };

    // Duplicate detection simulation: check proximity against existing reports
    const nearbyReport = reports.find((r) => {
      const dist = calculateDistanceMeters(
        reportData.latitude,
        reportData.longitude,
        r.latitude,
        r.longitude
      );
      return dist <= 50;
    });

    if (nearbyReport) {
      const distance = calculateDistanceMeters(
        reportData.latitude,
        reportData.longitude,
        nearbyReport.latitude,
        nearbyReport.longitude
      );
      const simulatedSimilarity = Math.min(98, Math.max(72, Math.round(100 - distance * 0.5)));

      const newPair: DuplicatePair = {
        id: `DUP-PAIR-${Math.floor(100 + Math.random() * 900)}`,
        primaryReportId: nearbyReport.id,
        incomingReportId: newId,
        distanceMeters: distance,
        simulatedVisualSimilarity: simulatedSimilarity,
        clusterConfidence: Math.round((simulatedSimilarity + (100 - distance)) / 2),
        status: 'pending',
      };

      setDuplicates((prev) => [newPair, ...prev]);
      showToast(
        'warning',
        'Potential Duplicate Detected',
        `New report is within ${distance}m of existing report ${nearbyReport.id}. Added to Duplicate Review queue.`
      );
    } else {
      showToast(
        'success',
        'Pothole Reported Successfully',
        `Registered as ${newId}. Simulated AI triage assigned priority: ${reportData.priority.toUpperCase()}`
      );
    }

    setReports((prev) => [createdReport, ...prev]);
    return createdReport;
  };

  const updateReportStatus = async (id: string, status: ReportStatus) => {
    const initiatingIdentity = currentIdentity;
    const initiatingGeneration = identityGenerationRef.current;
    const target = reports.find((r) => r.id === id);

    // If live Supabase record, enforce citizen ownership and update in database
    if (target?.isLiveRecord && isConfigured && !isDemoUser) {
      if (user && target.userId && user.id !== target.userId) {
        showToast(
          'error',
          'Unauthorized Modification',
          'You can only modify defect reports submitted by your own account.'
        );
        return;
      }

      try {
        await updateSupabaseReportStatus(id, status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update status in Supabase';
        if (isIdentityCurrent(initiatingIdentity, initiatingGeneration)) {
          showToast('error', 'Status Update Failed', msg);
        }
        return;
      }
    }

    if (!isIdentityCurrent(initiatingIdentity, initiatingGeneration)) return;

    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r))
    );
    showToast('info', 'Status Updated', `Report ${id} changed to ${status.replace('_', ' ')}.`);
  };

  const updateReportPriority = async (id: string, priority: ReportPriority) => {
    const initiatingIdentity = currentIdentity;
    const initiatingGeneration = identityGenerationRef.current;
    const target = reports.find((r) => r.id === id);

    // If live Supabase record, enforce citizen ownership and update in database
    if (target?.isLiveRecord && isConfigured && !isDemoUser) {
      if (user && target.userId && user.id !== target.userId) {
        showToast(
          'error',
          'Unauthorized Modification',
          'You can only modify defect reports submitted by your own account.'
        );
        return;
      }

      try {
        await updateSupabaseReportPriority(id, priority);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update priority in Supabase';
        if (isIdentityCurrent(initiatingIdentity, initiatingGeneration)) {
          showToast('error', 'Priority Update Failed', msg);
        }
        return;
      }
    }

    if (!isIdentityCurrent(initiatingIdentity, initiatingGeneration)) return;

    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, priority, updatedAt: new Date().toISOString() } : r))
    );
    showToast('info', 'Priority Updated', `Report ${id} priority set to ${priority}.`);
  };

  const deleteReport = async (id: string) => {
    const initiatingIdentity = currentIdentity;
    const initiatingGeneration = identityGenerationRef.current;
    const target = reports.find((r) => r.id === id);
    if (!target) return;

    if (target.isLiveRecord && isConfigured && !isDemoUser) {
      if (user && target.userId && user.id !== target.userId) {
        showToast(
          'error',
          'Unauthorized Deletion',
          'You cannot delete a defect report filed by another citizen.'
        );
        return;
      }

      try {
        await deleteSupabaseReport(target);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete report from Supabase';
        if (isIdentityCurrent(initiatingIdentity, initiatingGeneration)) {
          showToast('error', 'Delete Failed', msg);
        }
        return;
      }
    }

    if (!isIdentityCurrent(initiatingIdentity, initiatingGeneration)) return;

    setReports((prev) => prev.filter((r) => r.id !== id));
    showToast('info', 'Report Deleted', `Report ${id} has been removed.`);
  };

  const confirmDuplicate = (pairId: string, notes?: string) => {
    const pair = duplicates.find((d) => d.id === pairId);
    if (!pair) return;

    setDuplicates((prev) =>
      prev.map((d) =>
        d.id === pairId
          ? {
              ...d,
              status: 'confirmed',
              reviewedAt: new Date().toISOString(),
              reviewNotes: notes || 'Verified duplicate road defect.',
            }
          : d
      )
    );

    setReports((prev) =>
      prev.map((r) => {
        if (r.id === pair.incomingReportId) {
          return {
            ...r,
            status: 'rejected',
            duplicateOfId: pair.primaryReportId,
            updatedAt: new Date().toISOString(),
          };
        }
        if (r.id === pair.primaryReportId) {
          return {
            ...r,
            duplicateCount: (r.duplicateCount || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
        }
        return r;
      })
    );

    showToast(
      'success',
      'Duplicate Confirmed',
      `Complaint ${pair.incomingReportId} linked into master report ${pair.primaryReportId}.`
    );
  };

  const rejectDuplicate = (pairId: string, notes?: string) => {
    setDuplicates((prev) =>
      prev.map((d) =>
        d.id === pairId
          ? {
              ...d,
              status: 'rejected',
              reviewedAt: new Date().toISOString(),
              reviewNotes: notes || 'Manually reviewed as unique crater defect.',
            }
          : d
      )
    );

    showToast('info', 'Duplicate Rejected', `Marked as independent distinct road defect.`);
  };

  const resetToDefaults = () => {
    setReports(INITIAL_REPORTS);
    setDuplicates(INITIAL_DUPLICATE_PAIRS);
    localStorage.removeItem(STORAGE_REPORTS_KEY);
    localStorage.removeItem(STORAGE_DUPLICATES_KEY);
    showToast('info', 'Demo Dataset Reset', 'Restored 9 original deterministic Bengaluru reports.');
  };

  const loadStressTestData = () => {
    const extraReports: PotholeReport[] = [
      {
        id: 'BLR-2026-9041',
        roadName: 'Bannerghatta Main Rd near Bilekahalli',
        zone: 'Bommanahalli',
        wardNumber: 188,
        description: 'Large fissure near water pipe maintenance opening. Traffic crawling.',
        status: 'submitted',
        priority: 'high',
        latitude: 12.8992,
        longitude: 77.5987,
        imageUrl:
          'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
        reporterName: 'Sunil Gowda',
        reporterContact: '+91 98451 *****',
        createdAt: '2026-10-21T08:30:00Z',
        updatedAt: '2026-10-21T08:30:00Z',
        simulatedAiDetection: {
          potholeDetected: true,
          confidenceScore: 94.2,
          estimatedSeverity: 'high',
          estimatedDepthCm: 9.5,
          estimatedSurfaceAreaSqM: 0.95,
          detectedFeatures: ['High traffic road', 'Exposed sub-base'],
        },
      },
      {
        id: 'BLR-2026-9042',
        roadName: 'Old Madras Road near KR Puram Rly Stn',
        zone: 'East Zone',
        wardNumber: 52,
        description: 'Crater cluster beneath skywalk. Buses swerving sharply towards median.',
        status: 'in_review',
        priority: 'critical',
        latitude: 12.9981,
        longitude: 77.6755,
        imageUrl:
          'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80',
        reporterName: 'Meera Iyer',
        reporterContact: '+91 99002 *****',
        createdAt: '2026-10-20T14:15:00Z',
        updatedAt: '2026-10-21T09:00:00Z',
        simulatedAiDetection: {
          potholeDetected: true,
          confidenceScore: 98.7,
          estimatedSeverity: 'critical',
          estimatedDepthCm: 14.0,
          estimatedSurfaceAreaSqM: 1.6,
          detectedFeatures: ['Multiple pothole cluster', 'Severe impact risk'],
        },
      },
    ];

    setReports((prev) => [...extraReports, ...prev]);
    showToast('success', 'Extended Data Loaded', `Added additional ward inspection records.`);
  };

  return (
    <ReportContext.Provider
      value={{
        reports,
        duplicates,
        toasts,
        isLoading,
        error,
        isLiveSync,
        showToast,
        removeToast,
        refreshReports,
        addReport,
        createReport,
        updateReportStatus,
        updateReportPriority,
        deleteReport,
        confirmDuplicate,
        rejectDuplicate,
        resetToDefaults,
        loadStressTestData,
        getReportById,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
};

export { useReports } from '../hooks/useReports';
