import { useEffect, useMemo, useState } from 'react';

export interface Device {
    id: number;
    name: string;
    active: number;
    register_date: string;
    installation_area: string;
    domain: string;
    battery: number;
    category?: string;
}

const API_URL = 'http://127.0.0.1:5174/api/devices';

export function useDevicesByCategory(category: string) {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(API_URL);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as Device[];
                if (mounted) setDevices(Array.isArray(data) ? data : []);
            } catch (e) {
                if (mounted) setError(e instanceof Error ? e.message : 'Failed to load devices');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        const t = setInterval(load, 15000); // refresh every 15s
        return () => { mounted = false; clearInterval(t); };
    }, []);

    const filtered = useMemo(() => {
        const target = category.trim().toLowerCase();
        return devices.filter(d => (d.category || '').trim().toLowerCase() === target);
    }, [devices, category]);

    const nameSet = useMemo(() => new Set(filtered.map(d => (d.name || '').trim().toLowerCase())), [filtered]);

    return { devices: filtered, nameSet, loading, error };
}

// Convenience hook: specifically fetch devices with category 'Tiltmeter'
export function useTiltmeterDevices() {
    return useDevicesByCategory('Tiltmeter');
}
