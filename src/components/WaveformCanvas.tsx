import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import WaveformData from 'waveform-data';
import type { JsonWaveformData } from 'waveform-data';

export type WaveSeries = {
  name: string;
  data: number[];
  color: string;
};

export type WaveformCanvasProps = {
  series: WaveSeries[];
  height?: number;
  background?: string;
  enabledNames?: string[];
};

// Convert raw samples into a WaveformData object with a fixed pixel width
function buildWaveform(values: number[], width: number): WaveformData {
  const bits = 16;
  const range = bits === 16 ? 65536 : 256;
  // Avoid zero length
  const W = Math.max(1, Math.floor(width));
  const N = values.length;
  if (N === 0) {
    const empty: JsonWaveformData = { version: 2, channels: 1, sample_rate: 100, samples_per_pixel: 1, bits, length: W, data: Array(W * 2).fill(0) };
    return WaveformData.create(empty);
  }

  // Scale values to signed 16-bit range to match WaveformData expectations
  const peak = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;

  const spp = Math.max(1, Math.floor(N / W));
  const data: number[] = [];
  for (let i = 0; i < W; i++) {
    const start = Math.min(N, i * spp);
    const end = Math.min(N, start + spp);
    if (start >= end) {
      // pad when fewer samples than pixels
      data.push(0, 0);
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j < end; j++) {
      const s = Math.max(-1, Math.min(1, values[j] / peak)) * (range / 2 - 1); // clamp to [-32767, 32767]
      if (s < min) min = s;
      if (s > max) max = s;
    }
    // In case of single-point bucket, min==max -> sharp line
    data.push(Math.round(min), Math.round(max));
  }

  const json: JsonWaveformData = {
    version: 2,
    channels: 1,
    sample_rate: 100,
    samples_per_pixel: spp,
    bits,
    length: W,
    data,
  };

  return WaveformData.create(json);
}

export type WaveformCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  panLeft: () => void;
  panRight: () => void;
  resetView: () => void;
  exportPNG: () => string | null;
};

export const WaveformCanvas = forwardRef<WaveformCanvasHandle, WaveformCanvasProps>(({ series, height = 320, background = '#0b0b0b', enabledNames }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(800);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isDragging, setDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const [view, setView] = useState<{ start: number; end: number }>({ start: 0, end: 1 }); // fractions [0,1]

  // Observe container width for responsive drawing
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const RO: typeof ResizeObserver | undefined = (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (RO) {
      const observer = new RO(() => {
        setWidth(Math.max(100, el.clientWidth));
      });
      observer.observe(el);
      setWidth(Math.max(100, el.clientWidth));
      return () => observer.disconnect();
    } else {
      const onResize = () => setWidth(Math.max(100, el.clientWidth));
      window.addEventListener('resize', onResize);
      onResize();
      return () => window.removeEventListener('resize', onResize);
    }
  }, []);

  // Filter by enabled series if provided
  const activeSeries = useMemo(() => {
    const enabledSet = enabledNames ? new Set(enabledNames) : null;
    return series.filter(s => !enabledSet || enabledSet.has(s.name));
  }, [series, enabledNames]);

  const baseLen = useMemo(() => Math.max(1, ...activeSeries.map(s => s.data.length)), [activeSeries]);
  const viewIndices = useMemo(() => {
    const startIdx = Math.floor(view.start * baseLen);
    const endIdx = Math.ceil(view.end * baseLen);
    return { startIdx, endIdx };
  }, [view, baseLen]);

  // Build WaveformData per series according to current width and view
  const waveforms = useMemo(() => {
    const { startIdx, endIdx } = viewIndices;
    return activeSeries.map(s => ({
      name: s.name,
      color: s.color,
      startIdx,
      endIdx,
      wf: buildWaveform(s.data.slice(startIdx, endIdx), width),
    }));
  }, [activeSeries, viewIndices, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.floor(width * window.devicePixelRatio);
    canvas.height = Math.floor(height * window.devicePixelRatio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    // Clear background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    // Optional faint grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 50) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y < height; y += 50) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();

    // Draw each series as a sharp line using the max trace (min==max becomes a line)
    const scaleY = (amplitude: number) => {
      const range = 65536; // for 16-bit
      const offset = 32768;
      return height - ((amplitude + offset) * height) / range;
    };

    waveforms.forEach(({ color, wf }) => {
      const ch = wf.channel(0);
      const len = wf.length;
      if (len <= 0) return;
      // draw shadow
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let x = 0; x < len; x++) {
        const y = scaleY(ch.max_sample(x)) + 1;
        if (x === 0) ctx.moveTo(x + 0.5, y + 0.5);
        else ctx.lineTo(x + 0.5, y + 0.5);
      }
      ctx.stroke();

      // main line
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      for (let x = 0; x < len; x++) {
        const y = scaleY(ch.max_sample(x));
        if (x === 0) ctx.moveTo(x + 0.5, y + 0.5);
        else ctx.lineTo(x + 0.5, y + 0.5);
      }
      ctx.stroke();
    });

    // Hover crosshair and tooltip
    if (hoverX !== null) {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverX + 0.5, 0);
      ctx.lineTo(hoverX + 0.5, height);
      ctx.stroke();

      // Tooltip with sample index and values
      const { startIdx, endIdx } = viewIndices;
      const windowSamples = Math.max(1, endIdx - startIdx);
      const idx = startIdx + Math.round((hoverX / Math.max(1, width)) * (windowSamples - 1));
      const values = activeSeries.map(s => s.data[idx] ?? 0);
      const tooltip = `i: ${idx}  ` + values.map((v, i) => `${activeSeries[i].name}:${Number(v).toFixed(2)}`).join('  ');
      const pad = 6;
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const tw = ctx.measureText(tooltip).width + pad * 2;
      const th = 18 + pad * 2;
      const tx = Math.min(Math.max(8, hoverX + 8), width - tw - 8);
      const ty = 32;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = '#444';
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw, th);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(tooltip, tx + pad, ty + 14);
    }

    // Legend
    const legendPadding = 6;
    const legendY = 8;
    let legendX = 8;
    waveforms.forEach(({ color }, idx) => {
      const label = activeSeries[idx]?.name ?? '';
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY, 12, 12);
      legendX += 16;
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(label, legendX, legendY + 11);
      legendX += ctx.measureText(label).width + legendPadding;
    });

    // Title
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Waveform (Time Domain)', 8, 28);
  }, [waveforms, width, height, background, activeSeries, hoverX, viewIndices]);

  // Mouse interactions
  const onWheel: React.WheelEventHandler<HTMLCanvasElement> = (e) => {
    e.preventDefault();
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const anchor = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
    const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1; // in or out
    setView(v => {
      const center = v.start + (v.end - v.start) * anchor;
      let half = (v.end - v.start) * zoomFactor / 2;
      half = Math.max(0.0005, Math.min(0.5, half));
      let start = center - half;
      let end = center + half;
      if (start < 0) { end -= start; start = 0; }
      if (end > 1) { start -= (end - 1); end = 1; }
      start = Math.max(0, start);
      end = Math.min(1, end);
      return { start, end };
    });
  };

  const onMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(Math.max(0, Math.min(rect.width, x)));
    if (isDragging && dragStartX.current != null) {
      const dx = x - dragStartX.current;
      const frac = dx / Math.max(1, rect.width);
      setView(v => {
        let start = v.start - frac;
        let end = v.end - frac;
        const widthF = end - start;
        if (start < 0) { end -= start; start = 0; }
        if (end > 1) { start -= (end - 1); end = 1; }
        // keep width
        if (end - start !== widthF) {
          end = start + widthF;
          if (end > 1) { start = 1 - widthF; end = 1; }
        }
        return { start, end };
      });
      dragStartX.current = x;
    }
  };
  const onMouseLeave: React.MouseEventHandler<HTMLCanvasElement> = () => setHoverX(null);
  const onMouseDown: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    dragStartX.current = e.clientX - rect.left;
    setDragging(true);
  };
  const onMouseUp: React.MouseEventHandler<HTMLCanvasElement> = () => {
    setDragging(false);
    dragStartX.current = null;
  };

  // Imperative controls
  useImperativeHandle(ref, () => ({
    zoomIn() { setView(v => ({ start: v.start + (v.end - v.start) * 0.05, end: v.end - (v.end - v.start) * 0.05 })); },
    zoomOut() { setView(v => ({ start: Math.max(0, v.start - (v.end - v.start) * 0.05), end: Math.min(1, v.end + (v.end - v.start) * 0.05) })); },
    panLeft() { setView(v => { const w = v.end - v.start; const shift = w * 0.1; let s = Math.max(0, v.start - shift); let e = s + w; if (e > 1) { e = 1; s = e - w; } return { start: s, end: e }; }); },
    panRight() { setView(v => { const w = v.end - v.start; const shift = w * 0.1; let e = Math.min(1, v.end + shift); let s = e - w; if (s < 0) { s = 0; e = w; } return { start: s, end: e }; }); },
    resetView() { setView({ start: 0, end: 1 }); },
    exportPNG() {
      const canvas = canvasRef.current; if (!canvas) return null; return canvas.toDataURL('image/png');
    }
  }), []);

  const hasData = series.some(s => s.data && s.data.length > 1);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} onWheel={onWheel} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onMouseDown={onMouseDown} onMouseUp={onMouseUp} style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }} />
      {!hasData && (
        <div style={{
          marginTop: 8,
          color: '#999',
          fontSize: 14
        }}>No waveform data yet…</div>
      )}
      <div style={{ position: 'absolute', right: 8, bottom: 6, color: '#aaa', fontSize: 11, background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 4, border: '1px solid #333' }}>
        Wheel to zoom • Drag to pan
      </div>
    </div>
  );
});

export default WaveformCanvas;
