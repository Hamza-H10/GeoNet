import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

export type DataFetchSettingsProps = {
  initialHours?: number; // default selection
  title?: string; // dialog title
  label?: string; // tooltip label
  note?: string; // helper note under the select
  onSaved?: (hours: number) => void; // callback after successful save
  size?: 'small' | 'medium';
};

export default function DataFetchSettings({
  initialHours = 1,
  title = 'Data Fetch Frequency',
  label = 'Settings',
  note = 'Controls how often the client fetches data (client-only; not sent to server).',
  onSaved,
  size = 'medium',
}: DataFetchSettingsProps) {
  const [open, setOpen] = useState(false);
  // Store selection in milliseconds for flexibility (supports seconds/minutes/hours)
  const storedMs = ((): number | null => {
    try { const v = localStorage.getItem('app.fetchIntervalMs'); return v ? Number(v) : null; } catch { return null; }
  })();
  const defaultMs = storedMs && Number.isFinite(storedMs) && storedMs > 0 ? storedMs : Math.round(initialHours * 60 * 60000);
  const [intervalMs, setIntervalMs] = useState<number>(defaultMs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const hours = intervalMs / 3600000;
      // Persist locally for the app to use immediately
      try { localStorage.setItem('app.fetchIntervalMs', String(intervalMs)); } catch { /* ignore */ }
  // Backend persistence disabled per request; client-only setting.
      setOpen(false);
  setSavedOpen(true);
      onSaved?.(hours);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const formatInterval = (ms: number): string => {
    if (!Number.isFinite(ms) || ms <= 0) return 'unknown';
    if (ms < 60000) {
      const s = Math.round(ms / 1000);
      return `${s} second${s === 1 ? '' : 's'}`;
    }
    if (ms % 3600000 === 0) {
      const h = ms / 3600000;
      return `${h} hour${h === 1 ? '' : 's'}`;
    }
    const m = Math.round(ms / 60000);
    return `${m} minute${m === 1 ? '' : 's'}`;
  };

  return (
    <>
      <Tooltip title={label}>
        <IconButton onClick={() => setOpen(true)} size={size}>
          <SettingsIcon />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="freq-label">Frequency</InputLabel>
            <Select labelId="freq-label" value={intervalMs} label="Frequency" onChange={(e) => setIntervalMs(Number(e.target.value))}>
              {/* Seconds options */}
              {[10, 20, 30].map(s => (
                <MenuItem key={`s-${s}`} value={s * 1000}>{s} seconds</MenuItem>
              ))}
              {/* Minute options */}
              {[1, 5, 10, 20, 30].map(m => (
                <MenuItem key={`m-${m}`} value={m * 60000}>{m} minutes</MenuItem>
              ))}
              {/* Hour options */}
              {[1, 2, 3, 4, 6, 8, 12].map(h => (
                <MenuItem key={`h-${h}`} value={h * 3600000}>{h} {h===1 ? 'hour' : 'hours'}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {error && <Typography color="error" variant="body2" sx={{ mt: 1 }}>Failed to save setting: {error}</Typography>}
          {note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{note}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={savedOpen}
        autoHideDuration={3000}
        onClose={() => setSavedOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSavedOpen(false)} severity="success" sx={{ width: '100%' }}>
          Data fetch frequency updated to {formatInterval(intervalMs)}.
        </Alert>
      </Snackbar>
    </>
  );
}
