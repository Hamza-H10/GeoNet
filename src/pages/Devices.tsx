import { useEffect, useState } from 'react';
import DevicesIcon from '@mui/icons-material/Devices';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import AddIcon from '@mui/icons-material/Add';
import SquareIcon from '@mui/icons-material/Square';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Switch,
  Tooltip,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
} from '@mui/material';
import { Edit, Delete, Download, Search as SearchIcon } from '@mui/icons-material';

// Data types
interface Device {
  id: number;
  name: string;
  active: number;
  register_date: string;
  installation_area: string;
  domain: string;
  battery: number;
  category?: string;
}
interface Category { id: number; name: string }
const CATS_API = 'http://127.0.0.1:5174/api/categories';

// API config
const API_URL = 'http://127.0.0.1:5174/api/devices';
const downloadLinks = [
  { label: 'CSV', url: 'http://127.0.0.1:5174/api/devices/export/csv' },
  { label: 'TXT', url: 'http://127.0.0.1:5174/api/devices/export/txt' },
  { label: 'Excel', url: 'http://127.0.0.1:5174/api/devices/export/xlsx' },
];

// Device form dialog
function DeviceForm({ open, onClose, onSave, initial, categories }: {
  open: boolean;
  onClose: () => void;
  onSave: (device: Omit<Device, 'id'>) => void;
  initial?: Partial<Device>;
  categories: Category[];
}) {
  const [form, setForm] = useState<Omit<Device, 'id'>>({
    name: '',
    active: 1,
    register_date: '',
    installation_area: '',
    domain: '',
    battery: 100,
    category: '',
    ...initial,
  } as Omit<Device, 'id'>);
  useEffect(() => {
    setForm({
      name: '',
      active: 1,
      register_date: '',
      installation_area: '',
      domain: '',
      battery: 100,
      category: '',
      ...initial,
    } as Omit<Device, 'id'>);
  }, [initial, open]);
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{initial?.id ? 'Edit Device' : 'Add New Device'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 360 }}>
        <TextField label="Device Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth required />
        <TextField label="Register Date" type="date" value={form.register_date} onChange={e => setForm(f => ({ ...f, register_date: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth required />
        <TextField label="Installation Area" value={form.installation_area} onChange={e => setForm(f => ({ ...f, installation_area: e.target.value }))} fullWidth />
        <TextField label="Domain" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} fullWidth />
        <TextField label="Battery" type="number" value={form.battery} onChange={e => setForm(f => ({ ...f, battery: Number(e.target.value) }))} fullWidth />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span>Active</span>
          <Switch checked={!!form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))} />
        </Box>
        <FormControl fullWidth>
          <InputLabel id="device-category-label">Category</InputLabel>
          <Select
            labelId="device-category-label"
            value={form.category || ''}
            label="Category"
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          >
            {categories.length === 0 && <MenuItem value="" disabled>No categories</MenuItem>}
            {categories.map(cat => (
              <MenuItem key={cat.id} value={cat.name}>{cat.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const autoDate = `${yyyy}-${mm}-${dd}`;
            const payload = { ...form, register_date: form.register_date || autoDate };
            onSave(payload);
          }}
          variant="contained"
        >
          {initial?.id ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Devices() {
  // Bluetooth helper types
  type RequestDeviceOptions = { filters?: Array<{ [key: string]: unknown }>; optionalServices?: string[]; acceptAllDevices?: boolean };
  type BluetoothDevice = { id: string; name?: string };
  interface BluetoothNavigator extends Navigator { bluetooth: { requestDevice: (options: RequestDeviceOptions) => Promise<BluetoothDevice> } }

  // State
  const [availableBluetoothDevices, setAvailableBluetoothDevices] = useState<{ name: string; id: string }[]>([]);
  const [selectedBtDevice, setSelectedBtDevice] = useState('');
  const [pairing, setPairing] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const [deviceModal, setDeviceModal] = useState(false);
  const [bluetoothModal, setBluetoothModal] = useState(false);
  const [wifiModal, setWifiModal] = useState(false);
  const [rfModal, setRfModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');

  // Helper to load categories from backend
  const refreshCategories = async () => {
    try {
      const res = await fetch(CATS_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]); // no fallback defaults to avoid ID mismatch
    }
  };

  // Load categories on mount
  useEffect(() => { void refreshCategories(); }, []);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Discover BLE devices
  const discoverBluetoothDevices = async () => {
    setDiscovering(true);
    try {
      const device = await (navigator as BluetoothNavigator).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [] });
      setAvailableBluetoothDevices([{ name: device.name || device.id, id: device.id }]);
      setSelectedBtDevice(device.id);
    } catch {
      setAvailableBluetoothDevices([]);
      setSelectedBtDevice('');
    } finally {
      setTimeout(() => setDiscovering(false), 1000);
    }
  };

  // Load devices
  const fetchDevices = async () => {
    try {
      setLoadError(null);
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDevices(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load devices';
      console.error('Fetch devices error:', msg);
      setLoadError(msg);
      setDevices([]);
    }
  };
  useEffect(() => { fetchDevices(); }, []);

  // CRUD handlers
  const handleAdd = async (device: Omit<Device, 'id'>) => {
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(device) });
      if (!res.ok) throw new Error('Create failed');
      setOpen(false);
      setDeviceModal(false);
      fetchDevices();
  } catch {
      setOpen(false);
      // Keep deviceModal state; show a simple notification to aid debugging
      alert('Failed to add device. Please ensure all fields are valid and backend is running.');
    }
  };

  const handleEdit = async (device: Omit<Device, 'id'>) => {
    if (!editDevice) return;
    try {
      const res = await fetch(`${API_URL}/${editDevice.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(device) });
      if (!res.ok) throw new Error('Update failed');
      setEditDevice(null);
      fetchDevices();
    } catch {
      setEditDevice(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this device?')) return;
    try {
      const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchDevices();
    } catch {
      // ignore
    }
  };

  // Filtering / searching / sorting
  let filteredDevices = devices.filter(d => {
    if (filter === 'active' && !d.active) return false;
    if (filter === 'inactive' && d.active) return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(s) ||
        d.register_date.toLowerCase().includes(s) ||
        (d.installation_area || '').toLowerCase().includes(s) ||
        (d.domain || '').toLowerCase().includes(s) ||
        String(d.battery).includes(s)
      );
    }
    return true;
  });
  filteredDevices = filteredDevices.sort((a, b) => sortOrder === 'asc' ? a.register_date.localeCompare(b.register_date) : b.register_date.localeCompare(a.register_date));

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, zIndex: 0, overflowY: 'auto' }}>
      {/* Top Icon Toolbar - right aligned */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 2, boxShadow: 1, mb: 2, width: '100%', justifyContent: 'flex-end' }}>
        <Tooltip title="Category Management"><IconButton onClick={() => setCategoryModal(true)}><SquareIcon fontSize="large" /></IconButton></Tooltip>
        <Tooltip title="Devices"><IconButton onClick={() => setDeviceModal(true)}><DevicesIcon fontSize="large" /></IconButton></Tooltip>
        <Tooltip title="Bluetooth"><IconButton onClick={() => setBluetoothModal(true)}><BluetoothIcon fontSize="large" /></IconButton></Tooltip>
        <Tooltip title="WiFi"><IconButton onClick={() => setWifiModal(true)}><WifiIcon fontSize="large" /></IconButton></Tooltip>
        <Tooltip title="RF"><IconButton onClick={() => setRfModal(true)}><SettingsInputAntennaIcon fontSize="large" /></IconButton></Tooltip>
      </Box>

      {/* Devices Registration Modal (uses DeviceForm) */}
    <Dialog open={deviceModal} onClose={() => setDeviceModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Device Registration</DialogTitle>
        <DialogContent>
      <DeviceForm open onClose={() => setDeviceModal(false)} onSave={handleAdd} categories={categories} />
        </DialogContent>
      </Dialog>

      {/* Bluetooth Modal */}
      <Dialog open={bluetoothModal} onClose={() => setBluetoothModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bluetooth Device Connection</DialogTitle>
        <DialogContent>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={discoverBluetoothDevices} startIcon={<BluetoothIcon />} disabled={discovering}>Discover Bluetooth Devices</Button>
            {discovering && <Box sx={{ display: 'flex', alignItems: 'center' }}><span style={{ marginRight: 6 }}>Checking...</span><span><svg width="22" height="22" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#1976d2" strokeWidth="5" strokeDasharray="31.4 31.4" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg></span></Box>}
            <FormControl size="small" sx={{ minWidth: 220, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel id="bt-device-label">Bluetooth Devices</InputLabel>
              <Select labelId="bt-device-label" value={selectedBtDevice} label="Bluetooth Devices" onChange={e => setSelectedBtDevice(e.target.value)} disabled={discovering}>
                {availableBluetoothDevices.length === 0 && !discovering && <MenuItem value="" disabled>No devices found</MenuItem>}
                {availableBluetoothDevices.map(dev => <MenuItem key={dev.id} value={dev.id}>{dev.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="contained" color="primary" startIcon={<BluetoothIcon />} disabled={!selectedBtDevice || pairing || discovering} onClick={async () => {
              setPairing(true);
              try {
                const dev = availableBluetoothDevices.find(d => d.id === selectedBtDevice);
                if (dev) {
                  await fetch('http://127.0.0.1:5174/api/paired-devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: dev.id, name: dev.name }) });
                }
              } catch (err) { console.error('Bluetooth pairing failed', err); }
              setTimeout(() => setPairing(false), 800);
            }}>{pairing ? 'Pairing...' : 'Pair'}</Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* WiFi Modal (placeholder) */}
      <Dialog open={wifiModal} onClose={() => setWifiModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>WiFi Device Registration</DialogTitle>
        <DialogContent>
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="WiFi Device Name" fullWidth />
            <TextField label="MAC Address" fullWidth />
            <TextField label="Location" fullWidth />
            <Button variant="contained" color="primary">Register WiFi Device</Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* RF Modal (placeholder) */}
      <Dialog open={rfModal} onClose={() => setRfModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>RF Device Registration</DialogTitle>
        <DialogContent>
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="RF Device Name" fullWidth />
            <TextField label="Frequency" fullWidth />
            <TextField label="Location" fullWidth />
            <Button variant="contained" color="primary">Register RF Device</Button>
          </Box>
        </DialogContent>
      </Dialog>

      <Box sx={{ p: 2 }}>
        {/* Filters/search/add/downloads */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title="Add New Device"><IconButton color="primary" onClick={() => setOpen(true)}><AddIcon /></IconButton></Tooltip>
            <FormControl size="small" sx={{ minWidth: 160, borderRadius: 1 }}>
              <InputLabel id="filter-label" sx={{ color: 'green' }}>Devices Filter</InputLabel>
              <Select labelId="filter-label" value={filter} label="Devices Filter" onChange={e => setFilter(e.target.value as 'all' | 'active' | 'inactive')} sx={{ bgcolor: '#fff', borderRadius: 1 }}>
                <MenuItem value="all">All Devices</MenuItem>
                <MenuItem value="active">Active Devices</MenuItem>
                <MenuItem value="inactive">Non-Active Devices</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160, borderRadius: 1 }}>
              <InputLabel id="category-label" sx={{ color: 'blue' }}>Category</InputLabel>
              <Select labelId="category-label" value={categoryFilter} label="Category" onChange={e => setCategoryFilter(e.target.value)} sx={{ bgcolor: '#fff', borderRadius: 1 }}>
                <MenuItem value="all">All Categories</MenuItem>
                {categories.map(cat => <MenuItem key={cat.id} value={cat.name}>{cat.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1, pl: 1, pr: 1 }}>
            <SearchIcon />
            <TextField size="small" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 220, bgcolor: '#fff', borderRadius: 1 }} />
          </Box>
          <Box>
            {downloadLinks.map(dl => (
              <Button key={dl.label} href={dl.url} target="_blank" startIcon={<Download />} sx={{ ml: 1 }}>{dl.label}</Button>
            ))}
          </Box>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>S.No</TableCell>
                <TableCell>Device Name</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Register Date
                    <IconButton size="small" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                      {sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>Installation Area</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell>Battery</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadError && (
                <TableRow>
                  <TableCell colSpan={9}>
                    Failed to load devices: {loadError}. Ensure backend is running on http://127.0.0.1:5174.
                  </TableCell>
                </TableRow>
              )}
              {!loadError && filteredDevices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>No devices found.</TableCell>
                </TableRow>
              )}
              {!loadError && filteredDevices.map((d, i) => (
                <TableRow key={d.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.active ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{d.register_date}</TableCell>
                  <TableCell>{d.installation_area}</TableCell>
                  <TableCell>{d.domain}</TableCell>
                  <TableCell>{d.battery}</TableCell>
                  <TableCell>{d.category || '-'}</TableCell>
                  <TableCell>
                    <Tooltip title="Edit"><IconButton onClick={() => setEditDevice(d)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton onClick={() => handleDelete(d.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add & Edit Dialogs */}
        <DeviceForm open={open} onClose={() => setOpen(false)} onSave={handleAdd} categories={categories} />
        {editDevice && (
          <DeviceForm open onClose={() => setEditDevice(null)} onSave={handleEdit} initial={editDevice} categories={categories} />
        )}

        {/* Category Modal */}
        <Dialog open={categoryModal} onClose={() => setCategoryModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="cat-dropdown-label">Categories</InputLabel>
                <Select
                  labelId="cat-dropdown-label"
                  value={selectedCategoryId}
                  label="Categories"
                  onChange={e => {
                    const val = e.target.value as number | '';
                    setSelectedCategoryId(val);
                    if (val === '') { setNewCategory(''); return; }
                    const found = categories.find(c => c.id === val);
                    setNewCategory(found?.name || '');
                  }}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {categories.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                </Select>
              </FormControl>
              {/* Add, update, delete category UI (demo only) */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField label="New Category" size="small" sx={{ flex: 1 }} value={newCategory} onChange={e => setNewCategory(e.target.value)} />
        <Button variant="contained" color="primary" onClick={async () => {
                  const name = newCategory.trim();
                  if (!name) return;
                  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return;
                  try {
                    const res = await fetch(CATS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                    if (!res.ok) throw new Error('Create failed');
                    await res.json();
          // Re-fetch to stay in sync
          await refreshCategories();
                    setNewCategory('');
                  } catch {
                    alert('Failed to add category');
                  }
                }}>Add</Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" color="info" onClick={async () => {
                  if (selectedCategoryId === '') { alert('Select a category to update.'); return; }
                  const name = newCategory.trim();
                  if (!name) { alert('Enter a new name.'); return; }
                  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== selectedCategoryId)) { alert('Category already exists.'); return; }
                  try {
                    const res = await fetch(`${CATS_API}/${selectedCategoryId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                    if (!res.ok) throw new Error('Update failed');
          await refreshCategories();
                  } catch {
                    alert('Failed to update category');
                  }
                }}>Update</Button>
                <Button variant="outlined" color="error" onClick={async () => {
                  if (selectedCategoryId === '') { alert('Select a category to delete.'); return; }
                  const target = categories.find(c => c.id === selectedCategoryId);
                  if (!target) return;
                  if (!window.confirm(`Delete category "${target.name}"?`)) return;
                  try {
                    const res = await fetch(`${CATS_API}/${selectedCategoryId}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Delete failed');
          await refreshCategories();
                    setSelectedCategoryId('');
                    setNewCategory('');
                    if (categoryFilter === target.name) setCategoryFilter('all');
                  } catch {
                    alert('Failed to delete category');
                  }
                }}>Delete</Button>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>
    </Box>
  );
}
