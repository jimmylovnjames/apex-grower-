import React, { useEffect, useRef, useState } from 'react';
import { GrowLocation } from '../types';
import { LocationSuggestion, detectLocation, searchLocations, suggestionToLocation } from '../services/geo';
import { CrosshairIcon, LoaderIcon, MapPinIcon, SearchIcon } from './Icons';

interface LocationPickerProps {
  value: GrowLocation | null;
  onChange: (location: GrowLocation) => void;
  compact?: boolean;
}

/**
 * GPS detection with a city-search fallback. Search is debounced so a keystroke
 * does not become a request, and GPS failure is never fatal — the grower can
 * always type a city.
 */
const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange, compact }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const found = await searchLocations(query);
        // Ignore responses from searches the grower has already typed past.
        if (requestId.current === id) setResults(found);
      } catch {
        if (requestId.current === id) setError('Could not reach the location service.');
      } finally {
        if (requestId.current === id) setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      onChange(await detectLocation());
      setQuery('');
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not detect your location.');
    } finally {
      setDetecting(false);
    }
  };

  const handlePick = (suggestion: LocationSuggestion) => {
    onChange(suggestionToLocation(suggestion));
    setQuery('');
    setResults([]);
  };

  return (
    <div className="space-y-3">
      {value && (
        <div className="flex items-center gap-2 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <MapPinIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-200 truncate">
            {value.label}{value.country ? `, ${value.country}` : ''}
          </span>
          <span className="ml-auto text-[10px] font-mono text-emerald-500/70 flex-shrink-0">
            {value.latitude.toFixed(2)}, {value.longitude.toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={value ? 'Change city…' : 'Search your city or town'}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
          />
          {searching && <LoaderIcon className="w-4 h-4 text-emerald-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>

        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          title="Use my current location"
          className="flex-shrink-0 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 text-zinc-300 hover:text-emerald-400 transition-colors disabled:opacity-50"
        >
          {detecting ? <LoaderIcon className="w-5 h-5 animate-spin" /> : <CrosshairIcon className="w-5 h-5" />}
        </button>
      </div>

      {error && <p className="text-xs text-amber-400">{error}</p>}

      {results.length > 0 && (
        <div className="border border-zinc-700 rounded-lg overflow-hidden divide-y divide-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handlePick(result)}
              className="w-full text-left px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <div className="text-sm text-zinc-200">{result.label}</div>
              <div className="text-xs text-zinc-500">
                {result.country} · {result.latitude.toFixed(2)}, {result.longitude.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <p className="text-xs text-zinc-500 leading-relaxed">
          Your location drives the forecast, daylight hours and season used for advice. It stays in this
          browser and is only sent to the weather and geocoding services.
        </p>
      )}
    </div>
  );
};

export default LocationPicker;
