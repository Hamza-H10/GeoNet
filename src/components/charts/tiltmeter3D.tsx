import { useMemo } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
const Plot = createPlotlyComponent(Plotly);

export type Tiltmeter3DChartProps = {
  times: number[]; // epoch millis
  yAnglesDeg: number[]; // degrees
  heightMm: number; // radius/height for arc conversion
  height?: number; // chart height in px
  title?: string;
};

function yAngleToMm(yAngleDeg: number, heightMm: number): number {
  const thetaRad = (yAngleDeg * Math.PI) / 180;
  return heightMm * thetaRad;
}

export default function Tiltmeter3DChart({ times, yAnglesDeg, heightMm, height = 420, title }: Tiltmeter3DChartProps) {
  const data = useMemo(() => {
    const n = Math.min(times.length, yAnglesDeg.length);
    if (!n) return { x: [], y: [], z: [], labels: [] as string[] };
    const t0 = times[0] ?? Date.now();
    const x: number[] = []; // sample index
    const y: number[] = []; // deflection mm
    const z: number[] = []; // time (s since start)
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      x.push(i);
      y.push(yAngleToMm(yAnglesDeg[i], heightMm));
      z.push((times[i] - t0) / 1000);
      labels.push(new Date(times[i]).toLocaleString());
    }
    return { x, y, z, labels };
  }, [times, yAnglesDeg, heightMm]);

  const trace = {
    type: 'scatter3d',
    mode: 'lines+markers',
    x: data.x,
    y: data.y,
    z: data.z,
    text: data.labels,
    hovertemplate: 't=%{text}<br>idx=%{x}<br>Y=%{y:.2f} mm<extra></extra>',
    line: { width: 3, color: '#111827' },
    marker: { size: 3, color: '#1976d2' },
    name: 'Y (mm)'
  };

  const layout = {
    title: { text: title ?? '3D Deflection', font: { size: 14 } },
    margin: { l: 0, r: 0, t: 24, b: 0 },
    scene: {
      xaxis: { title: 'Sample', backgroundcolor: 'rgba(0,0,0,0)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
      yaxis: { title: 'Deflection (mm)', backgroundcolor: 'rgba(0,0,0,0)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
      zaxis: { title: 'Time (s)', backgroundcolor: 'rgba(0,0,0,0)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
      camera: { eye: { x: 1.6, y: 1.2, z: 0.8 } },
      dragmode: 'orbit',
    },
    showlegend: false,
  };

  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['resetCameraDefault3d', 'toImage'],
  };

  return (
    <Plot data={[trace]} layout={{ ...layout, height }} config={config} style={{ width: '100%' }} />
  );
}
