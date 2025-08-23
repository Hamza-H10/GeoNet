import { useMemo, useState } from 'react';
import { Box, Dialog, DialogTitle, DialogContent, ToggleButtonGroup, ToggleButton, Typography } from '@mui/material';
import { AreaChart } from '../../components/Charts';
import type { Meter } from '../../components/TiltmeterData';

type RangeKey = '1d' | '1w' | '1m' | '1y' | 'all';

export default function TiltmeterTimeSeriesModal({ open, onClose, meters }: { open: boolean; onClose: () => void; meters: Meter[] }) {
  const [range, setRange] = useState<RangeKey>('1d');

  // Build hourly labels 0-23
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
        // Include even zeros; if you want to ignore zeros, guard here
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters]);

  const showRangeNotice = range !== '1d';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Tiltmeter Time Series Averages</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 2, flexWrap: 'wrap' }}>
          <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
            <ToggleButton value="1d">1 Day</ToggleButton>
            <ToggleButton value="1w">1 Week</ToggleButton>
            <ToggleButton value="1m">1 Month</ToggleButton>
            <ToggleButton value="1y">1 Year</ToggleButton>
            <ToggleButton value="all">All Time</ToggleButton>
          </ToggleButtonGroup>
          {showRangeNotice && (
            <Typography variant="caption" color="text.secondary">Showing last 24h hourly averages (extended ranges not available from source)</Typography>
          )}
        </Box>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: '1fr' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Avg Tilt X/Y</Typography>
            <AreaChart data={xyData} height={260} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Avg Settlement Z</Typography>
            <AreaChart data={zData} height={240} />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
