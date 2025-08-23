import { useMemo, useState } from 'react';
import type React from 'react';

export function XYDeflectionChart({
  avgX,
  avgY,
  range = 15,
  width = 520,
  height = 360,
}: {
  avgX: number; // degrees (X axis is vertical)
  avgY: number; // degrees (Y axis is horizontal)
  range?: number; // +/- range in degrees
  width?: number;
  height?: number;
}) {
  const pad = 32; // padding for labels/ticks
  const cx = width / 2;
  const cy = height / 2;
  const scaleX = (width / 2 - pad) / range; // pixels per degree (horizontal: Y-axis degrees)
  const scaleY = (height / 2 - pad) / range; // pixels per degree (vertical: X-axis degrees)

  // unique ids for defs to avoid collisions if multiple charts render
  const uid = useMemo(() => `xy-${Math.random().toString(36).slice(2)}` , []);

  // Tooltip state
  const [hover, setHover] = useState<{ show: boolean; x: number; y: number } | null>(null);
  const [active, setActive] = useState<'x' | 'y' | null>(null); // which line is closest

  // Map degrees to pixels along vertical (X) and horizontal (Y)
  const mapX = (deg: number) => {
    const t = Math.max(-range, Math.min(range, deg));
    // vertical axis grows up negative in SVG (y up is negative), so invert
    return cy - (t / range) * (height / 2 - pad);
  };
  const mapY = (deg: number) => {
    const t = Math.max(-range, Math.min(range, deg));
    return cx + (t / range) * (width / 2 - pad);
  };

  const ticks = useMemo(() => [-10, -5, 0, 5, 10].filter(t => Math.abs(t) <= range), [range]);
  // Build two tilt lines crossing the origin
  const L = Math.max(width, height);
  const deg2rad = (d: number) => (d * Math.PI) / 180;
  // X tilt line: tilt the vertical axis by avgX => line angle relative to horizontal is 90 - avgX
  const thetaX = deg2rad(90 - avgX);
  const xDir = { x: Math.cos(thetaX), y: Math.sin(thetaX) };
  const xNorm = { x: -xDir.y, y: xDir.x }; // perpendicular unit
  const xLine = useMemo(() => ({ x1: cx - xDir.x * L, y1: cy - xDir.y * L, x2: cx + xDir.x * L, y2: cy + xDir.y * L }), [cx, cy, xDir.x, xDir.y, L]);
  // Y tilt line: tilt the horizontal axis by avgY => line angle relative to horizontal is avgY
  const thetaY = deg2rad(avgY);
  const yDir = { x: Math.cos(thetaY), y: Math.sin(thetaY) };
  const yNorm = { x: -yDir.y, y: yDir.x }; // perpendicular unit
  const yLine = useMemo(() => ({ x1: cx - yDir.x * L, y1: cy - yDir.y * L, x2: cx + yDir.x * L, y2: cy + yDir.y * L }), [cx, cy, yDir.x, yDir.y, L]);

  function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const t = c1 / c2;
    const projx = x1 + t * vx;
    const projy = y1 + t * vy;
    return Math.hypot(px - projx, py - projy);
  }

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dX = distToSeg(mx, my, xLine.x1, xLine.y1, xLine.x2, xLine.y2);
    const dY = distToSeg(mx, my, yLine.x1, yLine.y1, yLine.x2, yLine.y2);
    const thresh = 8;
    if (dX < dY && dX <= thresh) {
      setActive('x');
      setHover({ show: true, x: mx + 10, y: my - 10 });
    } else if (dY <= thresh) {
      setActive('y');
      setHover({ show: true, x: mx + 10, y: my - 10 });
    } else {
      setActive(null);
      setHover(null);
    }
  };

  const handleLeave = () => setHover(null);
  const r = Math.hypot(avgX, avgY);
  const theta = (Math.atan2(avgX, avgY) * 180) / Math.PI; // angle of vector (x=Ydeg, y=Xdeg)
  const bandPx = 10; // half thickness of gradient band around lines
  const clipId = `${uid}-clip`;
  const gradXId = `${uid}-grad-x`;
  const gradYId = `${uid}-grad-y`;

  // Build band polygons around each line (thick strip) for gradient fills
  const xBandPath = useMemo(() => {
    const p1 = { x: xLine.x1, y: xLine.y1 };
    const p2 = { x: xLine.x2, y: xLine.y2 };
    const ax = p1.x + xNorm.x * bandPx, ay = p1.y + xNorm.y * bandPx;
    const bx = p2.x + xNorm.x * bandPx, by = p2.y + xNorm.y * bandPx;
    const cxp = p2.x - xNorm.x * bandPx, cyp = p2.y - xNorm.y * bandPx;
    const dx = p1.x - xNorm.x * bandPx, dy = p1.y - xNorm.y * bandPx;
    return `M ${ax},${ay} L ${bx},${by} L ${cxp},${cyp} L ${dx},${dy} Z`;
  }, [xLine.x1, xLine.y1, xLine.x2, xLine.y2, xNorm.x, xNorm.y]);

  const yBandPath = useMemo(() => {
    const p1 = { x: yLine.x1, y: yLine.y1 };
    const p2 = { x: yLine.x2, y: yLine.y2 };
    const ax = p1.x + yNorm.x * bandPx, ay = p1.y + yNorm.y * bandPx;
    const bx = p2.x + yNorm.x * bandPx, by = p2.y + yNorm.y * bandPx;
    const cxp = p2.x - yNorm.x * bandPx, cyp = p2.y - yNorm.y * bandPx;
    const dx = p1.x - yNorm.x * bandPx, dy = p1.y - yNorm.y * bandPx;
    return `M ${ax},${ay} L ${bx},${by} L ${cxp},${cyp} L ${dx},${dy} Z`;
  }, [yLine.x1, yLine.y1, yLine.x2, yLine.y2, yNorm.x, yNorm.y]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={handleLeave} style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px #0001', display: 'block' }}>
      <defs>
        {/* Clip to inner plotting area */}
        <clipPath id={clipId}>
          <rect x={pad} y={pad} width={width - 2 * pad} height={height - 2 * pad} rx={4} ry={4} />
        </clipPath>
        {/* Gradient bands for area-like fill along the lines */}
        <linearGradient id={gradXId} gradientUnits="userSpaceOnUse" x1={cx - xNorm.x * bandPx} y1={cy - xNorm.y * bandPx} x2={cx + xNorm.x * bandPx} y2={cy + xNorm.y * bandPx}>
          <stop offset="0%" stopColor="#d32f2f" stopOpacity="0" />
          <stop offset="50%" stopColor="#d32f2f" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#d32f2f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={gradYId} gradientUnits="userSpaceOnUse" x1={cx - yNorm.x * bandPx} y1={cy - yNorm.y * bandPx} x2={cx + yNorm.x * bandPx} y2={cy + yNorm.y * bandPx}>
          <stop offset="0%" stopColor="#1976d2" stopOpacity="0" />
          <stop offset="50%" stopColor="#1976d2" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1976d2" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Reference rings at r=5° and r=10° (if within range) */}
      <g clipPath={`url(#${clipId})`}>
        {[5,10].filter(v => v <= range).map(v => (
          <ellipse key={v} cx={cx} cy={cy} rx={v * scaleX} ry={v * scaleY} fill="none" stroke="#999" strokeDasharray="4 4" strokeOpacity={0.35} />
        ))}
      </g>

      {/* Gradient bands (area-like) under lines */}
      <g clipPath={`url(#${clipId})`}>
        <path d={xBandPath} fill={`url(#${gradXId})`} opacity={active === 'x' ? 0.9 : 0.7} />
        <path d={yBandPath} fill={`url(#${gradYId})`} opacity={active === 'y' ? 0.9 : 0.7} />
      </g>

      {/* Axes */}
      <line x1={cx} y1={pad} x2={cx} y2={height - pad} stroke="#222" strokeWidth={1.5} />
      <line x1={pad} y1={cy} x2={width - pad} y2={cy} stroke="#222" strokeWidth={1.5} />

      {/* Ticks */}
      {ticks.map(t => (
        <g key={`xt-${t}`}>
          {/* vertical axis ticks for X */}
          <line x1={cx - 6} y1={mapX(t)} x2={cx + 6} y2={mapX(t)} stroke="#777" strokeWidth={1} />
          <text x={cx + 10} y={mapX(t) + 4} fill="#666" fontSize={11}>{t}</text>
        </g>
      ))}
      {ticks.map(t => (
        <g key={`yt-${t}`}>
          {/* horizontal axis ticks for Y */}
          <line x1={mapY(t)} y1={cy - 6} x2={mapY(t)} y2={cy + 6} stroke="#777" strokeWidth={1} />
          <text x={mapY(t) - 6} y={cy - 10} fill="#666" fontSize={11} textAnchor="middle">{t}</text>
        </g>
      ))}
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={3} fill="#222" />

      {/* Axes labels */}
      <text x={cx + 6} y={pad - 8} fill="#444" fontSize={12}>+X (°)</text>
      <text x={cx + 6} y={height - pad + 18} fill="#444" fontSize={12}>-X (°)</text>
      <text x={width - pad + 6} y={cy - 6} fill="#444" fontSize={12}>+Y (°)</text>
      <text x={pad - 28} y={cy - 6} fill="#444" fontSize={12}>-Y (°)</text>

      {/* X tilt line (origin through angle 90-avgX) */}
      <line x1={xLine.x1} y1={xLine.y1} x2={xLine.x2} y2={xLine.y2} stroke="#d32f2f" strokeWidth={active === 'x' ? 4.5 : 3} />
      {/* Y tilt line (origin through angle avgY) */}
      <line x1={yLine.x1} y1={yLine.y1} x2={yLine.x2} y2={yLine.y2} stroke="#1976d2" strokeWidth={active === 'y' ? 4.5 : 3} />
    </svg>
      {hover?.show && (
        <div style={{ position: 'absolute', left: hover.x, top: hover.y, background: '#111', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
          <div>{active === 'x' ? 'X tilt line' : active === 'y' ? 'Y tilt line' : 'Tilt'}</div>
          <div>X tilt: {avgX.toFixed(2)}°</div>
          <div>Y tilt: {avgY.toFixed(2)}°</div>
          <div>r: {r.toFixed(2)}°</div>
          <div>θ: {theta.toFixed(2)}°</div>
        </div>
      )}
    </div>
  );
}

export default XYDeflectionChart;
