import React, { useState } from 'react';
import {
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '../common/Button';
import { BENGALURU_HOTSPOTS, isValidBengaluruCoord } from '../../utils/geo';
import type { BBMPZone } from '../../types/report';

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  roadName: string;
  selectedZone: BBMPZone;
  selectedWard: number;
  onLocationChange: (
    lat: string,
    lng: string,
    roadName?: string,
    zone?: BBMPZone,
    ward?: number
  ) => void;
  latError?: string;
  lngError?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  latitude,
  longitude,
  roadName: _roadName,
  selectedZone: _selectedZone,
  selectedWard: _selectedWard,
  onLocationChange,
  latError,
  lngError,
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
  }>({ type: 'idle', message: '' });

  const handleRequestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus({
        type: 'error',
        message: 'Geolocation is not supported by your browser.',
      });
      return;
    }

    setIsLocating(true);
    setGeoStatus({ type: 'idle', message: 'Requesting device GPS coordinates...' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        onLocationChange(lat, lng);
        setGeoStatus({
          type: 'success',
          message: `Acquired GPS location: ${lat}, ${lng} (±${Math.round(position.coords.accuracy)}m)`,
        });
      },
      (error) => {
        setIsLocating(false);
        let msg = 'Failed to retrieve location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied by user. Please enter coordinates manually or choose a preset.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location position unavailable. Please enter coordinates manually.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'GPS request timed out. Please enter manually.';
        }
        setGeoStatus({ type: 'error', message: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleSelectHotspot = (hotspot: (typeof BENGALURU_HOTSPOTS)[0]) => {
    const hasCustomCoords = Boolean(latitude.trim() || longitude.trim());
    const nextLat = hasCustomCoords ? latitude : hotspot.lat.toFixed(6);
    const nextLng = hasCustomCoords ? longitude : hotspot.lng.toFixed(6);

    onLocationChange(
      nextLat,
      nextLng,
      hotspot.name,
      hotspot.zone,
      hotspot.wardNumber
    );
    setGeoStatus({
      type: 'success',
      message: hasCustomCoords
        ? `Selected preset: ${hotspot.name} (preserved custom coordinates)`
        : `Selected preset: ${hotspot.name}`,
    });
  };

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  const isBengaluru =
    !isNaN(latNum) && !isNaN(lngNum) && isValidBengaluruCoord(latNum, lngNum);

  return (
    <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">
            Geographic Coordinates & Location
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Pinpoint the road hazard coordinates for repair dispatch
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRequestGeolocation}
          disabled={isLocating}
          leftIcon={
            isLocating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
            ) : (
              <Navigation className="h-3.5 w-3.5 text-blue-600" />
            )
          }
          className="text-xs font-semibold shrink-0"
        >
          {isLocating ? 'Acquiring GPS...' : 'Use Browser Geolocation'}
        </Button>
      </div>

      {/* Geolocation feedback banner */}
      {geoStatus.message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
            geoStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {geoStatus.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          )}
          <span>{geoStatus.message}</span>
        </div>
      )}

      {/* Lat & Long input fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Latitude <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              placeholder="e.g. 12.971600"
              value={latitude}
              onChange={(e) => onLocationChange(e.target.value, longitude)}
              className="w-full text-xs sm:text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
              °N
            </span>
          </div>
          {latError && (
            <span className="text-[11px] text-rose-600 font-medium block mt-1">
              {latError}
            </span>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Longitude <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              placeholder="e.g. 77.594600"
              value={longitude}
              onChange={(e) => onLocationChange(latitude, e.target.value)}
              className="w-full text-xs sm:text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
              °E
            </span>
          </div>
          {lngError && (
            <span className="text-[11px] text-rose-600 font-medium block mt-1">
              {lngError}
            </span>
          )}
        </div>
      </div>

      {/* Coordinate Validity notice */}
      {latitude && longitude && (
        <div className="text-[11px] flex items-center gap-1.5 text-slate-500">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span>
            {isBengaluru ? (
              <span className="text-emerald-700 font-medium">
                Coordinates are within Greater Bengaluru BBMP jurisdiction.
              </span>
            ) : (
              <span className="text-amber-700 font-medium">
                Notice: Coordinates fall outside typical Bengaluru metropolitan bounds.
              </span>
            )}
          </span>
        </div>
      )}

      {/* Hotspots Quick Preset selector */}
      <div className="pt-2 border-t border-slate-100">
        <label className="text-xs font-semibold text-slate-500 block mb-2">
          Or Quick Pick a Known Bengaluru Hotspot Corridor:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {BENGALURU_HOTSPOTS.map((hotspot) => (
            <button
              key={hotspot.name}
              type="button"
              onClick={() => handleSelectHotspot(hotspot)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1"
            >
              <MapPin className="h-3 w-3 text-slate-400" />
              <span>{hotspot.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
