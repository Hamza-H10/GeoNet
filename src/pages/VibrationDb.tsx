import { Box, Typography, Switch, FormControlLabel, Paper, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, CircularProgress } from '@mui/material';
import VibrationIcon from '@mui/icons-material/Vibration';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VibrationChart, ColoredSummary, type AxisThresholds } from '../components/charts/vibrationCharts';
import Visible from '../components/Visible';
import { useDevicesByCategory } from '../hooks/useDevices';
import AlarmIcon from '@mui/icons-material/Alarm';
import FFTChartExpanded from '../components/charts/fftChart';

// Server payload shape
interface AccelPoint { x: number; y: number; z: number; t?: string }
type FSNumber = { doubleValue?: number | string; integerValue?: number | string } | undefined;
type FSString = { stringValue?: string } | undefined;
type FSFields = {
  accelerometer?: { mapValue?: { fields?: { x_acceleration?: FSNumber; y_acceleration?: FSNumber; z_acceleration?: FSNumber } } };
  timestamp?: FSString;
} | undefined;
type FSDocument = { fields?: FSFields };

// Poll Firestore REST for readings of a device and project into AccelPoint[]
function useFirestoreVibration(deviceId: string | undefined, intervalMs: number, pageSize = 120) {
  const [data, setData] = useState<AccelPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!deviceId) { setData([]); setLoading(false); setError(null); return; }
    let mounted = true;
    firstLoad.current = true; // reset when device changes
    const url = `https://firestore.googleapis.com/v1/projects/getnet-hamexlabs/databases/(default)/documents/vibration/${encodeURIComponent(deviceId)}/readings?pageSize=${pageSize}`;
    const fetchOnce = async () => {
      try {
        if (firstLoad.current) setLoading(true);
        setError(null);
        const res = await fetch(url);
        if (!res.ok) { if (mounted) setError(`${res.status} ${res.statusText}`); return; }
        const json = await res.json();
        const docs: FSDocument[] = Array.isArray(json?.documents) ? (json.documents as FSDocument[]) : [];
        // Parse documents to points
        const points = docs.map((d: FSDocument) => {
          const fields = d?.fields || {};
          const accel = (fields?.accelerometer?.mapValue?.fields ?? {}) as { x_acceleration?: FSNumber; y_acceleration?: FSNumber; z_acceleration?: FSNumber };
          const toNum = (v: FSNumber): number => {
            if (!v) return 0;
            const raw = typeof v.doubleValue !== 'undefined' ? v.doubleValue : (typeof v.integerValue !== 'undefined' ? v.integerValue : undefined);
            if (typeof raw === 'undefined') return 0;
            const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
            return Number.isFinite(num) ? num : 0;
          };
          const x = toNum(accel.x_acceleration);
          const y = toNum(accel.y_acceleration);
          const z = toNum(accel.z_acceleration);
          const t = fields?.timestamp?.stringValue || undefined;
          return { x, y, z, t } as AccelPoint;
        });
        // Sort by timestamp if available, else as-is
        points.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
        if (mounted) setData(points.slice(-1000));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch';
        if (mounted) setError(msg);
      } finally {
        if (mounted) {
          setLoading(false);
          firstLoad.current = false;
        }
      }
    };
    fetchOnce();
    timer.current = window.setInterval(fetchOnce, intervalMs);
    return () => { mounted = false; if (timer.current) window.clearInterval(timer.current); };
  }, [deviceId, intervalMs, pageSize]);
  return { data, loading, error };
}

export default function VibrationDb() {
  const [showAlerts, setShowAlerts] = useState(true);
  // Per-axis thresholds and generic alert
  const [thresholds, setThresholds] = useState<AxisThresholds>({ x: 2, y: 2, z: 2, alert: 2.5 });
  const [alarmOpen, setAlarmOpen] = useState(false);
  const { devices: vibDevices } = useDevicesByCategory('vibration');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  useEffect(() => {
    if (!selectedDevice && vibDevices.length > 0) setSelectedDevice(vibDevices[0].name);
  }, [vibDevices, selectedDevice]);
  // Fetch from Firestore REST API for the selected device (deviceId == device.name)
  const { data, loading } = useFirestoreVibration(selectedDevice || undefined, 1500);

  // Persist thresholds per-device
  useEffect(() => {
    if (!selectedDevice) return;
    const key = `vib.thresholds:${selectedDevice}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as AxisThresholds;
        setThresholds(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) return;
    const key = `vib.thresholds:${selectedDevice}`;
    try { localStorage.setItem(key, JSON.stringify(thresholds)); } catch { /* ignore */ }
  }, [thresholds, selectedDevice]);

  // Open thresholds modal if global alarm event is dispatched
  useEffect(() => {
    const handler = () => setAlarmOpen(true);
    window.addEventListener('open-vibration-thresholds', handler as EventListener);
    return () => window.removeEventListener('open-vibration-thresholds', handler as EventListener);
  }, []);

  // compact alert indicator: red pulse when any axis exceeds threshold in latest point
  const alertActive = useMemo(() => {
    const last = data[data.length - 1];
    if (!last) return false;
    const th = thresholds;
    const exceed = (
      (typeof th.x === 'number' && Math.abs(last.x) >= th.x) ||
      (typeof th.y === 'number' && Math.abs(last.y) >= th.y) ||
      (typeof th.z === 'number' && Math.abs(last.z) >= th.z) ||
      (typeof th.alert === 'number' && Math.max(Math.abs(last.x), Math.abs(last.y), Math.abs(last.z)) >= th.alert)
    );
    return exceed;
  }, [data, thresholds]);

  const lastUpdated = useMemo(() => {
    const t = data.length ? data[data.length - 1].t : undefined;
    if (!t) return null;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [data]);

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, overflow: 'auto' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <VibrationIcon sx={{ fontSize: 36, color: '#1976d2' }} />
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: 0.5, color: '#232837' }}>Vibration Dashboard</Typography>
          <Box sx={{ flex: 1 }} />
          <FormControl size="small" sx={{ minWidth: 240, flexShrink: 0 }}>
            <InputLabel id="vib-device-label">Device</InputLabel>
            <Select
              labelId="vib-device-label"
              value={selectedDevice}
              label="Device"
              onChange={e => setSelectedDevice(e.target.value)}
            >
              {vibDevices.length === 0 && <MenuItem value="" disabled>No devices (category: vibration)</MenuItem>}
              {vibDevices.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControlLabel control={<Switch checked={showAlerts} onChange={(_, v) => setShowAlerts(v)} />} label="Alerts" />
          <Button size="small" variant="outlined" startIcon={<AlarmIcon />} onClick={() => setAlarmOpen(true)} sx={{ textTransform: 'none', minWidth: 120 }}>Thresholds</Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 1, minWidth: 200, justifyContent: 'flex-end' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: alertActive ? '#d32f2f' : '#9e9e9e', boxShadow: alertActive ? '0 0 0 6px rgba(211,47,47,0.2)' : 'none', transition: 'all .2s' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loading ? <CircularProgress size={14} thickness={5} /> : null}
            </Box>
            <Typography variant="caption" color="text.secondary">Last updated: {lastUpdated ? lastUpdated.toLocaleString() : '—'}</Typography>
            </Box>
          </Box>
        </Box>

        {vibDevices.length === 0 && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">No devices found in category "vibration" from the Devices backend. Add devices in Devices page to reflect here.</Typography>
          </Paper>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ flex: 2, minWidth: 0, bgcolor: '#fff', borderRadius: 2, boxShadow: 1, p: 2 }}>
            {data.length === 0 && (
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Loading readings…' : 'No readings available yet for this device.'}
                </Typography>
              </Paper>
            )}
            <Visible><VibrationChart data={data} showAlerts={showAlerts} thresholds={thresholds} /></Visible>
          </Box>
          <Visible><ColoredSummary data={data} /></Visible>
        </Box>

        {/* Expanded FFT Chart for selected device */}
        <Box sx={{ mt: 3 }}>
          <Visible><FFTChartExpanded deviceId={selectedDevice || undefined} height={360} /></Visible>
        </Box>

        <Paper sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Notes</Typography>
          <Typography variant="body2" color="text.secondary">Live readings are fetched from Firestore for the selected device. Data summary colors align with the Acceleration chart. Alerts are compact and toggleable.</Typography>
        </Paper>
      </Box>

      {/* Alarm/Thresholds Modal */}
      <Dialog open={alarmOpen} onClose={() => setAlarmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Alert Thresholds</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Per-axis thresholds</Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField type="number" label="X Alert" value={thresholds.x ?? ''} onChange={e => setThresholds(t => ({ ...t, x: e.target.value === '' ? undefined : Number(e.target.value) }))} size="small" fullWidth />
            <TextField type="number" label="Y Alert" value={thresholds.y ?? ''} onChange={e => setThresholds(t => ({ ...t, y: e.target.value === '' ? undefined : Number(e.target.value) }))} size="small" fullWidth />
            <TextField type="number" label="Z Alert" value={thresholds.z ?? ''} onChange={e => setThresholds(t => ({ ...t, z: e.target.value === '' ? undefined : Number(e.target.value) }))} size="small" fullWidth />
          </Box>

          <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Generic alert line</Typography>
          <TextField type="number" label="Alert (any axis)" value={thresholds.alert ?? ''} onChange={e => setThresholds(t => ({ ...t, alert: e.target.value === '' ? undefined : Number(e.target.value) }))} size="small" fullWidth />

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Tilt categories (for reference)</Typography>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#10b981', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Normal (&lt;5°)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#f59e0b', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Warning (5-10°)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444', mr: 1 }} />
              <Typography variant="body2" sx={{ color: '#111827' }}>Danger (&gt;10°)</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlarmOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
