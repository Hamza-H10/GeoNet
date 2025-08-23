import { useEffect, useRef } from 'react';

export type DeviceMarker = { id: string; lat: number; lon: number };

let googleMapsLoader: Promise<void> | null = null;

// Minimal declarations to access global
declare global {
  interface Window {
    google?: {
      maps?: {
        Map: new (el: HTMLElement, opts?: unknown) => unknown;
        Marker: new (opts?: unknown) => { setMap: (map: unknown | null) => void };
        LatLngBounds: new () => { extend: (latLng: { lat: number; lng: number }) => void };
      };
    };
    GMAPS_API_KEY?: string;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google && window.google.maps) return Promise.resolve();
  if (!googleMapsLoader) {
    googleMapsLoader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const key = encodeURIComponent(apiKey);
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
      document.head.appendChild(script);
    });
  }
  return googleMapsLoader;
}

export default function GoogleDevicesMap({ markers, zoom, center }: { markers: DeviceMarker[]; zoom?: number; center?: { lat: number; lon: number } }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
  const envKey = (import.meta as { env?: Record<string, string | undefined> })?.env?.VITE_GOOGLE_MAPS_API_KEY;
  const apiKey = envKey || window.GMAPS_API_KEY || '';
  let map: unknown;
  let gmarkers: Array<{ setMap?: (map: unknown | null) => void }> = [];

    async function init() {
      try {
        await loadGoogleMaps(apiKey);
  const g = window.google!;
  if (!ref.current || !g.maps) return;

        // Determine center
        let centerLat = 0, centerLon = 0;
        if (center) {
          centerLat = center.lat; centerLon = center.lon;
        } else if (markers.length > 0) {
          centerLat = markers.reduce((a, m) => a + m.lat, 0) / markers.length;
          centerLon = markers.reduce((a, m) => a + m.lon, 0) / markers.length;
        } else {
          centerLat = 0; centerLon = 0;
        }

  map = new g.maps.Map(ref.current, {
          center: { lat: centerLat, lng: centerLon },
          zoom: zoom ?? (markers.length <= 1 ? 14 : 12),
          mapTypeId: 'roadmap',
          streetViewControl: false,
          fullscreenControl: false,
        });

        // Add markers
        const bounds = new g.maps.LatLngBounds();
        gmarkers = markers.map(m => {
          const pos = { lat: m.lat, lng: m.lon };
          const marker = g.maps ? new g.maps.Marker({ position: pos, map, title: m.id }) : { setMap: () => {} };
          bounds.extend(pos);
          return marker;
        });
        if (markers.length > 1) {
          (map as { fitBounds?: (b: unknown, padding?: number) => void }).fitBounds?.(bounds, 48);
        }
      } catch (err) {
        console.error('GoogleDevicesMap init failed', err);
      }
    }

    init();
    return () => {
      // Clean up markers from map
      gmarkers.forEach(m => m.setMap?.(null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers), zoom, center?.lat, center?.lon]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
