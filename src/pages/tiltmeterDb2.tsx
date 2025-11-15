import StraightenIcon from '@mui/icons-material/Straighten';
// Convert Y angle (degrees) to mm using arc length formula: s = r * θ (θ in radians)
function yAngleToMm(yAngleDeg: number, heightMm: number): number {
  const thetaRad = (yAngleDeg * Math.PI) / 180;
  return heightMm * thetaRad;
}
  // Height (radius) for arc length calculation, default 1000mm
import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import DataFetchSettings from '../components/DataFetchSettings';
import RoomIcon from '@mui/icons-material/Room';
import IconButton from '@mui/material/IconButton';
import GoogleDevicesMap from '../components/GoogleDevicesMap';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import AlarmIcon from '@mui/icons-material/Alarm';
import XYDeflectionChart from '../components/charts/tiltmeterChartsXY';
import TiltmeterTimeSeriesModal from '../components/charts/tiltmeterTimeSeries';
import BatteryFullIcon from '@mui/icons-material/BatteryFull';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import { AreaChart } from '../components/Charts';
import ApexChart from 'react-apexcharts';
import Tiltmeter3DChart from '../components/charts/tiltmeter3D';
import { valueFor, meterColor, computeSummary, type Meter, buildMeters, type RawTiltRecord } from '../components/TiltmeterData';

// Candidate device IDs to read from Firestore
const CANDIDATE_DEVICE_IDS = ['tm1', 'tm2', 'tm3', 'tm4', 'tm5'];
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/hamexlabs-metro/databases/(default)/documents/tiltmeter';
const FIRESTORE_API_KEY = 'AIzaSyChzg_JqqEJfvOdxINMf8JP4gOWCeRtdcA';

// Parse Firestore timestamp to epoch millis
function parseFirestoreTimestamp(timestampValue: string): number {
  try {
    return new Date(timestampValue).getTime();
  } catch {
    return Date.now();
  }
}

// Transform Firestore document to our internal format
interface FirestoreDocument {
  name: string;
  fields: {
    x_angle?: { doubleValue: number };
    y_angle?: { doubleValue: number };
    batteryPercent?: { doubleValue: number };
    power_mW?: { doubleValue: number };
    readingTime?: { timestampValue: string };
  };
  createTime: string;
  updateTime: string;
}

interface FirestoreResponse {
  documents?: FirestoreDocument[];
}

function transformFirestoreDoc(doc: FirestoreDocument, deviceId: string): { rec: RawTiltRecord; health: number } {
  const fields = doc.fields;
  const x = fields.x_angle?.doubleValue ?? 0;
  const y = fields.y_angle?.doubleValue ?? 0;
  const battery = fields.batteryPercent?.doubleValue ?? 0;
  const timestamp = fields.readingTime?.timestampValue 
    ? parseFirestoreTimestamp(fields.readingTime.timestampValue)
    : parseFirestoreTimestamp(doc.createTime);
  
  const rec: RawTiltRecord = {
    deviceId,
    timestamp,
    accelerometer: { x_angle: x, y_angle: y, z_displacement_mm: 0 }
  };
  
  return { rec, health: battery };
}

export default function TiltmeterDashboard2() {
  // Height (radius) for arc length calculation, default 1000mm
  const [heightMm, setHeightMm] = useState<number>(() => {
    const v = localStorage.getItem('tilt.heightMm');
    const n = v ? Number(v) : 1000;
    return Number.isFinite(n) && n > 0 ? n : 1000;
  });
  useEffect(() => { localStorage.setItem('tilt.heightMm', String(heightMm)); }, [heightMm]);
  // Consider deviceId001..020 if available
  const candidateSet = useMemo(() => new Set(CANDIDATE_DEVICE_IDS.map(n => n.trim().toLowerCase())), []);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [healthByDevice, setHealthByDevice] = useState<Map<string, number>>(new Map());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Meter | null>(null);
  const [detailHistory, setDetailHistory] = useState<Array<{ ts: number; x: number; y: number; health?: number }>>([]);
  const [detailRange, setDetailRange] = useState<10 | 20 | 50 | 'all'>(20);

  useEffect(() => {
    let cancelled = false;
    const getIntervalMs = () => {
      try {
        const v = localStorage.getItem('app.fetchIntervalMs');
        const n = v ? Number(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 60_000; // default 1 min
      } catch { return 60_000; }
    };

    const fetchLatestForDevice = async (deviceId: string) => {
      try {
        const url = `${FIRESTORE_BASE}/${encodeURIComponent(deviceId)}/readings?key=${FIRESTORE_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json: FirestoreResponse = await res.json();
        if (!json.documents || json.documents.length === 0) return null;
        
        // Get the latest document (last in array, assuming sorted by time)
        const latest = json.documents[json.documents.length - 1];
        return transformFirestoreDoc(latest, deviceId);
      } catch {
        return null;
      }
    };

    const load = async () => {
      setFetchError(null);
      const out: RawTiltRecord[] = [];
      const battery = new Map<string, number>();
      const results = await Promise.all(CANDIDATE_DEVICE_IDS.map(fetchLatestForDevice));
      for (let i = 0; i < CANDIDATE_DEVICE_IDS.length; i++) {
        const devId = CANDIDATE_DEVICE_IDS[i];
        const r = results[i];
        if (r && r.rec) {
          out.push(r.rec);
          battery.set(devId, r.health);
        } else {
          // Create placeholder record for devices with no data
          const placeholderRec: RawTiltRecord = {
            deviceId: devId,
            timestamp: Date.now(),
            accelerometer: { x_angle: 0, y_angle: 0, z_displacement_mm: 0 }
          };
          out.push(placeholderRec);
          battery.set(devId, 0);
        }
      }
      // Build meters from latest-only records
      const built = buildMeters(out);
      if (!cancelled) { setMeters(built); setHealthByDevice(battery); }
    };

    load();
    let currentInterval = getIntervalMs();
    let t = setInterval(load, currentInterval);
    const ping = setInterval(() => {
      const newVal = getIntervalMs();
      if (newVal !== currentInterval) { currentInterval = newVal; clearInterval(t); t = setInterval(load, currentInterval); }
    }, 5_000);
    return () => { cancelled = true; clearInterval(t); clearInterval(ping); };
  }, []);

  const filteredMeters = useMemo(() => meters.filter(m => candidateSet.has(m.id.trim().toLowerCase())), [meters, candidateSet]);
  const [mode, setMode] = useState<'current' | 'today' | 'alltime'>('current');
  // detail modal handlers
  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      if (!detail) { setDetailHistory([]); return; }
      try {
        const url = `${FIRESTORE_BASE}/${encodeURIComponent(detail.id)}/readings?key=${FIRESTORE_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) { setDetailHistory([]); return; }
        const json: FirestoreResponse = await res.json();
        if (!json.documents) { setDetailHistory([]); return; }
        
        const entries = json.documents.map(doc => {
          const fields = doc.fields;
          const x = fields.x_angle?.doubleValue ?? 0;
          const y = fields.y_angle?.doubleValue ?? 0;
          const battery = fields.batteryPercent?.doubleValue;
          const timestamp = fields.readingTime?.timestampValue 
            ? parseFirestoreTimestamp(fields.readingTime.timestampValue)
            : parseFirestoreTimestamp(doc.createTime);
          
          return {
            ts: timestamp,
            x,
            y,
            health: battery !== undefined ? battery : undefined
          };
        });
        
        entries.sort((a, b) => a.ts - b.ts);
        if (!cancelled) setDetailHistory(entries);
      } catch {
        if (!cancelled) setDetailHistory([]);
      }
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [detail]);
  const [tileSize, setTileSize] = useState<'small' | 'medium' | 'large'>('small');
  const [mapOpen, setMapOpen] = useState(false);
  const [xyOpen, setXyOpen] = useState(false);
  const [xyMode, setXyMode] = useState<'current' | 'today' | 'alltime'>(mode);
  const [tsOpen, setTsOpen] = useState(false);
  const [chart3dOpen, setChart3dOpen] = useState(false);
  const handlePrint = () => {
    try {
      if (!detail) { window.print(); return; }
      const prevTitle = document.title;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const suggested = `${detail.id}_${ts}`;
      document.title = suggested;
      const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      window.print();
      // Fallback restore in case afterprint doesn't fire
      setTimeout(restore, 5000);
    } catch { /* noop */ }
  };
  const handleExportCsv = () => {
    try {
      if (!detail) return;
      const asc = detailHistory;
      const win = detailRange === 'all' ? asc : asc.slice(-detailRange);
      const rows = win.map(e => {
        const iso = new Date(e.ts).toISOString();
        const x = Number(e.x);
        const y = Number(e.y);
        const ymm = yAngleToMm(y, heightMm);
        const batt = e.health != null ? Number(e.health) : '';
        return [iso, x.toFixed(3), y.toFixed(3), ymm.toFixed(2), batt];
      });
      const header = ['Time', 'X_deg', 'Y_deg', 'Y_mm', 'Battery_pct'];
      const csv = [header, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `${detail.id}_recent_entries_${ts}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* noop */ }
  };

  const [alarmOpen, setAlarmOpen] = useState(false);
  const [normalCutoff, setNormalCutoff] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('tilt.thresholds');
      if (raw) { const obj = JSON.parse(raw) as { normal?: number; danger?: number }; if (typeof obj.normal === 'number') return obj.normal; }
  } catch { /* ignore */ }
    return 5;
  });
  const [dangerCutoff, setDangerCutoff] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('tilt.thresholds');
      if (raw) { const obj = JSON.parse(raw) as { normal?: number; danger?: number }; if (typeof obj.danger === 'number') return obj.danger; }
  } catch { /* ignore */ }
    return 10;
  });

  // Save thresholds
  useEffect(() => { try { localStorage.setItem('tilt.thresholds', JSON.stringify({ normal: normalCutoff, danger: dangerCutoff })); } catch { /* ignore */ } }, [normalCutoff, dangerCutoff]);

  const { maxToday, allTimeHigh, recent } = useMemo(() => computeSummary(filteredMeters), [filteredMeters]);
  const counts = useMemo(() => {
    let safe = 0, warning = 0, danger = 0, active = 0;
    for (const m of filteredMeters) {
      const v = Math.max(m.currentX, m.currentY);
      if (v < normalCutoff) safe++; else if (v < dangerCutoff) warning++; else danger++;
      // Count as active if battery > 0
      const batteryPct = healthByDevice.get(m.id) ?? 0;
      if (batteryPct > 0) active++;
    }
    return { safe, warning, danger, active };
  }, [filteredMeters, normalCutoff, dangerCutoff, healthByDevice]);

  const alertActive = useMemo(() => filteredMeters.some(m => Math.max(m.currentX, m.currentY) >= dangerCutoff), [filteredMeters, dangerCutoff]);

  const sizeCfg = { small: { meterH: 80, pad: 1, valueFont: 'h6' as const }, medium: { meterH: 100, pad: 1.5, valueFont: 'h5' as const }, large: { meterH: 120, pad: 2, valueFont: 'h5' as const } }[tileSize];

  const getBatteryPct = (id: string) => healthByDevice.get(id) ?? null;
  const batteryColor = (pct: number | null) => pct == null ? '#9e9e9e' : pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflow: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none', '&::-webkit-scrollbar': { width: 0, height: 0 }, '& *': { scrollbarWidth: 'none', msOverflowStyle: 'none' }, '& *::-webkit-scrollbar': { width: 0, height: 0 } }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#10b981', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Normal (&lt;{normalCutoff}°)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#f59e0b', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Warning ({normalCutoff}–{dangerCutoff}°)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Danger (&gt;{dangerCutoff}°)</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant={mode === 'today' ? 'contained' : 'outlined'} onClick={() => setMode('today')} sx={{ textTransform: 'none' }}>Today's Max</Button>
            <Button size="small" variant={mode === 'alltime' ? 'contained' : 'outlined'} onClick={() => setMode('alltime')} sx={{ textTransform: 'none' }}>All Time High</Button>
            <FormControl size="small" sx={{ minWidth: 140, ml: 1 }}>
              <InputLabel id="size-label">Tile Size</InputLabel>
              <Select labelId="size-label" value={tileSize} label="Tile Size" onChange={(e) => setTileSize(e.target.value as 'small' | 'medium' | 'large')}>
                <MenuItem value="small">Small</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="large">Large</MenuItem>
              </Select>
            </FormControl>
            <DataFetchSettings size="small" />
            <IconButton color="primary" size="small" onClick={() => setAlarmOpen(true)} title="Tilt thresholds"><AlarmIcon /></IconButton>
            <Box sx={{ ml: 0.5, width: 10, height: 10, borderRadius: '50%', bgcolor: alertActive ? '#d32f2f' : '#9e9e9e', boxShadow: alertActive ? '0 0 0 6px rgba(211,47,47,0.2)' : 'none', transition: 'all .2s' }} />
            <IconButton color="primary" size="small" onClick={() => setMapOpen(true)} title="Show Devices on Map"><RoomIcon /></IconButton>
            <IconButton color="primary" size="small" onClick={() => { setXyMode(mode); setXyOpen(true); }} title="XY Deflection Chart"><ShowChartIcon /></IconButton>
            <IconButton color="primary" size="small" onClick={() => setTsOpen(true)} title="Time Series Averages"><TimelineIcon /></IconButton>
            <IconButton color="primary" size="small" onClick={() => setChart3dOpen(true)} title="3D Deflection"><ThreeDRotationIcon /></IconButton>
          </Box>
        </Box>

        {fetchError ? (
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff3f3', border: '1px solid #ffcdd2' }}>
            <Typography color="error">Failed to fetch RTDB readings: {fetchError}</Typography>
          </Paper>
        ) : null}

        {/* Summary cards */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.5rem' }}>{filteredMeters.length}</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Total Sensors</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#6366f1', fontSize: '1.5rem' }}>{counts.active}</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Active Devices</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#10b981', fontSize: '1.5rem' }}>{counts.safe}</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Normal</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#f59e0b', fontSize: '1.5rem' }}>{counts.warning}</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Warning</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#ef4444', fontSize: '1.5rem' }}>{counts.danger}</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Danger</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#3b82f6', fontSize: '1.5rem' }}>{maxToday.toFixed(1)}°</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>Max Today</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, textAlign: 'center', minWidth: 120, flex: '1 1 0' }} elevation={2}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#7c3aed', fontSize: '1.5rem' }}>{allTimeHigh.toFixed(1)}°</Typography>
            <Typography sx={{ color: '#6b7280', fontSize: '0.75rem' }}>All Time High</Typography>
          </Paper>
        </Box>

        {/* Status grid (no Z bar; show battery) */}
        <Paper sx={{ p: 2, mb: 3 }}>
      {filteredMeters.length === 0 && (
            <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>
        No data found for sensor: {CANDIDATE_DEVICE_IDS.join(', ')}. Check Firestore connection.
            </Typography>
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(12, 1fr)' }}>
            {filteredMeters.map(m => {
              const xVal = valueFor(m, 'x', mode);
              const yVal = valueFor(m, 'y', mode);
              const axisStatusX: Meter['status'] = ((): Meter['status'] => { const v = Math.abs(xVal); if (v < normalCutoff) return 'safe'; if (v < dangerCutoff) return 'warning'; return 'danger'; })();
              const axisStatusY: Meter['status'] = ((): Meter['status'] => { const v = Math.abs(yVal); if (v < normalCutoff) return 'safe'; if (v < dangerCutoff) return 'warning'; return 'danger'; })();
              const scaleMax = 15; // degrees mapped to full half-width
              const bpct = getBatteryPct(m.id);
              return (
                <Box key={m.id} sx={{ gridColumn: { xs: 'span 12', sm: 'span 6', md: 'span 4' } }}>
                  <Paper sx={{ p: sizeCfg.pad, cursor: 'pointer' }} onClick={() => setDetail(m)}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{m.id}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          <BatteryFullIcon fontSize="small" sx={{ color: batteryColor(bpct) }} />
                          <Typography variant="caption" sx={{ color: '#111827' }}>{bpct != null ? `${bpct}%` : '—'}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: '#6b7280', display: 'block' }}>{m.location}</Typography>
                        {m.lastUpdated ? (
                          <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>
                            Last updated: {new Date(m.lastUpdated).toLocaleString()}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>

                    {/* X/Y diverging horizontal bars: center baseline with positive/negative sides */}
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* X */}
                        <Box sx={{ position: 'relative', height: sizeCfg.meterH / 2, bgcolor: '#f3f4f6', borderRadius: 1, overflow: 'hidden' }}>
                          {/* center axis */}
                          <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, bgcolor: '#e5e7eb', transform: 'translateX(-1px)' }} />
                          {/* value segment */}
                          {(() => { const w = Math.min(50, (Math.abs(xVal) / scaleMax) * 50); return (
                            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: xVal >= 0 ? '50%' : undefined, right: xVal < 0 ? '50%' : undefined, width: `${w}%`, bgcolor: meterColor(axisStatusX) }} />
                          ); })()}
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827' }}>X {xVal.toFixed(3)}°</Typography>
                          </Box>
                        </Box>
                        {/* Y */}
                        <Box sx={{ position: 'relative', height: sizeCfg.meterH / 2, bgcolor: '#f3f4f6', borderRadius: 1, overflow: 'hidden' }}>
                          <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, bgcolor: '#e5e7eb', transform: 'translateX(-1px)' }} />
                          {(() => { const w = Math.min(50, (Math.abs(yVal) / scaleMax) * 50); return (
                            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: yVal >= 0 ? '50%' : undefined, right: yVal < 0 ? '50%' : undefined, width: `${w}%`, bgcolor: meterColor(axisStatusY) }} />
                          ); })()}
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827' }}>Y {yVal.toFixed(3)}°</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Paper>
                </Box>
              );
            })}
          </Box>
        </Paper>

        {/* Recent Activity */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Current X°</TableCell>
                <TableCell align="right">Current Y°</TableCell>
                <TableCell align="right">Today Max°</TableCell>
                <TableCell align="right">All Time High°</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recent.map(m => (
                <TableRow key={m.id}>
                  <TableCell>{m.id}</TableCell>
                  <TableCell>{m.location}</TableCell>
                  <TableCell align="right">{m.currentX.toFixed(3)}</TableCell>
                  <TableCell align="right">{m.currentY.toFixed(3)}</TableCell>
                  <TableCell align="right">{Math.max(m.todayMaxX, m.todayMaxY).toFixed(1)}</TableCell>
                  <TableCell align="right">{Math.max(m.allTimeHighX, m.allTimeHighY).toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      {/* Alarm/Thresholds Modal */}
      <Dialog open={alarmOpen} onClose={() => setAlarmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tilt Alert Thresholds</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Define category cut-offs for tilt magnitude based on max(|X|, |Y|).
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField type="number" label="Normal &lt; (°)" value={Number.isFinite(normalCutoff) ? normalCutoff : ''} onChange={(e) => { const v = e.target.value; if (v === '') { setNormalCutoff(NaN as unknown as number); return; } const n = Number(v); if (Number.isFinite(n)) setNormalCutoff(n); }} size="small" fullWidth />
            <TextField type="number" label="Danger &gt;= (°)" value={Number.isFinite(dangerCutoff) ? dangerCutoff : ''} onChange={(e) => { const v = e.target.value; if (v === '') { setDangerCutoff(NaN as unknown as number); return; } const n = Number(v); if (Number.isFinite(n)) setDangerCutoff(n); }} size="small" fullWidth />
          </Box>
          <Typography variant="caption" sx={{ color: '#6b7280' }}>Warning range is between the two values.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlarmOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Map */}
      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Device Locations</DialogTitle>
        <DialogContent>
          <Box sx={{ height: 480 }}>
            <GoogleDevicesMap markers={filteredMeters.filter(m => m.lat != null && m.lon != null).map(m => ({ id: m.id, lat: m.lat as number, lon: m.lon as number }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMapOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* XY Chart */}
      <Dialog open={xyOpen} onClose={() => setXyOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>XY Deflection Chart</DialogTitle>
        <DialogContent>
          {(() => { const avgX = filteredMeters.length ? filteredMeters.reduce((s, m) => s + (xyMode === 'today' ? m.todayMaxX : xyMode === 'alltime' ? m.allTimeHighX : m.currentX), 0) / filteredMeters.length : 0;
            const avgY = filteredMeters.length ? filteredMeters.reduce((s, m) => s + (xyMode === 'today' ? m.todayMaxY : xyMode === 'alltime' ? m.allTimeHighY : m.currentY), 0) / filteredMeters.length : 0;
            return <XYDeflectionChart avgX={avgX} avgY={avgY} />; })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setXyOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Time Series */}
      <Dialog open={tsOpen} onClose={() => setTsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Time Series Averages</DialogTitle>
        <DialogContent>
          <TiltmeterTimeSeriesModal open={tsOpen} onClose={() => setTsOpen(false)} meters={filteredMeters} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* 3D Chart */}
      <Dialog open={chart3dOpen} onClose={() => setChart3dOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>3D Deflection — {detail?.id ?? ''}</DialogTitle>
        <DialogContent>
          {(() => {
            if (!detail) return null;
            const asc = detailHistory;
            const win = detailRange === 'all' ? asc : asc.slice(-detailRange);
            const times = win.map(e => e.ts);
            const yAngles = win.map(e => e.y);
            return (
              <Box sx={{ my: 1 }}>
                <Tiltmeter3DChart times={times} yAnglesDeg={yAngles} heightMm={heightMm} height={460} title="3D Deflection (Y in mm)" />
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChart3dOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Print styles scoped to Sensor Details */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #sensor-print, #sensor-print * { visibility: visible !important; }
          #sensor-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 16px; box-sizing: border-box; }
          .print-only { display: block !important; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

    {/* Sensor Details */}
  <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Sensor Details — {detail?.id}</DialogTitle>
        <DialogContent>
          {detail ? (
            <Box id="sensor-print">
              {/* Print-only header to include title inside printable area */}
              <Box className="print-only" sx={{ mb: 1 }}>
                <Typography variant="h6">Sensor Details — {detail.id}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <BatteryFullIcon fontSize="small" sx={{ color: ((): string => { const p = healthByDevice.get(detail.id) ?? null; return p == null ? '#9e9e9e' : p >= 60 ? '#10b981' : p >= 30 ? '#f59e0b' : '#ef4444'; })() }} />
                  <Typography variant="caption">{healthByDevice.get(detail.id) ?? '—'}%</Typography>
                  <IconButton size="small" color="primary" onClick={() => setChart3dOpen(true)} title="3D Deflection"><ThreeDRotationIcon fontSize="small" /></IconButton>
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
                <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <RoomIcon fontSize="small" sx={{ color: '#6b7280' }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{detail.location || '—'}</Typography>
                </Paper>
                <Paper sx={{ p: 1 }}>
                  <Typography variant="caption" sx={{ color: '#6b7280' }}>Current</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                    <Box sx={{ px: 0.75, py: 0.25, bgcolor: 'rgba(211,47,47,.08)', border: '1px solid rgba(211,47,47,.25)', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#d32f2f' }}>X {detail.currentX.toFixed(3)}°</Typography>
                    </Box>
                    <Box sx={{ px: 0.75, py: 0.25, bgcolor: 'rgba(25,118,210,.08)', border: '1px solid rgba(25,118,210,.25)', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#1976d2' }}>Y {detail.currentY.toFixed(3)}°</Typography>
                    </Box>
                  </Box>
                </Paper>
                {/* Height input with MM icon */}
                <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StraightenIcon fontSize="small" sx={{ color: '#6b7280' }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}></Typography>
                  <TextField
                    value={heightMm}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) setHeightMm(v);
                    }}
                    size="small"
                    type="number"
                    inputProps={{ min: 1, step: 1 }}
                    sx={{ width: 150, ml: 1 }}
                    variant="outlined"
                    label="Height (mm)"
                  />
                </Paper>
                {/* Current Y deflection in mm, beautiful card */}
                <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(16,185,129,0.08)', border: '1px solid #10b981', borderRadius: 2, flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>Current Tilt (MM)</Typography>
                  <Typography variant="h6" sx={{ color: '#10b981', fontWeight: 700, lineHeight: 1.1 }}>
                    {yAngleToMm(detail.currentY, heightMm).toFixed(2)} mm
                  </Typography>
                </Paper>
                <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTimeIcon fontSize="small" sx={{ color: '#6b7280' }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{new Date(detail.lastUpdated).toLocaleString()}</Typography>
                </Paper>
              </Box>
              {(() => {
                const asc = detailHistory;
                const win = detailRange === 'all' ? asc : asc.slice(-detailRange);
                const xs = win.map(e => e.x);
                const ys = win.map(e => e.y);
                const min = (arr: number[]) => (arr.length ? Math.min(...arr) : 0);
                const max = (arr: number[]) => (arr.length ? Math.max(...arr) : 0);
                const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
                const stats = { xmin: min(xs), xmax: max(xs), xavg: avg(xs), ymin: min(ys), ymax: max(ys), yavg: avg(ys) };
                const labels = win.map(e => new Date(e.ts).toLocaleString());
                const chartData = { labels, datasets: [
                  { label: 'X (°)', data: win.map(e => e.x), borderColor: '#d32f2f' },
                  { label: 'Y (°)', data: win.map(e => e.y), borderColor: '#1976d2' },
                ] };
                return (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1.5, flexWrap: 'wrap' }}>
                      <ToggleButtonGroup size="small" exclusive value={detailRange} onChange={(_, v) => v && setDetailRange(v)} sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.75rem' } }}>
                        <ToggleButton value={10}>Last 10</ToggleButton>
                        <ToggleButton value={20}>Last 20</ToggleButton>
                        <ToggleButton value={50}>Last 50</ToggleButton>
                        <ToggleButton value="all">All</ToggleButton>
                      </ToggleButtonGroup>
                      <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#d32f2f' }}>X</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(211,47,47,.08)', border: '1px solid rgba(211,47,47,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">min {stats.xmin.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(211,47,47,.08)', border: '1px solid rgba(211,47,47,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">avg {stats.xavg.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(211,47,47,.08)', border: '1px solid rgba(211,47,47,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">max {stats.xmax.toFixed(2)}</Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#1976d2' }}>Y</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(25,118,210,.08)', border: '1px solid rgba(25,118,210,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">min {stats.ymin.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(25,118,210,.08)', border: '1px solid rgba(25,118,210,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">avg {stats.yavg.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ px: 0.6, py: 0.2, bgcolor: 'rgba(25,118,210,.08)', border: '1px solid rgba(25,118,210,.25)', borderRadius: 1 }}>
                              <Typography variant="caption">max {stats.ymax.toFixed(2)}</Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ mb: 1.5 }}>
                      <AreaChart data={chartData} height={320} yDecimals={3} />
                    </Box>
                    {(() => {
                      // Single black line for Y (mm) with shaded background zones and horizontal % lines
                      const yMm = win.map(e => yAngleToMm(e.y, heightMm));
                      const p1 = heightMm * 0.01;
                      const p5 = heightMm * 0.05;
                      const p10 = heightMm * 0.10;
                      const yMin = Math.min(...yMm, -p10 * 1.5);
                      const yMax = Math.max(...yMm, p10 * 1.5);
                      const series = [ { name: 'Y (mm)', data: yMm } ];
                      const options = {
                        chart: { type: 'line' as const, toolbar: { show: false } },
                        xaxis: { categories: labels },
                        stroke: { curve: 'smooth' as const, width: 1 },
                        colors: ['#000000'], // darker black line
                        dataLabels: { enabled: false },
                        legend: { show: false },
                        yaxis: { labels: { formatter: (val: number) => (Number.isFinite(val) ? val.toFixed(2) : String(val)) } },
                        annotations: {
                          yaxis: [
                            // Shaded zones
                            { y: yMin, y2: -p10, borderColor: 'transparent', fillColor: 'rgba(220,38,38,0.45)', opacity: 0.6 }, // danger bottom (darker)
                            { y: -p10, y2: -p5, borderColor: 'transparent', fillColor: 'rgba(217,119,6,0.45)', opacity: 0.6 }, // warning bottom (darker)
                            { y: -p5, y2: p5, borderColor: 'transparent', fillColor: 'rgba(5,150,105,0.45)', opacity: 0.6 }, // normal (darker)
                            { y: p5, y2: p10, borderColor: 'transparent', fillColor: 'rgba(217,119,6,0.45)', opacity: 0.6 }, // warning top (darker)
                            { y: p10, y2: yMax, borderColor: 'transparent', fillColor: 'rgba(220,38,38,0.45)', opacity: 0.6 }, // danger top (darker)
                            // Percent lines
                            { y: p1, borderColor: '#111827', strokeDashArray: 4, label: { text: '+1%', style: { background: '#111827' } } },
                            { y: -p1, borderColor: '#111827', strokeDashArray: 4, label: { text: '-1%', style: { background: '#111827' } } },
                            { y: p5, borderColor: '#b45309', strokeDashArray: 4, label: { text: '+5%', style: { background: '#b45309' } } },
                            { y: -p5, borderColor: '#b45309', strokeDashArray: 4, label: { text: '-5%', style: { background: '#b45309' } } },
                            { y: p10, borderColor: '#b91c1c', strokeDashArray: 4, label: { text: '+10%', style: { background: '#b91c1c' } } },
                            { y: -p10, borderColor: '#b91c1c', strokeDashArray: 4, label: { text: '-10%', style: { background: '#b91c1c' } } },
                          ],
                        },
                        tooltip: { y: { formatter: (val: number) => `${Number(val).toFixed(2)} mm` } },
                      };
                      return (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>Deflection in MM</Typography>
                          <ApexChart type="line" series={series} options={options} height={420} />
                        </Box>
                      );
                    })()}
                  </>
                );
              })()}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, mb: 0.5 }}>
                <Typography variant="subtitle2">Recent Entries</Typography>
                <Button size="small" variant="outlined" onClick={handleExportCsv} startIcon={<DownloadIcon />}>Export CSV</Button>
              </Box>
              <Table size="small" sx={{ '& td, & th': { fontSize: '0.8rem' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell align="right">X°</TableCell>
                    <TableCell align="right">Y°</TableCell>
                    <TableCell align="right">Y (mm)</TableCell>
                    <TableCell align="right">Battery</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => { const asc = detailHistory; const win = detailRange === 'all' ? asc : asc.slice(-detailRange); return win.slice().reverse().map((e, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{new Date(e.ts).toLocaleString()}</TableCell>
                      <TableCell align="right">{e.x.toFixed(3)}</TableCell>
                      <TableCell align="right">{e.y.toFixed(3)}</TableCell>
                      <TableCell align="right">{yAngleToMm(e.y, heightMm).toFixed(2)}</TableCell>
                      <TableCell align="right">{e.health != null ? `${e.health}%` : '—'}</TableCell>
                    </TableRow>
                  )); })()}
                </TableBody>
              </Table>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePrint} startIcon={<PrintIcon />}>Print</Button>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
