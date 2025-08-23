import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { LineChart } from '../Charts';

// Type for tiltmeter data
export type TiltData = { x: number; y: number; timestamp?: number };

export function TiltmeterDashboard() {
  const [data, setData] = useState<TiltData[]>([]);

  useEffect(() => {
    // Demo: generate random angle data for x and y axes
    const interval = setInterval(() => {
      setData(prev => [
        ...prev.slice(-39),
        {
          x: Number((Math.random() * 90 - 45).toFixed(2)), // -45 to +45 degrees
          y: Number((Math.random() * 90 - 45).toFixed(2)),
          timestamp: Date.now(),
        },
      ]);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Prepare chart data
  const chartData = {
    labels: data.map((d, i) => d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : i),
    datasets: [
      { label: 'X Angle', data: data.map(d => d.x), borderColor: '#1976d2' },
      { label: 'Y Angle', data: data.map(d => d.y), borderColor: '#388e3c' },
    ],
  };

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', px: { xs: 2, sm: 3, md: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, color: '#1976d2' }}>
          Tiltmeter Dashboard
        </Typography>
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Real-time Tiltmeter Angle Data (X, Y)
          </Typography>
          <LineChart data={chartData} />
        </Paper>
      </Box>
    </Box>
  );
}
