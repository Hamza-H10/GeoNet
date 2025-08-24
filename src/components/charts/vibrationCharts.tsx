import ApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

type AccelPoint = { x: number; y: number; z: number };
export type AxisThresholds = {
  x?: number; y?: number; z?: number; alert?: number;
  normalCutoff?: number; // <= normal
  dangerCutoff?: number; // >= danger
};

const AXIS_COLORS: Record<'x' | 'y' | 'z', string> = {
  x: '#e53935',
  y: '#43a047',
  z: '#1e88e5',
};

function getStats(arr: number[]) {
  if (!arr.length) return { current: 0, min: 0, max: 0, avg: 0 };
  const current = arr[arr.length - 1];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { current, min, max, avg: Number(avg.toFixed(2)) };
}

export function VibrationChart({ data, showAlerts, thresholds }: { data: AccelPoint[]; showAlerts: boolean; thresholds?: AxisThresholds; }) {
  const MAX_POINTS = 60;
  const visible = data.slice(-MAX_POINTS);
  const xArr = visible.map(d => d.x);
  const yArr = visible.map(d => d.y);
  const zArr = visible.map(d => d.z);
  const series = [
    { name: 'X', data: xArr },
    { name: 'Y', data: yArr },
    { name: 'Z', data: zArr },
  ];
  const minY = Math.min(-3, ...xArr, ...yArr, ...zArr);
  const maxY = Math.max(3, ...xArr, ...yArr, ...zArr);
  const th = thresholds || {};
  const options: ApexOptions = {
    chart: {
      id: 'vibration-chart',
  animations: { enabled: true, dynamicAnimation: { speed: 180 } },
      toolbar: { show: true },
      zoom: { enabled: true, type: 'xy', autoScaleYaxis: true },
      background: '#fff',
    },
    grid: { borderColor: '#e0e0e0' },
    stroke: { width: 2, curve: 'smooth' },
    markers: { size: 2, strokeWidth: 1, strokeColors: Object.values(AXIS_COLORS) },
    colors: Object.values(AXIS_COLORS),
  xaxis: { labels: { style: { fontSize: '12px', colors: '#444' } }, axisTicks: { show: true }, axisBorder: { show: true }, type: 'category', categories: visible.map((_, i) => String(i)) },
  yaxis: { min: minY, max: maxY, labels: { style: { fontSize: '12px', colors: '#444' } } },
    annotations: {
      yaxis: showAlerts ? [
        ...(typeof th.normalCutoff === 'number' ? [{ y: th.normalCutoff, borderColor: '#10b981', strokeDashArray: 4, opacity: 0.7, label: { text: 'Normal', style: { background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
        ...(typeof th.dangerCutoff === 'number' ? [{ y: th.dangerCutoff, borderColor: '#ef4444', strokeDashArray: 0, opacity: 0.9, label: { text: 'Danger', style: { background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
        ...(typeof th.x === 'number' ? [{ y: th.x, borderColor: AXIS_COLORS.x, strokeDashArray: 4, opacity: 0.85, label: { text: 'X Alert', style: { background: AXIS_COLORS.x, color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
        ...(typeof th.y === 'number' ? [{ y: th.y, borderColor: AXIS_COLORS.y, strokeDashArray: 4, opacity: 0.85, label: { text: 'Y Alert', style: { background: AXIS_COLORS.y, color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
        ...(typeof th.z === 'number' ? [{ y: th.z, borderColor: AXIS_COLORS.z, strokeDashArray: 4, opacity: 0.85, label: { text: 'Z Alert', style: { background: AXIS_COLORS.z, color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
        ...(typeof th.alert === 'number' ? [{ y: th.alert, borderColor: '#d32f2f', strokeDashArray: 0, opacity: 0.95, label: { text: 'Alert', style: { background: '#d32f2f', color: '#fff', fontWeight: 600, fontSize: '12px' } } }] : []),
      ] : []
    },
    tooltip: { theme: 'light' },
    legend: { show: true },
    title: { text: 'Acceleration Over Time', align: 'left' },
  };

  return <ApexChart type="area" series={series} options={options} height={320} width={'100%'} />;
}

export function ColoredSummary({ data }: { data: AccelPoint[] }) {
  const latest = data[data.length - 1] || { x: 0, y: 0, z: 0 };
  const xArr = data.map(d => d.x);
  const yArr = data.map(d => d.y);
  const zArr = data.map(d => d.z);
  const stats = {
    x: getStats(xArr),
    y: getStats(yArr),
    z: getStats(zArr),
  };
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#f7f7f7', borderRadius: 8, boxShadow: '0 1px 4px #0001', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#222' }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center', color: '#222' }}>Data Summary</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, color: '#222' }}>
        <thead>
          <tr style={{ background: '#e0e0e0', color: '#222' }}>
            <th style={{ padding: 8, border: '1px solid #ccc' }}>Axis</th>
            <th style={{ padding: 8, border: '1px solid #ccc' }}>Current</th>
            <th style={{ padding: 8, border: '1px solid #ccc' }}>Min</th>
            <th style={{ padding: 8, border: '1px solid #ccc' }}>Max</th>
            <th style={{ padding: 8, border: '1px solid #ccc' }}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {(['x','y','z'] as const).map(axis => {
            const bg = AXIS_COLORS[axis] === '#e53935' ? 'rgba(229,57,53,0.07)'
              : AXIS_COLORS[axis] === '#43a047' ? 'rgba(67,160,71,0.07)'
              : 'rgba(30,136,229,0.07)';
            return (
              <tr key={axis} style={{ background: bg }}>
                <td style={{ padding: 8, border: '1px solid #ccc', fontWeight: 700, color: AXIS_COLORS[axis] }}>{axis.toUpperCase()}</td>
                <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>{latest ? (latest[axis] as number).toFixed(2) : '--'}</td>
                <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>{data.length ? stats[axis].min.toFixed(2) : '--'}</td>
                <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>{data.length ? stats[axis].max.toFixed(2) : '--'}</td>
                <td style={{ padding: 8, border: '1px solid #ccc', color: '#222' }}>{data.length ? stats[axis].avg.toFixed(2) : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
