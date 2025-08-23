import { useEffect, useState } from 'react';

// Shared types
export type AxisPoint = { hour: number; x: number; y: number };
export type Meter = {
  id: string;
  location: string;
  currentX: number;
  currentY: number;
  todayMaxX: number;
  todayMaxY: number;
  allTimeHighX: number;
  allTimeHighY: number;
  status: 'safe' | 'warning' | 'danger';
  history: AxisPoint[];
};

export type TiltMode = 'current' | 'today' | 'alltime';

export function statusOf(x: number, y: number): Meter['status'] {
  const v = Math.max(x, y);
  if (v < 5) return 'safe';
  if (v < 10) return 'warning';
  return 'danger';
}

// Hook providing mock data and live updates
export function useTiltmeterData() {
  const [meters, setMeters] = useState<Meter[]>([]);

  // Initialize mock meters
  useEffect(() => {
    const locations = ['Building A', 'Building B', 'Tower X', 'Bridge 1', 'Platform 2', 'Structure 3'];
    const arr: Meter[] = Array.from({ length: 30 }, (_, i) => {
      const id = `T-${(i + 1).toString().padStart(3, '0')}`;
      const location = locations[i % locations.length];
      const currentX = parseFloat((Math.random() * 12).toFixed(1));
      const currentY = parseFloat((Math.random() * 12).toFixed(1));
      const todayMaxX = parseFloat((currentX + Math.random() * 3).toFixed(1));
      const todayMaxY = parseFloat((currentY + Math.random() * 3).toFixed(1));
      const allTimeHighX = parseFloat((todayMaxX + Math.random() * 4).toFixed(1));
      const allTimeHighY = parseFloat((todayMaxY + Math.random() * 4).toFixed(1));
      const history: AxisPoint[] = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        x: parseFloat((Math.random() * 10 * (h % 2 === 0 ? 1 : 0.8)).toFixed(1)),
        y: parseFloat((Math.random() * 10 * (h % 2 === 1 ? 1 : 0.8)).toFixed(1)),
      }));
      return {
        id,
        location,
        currentX,
        currentY,
        todayMaxX,
        todayMaxY,
        allTimeHighX,
        allTimeHighY,
        status: statusOf(currentX, currentY),
        history,
      };
    });
    setMeters(arr);
  }, []);

  // Simulate live updates every 5s
  useEffect(() => {
    const t = setInterval(() => {
      setMeters(prev => prev.map(m => {
        const changeX = (Math.random() - 0.5) * 0.5;
        const changeY = (Math.random() - 0.5) * 0.5;
        const currentX = parseFloat(Math.max(0, m.currentX + changeX).toFixed(1));
        const currentY = parseFloat(Math.max(0, m.currentY + changeY).toFixed(1));
        const todayMaxX = currentX > m.todayMaxX ? currentX : m.todayMaxX;
        const todayMaxY = currentY > m.todayMaxY ? currentY : m.todayMaxY;
        const nowH = new Date().getHours();
        const history = m.history.map(p => (p.hour === nowH ? { ...p, x: currentX, y: currentY } : p));
        const allTimeHighX = Math.max(m.allTimeHighX, currentX);
        const allTimeHighY = Math.max(m.allTimeHighY, currentY);
        return { ...m, currentX, currentY, todayMaxX, todayMaxY, allTimeHighX, allTimeHighY, status: statusOf(currentX, currentY), history };
      }));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  return { meters };
}

// Helper utilities so UI can stay presentation-only
export function valueFor(m: Meter, axis: 'x' | 'y', mode: TiltMode) {
  if (mode === 'current') return axis === 'x' ? m.currentX : m.currentY;
  if (mode === 'today') return axis === 'x' ? m.todayMaxX : m.todayMaxY;
  return axis === 'x' ? m.allTimeHighX : m.allTimeHighY;
}

export function meterColor(st: Meter['status']) {
  return st === 'safe' ? '#10b981' : st === 'warning' ? '#f59e0b' : '#ef4444';
}

export function computeSummary(meters: Meter[]) {
  const counts = {
    safe: meters.filter(m => m.status === 'safe').length,
    warning: meters.filter(m => m.status === 'warning').length,
    danger: meters.filter(m => m.status === 'danger').length,
  };
  const maxToday = meters.reduce((mx, m) => Math.max(mx, Math.max(m.todayMaxX, m.todayMaxY)), 0);
  const allTimeHigh = meters.reduce((mx, m) => Math.max(mx, Math.max(m.allTimeHighX, m.allTimeHighY)), 0);
  const recent = [...meters].sort((a, b) => Math.max(b.currentX, b.currentY) - Math.max(a.currentX, a.currentY)).slice(0, 10);
  return { counts, maxToday, allTimeHigh, recent };
}
