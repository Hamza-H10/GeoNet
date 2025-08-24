import { useEffect, useMemo, useRef, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import { useDevicesByCategory } from '../../hooks/useDevices';

type AccelSample = { x: number; y: number; z: number; ts?: number | string };

// FFT helpers (ported from BluetoothDb)
const hannWindow = (N: number) => Array.from({ length: N }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))));
const nearestPow2 = (n: number) => (n < 1 ? 0 : 1 << Math.floor(Math.log2(n)));
function dftMagnitude(input: number[]): number[] {
  const N = input.length;
  if (N === 0) return [];
  const win = hannWindow(N);
  const mags: number[] = [];
  const half = Math.floor(N / 2);
  for (let k = 0; k <= half; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const wv = input[n] * win[n];
      const angle = (-2 * Math.PI * k * n) / N;
      re += wv * Math.cos(angle);
      im += wv * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im) / (N / 2);
    mags.push(Number(mag.toFixed(4)));
  }
  return mags;
}

// Parse Firestore REST response for vibration readings
type FirestoreNumber = { doubleValue?: number | string; integerValue?: number | string } | number | string | undefined;
type FirestoreDocument = { fields?: Record<string, unknown> };
type FirestoreListResponse = { documents?: FirestoreDocument[] } | undefined;

function parseFirestoreVibration(json: FirestoreListResponse): AccelSample[] {
  const docs = Array.isArray(json?.documents) ? json!.documents! : [];
  const out: AccelSample[] = [];
  for (const d of docs) {
    const fieldsRec = (d as FirestoreDocument)?.fields;
    const fields = typeof fieldsRec === 'object' && fieldsRec ? (fieldsRec as Record<string, unknown>) : undefined;
    if (!fields) continue;
    const accelFields = (() => {
      const accel = fields['accelerometer'];
      if (accel && typeof accel === 'object') {
        const mv = (accel as Record<string, unknown>)['mapValue'];
        if (mv && typeof mv === 'object') {
          const f = (mv as Record<string, unknown>)['fields'];
          if (f && typeof f === 'object') return f as Record<string, FirestoreNumber>;
        }
      }
      return undefined;
    })();
    const tsField = fields?.timestamp as { stringValue?: string } | undefined;
    const num = (v: FirestoreNumber): number | undefined => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      if (v && typeof v === 'object') {
        const dv = (v as { doubleValue?: number | string }).doubleValue;
        const iv = (v as { integerValue?: number | string }).integerValue;
        const n = Number(dv ?? iv);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    };
    const x = num(accelFields?.x_acceleration);
    const y = num(accelFields?.y_acceleration);
    const z = num(accelFields?.z_acceleration);
    const ts = typeof tsField?.stringValue === 'string' ? tsField.stringValue : undefined;
    if (x != null && y != null && z != null) {
      out.push({ x, y, z, ts });
    }
  }
  // Sort by timestamp if possible
  out.sort((a, b) => {
    const ta = typeof a.ts === 'number' ? a.ts : a.ts ? Date.parse(String(a.ts)) : 0;
    const tb = typeof b.ts === 'number' ? b.ts : b.ts ? Date.parse(String(b.ts)) : 0;
    return (ta || 0) - (tb || 0);
  });
  return out;
}

export default function FFTChartExpanded({ deviceId: deviceIdProp, height = 360 }: { deviceId?: string; height?: number }) {
  const { devices } = useDevicesByCategory('vibration');
  const defaultId = devices[0]?.name;
  const [deviceId, setDeviceId] = useState<string | undefined>(deviceIdProp || defaultId);
  const [samples, setSamples] = useState<AccelSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Keep deviceId in sync with props/devices
  useEffect(() => {
    if (deviceIdProp) setDeviceId(deviceIdProp);
    else if (!deviceId && defaultId) setDeviceId(defaultId);
  }, [deviceIdProp, defaultId, deviceId]);

  // Fetch readings from Firestore
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        setLoading(true);
        setError(null);
        const base = 'https://firestore.googleapis.com/v1/projects/getnet-hamexlabs/databases/(default)/documents/vibration';
        const url = `${base}/${encodeURIComponent(deviceId)}/readings`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const parsed = parseFirestoreVibration(json);
        if (!cancelled) setSamples(parsed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    // poll every 10s
    const id = window.setInterval(fetchOnce, 10000);
    timer.current = id as unknown as number;
    return () => { cancelled = true; if (timer.current) window.clearInterval(timer.current); };
  }, [deviceId]);

  // Compute FFT data from last N samples
  const fftData = useMemo(() => {
    const N = Math.min(256, nearestPow2(samples.length));
    if (!N || N < 32) return null;
    const slice = samples.slice(-N);
    const x = slice.map((d) => d.x);
    const y = slice.map((d) => d.y);
    const z = slice.map((d) => d.z);

    const xSpec = dftMagnitude(x);
    const ySpec = dftMagnitude(y);
    const zSpec = dftMagnitude(z);
    const labels = Array.from({ length: xSpec.length }, (_, i) => `${i}`);

    const options: ApexOptions = {
      chart: { type: 'area', foreColor: '#1f2937', background: '#ffffff', toolbar: { show: true } },
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: {
        enabled: true,
        style: { fontSize: '12px', fontWeight: 700, colors: ['#111'] },
        background: { enabled: true, borderRadius: 2, foreColor: '#111', opacity: 1, borderWidth: 0, padding: 3 },
        dropShadow: { enabled: true, top: 0, left: 0, blur: 2, opacity: 0.25 },
        formatter: (val: number, opts?: { seriesIndex: number; series: number[][] }) => {
          const s = (opts?.series?.[opts.seriesIndex] as unknown as number[]) || [];
          const max = s.length ? Math.max(...s) : 0;
          return max && val >= max * 0.6 ? val.toFixed(2) : '';
        },
      },
      fill: { type: 'gradient', gradient: { shadeIntensity: 0.2, opacityFrom: 0.28, opacityTo: 0.06, stops: [0, 90, 100] } },
      markers: { size: 0, strokeWidth: 0, hover: { size: 4 } },
      colors: ['#e53935', '#43a047', '#1e88e5'],
      xaxis: {
        categories: labels,
        tickAmount: 10,
        title: { text: 'Frequency Bin (relative)', style: { color: '#111', fontSize: '12px', fontWeight: 600 } },
        labels: { rotate: 0, showDuplicates: false, style: { colors: '#111', fontSize: '12px' } },
        axisBorder: { show: true, color: '#9aa0a6' },
        axisTicks: { show: true, color: '#9aa0a6' },
      },
      yaxis: { decimalsInFloat: 2, title: { text: 'Amplitude', style: { color: '#111', fontSize: '12px', fontWeight: 600 } }, labels: { style: { colors: '#111', fontSize: '12px' } } },
      tooltip: { shared: true, intersect: false, theme: 'light', style: { fontSize: '13px' } },
      legend: { show: true, position: 'top', fontSize: '12px' },
      grid: { borderColor: '#e0e0e0' },
      title: { text: 'Frequency Spectrum (FFT)', align: 'left', style: { color: '#111', fontSize: '14px', fontWeight: 700 } },
    };

    const series = [
      { name: 'X', data: xSpec },
      { name: 'Y', data: ySpec },
      { name: 'Z', data: zSpec },
    ];
    return { options, series };
  }, [samples]);

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Vibration FFT</Typography>
        {!deviceIdProp && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="fft-device-label">Vibration Device</InputLabel>
              <Select labelId="fft-device-label" label="Vibration Device" value={deviceId || ''} onChange={e => setDeviceId(String(e.target.value))}>
                {devices.map(d => (
                  <MenuItem key={d.name} value={d.name}>{d.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </Box>
      {error && (
        <Typography color="error" sx={{ mb: 1 }}>Failed to load readings: {error}</Typography>
      )}
      {loading && !samples.length ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Loading readings…</Typography>
        </Box>
      ) : fftData ? (
        <ReactApexChart options={fftData.options as ApexOptions} series={fftData.series as { name: string; data: number[] }[]} type="area" height={height} />
      ) : (
        <Typography variant="body2" color="text.secondary">Waiting for enough data to compute FFT…</Typography>
      )}
    </Paper>
  );
}
