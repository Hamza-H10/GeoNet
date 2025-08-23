import React, { useState } from 'react';
import ApexChart from 'react-apexcharts';
import IconButton from '@mui/material/IconButton';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';

type Axis = 'x' | 'y' | 'z';
type AccelData = { x: number; y: number; z: number; };


interface AccelChartProps {
  /**
   * Accepts either:
   *   - data: AccelData[] (for legacy/demo)
   *   - serialLogs: string[] (for live serial input)
   */
  data?: AccelData[];
  serialLogs?: string[];
  alertThresholds?: { x?: number; y?: number; z?: number; alert?: number };
}

function getStats(arr: number[]) {
  if (!arr.length) return { current: 0, min: 0, max: 0, avg: 0 };
  const current = arr[arr.length - 1];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { current, min, max, avg: Number(avg.toFixed(2)) };
}


// ---
// To send data to the app for plotting and summary, use this format (case-insensitive, spaces optional):
//   X: -1.23, Y: 1.85, Z: 0.34
// or
//   x=0.12, y=-0.99, z=0.01
// Each line must contain all three values (x, y, z) separated by commas.
// ---

export function AccelerationDashboard({ data, serialLogs, alertThresholds }: AccelChartProps) {
  // Use alertThresholds from props, fallback to window for backward compatibility
  // Accepts { x, y, z, alert }
  const thresholds = alertThresholds || (typeof window !== 'undefined' ? (window as { alertThresholds?: { x?: number; y?: number; z?: number; alert?: number } }).alertThresholds : {}) || {};
  const [open, setOpen] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
        // Add print CSS to hide controls when printing
        React.useEffect(() => {
          const style = document.createElement('style');
          style.innerHTML = `@media print { .no-print { display: none !important; } }`;
          document.head.appendChild(style);
          return () => { document.head.removeChild(style); };
        }, []);

  // Handler to open/close maximize dialog
  const handleMaximize = () => setOpen(true);
  const handleClose = () => setOpen(false);
  // Helper to parse serial log lines like "X: -1.23 , Y: 1.85, Z: 0.34"
  function parseAccelLine(line: string): AccelData | null {
    // Accepts variations in whitespace/case, e.g. "x:1, y:2, z:3"
    const regex = /x\s*[:=]\s*(-?\d*\.?\d+)\s*,?\s*y\s*[:=]\s*(-?\d*\.?\d+)\s*,?\s*z\s*[:=]\s*(-?\d*\.?\d+)/i;
    const match = line.match(regex);
    if (!match) return null;
    const [, x, y, z] = match;
    return { x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) };
  }

  // Prefer serialLogs if provided, else fallback to data
  let accelData: AccelData[] = [];
  if (serialLogs && serialLogs.length > 0) {
    accelData = serialLogs
      .map(parseAccelLine)
      .filter((d): d is AccelData => d !== null);
  } else if (data) {
    accelData = data;
  }


  // Only show the latest 40 points for scrolling effect
  const MAX_POINTS = 40;
  const startIdx = accelData.length > MAX_POINTS ? accelData.length - MAX_POINTS : 0;
  const visibleData = accelData.slice(startIdx);
  const timeLabels = visibleData.map((_, i) => i + startIdx);
  const xArr = visibleData.map(d => d.x);
  const yArr = visibleData.map(d => d.y);
  const zArr = visibleData.map(d => d.z);

  // Define chart series and options
  const series = [
    { name: 'X', data: xArr },
    { name: 'Y', data: yArr },
    { name: 'Z', data: zArr },
  ];

  // Calculate y-axis min/max for flexibility, but default to -3/+3
  const minY = Math.min(-3, ...xArr, ...yArr, ...zArr);
  const maxY = Math.max(3, ...xArr, ...yArr, ...zArr);

  // Use time as x-axis (if available), else sample index
  // For now, use sample index as time (can be replaced with real timestamps)
  // We'll generate fake times for demo, but in real use, replace with actual timestamps
  const now = new Date();
  // Generate xLabels and minute markers
  const xLabels: string[] = [];
  const minuteMarkers: number[] = [];
  for (let idx = 0; idx < timeLabels.length; idx++) {
    const t = new Date(now.getTime() + (timeLabels[idx]) * 1000); // 1s interval
    xLabels.push(t.toLocaleTimeString('en-GB', { hour12: false }));
    if (t.getSeconds() === 0) minuteMarkers.push(idx); // mark new minute
  }

  interface CustomIcon {
    icon: string;
    index: number;
    title: string;
    class: string;
    click: (chartContext: unknown, options: unknown) => void;
  }

  interface ChartOptions {
    chart: {
      id: string;
      animations: {
        enabled: boolean;
        easing: string;
        dynamicAnimation: { speed: number };
      };
      toolbar: {
        show: boolean;
        tools: {
          download: boolean;
          selection: boolean;
          zoom: boolean;
          zoomin: boolean;
          zoomout: boolean;
          pan: boolean;
          reset: boolean;
          customIcons: CustomIcon[];
        };
      };
      zoom: { enabled: boolean; type: 'xy'; autoScaleYaxis: boolean };
      pan: { enabled: boolean; mode: 'xy' };
    };
    xaxis: {
      type: 'category';
      categories: string[];
      title: { text: string };
      labels: {
        show: boolean;
        style: { fontSize: string; color: string };
        formatter: (val: string) => string;
      };
      axisTicks: { show: boolean };
      axisBorder: { show: boolean };
    };
    yaxis: {
      min: number;
      max: number;
      title: { text: string };
      labels: {
        show: boolean;
        style: { fontSize: string; color: string };
        formatter: (val: number) => string;
      };
      axisTicks: { show: boolean };
      axisBorder: { show: boolean };
    };
    annotations: {
      yaxis: Array<{
        y: number;
        borderColor: string;
        strokeDashArray: number;
        opacity: number;
        label: { show: boolean; text?: string; style?: { background: string; color: string; fontWeight: number; fontSize: string } };
      }>;
      xaxis: Array<{
        x: string;
        borderColor: string;
        strokeDashArray: number;
        opacity: number;
        label: {
          borderColor: string;
          borderWidth: number;
          text: string;
          style: {
            color: string;
            background: string;
            fontSize: string;
            fontWeight: number;
          };
          orientation: string;
          position: string;
          offsetY: number;
          offsetX: number;
        };
      }>;
    };
    grid: {
      show: boolean;
      borderColor: string;
      strokeDashArray: number;
      xaxis: { lines: { show: boolean } };
      yaxis: { lines: { show: boolean } };
    };
    markers: {
      size: number;
      strokeWidth: number;
      strokeColors: string[];
      fillOpacity: number;
      shape: "circle";
    };
    stroke: {
      width: number;
      curve: "smooth";
    };
    colors: string[];
    legend: { show: boolean };
    title: { text: string; align: "left" };
    tooltip: {
      enabled: boolean;
      theme: string;
      style: {
        fontSize: string;
        fontWeight: number;
        color: string;
      };
      custom: (params: {
        series: number[][];
        seriesIndex: number;
        dataPointIndex: number;
        w: ApexCharts.ApexOptions;
      }) => string;
    };
    dataLabels?: {
      enabled: boolean;
    };
  }

  const options: ChartOptions = {
    chart: {
      id: 'accel-chart',
      animations: {
        enabled: true,
        easing: 'linear',
        dynamicAnimation: { speed: 100 }
      },
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
          customIcons: [
            {
              icon: '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19 8h-1V3H6v5H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-2 0H7V5h10zm3 11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1z"/></svg>',
              index: -1,
              title: 'Print Chart',
              class: 'apexcharts-custom-print',
              click: function(chartContext: unknown) {
                // chartContext is expected to be an ApexCharts instance with an 'el' property
                const chartEl = (chartContext as { el: HTMLElement }).el;
                const win = window.open('', 'PrintChart');
                if (win) {
                  win.document.write('<html><head><title>Print Chart</title></head><body>' + chartEl.outerHTML + '</body></html>');
                  win.document.close();
                  win.focus();
                  setTimeout(() => { win.print(); win.close(); }, 500);
                }
              }
            }
          ]
        }
      },
      zoom: { enabled: true, type: 'xy', autoScaleYaxis: true },
      pan: { enabled: true, mode: 'xy' },
    },
    xaxis: {
      type: 'category',
      categories: xLabels,
      title: { text: 'Time' },
      labels: {
        show: true,
        style: { fontSize: '12px', color: '#444' },
        formatter: (val: string) => val,
      },
      axisTicks: { show: true },
      axisBorder: { show: true },
    },
    yaxis: {
      min: minY,
      max: maxY,
      title: { text: 'Acceleration (g)' },
      labels: {
        show: true,
        style: { fontSize: '12px', color: '#444' },
        formatter: (val: number) => val.toFixed(1),
      },
      axisTicks: { show: true },
      axisBorder: { show: true },
    },
    annotations: {
      yaxis: [
        {
          y: 0,
          borderColor: '#bbb',
          strokeDashArray: 0,
          opacity: 0.35,
          label: { show: false },
        },
        ...(showAlerts && typeof thresholds.x === 'number' ? [{
          y: thresholds.x,
          borderColor: '#e53935',
          strokeDashArray: 4,
          opacity: 0.9,
          label: { show: true, text: 'X Alert', style: { background: '#e53935', color: '#fff', fontWeight: 600, fontSize: '12px' } },
        }] : []),
        ...(showAlerts && typeof thresholds.y === 'number' ? [{
          y: thresholds.y,
          borderColor: '#43a047',
          strokeDashArray: 4,
          opacity: 0.9,
          label: { show: true, text: 'Y Alert', style: { background: '#43a047', color: '#fff', fontWeight: 600, fontSize: '12px' } },
        }] : []),
        ...(showAlerts && typeof thresholds.z === 'number' ? [{
          y: thresholds.z,
          borderColor: '#1e88e5',
          strokeDashArray: 4,
          opacity: 0.9,
          label: { show: true, text: 'Z Alert', style: { background: '#1e88e5', color: '#fff', fontWeight: 600, fontSize: '12px' } },
        }] : []),
        ...(showAlerts && typeof thresholds.alert === 'number' ? [{
          y: thresholds.alert,
          borderColor: '#d32f2f',
          strokeDashArray: 0,
          opacity: 0.95,
          label: { show: true, text: 'Alert', style: { background: '#d32f2f', color: '#fff', fontWeight: 600, fontSize: '12px' } },
        }] : []),
      ],
      xaxis: [
        ...minuteMarkers.map(idx => ({
          x: xLabels[idx],
          borderColor: '#888',
          strokeDashArray: 6,
          opacity: 0.7,
          label: {
            borderColor: '#888',
            borderWidth: 0,
            text: '',
            style: {
              color: '#888',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 400,
            },
            orientation: 'horizontal',
            position: 'top',
            offsetY: 0,
            offsetX: 0,
          },
        }))
      ]
    },
    grid: {
      show: true,
      borderColor: '#ccc',
      strokeDashArray: 2,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    markers: {
      size: 2,
      strokeWidth: 1,
      strokeColors: ['#e53935', '#43a047', '#1e88e5'],
      fillOpacity: 1,
      shape: "circle",
    },
    stroke: {
      width: 2,
      curve: "smooth",
    },
    colors: ['#e53935', '#43a047', '#1e88e5'],
    legend: { show: true },
    title: { text: 'Acceleration Over Time', align: "left" },
    tooltip: {
      enabled: true,
      theme: 'light',
      style: {
        fontSize: '15px',
        fontWeight: 500,
        color: '#888',
      },
      custom: function({ dataPointIndex }: {
        dataPointIndex: number;
      }): string {
        if (dataPointIndex == null) return '';
        const x = xArr[dataPointIndex];
        const y = yArr[dataPointIndex];
        const z = zArr[dataPointIndex];
        return `<div style="padding:8px 12px;font-size:15px;font-weight:500;color:#888;background:rgba(255,255,255,0.92);border-radius:6px;box-shadow:0 2px 8px #0002;">
          <div><span style='color:#e53935'>X</span>: ${x !== undefined ? x.toFixed(2) : '--'}</div>
          <div><span style='color:#43a047'>Y</span>: ${y !== undefined ? y.toFixed(2) : '--'}</div>
          <div><span style='color:#1e88e5'>Z</span>: ${z !== undefined ? z.toFixed(2) : '--'}</div>
        </div>`;
      },
    },
    dataLabels: {
      enabled: false,
    },
  };

  // Compute stats for summary table
  const latest: AccelData = accelData.length
    ? accelData[accelData.length - 1]
    : { x: 0, y: 0, z: 0 };
  const stats = {
    x: getStats(xArr),
    y: getStats(yArr),
    z: getStats(zArr),
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', width: '100%' }}>
        <div style={{ flex: 2, minWidth: 0, background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px #0001', padding: 16, display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'auto', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0, color: '#222' }}>Acceleration Chart</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="no-print">
              <button
                style={{ fontSize: 13, padding: '2px 8px', borderRadius: 4, border: '1px solid #bbb', background: showAlerts ? '#e53935' : '#eee', color: showAlerts ? '#fff' : '#444', cursor: 'pointer', marginRight: 8 }}
                onClick={() => setShowAlerts(s => !s)}
                title={showAlerts ? 'Hide Alert Lines' : 'Show Alert Lines'}
              >
                {showAlerts ? 'Hide Alerts' : 'Show Alerts'}
              </button>
              <IconButton onClick={handleMaximize} size="small" title="Maximize">
                <OpenInFullIcon fontSize="small" />
              </IconButton>
            </div>
          </div>
          <ApexChart type="area" series={series} options={options} height={320} width={'100%'} />
        </div>
        <div style={{ flex: 1, minWidth: 0, background: '#f7f7f7', borderRadius: 8, boxShadow: '0 1px 4px #0001', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#222' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center', color: '#222' }}>Data Summary</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, color: '#222' }}>
            <thead>
              <tr style={{ background: '#e0e0e0', color: '#222' }}>
                <th style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>Axis</th>
                <th style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>Current</th>
                <th style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>Min</th>
                <th style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>Max</th>
                <th style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {(['x', 'y', 'z'] as Axis[]).map(axis => (
                <tr key={axis} style={{ color: '#222' }}>
                  <td style={{ padding: 8, border: '1px solid #ccc', fontWeight: 600, color: '#222' }}>{axis.toUpperCase()}</td>
                  <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>
                    {accelData.length ? latest[axis]?.toFixed(2) : '--'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>
                    {xArr.length ? stats[axis].min.toFixed(2) : '--'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>
                    {xArr.length ? stats[axis].max.toFixed(2) : '--'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>
                    {xArr.length ? stats[axis].avg.toFixed(2) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Maximize dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
        <DialogContent style={{ background: '#fff', padding: 0 }}>
          <div style={{ position: 'relative', width: '100%', height: '80vh', background: '#fff' }}>
            <IconButton onClick={handleClose} size="small" style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} title="Close">
              <OpenInFullIcon style={{ transform: 'rotate(45deg)' }} fontSize="small" />
            </IconButton>
            <ApexChart type="area" series={series} options={options} height={'100%'} width={'100%'} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}