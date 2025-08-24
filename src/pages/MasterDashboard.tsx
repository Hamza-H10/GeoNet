import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ToggleButtonGroup, ToggleButton } from '@mui/material';
import { useMemo, useState } from 'react';
import { AreaChart } from '../components/Charts';
import Visible from '../components/Visible';
import FFTChartExpanded from '../components/charts/fftChart';
import { useTiltmeterData } from '../components/TiltmeterData';

export default function MasterDashboard() {
  const { meters } = useTiltmeterData();
  const [range, setRange] = useState<'1d'|'1w'|'1m'|'1y'|'all'>('1d');

  const labels = useMemo(() => Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), []);
  const { xyData, zData } = useMemo(() => {
    const len = 24;
    const sumX = Array(len).fill(0);
    const sumY = Array(len).fill(0);
    const sumZ = Array(len).fill(0);
    const counts = Array(len).fill(0);
    for (const m of meters) {
      const hist = m.history || [];
      for (let i = 0; i < len; i++) {
        const v = hist[i];
        if (!v) continue;
        sumX[i] += Number(v.x) || 0;
        sumY[i] += Number(v.y) || 0;
        sumZ[i] += Number(v.z) || 0;
        counts[i] += 1;
      }
    }
    const avg = (arr: number[], c: number[]) => arr.map((v, i) => (c[i] ? v / c[i] : 0));
    const xAvg = avg(sumX, counts);
    const yAvg = avg(sumY, counts);
    const zAvg = avg(sumZ, counts);
    return {
      xyData: { labels, datasets: [
        { label: 'Avg X (°)', data: xAvg, borderColor: '#d32f2f' },
        { label: 'Avg Y (°)', data: yAvg, borderColor: '#1976d2' },
      ] },
      zData: { labels, datasets: [
        { label: 'Avg Z (mm)', data: zAvg, borderColor: '#f59e0b' },
      ] },
    };
  }, [labels, meters]);

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ mt: 3, mb: 2, fontWeight: 700, color: '#111827' }}>Master Dashboard</Typography>
  <Paper sx={{ p: 3, mb: 3, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Tiltmeter Time Series Averages</Typography>
            <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
              <ToggleButton value="1d">1 Day</ToggleButton>
              <ToggleButton value="1w">1 Week</ToggleButton>
              <ToggleButton value="1m">1 Month</ToggleButton>
              <ToggleButton value="1y">1 Year</ToggleButton>
              <ToggleButton value="all">All Time</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'stretch' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Avg Tilt X/Y</Typography>
              <Visible><AreaChart data={xyData} height={280} /></Visible>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Avg Settlement Z</Typography>
              <Visible><AreaChart data={zData} height={280} /></Visible>
            </Box>
          </Box>
          {range !== '1d' && (
            <Typography variant="caption" color="text.secondary">Showing last 24h hourly averages (extended ranges not available from source)</Typography>
          )}
        </Paper>

        {/* Expanded FFT Chart section */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Visible><FFTChartExpanded height={360} /></Visible>
        </Paper>
      </Box>
    </Box>
  );
}
