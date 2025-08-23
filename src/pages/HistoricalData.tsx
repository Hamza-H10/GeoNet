import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';
import DataFetchSettings from '../components/DataFetchSettings';


type TiltmeterRow = {
  deviceId: string;
  timestamp: string; // ISO or raw
  x_angle: number | null;
  y_angle: number | null;
  z_displacement_mm: number | null;
  latitude: number | null;
  longitude: number | null;
};

const URL = 'https://getnet-hamexlabs-default-rtdb.asia-southeast1.firebasedatabase.app/tiltmeter.json';

export default function HistoricalData() {
  const [rows, setRows] = useState<TiltmeterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No local settings logic; delegated to DataFetchSettings component

  useEffect(() => {
    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
    const getString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
    const toNumber = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const mapRow = (v: unknown, keyHint?: string): TiltmeterRow | null => {
      if (!isRecord(v)) return null;
      const rec = v as Record<string, unknown>;

      const deviceId = getString(rec['deviceId']) || getString(rec['device_id']) || keyHint || 'unknown';

      const tsRaw = rec['timestamp'];
      let timestamp = '';
      if (typeof tsRaw === 'number') timestamp = new Date(tsRaw).toISOString();
      else if (typeof tsRaw === 'string') {
        const allDigits = /^\d+$/.test(tsRaw.trim());
        timestamp = allDigits ? new Date(Number(tsRaw)).toISOString() : tsRaw;
      }

      const accel = isRecord(rec['accelerometer']) ? (rec['accelerometer'] as Record<string, unknown>) : {};
      const gps = isRecord(rec['gps']) ? (rec['gps'] as Record<string, unknown>) : {};

      const x_angle = toNumber(accel['x_angle']);
      const y_angle = toNumber(accel['y_angle']);
      const z_displacement_mm = toNumber(accel['z_displacement_mm']);
      const latitude = toNumber(gps['latitude']);
      const longitude = toNumber(gps['longitude']);

      return { deviceId, timestamp, x_angle, y_angle, z_displacement_mm, latitude, longitude };
    };

    const normalize = (data: unknown): TiltmeterRow[] => {
      if (Array.isArray(data)) {
        return (data as unknown[])
          .map((d, idx) => mapRow(d, `idx-${idx}`))
          .filter((r): r is TiltmeterRow => !!r);
      }
      if (isRecord(data)) {
        const rec = data as Record<string, unknown>;
        // Handle wrapped or map-like shapes
        const wrapperKey = ['tiltmeter', 'items', 'data', 'meters'].find((k) => k in rec);
        if (wrapperKey) {
          const val = rec[wrapperKey];
          if (Array.isArray(val)) {
            return (val as unknown[])
              .map((d, idx) => mapRow(d, `idx-${idx}`))
              .filter((r): r is TiltmeterRow => !!r);
          }
          if (isRecord(val)) {
            return Object.entries(val as Record<string, unknown>)
              .map(([k, v]) => mapRow(v, k))
              .filter((r): r is TiltmeterRow => !!r);
          }
        }
        return Object.entries(rec)
          .map(([k, v]) => mapRow(v, k))
          .filter((r): r is TiltmeterRow => !!r);
      }
      return [];
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const list = normalize(json);
        setRows(list);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to load tiltmeter data: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto', width: '100%', p: { xs: 2, md: 3 } }}>
      <Paper elevation={3} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Tiltmeter Data</Typography>
          <DataFetchSettings />
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Loading…</Typography>
          </Box>
        ) : error ? (
          <Typography color="error" variant="body2">{error}</Typography>
        ) : (
          <TableContainer component={Paper} elevation={0}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device ID</TableCell>
                  <TableCell>Timestamp</TableCell>
                  <TableCell align="right">X Angle (°)</TableCell>
                  <TableCell align="right">Y Angle (°)</TableCell>
                  <TableCell align="right">Z Displacement (mm)</TableCell>
                  <TableCell align="right">Latitude</TableCell>
                  <TableCell align="right">Longitude</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">No data</Typography></TableCell></TableRow>
                ) : (
                  rows.map((m) => (
                    <TableRow key={`${m.deviceId}-${m.timestamp}`}>
                      <TableCell>{m.deviceId}</TableCell>
                      <TableCell>{m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}</TableCell>
                      <TableCell align="right">{m.x_angle != null ? m.x_angle.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right">{m.y_angle != null ? m.y_angle.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right">{m.z_displacement_mm != null ? m.z_displacement_mm.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right">{m.latitude != null ? m.latitude.toFixed(6) : '-'}</TableCell>
                      <TableCell align="right">{m.longitude != null ? m.longitude.toFixed(6) : '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
  {/* Settings Modal moved into DataFetchSettings component */}
      </Box>
    </Box>
  );
}