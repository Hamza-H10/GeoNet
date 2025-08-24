import { useEffect, useRef, useState } from 'react';

// Shared types (match mock)
// Include the timestamp (ts) and ISO string for the value that contributed to the bucket,
// so UI or other logic can show the date/time of the particular data.
export type AxisPoint = {
  hour: number;
  x: number;
  y: number;
  z: number;
  ts?: number;        // epoch millis for the max value seen in this hour bucket
  iso?: string;       // ISO string derived from ts
};
export type Meter = {
  id: string;
  location: string;
  lat?: number | null;
  lon?: number | null;
  currentX: number;
  currentY: number;
  currentZ: number;
  todayMaxX: number;
  todayMaxY: number;
  todayMaxZ: number;
  allTimeHighX: number;
  allTimeHighY: number;
  allTimeHighZ: number;
  status: 'safe' | 'warning' | 'danger';
  history: AxisPoint[];
  lastUpdated: number; // epoch millis of latest reading for this sensor
};

export type TiltMode = 'current' | 'today' | 'alltime';

export function statusOf(x: number, y: number): Meter['status'] {
  const v = Math.max(x, y);
  if (v < 5) return 'safe';
  if (v < 10) return 'warning';
  return 'danger';
}

// Raw payload types
export type RawTiltRecord = {
  deviceId?: string;
  device_id?: string;
  timestamp?: string | number;
  accelerometer?: {
    x_angle?: number | string;
    y_angle?: number | string;
    z_displacement_mm?: number | string;
  };
  gps?: {
    latitude?: number | string;
    longitude?: number | string;
  };
};

const URL = 'https://getnet-hamexlabs-default-rtdb.asia-southeast1.firebasedatabase.app/tiltmeter.json';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function getString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function normalize(raw: unknown): RawTiltRecord[] {
  // Helper: parse Firestore number value
  const fsNum = (val: unknown): number | undefined => {
    if (!isRecord(val)) return toNumber(val) ?? undefined;
    const dv = val['doubleValue'];
    const iv = val['integerValue'];
    const nv = toNumber(dv ?? iv);
    return nv == null ? undefined : nv;
  };

  // Helper: parse mapValue fields into plain object
  const fsMapFields = (mapVal: unknown): Record<string, unknown> | undefined => {
    if (!isRecord(mapVal)) return undefined;
    const mv = mapVal['mapValue'];
    const fields = isRecord(mv) && isRecord(mv['fields']) ? (mv['fields'] as Record<string, unknown>) : undefined;
    return fields;
  };

  const mapRow = (v: unknown): RawTiltRecord | null => {
    if (!isRecord(v)) return null;
    const r: RawTiltRecord = {};
    // Direct/RTDB style
    let deviceId = getString(v['deviceId']) || getString(v['device_id']);
    let timestamp: string | number | undefined = ((): string | number | undefined => {
      const t = v['timestamp'];
      if (typeof t === 'number') return t;
      if (typeof t === 'string') return /^\d+$/.test(t.trim()) ? Number(t) : t;
      return undefined;
    })();

    let accel = isRecord(v['accelerometer']) ? (v['accelerometer'] as Record<string, unknown>) : undefined;
    let gps = isRecord(v['gps']) ? (v['gps'] as Record<string, unknown>) : undefined;

    // Firestore REST document shape
    if (!deviceId && isRecord(v['name'])) {
      // Unlikely: name is never object; ignore
    }
    if (!deviceId && typeof v['name'] === 'string') {
      const name = v['name'] as string; // projects/.../documents/tiltmeter/{deviceId}/readings/{docId}
      const parts = name.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'tiltmeter');
      if (idx >= 0) {
        const dev = parts[idx + 1];
        const docId = parts[idx + 3];
        if (dev) deviceId = dev;
        if (!timestamp && docId) timestamp = docId; // ISO string
      }
      // fields under v.fields
      const fields = isRecord(v['fields']) ? (v['fields'] as Record<string, unknown>) : undefined;
      if (fields) {
        const accelFields = fsMapFields(fields['accelerometer']);
        const gpsFields = fsMapFields(fields['gps']);
        accel = accelFields
          ? {
              x_angle: fsNum(accelFields['x_angle']),
              y_angle: fsNum(accelFields['y_angle']),
              z_displacement_mm: fsNum(accelFields['z_displacement_mm']),
            }
          : undefined;
        gps = gpsFields
          ? {
              latitude: fsNum(gpsFields['latitude']),
              longitude: fsNum(gpsFields['longitude']),
            }
          : undefined;
      }
    }

    r.deviceId = deviceId;
    r.timestamp = timestamp;
    r.accelerometer = accel
      ? {
          x_angle: toNumber(accel['x_angle']) ?? undefined,
          y_angle: toNumber(accel['y_angle']) ?? undefined,
          z_displacement_mm: toNumber(accel['z_displacement_mm']) ?? undefined,
        }
      : undefined;
    r.gps = gps
      ? {
          latitude: toNumber(gps['latitude']) ?? undefined,
          longitude: toNumber(gps['longitude']) ?? undefined,
        }
      : undefined;
    return r;
  };

  if (Array.isArray(raw)) {
    return (raw as unknown[])
      .map(mapRow)
      .filter((x): x is RawTiltRecord => !!x && !!(x.deviceId ?? x.device_id));
  }
  if (isRecord(raw)) {
    const rec = raw as Record<string, unknown>;
    // Firestore list response: { documents: [...] }
    if (Array.isArray(rec['documents'])) {
      return (rec['documents'] as unknown[]).map(mapRow).filter((x): x is RawTiltRecord => !!x && !!(x.deviceId ?? x.device_id));
    }
    const wrapperKey = ['tiltmeter', 'items', 'data', 'meters'].find((k) => k in rec);
    if (wrapperKey) {
      const val = rec[wrapperKey];
      if (Array.isArray(val)) return normalize(val);
      if (isRecord(val)) return Object.values(val).map(mapRow).filter((x): x is RawTiltRecord => !!x);
    }
    // Map-like object from Firebase
    return Object.values(rec).map(mapRow).filter((x): x is RawTiltRecord => !!x);
  }
  return [];
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourOf(date: Date) {
  return new Date(date).getHours();
}

// Group records by device and compute metrics
export function buildMeters(records: RawTiltRecord[]): Meter[] {
  // Coalesce by deviceId
  const byDev = new Map<string, RawTiltRecord[]>();
  for (const r of records) {
    const id = (r.deviceId || r.device_id || 'unknown').trim();
    if (!byDev.has(id)) byDev.set(id, []);
    byDev.get(id)!.push(r);
  }

  const now = Date.now();
  const todayStart = startOfLocalDay(new Date(now));

  const meters: Meter[] = [];
  for (const [id, list] of byDev.entries()) {
    // Sort by timestamp asc
    const enriched = list
      .map((r) => {
        const tsRaw = r.timestamp;
        const ts = typeof tsRaw === 'number' ? tsRaw : typeof tsRaw === 'string' && /^\d+$/.test(tsRaw) ? Number(tsRaw) : Date.parse(String(tsRaw ?? now));
        const x = toNumber(r.accelerometer?.x_angle) ?? 0;
        const y = toNumber(r.accelerometer?.y_angle) ?? 0;
        const z = toNumber(r.accelerometer?.z_displacement_mm) ?? 0;
        return { ts, x, y, z, lat: toNumber(r.gps?.latitude), lon: toNumber(r.gps?.longitude) };
      })
      .sort((a, b) => a.ts - b.ts);

    if (enriched.length === 0) continue;

    const current = enriched[enriched.length - 1];

    const today = enriched.filter((e) => e.ts >= todayStart);
    const todayMaxX = today.length ? Math.max(...today.map((e) => e.x)) : current.x;
    const todayMaxY = today.length ? Math.max(...today.map((e) => e.y)) : current.y;
    const todayMaxZ = today.length ? Math.max(...today.map((e) => e.z)) : current.z;

    const allTimeHighX = Math.max(...enriched.map((e) => e.x));
    const allTimeHighY = Math.max(...enriched.map((e) => e.y));
    const allTimeHighZ = Math.max(...enriched.map((e) => e.z));

    const { lat: latNum, lon: lonNum } = (() => {
      const lat = enriched.find((e) => e.lat != null)?.lat ?? current.lat;
      const lon = enriched.find((e) => e.lon != null)?.lon ?? current.lon;
      return { lat, lon };
    })();
    const loc = (latNum != null && lonNum != null) ? `${latNum.toFixed(5)}, ${lonNum.toFixed(5)}` : 'Unknown';

    // Build 24h history by hour using max per hour within available data, tracking timestamp of that max
    const historyMap = new Map<number, { x: number; y: number; z: number; ts?: number }>();
    for (const e of enriched) {
      const h = hourOf(new Date(e.ts));
      const prev = historyMap.get(h);
      if (!prev) historyMap.set(h, { x: e.x, y: e.y, z: e.z, ts: e.ts });
      else {
        historyMap.set(h, {
          x: Math.max(prev.x, e.x),
          y: Math.max(prev.y, e.y),
          z: Math.max(prev.z, e.z),
          ts: ((): number | undefined => {
            // If any axis increased, prefer this entry's timestamp; otherwise keep previous
            const increased = e.x > prev.x || e.y > prev.y || e.z > prev.z;
            return increased ? e.ts : prev.ts;
          })(),
        });
      }
    }
    const history: AxisPoint[] = Array.from({ length: 24 }, (_, h) => {
      const bucket = historyMap.get(h);
      const ts = bucket?.ts;
      return {
        hour: h,
        x: bucket?.x ?? 0,
        y: bucket?.y ?? 0,
        z: bucket?.z ?? 0,
        ts,
        iso: ts != null ? new Date(ts).toISOString() : undefined,
      };
    });

    const m: Meter = {
      id,
      location: loc,
  lat: latNum ?? null,
  lon: lonNum ?? null,
      currentX: current.x,
      currentY: current.y,
      currentZ: current.z,
      todayMaxX,
      todayMaxY,
      todayMaxZ,
      allTimeHighX,
      allTimeHighY,
      allTimeHighZ,
      status: statusOf(current.x, current.y),
      history,
  lastUpdated: current.ts,
    };

    meters.push(m);
  }

  // Sort meters by id for stability
  return meters.sort((a, b) => a.id.localeCompare(b.id));
}

// Hook: fetch and compute meters, refresh periodically
export function useTiltmeterData() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      try {
        setError(null);
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const records = normalize(json);
        const meters = buildMeters(records);
        if (mounted.current) setMeters(meters);
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      }
    };

    load();
    const t = setInterval(load, 10000); // refresh every 10s
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, []);

  return { meters, error };
}

// Helper utilities (same as mock)
export function valueFor(m: Meter, axis: 'x' | 'y' | 'z', mode: TiltMode) {
  if (mode === 'current') return axis === 'x' ? m.currentX : axis === 'y' ? m.currentY : m.currentZ;
  if (mode === 'today') return axis === 'x' ? m.todayMaxX : axis === 'y' ? m.todayMaxY : m.todayMaxZ;
  return axis === 'x' ? m.allTimeHighX : axis === 'y' ? m.allTimeHighY : m.allTimeHighZ;
}

export function meterColor(st: Meter['status']) {
  return st === 'safe' ? '#10b981' : st === 'warning' ? '#f59e0b' : '#ef4444';
}

export function computeSummary(meters: Meter[]) {
  const counts = {
    safe: meters.filter((m) => m.status === 'safe').length,
    warning: meters.filter((m) => m.status === 'warning').length,
    danger: meters.filter((m) => m.status === 'danger').length,
  };
  const maxToday = meters.reduce((mx, m) => Math.max(mx, Math.max(m.todayMaxX, m.todayMaxY)), 0);
  const allTimeHigh = meters.reduce((mx, m) => Math.max(mx, Math.max(m.allTimeHighX, m.allTimeHighY)), 0);
  const recent = [...meters]
    .sort((a, b) => Math.max(b.currentX, b.currentY) - Math.max(a.currentX, a.currentY))
    .slice(0, 10);
  return { counts, maxToday, allTimeHigh, recent };
}
