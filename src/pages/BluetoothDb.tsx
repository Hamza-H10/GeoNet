// Extend the window.electronAPI type to include required methods
declare global {
  interface Window {
    electronAPI?: {
      listSerialPorts?: () => Promise<{ path: string; manufacturer?: string }[]>;
      connectSerial?: (port: string) => Promise<void>;
      onSerialData?: (cb: (data: string) => void) => void;
      sendSerial?: (data: string) => Promise<void>;
      onMenuAction?: (cb: (payload: { action: string }) => void) => void;
    };
  }
}

import { Box, Button, Typography, MenuItem, Select, FormControl, InputLabel, IconButton, Tooltip, TextField } from '@mui/material';
import { useState, useEffect, useRef, useMemo } from 'react';
import ClearIcon from '@mui/icons-material/Clear';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import SendIcon from '@mui/icons-material/Send';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import { AccelerationDashboard } from '../components/charts/btCharts';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import WaveformCanvas from '../components/WaveformCanvas';
import type { WaveformCanvasHandle } from '../components/WaveformCanvas';

// FFT helpers moved to module scope
const hannWindow = (N: number) => Array.from({ length: N }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))));
const nearestPow2 = (n: number) => (n < 1 ? 0 : 1 << Math.floor(Math.log2(n)));
function dftMagnitude(input: number[]): number[] {
  const N = input.length;
  if (N === 0) return [];
  const win = hannWindow(N);
  const mags: number[] = [];
  // Only compute up to Nyquist (N/2)
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

interface BluetoothDbProps {
  serialInput: string;
  setSerialInput: React.Dispatch<React.SetStateAction<string>>;
  serialLogs: string[];
  setSerialLogs: React.Dispatch<React.SetStateAction<string[]>>;
  sendSerialData: () => Promise<void>;
}


// Mock accelerometer data for demo (replace with real data as needed)
const mockData = Array.from({ length: 20 }, () => ({
  x: Math.random(),
  y: Math.random(),
  z: Math.random(),
}));


export default function BluetoothDb({ serialInput, setSerialInput, serialLogs, setSerialLogs, sendSerialData }: BluetoothDbProps) {
  const [ports, setPorts] = useState<{path: string, manufacturer?: string}[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [connected, setConnected] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [showPorts, setShowPorts] = useState(false);
  const [userMsg, setUserMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showHorizontal, setShowHorizontal] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [enabledSeries, setEnabledSeries] = useState<string[]>(['X', 'Y', 'Z']);
  const waveRef = useRef<WaveformCanvasHandle | null>(null);

  // Helper to add timestamp
  const formatLog = (log: string) => {
    if (!showTimestamps) return log;
    const now = new Date();
    const ts = now.toLocaleTimeString();
    return `[${ts}] ${log}`;
  };

  // --- ALERT SYSTEM STATE ---
  // Thresholds for x, y, z and alert threshold
  const [thresholds, setThresholds] = useState({ x: 1.5, y: 1.5, z: 1.5, alert: 2 });
  // Last 3 largest displacements (magnitude)
  const [largest, setLargest] = useState<{ mag: number, x: number, y: number, z: number, idx: number }[]>([]);
  // Threshold exceeded info: count and last value for each axis
  const [exceeded, setExceeded] = useState({ x: { count: 0, last: 0 }, y: { count: 0, last: 0 }, z: { count: 0, last: 0 } });
  // Alert active state
  const [alertActive, setAlertActive] = useState(false);
  // For alert animation
  const alertTimeout = useRef<NodeJS.Timeout | null>(null);

  // Parse serialLogs for live data
  function parseAccelLine(line: string): { x: number, y: number, z: number } | null {
    const regex = /x\s*[:=]\s*(-?\d*\.?\d+)\s*,?\s*y\s*[:=]\s*(-?\d*\.?\d+)\s*,?\s*z\s*[:=]\s*(-?\d*\.?\d+)/i;
    const match = line.match(regex);
    if (!match) return null;
    const [, x, y, z] = match;
    return { x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) };
  }

  // Build FFT spectrum from latest samples
  const fftData = useMemo(() => {
    const parsed = serialLogs
      .map(parseAccelLine)
      .filter((v): v is { x: number; y: number; z: number } => !!v);

    const N = Math.min(256, nearestPow2(parsed.length));
    if (!N || N < 32) return null; // not enough data

    const slice = parsed.slice(-N);
    const x = slice.map((d) => d.x);
    const y = slice.map((d) => d.y);
    const z = slice.map((d) => d.z);

    const xSpec = dftMagnitude(x);
    const ySpec = dftMagnitude(y);
    const zSpec = dftMagnitude(z);

    const labels = Array.from({ length: xSpec.length }, (_, i) => `${i}`);

    const options: ApexOptions = {
      chart: {
        type: 'area',
        foreColor: '#1f2937',
        background: '#ffffff',
        toolbar: { show: true },
      },
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
      // Subtle gradient under lines (not too faded)
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 0.2, opacityFrom: 0.28, opacityTo: 0.06, stops: [0, 90, 100] },
      },
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
      yaxis: {
        decimalsInFloat: 2,
        title: { text: 'Amplitude', style: { color: '#111', fontSize: '12px', fontWeight: 600 } },
        labels: { style: { colors: '#111', fontSize: '12px' } },
      },
      tooltip: { shared: true, intersect: false, theme: 'light', style: { fontSize: '13px' } },
      legend: { show: true, position: 'top', fontSize: '12px' },
      grid: { borderColor: '#e0e0e0' },
      title: { text: 'Frequency Spectrum (FFT)', align: 'left', style: { color: '#111', fontSize: '14px', fontWeight: 700 } },
    };

    const series: { name: string; data: number[] }[] = [
      { name: 'X', data: xSpec },
      { name: 'Y', data: ySpec },
      { name: 'Z', data: zSpec },
    ];

    return { options, series };
  }, [serialLogs]);

  // Build time-domain arrays for waveform-data.js component
  const waveformSeries = useMemo(() => {
    const parsed = serialLogs
      .map(parseAccelLine)
      .filter((v): v is { x: number; y: number; z: number } => !!v);
    const N = Math.min(1024, parsed.length);
    if (N < 2) return null;
    const slice = parsed.slice(-N);
    const x = slice.map(d => d.x);
    const y = slice.map(d => d.y);
    const z = slice.map(d => d.z);
    return [
      { name: 'X', data: x, color: '#ff5252' },
      { name: 'Y', data: y, color: '#4caf50' },
      { name: 'Z', data: z, color: '#42a5f5' },
    ];
  }, [serialLogs]);

  // Track last 3 largest displacements and threshold exceed info
  useEffect(() => {
    if (!serialLogs.length) return;
    const last = serialLogs[serialLogs.length - 1];
    const d = parseAccelLine(last);
    if (!d) return;
    // Displacement magnitude
    const mag = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    setLargest(prev => {
      const arr = [...prev, { mag, ...d, idx: serialLogs.length - 1 }];
      arr.sort((a, b) => b.mag - a.mag);
      return arr.slice(0, 3);
    });
    // Threshold exceeded info
    setExceeded(prev => {
      const upd = { ...prev };
      ['x', 'y', 'z'].forEach(axis => {
        const val = d[axis as 'x' | 'y' | 'z'];
        if (Math.abs(val) > thresholds[axis as 'x' | 'y' | 'z']) {
          upd[axis as 'x' | 'y' | 'z'] = {
            count: prev[axis as 'x' | 'y' | 'z'].count + 1,
            last: val
          };
        }
      });
      return upd;
    });
    // Alert system: if any axis exceeds alert threshold
    if (Math.abs(d.x) > thresholds.alert || Math.abs(d.y) > thresholds.alert || Math.abs(d.z) > thresholds.alert) {
      setAlertActive(true);
      if (alertTimeout.current) clearTimeout(alertTimeout.current);
      alertTimeout.current = setTimeout(() => setAlertActive(false), 2000);
    }
  }, [serialLogs, thresholds]);

  // Handlers for threshold input
  const handleThresholdChange = (axis: 'x' | 'y' | 'z' | 'alert', val: number) => {
    setThresholds(t => ({ ...t, [axis]: val }));
  };
  const inc = (axis: 'x' | 'y' | 'z' | 'alert') => handleThresholdChange(axis, Number((thresholds[axis] + 0.1).toFixed(2)));
  const dec = (axis: 'x' | 'y' | 'z' | 'alert') => handleThresholdChange(axis, Number((thresholds[axis] - 0.1).toFixed(2)));

  // Discover available serial ports
  const discoverSerialPorts = async () => {
    setUserMsg('');
    setDiscovering(true);
    setShowPorts(true);
    try {
      if (window.electronAPI && window.electronAPI.listSerialPorts) {
        setUserMsg('Searching for serial Bluetooth devices...');
        const found = await window.electronAPI.listSerialPorts();
        setPorts(found);
        if (found.length === 0) {
          setUserMsg('No serial Bluetooth devices found. Make sure your device is paired and connected to the PC.');
        } else {
          setUserMsg(`Found ${found.length} device(s). Select one to connect.`);
        }
      } else {
        setPorts([]);
        setUserMsg('Serial port API not available. Are you running in Electron?');
      }
    } catch (err) {
      setPorts([]);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setUserMsg('Error discovering devices: ' + errorMsg);
    }
    setTimeout(() => setDiscovering(false), 800);
  };

  // Connect to selected serial port
  const connectSerial = async () => {
    setErrorMsg('');
    if (window.electronAPI && window.electronAPI.connectSerial && selectedPort) {
      try {
        await window.electronAPI.connectSerial(selectedPort);
        setConnected(true);
        setSerialLogs(logs => [...logs, `Connected to ${selectedPort}`]);
      } catch (err) {
        setErrorMsg('Failed to connect to port. It may be busy or access is denied. Close other apps that might be using the port and try again.');
        setConnected(false);
        const errorMsg = (err && typeof err === 'object' && 'message' in err) ? (err as { message: string }).message : String(err);
        setSerialLogs(logs => [...logs, `Error connecting to ${selectedPort}: ${errorMsg}`]);
      }
    }
  };

  // Listen for serial data
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onSerialData) {
      const handler = (data: string) => setSerialLogs(logs => [...logs, data]);
      window.electronAPI.onSerialData(handler);
      // No cleanup needed because onSerialData is a one-time registration in preload
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Modern UI Heading */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, mb: 2 }}>
          <BluetoothIcon sx={{ fontSize: 36, color: '#1976d2', mr: 1 }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: 0.5, color: '#232837', lineHeight: 1.1 }}>
              Bluetooth Serial Dashboard
            </Typography>
          </Box>
        </Box>

        {/* Charts first */}
        {/* Only keep the top chart instance */}
        <Box sx={{ mt: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <AccelerationDashboard data={mockData} serialLogs={serialLogs} alertThresholds={thresholds} />
        </Box>

        {/* FFT Spectrum Chart */}
        <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f7', borderRadius: 2, boxShadow: 1 }}>
          {fftData ? (
            <ReactApexChart options={fftData.options} series={fftData.series} type="area" height={320} />
          ) : (
            <Typography variant="body2" color="text.secondary">Waiting for enough data to compute FFT…</Typography>
          )}
        </Box>

        {/* Waveform Chart (waveform-data.js) */}
        <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f7', borderRadius: 2, boxShadow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1 }}>Waveform</Typography>
            {/* Toggle series */}
            {(['X','Y','Z'] as const).map(n => (
              <Button key={n} size="small" variant={enabledSeries.includes(n) ? 'contained' : 'outlined'} onClick={() => setEnabledSeries(s => s.includes(n) ? s.filter(x => x!==n) : [...s, n])} sx={{ textTransform: 'none' }}>
                {enabledSeries.includes(n) ? `Hide ${n}` : `Show ${n}`}
              </Button>
            ))}
            <Box sx={{ flex: 1 }} />
            {/* View controls */}
            <Button size="small" onClick={() => waveRef.current?.panLeft()} sx={{ textTransform: 'none' }}>Pan ←</Button>
            <Button size="small" onClick={() => waveRef.current?.panRight()} sx={{ textTransform: 'none' }}>Pan →</Button>
            <Button size="small" onClick={() => waveRef.current?.zoomIn()} sx={{ textTransform: 'none' }}>Zoom In</Button>
            <Button size="small" onClick={() => waveRef.current?.zoomOut()} sx={{ textTransform: 'none' }}>Zoom Out</Button>
            <Button size="small" onClick={() => waveRef.current?.resetView()} sx={{ textTransform: 'none' }}>Reset</Button>
            <Button size="small" onClick={() => { const url = waveRef.current?.exportPNG(); if (url) { const a = document.createElement('a'); a.href=url; a.download='waveform.png'; a.click(); } }} sx={{ textTransform: 'none' }}>Export PNG</Button>
          </Box>
          {waveformSeries ? (
            <WaveformCanvas ref={waveRef} series={waveformSeries.filter(s => enabledSeries.includes(s.name))} height={320} background="#0b0b0b" />
          ) : (
            <Typography variant="body2" color="text.secondary">No waveform data yet…</Typography>
          )}
        </Box>

        {/* ALERT SYSTEM UI */}
        <Box sx={{ mt: 3, mb: 2, p: 2, bgcolor: '#f5f5f7', borderRadius: 2, boxShadow: 1 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Alert System</Typography>
          {/* Threshold inputs in a row */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            {(['x', 'y', 'z'] as const).map(axis => (
              <Box key={axis} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#e3eafc', p: 1, borderRadius: 1 }}>
                <Typography sx={{ minWidth: 18, fontWeight: 500, color: axis === 'x' ? '#e53935' : axis === 'y' ? '#43a047' : '#1e88e5' }}>{axis.toUpperCase()}</Typography>
                <IconButton size="small" onClick={() => dec(axis)}><span style={{fontWeight:700}}>-</span></IconButton>
                <TextField size="small" type="number" value={thresholds[axis]} onChange={e => handleThresholdChange(axis, Number(e.target.value))} inputProps={{ step: 0.1, min: 0, style: { width: 48, textAlign: 'center' } }} />
                <IconButton size="small" onClick={() => inc(axis)}><span style={{fontWeight:700}}>+</span></IconButton>
                <Typography sx={{ ml: 0.5, fontSize: 13, color: '#888' }}>Threshold</Typography>
              </Box>
            ))}
            {/* Alert threshold */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#ffe0e0', p: 1, borderRadius: 1 }}>
              <Typography sx={{ minWidth: 18, fontWeight: 500, color: '#d32f2f' }}>Alert</Typography>
              <IconButton size="small" onClick={() => dec('alert')}><span style={{fontWeight:700}}>-</span></IconButton>
              <TextField size="small" type="number" value={thresholds.alert} onChange={e => handleThresholdChange('alert', Number(e.target.value))} inputProps={{ step: 0.1, min: 0, style: { width: 48, textAlign: 'center' } }} />
              <IconButton size="small" onClick={() => inc('alert')}><span style={{fontWeight:700}}>+</span></IconButton>
              <Typography sx={{ ml: 0.5, fontSize: 13, color: '#d32f2f' }}>Alert Threshold</Typography>
            </Box>
            {/* Alert indicator */}
            <Box sx={{ ml: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              {alertActive && <span style={{ color: '#d32f2f', fontWeight: 700, fontSize: 18, animation: 'blinker 1s linear infinite' }}>ALERT!</span>}
            </Box>
          </Box>

          {/* Last 3 largest displacement */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>Last 3 Largest Displacement</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {largest.length === 0 && <Typography sx={{ color: '#888' }}>No data yet.</Typography>}
              {largest.map((d, i) => (
                <Box key={i} sx={{ bgcolor: '#f0f4c3', p: 1, borderRadius: 1, minWidth: 120 }}>
                  <Typography sx={{ fontSize: 13 }}>#{d.idx + 1} | Mag: <b>{d.mag.toFixed(2)}</b></Typography>
                  <Typography sx={{ fontSize: 13, color: '#e53935' }}>X: {d.x.toFixed(2)}</Typography>
                  <Typography sx={{ fontSize: 13, color: '#43a047' }}>Y: {d.y.toFixed(2)}</Typography>
                  <Typography sx={{ fontSize: 13, color: '#1e88e5' }}>Z: {d.z.toFixed(2)}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Threshold exceeded info */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>Threshold Exceeded Information</Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {(['x', 'y', 'z'] as const).map(axis => (
                <Box key={axis} sx={{ bgcolor: '#e3eafc', p: 1, borderRadius: 1, minWidth: 120 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: axis === 'x' ? '#e53935' : axis === 'y' ? '#43a047' : '#1e88e5' }}>{axis.toUpperCase()}</Typography>
                  <Typography sx={{ fontSize: 13 }}>Exceeded Count: <b>{exceeded[axis].count}</b></Typography>
                  <Typography sx={{ fontSize: 13 }}>Last Exceeded Value: <b>{exceeded[axis].last !== 0 ? exceeded[axis].last.toFixed(2) : '--'}</b></Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Serial Port UI and Discover below charts */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button variant="outlined" startIcon={<BluetoothIcon />} onClick={discoverSerialPorts} disabled={discovering}>
              Discover Bluetooth Devices (Serial)
            </Button>
            {discovering && <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}><span style={{marginRight: 6}}>Searching...</span><span><svg width="22" height="22" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#1976d2" strokeWidth="5" strokeDasharray="31.4 31.4" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg></span></Box>}
          </Box>
          {showPorts && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#0d2f47ff', borderRadius: 2, minHeight: 80 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Available Serial Bluetooth Devices</Typography>
              {userMsg && <Typography variant="body2" color="primary" sx={{ mb: 1 }}>{userMsg}</Typography>}
              {errorMsg && <Typography variant="body2" color="error" sx={{ mb: 1 }}>{errorMsg}</Typography>}
              <FormControl size="small" sx={{ minWidth: 200, bgcolor: '#fff', borderRadius: 1 }}>
                <InputLabel id="serial-port-label">Serial Port</InputLabel>
                <Select
                  labelId="serial-port-label"
                  value={selectedPort}
                  label="Serial Port"
                  onChange={e => setSelectedPort(e.target.value)}
                  disabled={discovering || ports.length === 0}
                >
                  {ports.length === 0 && !discovering && <MenuItem value="" disabled>No devices found</MenuItem>}
                  {ports.map((p) => (
                    <MenuItem key={p.path} value={p.path}>{p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="contained" color="primary" onClick={connectSerial} disabled={!selectedPort || connected || discovering} sx={{ ml: 2 }}>
                {connected ? 'Connected' : 'Connect'}
              </Button>
            </Box>
          )}
          <Box sx={{ p: 2, background: '#24181dff', mb: 2, borderRadius: 2, boxShadow: 1, position: 'relative', minHeight: 120, border: '1px solid #444' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <input
                value={serialInput}
                onChange={e => setSerialInput(e.target.value)}
                placeholder="Type message..."
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', fontSize: 16, flex: 1, minWidth: 0, background: '#232837', color: '#e0e0e0' }}
                onKeyDown={e => { if (e.key === 'Enter') sendSerialData(); }}
              />
              <Tooltip title="Send">
                <span>
                  <IconButton
                    onClick={sendSerialData}
                    disabled={!serialInput.trim() || !connected || discovering}
                    color="primary"
                    size="medium"
                    sx={{ bgcolor: '#e0e0e0', border: '1px solid #bbb', ml: 1, color: '#232837', '&:hover': { bgcolor: '#181c24', color: '#fff', borderColor: '#232837' } }}
                  >
                    <SendIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Clear Console">
                <span>
                  <IconButton
                    onClick={() => setSerialLogs([])}
                    color="primary"
                    size="medium"
                    sx={{ bgcolor: '#32384a', border: '1px solid #666', ml: 1, color: '#f0f0f0', '&:hover': { bgcolor: '#181c24', color: '#fff', borderColor: '#232837' } }}
                  >
                    <ClearIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={showHorizontal ? 'Vertical Scroll' : 'Horizontal Scroll'}>
                <span>
                  <IconButton
                    onClick={() => setShowHorizontal(s => !s)}
                    color="primary"
                    size="medium"
                    sx={{ bgcolor: '#32384a', border: '1px solid #666', ml: 1, color: '#f0f0f0', '&:hover': { bgcolor: '#181c24', color: '#fff', borderColor: '#232837' } }}
                  >
                    {showHorizontal ? <SwapVertIcon /> : <SwapHorizIcon />}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={showTimestamps ? 'Hide Timestamps' : 'Show Timestamps'}>
                <span>
                  <IconButton
                    onClick={() => setShowTimestamps(s => !s)}
                    color="primary"
                    size="medium"
                    sx={{ bgcolor: '#32384a', border: '1px solid #666', ml: 1, color: '#f0f0f0', '&:hover': { bgcolor: '#181c24', color: '#fff', borderColor: '#232837' } }}
                  >
                    {showTimestamps ? <CalendarTodayIcon /> : <AccessTimeIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Box
              sx={{
                minHeight: 72,
                maxHeight: 140,
                minWidth: 0,
                overflowY: showHorizontal ? 'hidden' : 'auto',
                overflowX: showHorizontal ? 'auto' : 'hidden',
                mt: 1,
                background: '#232837',
                p: 1,
                border: '1px solid #444',
                whiteSpace: showHorizontal ? 'pre' : 'pre-wrap',
                fontFamily: 'monospace',
                display: 'block',
                borderRadius: 1,
                position: 'relative',
                userSelect: 'text',
                color: '#e0e0e0',
              }}
            >
              {serialLogs.length === 0 && (
                <span style={{
                  color: '#888',
                  position: 'absolute',
                  left: 12,
                  top: 12,
                  pointerEvents: 'none',
                  fontSize: 16,
                  opacity: 0.7,
                  userSelect: 'none',
                  transition: 'opacity 0.2s',
                }}>
                  Serial Port Console
                </span>
              )}
              {showHorizontal ? (
                <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>
                  {serialLogs.map((log, i) => (
                    <span key={i} style={{ color: '#7fffd4', marginRight: 8 }}>{formatLog(log)}</span>
                  ))}
                </div>
              ) : (
                <>{serialLogs.map((log, i) => (
                  <div key={i} style={{ color: '#7fffd4', marginBottom: 4 }}>{formatLog(log)}</div>
                ))}</>
              )}
            </Box>
          </Box>
        </Box>
        {/* Removed duplicate chart instance */}
      </Box>
    </Box>
  );
}
