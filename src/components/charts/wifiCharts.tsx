import { useEffect, useState } from 'react';
// import { db, ref, onValue } from '../../firebase'; // Uncomment when Firebase is configured
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { LineChart } from '../Charts';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';

// Type for acceleration data
type AccelData = { x: number; y: number; z: number; timestamp?: number };

// WiFiAccelerationDashboard: Fetches acceleration data from Firebase (commented out) and displays chart
export function WifiAccelerationDashboard() {
  const [data, setData] = useState<AccelData[]>([]);
  // const [loading, setLoading] = useState(true);

  // Angles table state
  type AngleRow = { deviceId: string; timestamp: string; x_angle: number; y_angle: number; z_angle: number };
  const [angles, setAngles] = useState<AngleRow[]>([]);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [anglesError, setAnglesError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch data from the ESP32 server.
        // Note: You may need to configure CORS on the server or use a proxy
        // if you run into cross-origin issues.
        const response = await fetch('http://127.0.0.1:9080');
        if (!response.ok) {
          console.error(`Error fetching data from ESP32: ${response.statusText}`);
          return;
        }
        const html = await response.text();

        // Parse the HTML to extract accelerometer values using regex
        const xMatch = /X: ([-.0-9]+)/.exec(html);
        const yMatch = /Y: ([-.0-9]+)/.exec(html);
        const zMatch = /Z: ([-.0-9]+)/.exec(html);

        if (xMatch && yMatch && zMatch) {
          const newPoint: AccelData = {
            x: parseFloat(xMatch[1]),
            y: parseFloat(yMatch[1]),
            z: parseFloat(zMatch[1]),
            timestamp: Date.now(),
          };
          setData(prev => [...prev.slice(-39), newPoint]);
        }
      } catch (error) {
        console.error('Failed to connect to ESP32 server. Make sure it is running.', error);
      }
    };

    // Fetch data every 500ms to match the ESP32's update rate
    const intervalId = setInterval(fetchData, 500);

    return () => clearInterval(intervalId);
  }, []);

  // Fetch angles data for table from Firebase RTDB endpoint
  useEffect(() => {
    const URL = 'https://getnet-hamexlabs-default-rtdb.asia-southeast1.firebasedatabase.app/angles.json';

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

    const getString = (v: unknown): string | undefined => {
      if (typeof v === 'string') return v;
      if (isRecord(v) && typeof v.stringValue === 'string') return v.stringValue;
      return undefined;
    };

    const toNumber = (v: unknown): number => {
      if (v == null) return NaN;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return Number(v);
      if (isRecord(v)) {
        if (v.doubleValue != null) return Number(v.doubleValue as number | string);
        if (v.integerValue != null) return Number(v.integerValue as number | string);
        if (v.stringValue != null) return Number(v.stringValue as number | string);
      }
      return Number(v as unknown as number);
    };

    const mapFields = (v: unknown): Record<string, unknown> | undefined => {
      if (isRecord(v) && isRecord(v.mapValue) && isRecord(v.mapValue.fields)) return v.mapValue.fields as Record<string, unknown>;
      if (isRecord(v)) return v;
      return undefined;
    };

    const extractDoc = (doc: unknown): AngleRow[] => {
      const rows: AngleRow[] = [];
      if (!isRecord(doc)) return rows;
      const drec = doc as Record<string, unknown>;
      const fields: Record<string, unknown> = isRecord(drec.fields) ? (drec.fields as Record<string, unknown>) : drec;

      const deviceRaw = (fields as Record<string, unknown>)['device_id'];
      const deviceId = getString(deviceRaw) ?? (deviceRaw != null ? String(deviceRaw) : 'unknown');

      const readingsSrc = (fields as Record<string, unknown>)['readings'];
      let readings: unknown[] = [];
      if (isRecord(readingsSrc) && Array.isArray((readingsSrc as Record<string, unknown>)['values'] as unknown[])) {
        readings = ((readingsSrc as Record<string, unknown>)['values'] as unknown[]) || [];
      } else if (
        isRecord(readingsSrc) &&
        isRecord((readingsSrc as Record<string, unknown>)['arrayValue']) &&
        Array.isArray(((readingsSrc as Record<string, unknown>)['arrayValue'] as Record<string, unknown>)['values'] as unknown[])
      ) {
        const vals = (((readingsSrc as Record<string, unknown>)['arrayValue'] as Record<string, unknown>)['values'] as unknown[]) || [];
        readings = vals.map((v: unknown) => mapFields(v) ?? v);
      } else if (Array.isArray(readingsSrc)) {
        readings = readingsSrc as unknown[];
      }

      readings.forEach((r: unknown) => {
        const f = mapFields(r) ?? {};
        const tsRaw = (f as Record<string, unknown>)['timestamp'];
        const ts = getString(tsRaw) ?? (tsRaw != null ? String(tsRaw) : '');
        rows.push({
          deviceId,
          timestamp: ts,
          x_angle: toNumber((f as Record<string, unknown>)['x_angle']),
          y_angle: toNumber((f as Record<string, unknown>)['y_angle']),
          z_angle: toNumber((f as Record<string, unknown>)['z_angle']),
        });
      });
      return rows;
    };

    const load = async () => {
      setAnglesLoading(true);
      setAnglesError(null);
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        let rows: AngleRow[] = [];
        if (Array.isArray(json)) {
          (json as unknown[]).forEach((d) => { rows = rows.concat(extractDoc(d)); });
        } else if (isRecord(json)) {
          if ('fields' in json || 'readings' in json || 'device_id' in json) {
            rows = extractDoc(json);
          } else {
            Object.values(json as Record<string, unknown>).forEach((d) => { rows = rows.concat(extractDoc(d)); });
          }
        }
        rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAngles(rows);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAnglesError(`Failed to load angles: ${msg}`);
      } finally {
        setAnglesLoading(false);
      }
    };

    load();
  }, []);

  // Prepare chart data
  const chartData = {
    labels: data.map((d, i) => d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : i),
    datasets: [
      { label: 'X', data: data.map(d => d.x), borderColor: '#1976d2' },
      { label: 'Y', data: data.map(d => d.y), borderColor: '#388e3c' },
      { label: 'Z', data: data.map(d => d.z), borderColor: '#d32f2f' },
    ],
  };

  // Full window layout, similar to BluetoothDb
  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, color: '#1976d2' }}>
          WiFi Acceleration Dashboard
        </Typography>
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Real-time Acceleration Data (X, Y, Z)
          </Typography>
          {/* {loading ? <div>Loading...</div> : */}
          <LineChart data={chartData} />
          {/* } */}
        </Paper>

        {/* Angles Table */}
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            Angles Data
          </Typography>
          {anglesLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : anglesError ? (
            <Typography color="error" variant="body2">{anglesError}</Typography>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Device ID</TableCell>
                    <TableCell>Timestamp</TableCell>
                    <TableCell align="right">X Angle</TableCell>
                    <TableCell align="right">Y Angle</TableCell>
                    <TableCell align="right">Z Angle</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {angles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    angles.map((row, idx) => (
                      <TableRow key={`${row.deviceId}-${row.timestamp}-${idx}`}>
                        <TableCell>{row.deviceId}</TableCell>
                        <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                        <TableCell align="right">{isNaN(row.x_angle) ? '-' : row.x_angle}</TableCell>
                        <TableCell align="right">{isNaN(row.y_angle) ? '-' : row.y_angle}</TableCell>
                        <TableCell align="right">{isNaN(row.z_angle) ? '-' : row.z_angle}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table></TableContainer>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
