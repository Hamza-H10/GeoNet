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
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { AreaChart } from '../components/Charts';
import { valueFor, meterColor, computeSummary, type Meter, normalize, buildMeters } from '../components/TiltmeterData';
import DataFetchSettings from '../components/DataFetchSettings';
import RoomIcon from '@mui/icons-material/Room';
import IconButton from '@mui/material/IconButton';
import GoogleDevicesMap from '../components/GoogleDevicesMap';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import AlarmIcon from '@mui/icons-material/Alarm';
import XYDeflectionChart from '../components/charts/tiltmeterChartsXY';
import TiltmeterTimeSeriesModal from '../components/charts/tiltmeterTimeSeries';
import { useDevicesByCategory } from '../hooks/useDevices';

export default function TiltmeterDashboard() {
  // Only show sensors that exist in Devices backend with category 'tiltmeter'
  const { devices, nameSet } = useDevicesByCategory('tiltmeter');
  const [meters, setMeters] = useState<Meter[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch from Firestore REST: list documents under tiltmeter/{deviceId}/readings for all known devices
  useEffect(() => {
    let cancelled = false;
    const deviceNames = devices.map(d => d.name).filter(Boolean);
    // Determine client-side fetch interval from settings (minutes → ms), fallback 10s
    const getIntervalMs = () => {
      try {
        const v = localStorage.getItem('app.fetchIntervalMs');
        const n = v ? Number(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 10_000;
      } catch { return 10_000; }
    };

    const load = async () => {
      try {
        setFetchError(null);
  if (deviceNames.length === 0) {
          if (!cancelled) setMeters([]);
          return;
        }
        // const base = 'https://firestore.googleapis.com/v1/projects/getnet-hamexlabs/databases/(default)/documents/tiltmeter';

        const base = 'https://firestore.googleapis.com/v1/projects/hamexlabs-metro/databases/(default)/documents/tiltmeter';

        const fetchOne = async (devId: string) => {
          const url = `${base}/${encodeURIComponent(devId)}/readings`;
          try {
            const res = await fetch(url);
            if (!res.ok) return [] as ReturnType<typeof normalize>;
            const json = await res.json();
            return normalize(json);
          } catch {
            return [] as ReturnType<typeof normalize>;
          }
        };
        const all = (await Promise.all(deviceNames.map(fetchOne))).flat();
        const built = buildMeters(all);
        if (!cancelled) setMeters(built);
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e));
      }
    };

    load();
    let currentInterval = getIntervalMs();
    let t = setInterval(load, currentInterval);
    // React to interval changes (if user updates settings while on page)
    const ping = setInterval(() => {
      const newVal = getIntervalMs();
      if (newVal !== currentInterval) {
        currentInterval = newVal;
        clearInterval(t);
        t = setInterval(load, currentInterval);
      }
    }, 5_000);
    return () => { cancelled = true; clearInterval(t); clearInterval(ping); };
  }, [devices]);

  const filteredMeters = useMemo(() => meters.filter(m => nameSet.has(m.id.trim().toLowerCase())), [meters, nameSet]);
  const [mode, setMode] = useState<'current' | 'today' | 'alltime'>('current');
  const [detail, setDetail] = useState<Meter | null>(null);
  const [tileSize, setTileSize] = useState<'small' | 'medium' | 'large'>('small');
  const [mapOpen, setMapOpen] = useState(false);
  const [xyOpen, setXyOpen] = useState(false);
  const [xyMode, setXyMode] = useState<'current' | 'today' | 'alltime'>(mode);
  const [tsOpen, setTsOpen] = useState(false);

  // Alert thresholds (degrees)
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [normalCutoff, setNormalCutoff] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('tilt.thresholds');
      if (raw) {
        const obj = JSON.parse(raw) as { normal?: number; danger?: number };
        if (typeof obj.normal === 'number' && Number.isFinite(obj.normal)) return obj.normal;
      }
    } catch { /* ignore */ }
    return 5;
  });
  const [dangerCutoff, setDangerCutoff] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('tilt.thresholds');
      if (raw) {
        const obj = JSON.parse(raw) as { normal?: number; danger?: number };
        if (typeof obj.danger === 'number' && Number.isFinite(obj.danger)) return obj.danger;
      }
    } catch { /* ignore */ }
    return 10;
  });

  // Save thresholds
  useEffect(() => {
    try {
      localStorage.setItem('tilt.thresholds', JSON.stringify({ normal: normalCutoff, danger: dangerCutoff }));
    } catch {
      // ignore storage errors
    }
  }, [normalCutoff, dangerCutoff]);

  const { maxToday, allTimeHigh, recent } = useMemo(() => computeSummary(filteredMeters), [filteredMeters]);
  const counts = useMemo(() => {
    let safe = 0, warning = 0, danger = 0;
    for (const m of filteredMeters) {
      const v = Math.max(m.currentX, m.currentY);
      if (v < normalCutoff) safe++; else if (v < dangerCutoff) warning++; else danger++;
    }
    return { safe, warning, danger };
  }, [filteredMeters, normalCutoff, dangerCutoff]);

  const statusWithThresholds = (x: number, y: number): Meter['status'] => {
    const v = Math.max(x, y);
    if (v < normalCutoff) return 'safe';
    if (v < dangerCutoff) return 'warning';
    return 'danger';
  };

  const alertActive = useMemo(() => filteredMeters.some(m => Math.max(m.currentX, m.currentY) >= dangerCutoff), [filteredMeters, dangerCutoff]);

  // Size tuning
  const sizeCfg = {
    small: { meterH: 80, pad: 1, valueFont: 'h6' as const },
    medium: { meterH: 100, pad: 1.5, valueFont: 'h5' as const },
    large: { meterH: 120, pad: 2, valueFont: 'h5' as const },
  }[tileSize];

  return (
    <Box sx={{
      bgcolor: '#fff',
      minHeight: '100vh',
      minWidth: '100vw',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 0,
      overflow: 'auto',
      overflowX: 'hidden',
      scrollbarWidth: 'none',          // Firefox
      msOverflowStyle: 'none',         // IE/Edge
      '&::-webkit-scrollbar': {        // Chrome/Safari
        width: 0,
        height: 0,
      },
      // Also hide scrollbars for all nested scrollable elements within this page
      '& *': {
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      },
      '& *::-webkit-scrollbar': {
        width: 0,
        height: 0,
      },
    }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        {/* Legend and controls (title/description removed as requested) */}
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
            {/* Alarm/Thresholds trigger next to settings */}
            <IconButton color="primary" size="small" onClick={() => setAlarmOpen(true)} title="Tilt thresholds">
              <AlarmIcon />
            </IconButton>
            <Box sx={{ ml: 0.5, width: 10, height: 10, borderRadius: '50%', bgcolor: alertActive ? '#d32f2f' : '#9e9e9e', boxShadow: alertActive ? '0 0 0 6px rgba(211,47,47,0.2)' : 'none', transition: 'all .2s' }} />
            <IconButton color="primary" size="small" onClick={() => setMapOpen(true)} title="Show Devices on Map">
              <RoomIcon />
            </IconButton>
            <IconButton color="primary" size="small" onClick={() => { setXyMode(mode); setXyOpen(true); }} title="XY Deflection Chart">
              <ShowChartIcon />
            </IconButton>
            <IconButton color="primary" size="small" onClick={() => setTsOpen(true)} title="Time Series Averages">
              <TimelineIcon />
            </IconButton>
          </Box>
        </Box>

        {fetchError ? (
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff3f3', border: '1px solid #ffcdd2' }}>
            <Typography color="error">Failed to fetch Firestore readings: {fetchError}</Typography>
          </Paper>
        ) : null}

        {/* Summary cards */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(12, 1fr)', mb: 3 }}>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#111827' }}>{filteredMeters.length}</Typography>
              <Typography sx={{ color: '#6b7280' }}>Total Sensors</Typography>
            </Paper>
          </Box>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#10b981' }}>{counts.safe}</Typography>
              <Typography sx={{ color: '#6b7280' }}>Normal</Typography>
            </Paper>
          </Box>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#f59e0b' }}>{counts.warning}</Typography>
              <Typography sx={{ color: '#6b7280' }}>Warning</Typography>
            </Paper>
          </Box>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#ef4444' }}>{counts.danger}</Typography>
              <Typography sx={{ color: '#6b7280' }}>Danger</Typography>
            </Paper>
          </Box>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#3b82f6' }}>{maxToday.toFixed(1)}°</Typography>
              <Typography sx={{ color: '#6b7280' }}>Max Today</Typography>
            </Paper>
          </Box>
          <Box sx={{ gridColumn: { xs: 'span 6', sm: 'span 4', md: 'span 2' } }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#7c3aed' }}>{allTimeHigh.toFixed(1)}°</Typography>
              <Typography sx={{ color: '#6b7280' }}>All Time High</Typography>
            </Paper>
          </Box>
        </Box>

        {/* Status grid */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(12, 1fr)' }}>
            {filteredMeters.map(m => {
              const xVal = valueFor(m, 'x', mode);
              const yVal = valueFor(m, 'y', mode);
              const zVal = valueFor(m, 'z', mode);
              const st = statusWithThresholds(xVal, yVal);
              const xPct = Math.min(100, (xVal / 15) * 100);
              const yPct = Math.min(100, (yVal / 15) * 100);
              const zDen = Math.max(1, Math.max(m.todayMaxZ ?? 0, m.allTimeHighZ ?? 0, 10));
              const zPct = Math.min(100, (zVal / zDen) * 100);
              return (
                <Box key={m.id} sx={{ gridColumn: { xs: 'span 12', sm: 'span 6', md: 'span 4' } }}>
                  <Paper sx={{ p: sizeCfg.pad, cursor: 'pointer' }} onClick={() => setDetail(m)}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{m.id}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: '#6b7280', display: 'block' }}>{m.location}</Typography>
                        {m.lastUpdated ? (
                          <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>
                            Last updated: {new Date(m.lastUpdated).toLocaleString()}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>

                    {/* Place XY bars on left, Z vertical on right */}
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
                      {/* X/Y horizontal bars */}
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* X */}
                        <Box sx={{ position: 'relative', height: sizeCfg.meterH / 2, bgcolor: '#f3f4f6', borderRadius: 1, overflow: 'hidden' }}>
                          <Box sx={{ width: `${xPct}%`, height: '100%', bgcolor: meterColor(st) }} />
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827' }}>X {xVal.toFixed(1)}°</Typography>
                          </Box>
                        </Box>
                        {/* Y */}
                        <Box sx={{ position: 'relative', height: sizeCfg.meterH / 2, bgcolor: '#f3f4f6', borderRadius: 1, overflow: 'hidden' }}>
                          <Box sx={{ width: `${yPct}%`, height: '100%', bgcolor: meterColor(st) }} />
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827' }}>Y {yVal.toFixed(1)}°</Typography>
                          </Box>
                        </Box>
                      </Box>

                      {/* Thicker Z vertical bar on right */}
                      <Box sx={{ width: 40, height: sizeCfg.meterH, bgcolor: '#f3f4f6', borderRadius: 1, position: 'relative', overflow: 'hidden' }}>
                        <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${zPct}%`, bgcolor: meterColor(st) }} />
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827', textAlign: 'center' }}>Z {zVal.toFixed(1)}mm</Typography>
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
                  <TableCell align="right">{m.currentX.toFixed(1)}</TableCell>
                  <TableCell align="right">{m.currentY.toFixed(1)}</TableCell>
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
            <TextField
              type="number"
              label="Normal &lt; (°)"
              value={Number.isFinite(normalCutoff) ? normalCutoff : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') { setNormalCutoff(NaN as unknown as number); return; }
                const n = Number(v);
                if (Number.isFinite(n)) setNormalCutoff(n);
              }}
              size="small"
              fullWidth
            />
            <TextField
              type="number"
              label="Danger &gt; (°)"
              value={Number.isFinite(dangerCutoff) ? dangerCutoff : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') { setDangerCutoff(NaN as unknown as number); return; }
                const n = Number(v);
                if (Number.isFinite(n)) setDangerCutoff(n);
              }}
              size="small"
              fullWidth
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mt: 1 }}>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlarmOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Sensor Details</DialogTitle>
        <DialogContent>
          {detail && (
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: '1fr', pt: 1 }}>
              {/* XY Tilt area chart */}
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Tilt over Time (X/Y)</Typography>
                {(() => {
                  const labels = detail.history.map(p => `${p.hour}:00${p.iso ? ` (${new Date(p.ts as number).toLocaleDateString()})` : ''}`);
                  const data = {
                    labels,
                    datasets: [
                      { label: 'X Angle (°)', data: detail.history.map(p => p.x), borderColor: '#1976d2' },
                      { label: 'Y Angle (°)', data: detail.history.map(p => p.y), borderColor: '#388e3c' },
                    ],
                  };
                  return <AreaChart data={data} height={240} />;
                })()}
              </Box>
              {/* Z Settlement area chart */}
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Pavement Settlement (Z)</Typography>
                {(() => {
                  const labels = detail.history.map(p => `${p.hour}:00${p.iso ? ` (${new Date(p.ts as number).toLocaleDateString()})` : ''}`);
                  const data = {
                    labels,
                    datasets: [
                      { label: 'Settlement (mm)', data: detail.history.map(p => p.z), borderColor: '#f59e0b' },
                    ],
                  };
                  return <AreaChart data={data} height={240} />;
                })()}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Map Modal */}
      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Devices Map</DialogTitle>
        <DialogContent>
          <Box sx={{ height: '70vh', width: '100%', position: 'relative' }}>
            {/* Google JS Maps with programmatic markers */}
            {(() => {
              const valid = filteredMeters.filter(m => m.lat != null && m.lon != null) as Array<Meter & { lat: number; lon: number }>;
              if (valid.length === 0) return <Typography color="text.secondary">No coordinates available.</Typography>;
              const markers = valid.map(m => ({ id: m.id, lat: m.lat, lon: m.lon }));
              const center = {
                lat: valid.reduce((a, m) => a + m.lat, 0) / valid.length,
                lon: valid.reduce((a, m) => a + m.lon, 0) / valid.length,
              };
              return (
                <Box sx={{ position: 'absolute', inset: 0 }}>
                  <GoogleDevicesMap markers={markers} center={center} />
                  {/* Optional overlay list for quick reference */}
                  <Box sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.9)', p: 1, borderRadius: 1, maxHeight: '60%', overflow: 'auto', minWidth: 220 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Markers</Typography>
                    {valid.map(m => (
                      <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <RoomIcon fontSize="small" color="error" />
                        <Typography variant="caption">{m.id} — {m.lat.toFixed(5)}, {m.lon.toFixed(5)}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              );
            })()}
          </Box>
        </DialogContent>
      </Dialog>

      {/* XY Deflection Modal */}
      <Dialog open={xyOpen} onClose={() => setXyOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Tiltmeter XY Deflection (Avg)</DialogTitle>
        <DialogContent>
          {/* Controls: averaging mode + legend */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="xy-mode-label">Averaging Mode</InputLabel>
              <Select labelId="xy-mode-label" label="Averaging Mode" value={xyMode} onChange={e => setXyMode(e.target.value as 'current' | 'today' | 'alltime')}>
                <MenuItem value="current">Current</MenuItem>
                <MenuItem value="today">Today's Max</MenuItem>
                <MenuItem value="alltime">All Time High</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: '#d32f2f', borderRadius: 0.5 }} />
                <Typography variant="caption">X tilt</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: '#1976d2', borderRadius: 0.5 }} />
                <Typography variant="caption">Y tilt</Typography>
              </Box>
            </Box>
          </Box>
          {(() => {
            const vals = filteredMeters.map(m => ({
              x: xyMode === 'current' ? m.currentX : xyMode === 'today' ? m.todayMaxX : m.allTimeHighX,
              y: xyMode === 'current' ? m.currentY : xyMode === 'today' ? m.todayMaxY : m.allTimeHighY,
            }));
            if (vals.length === 0) return <Typography color="text.secondary">No sensors available in category.</Typography>;
            const avgX = vals.reduce((a, v) => a + v.x, 0) / vals.length;
            const avgY = vals.reduce((a, v) => a + v.y, 0) / vals.length;
            return (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
                <XYDeflectionChart avgX={avgX} avgY={avgY} />
              </Box>
            );
          })()}
        </DialogContent>
      </Dialog>

  {/* Time Series Modal */}
  <TiltmeterTimeSeriesModal open={tsOpen} onClose={() => setTsOpen(false)} meters={filteredMeters} />
    </Box>
  );
}
