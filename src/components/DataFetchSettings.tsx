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

export type DataFetchSettingsProps = {
  endpoint?: string; // API endpoint to persist the setting
  initialHours?: number; // default selection
  title?: string; // dialog title
  label?: string; // tooltip label
  note?: string; // helper note under the select
  onSaved?: (hours: number) => void; // callback after successful save
  size?: 'small' | 'medium';
};

export default function DataFetchSettings({
  endpoint = 'http://localhost:5174/api/app-settings/client-data-frequency',
  initialHours = 1,
  title = 'Data Fetch Frequency',
  label = 'Settings',
  note = 'This will be saved in Firestore under the document "app settings" (field: "client data Frequency").',
  onSaved,
  size = 'medium',
}: DataFetchSettingsProps) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<number>(initialHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOpen(false);
      onSaved?.(hours);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
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
            <InputLabel id="freq-label">Frequency (Hours)</InputLabel>
            <Select labelId="freq-label" value={String(hours)} label="Frequency (Hours)" onChange={(e) => setHours(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8, 12].map(h => (
                <MenuItem key={h} value={String(h)}>{h} {h === 1 ? 'Hour' : 'Hours'}</MenuItem>
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
    </>
  );
}
