import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Toolbar, Box, Tooltip, Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Snackbar } from '@mui/material';
import Alert from '@mui/material/Alert';
import HomeIcon from '@mui/icons-material/Home';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import HistoryIcon from '@mui/icons-material/History';
import DevicesIcon from '@mui/icons-material/Devices';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import InfoIcon from '@mui/icons-material/Info';
import SpeedIcon from '@mui/icons-material/Speed';
import NotificationsIcon from '@mui/icons-material/Notifications';
import VibrationIcon from '@mui/icons-material/Vibration';
import SettingsIcon from '@mui/icons-material/Settings';
import AlarmIcon from '@mui/icons-material/Alarm';
import BugReportIcon from '@mui/icons-material/BugReport';
import LogoutIcon from '@mui/icons-material/Logout';
import BatteryFullIcon from '@mui/icons-material/BatteryFull';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { logout } from '../slices/authSlice';
import pkg from '../../package.json';

const drawerWidth = 220;
const railWidth = 56;

export default function NavigationDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const auth = useSelector((s: RootState) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [logoutConfirm, setLogoutConfirm] = React.useState(false);
  const [online, setOnline] = React.useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [appVersion, setAppVersion] = React.useState<string>('');
  const [offlineSnack, setOfflineSnack] = React.useState(false);

  React.useEffect(() => {
  const on = () => setOnline(true);
  const off = () => { setOnline(false); setOfflineSnack(true); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Get app version (Electron preferred; fallback to package.json in web)
  React.useEffect(() => {
    const getVer = async () => {
      try {
        // @ts-expect-error electronAPI is injected by preload in Electron
        if (window.electronAPI && window.electronAPI.getAppVersion) {
          // @ts-expect-error invoke available only in Electron
          const v = await window.electronAPI.getAppVersion();
          setAppVersion(v);
        } else if (pkg?.version) {
          setAppVersion(pkg.version);
        }
      } catch {
        if (pkg?.version) setAppVersion(pkg.version);
      }
    };
    getVer();
  }, []);

  const handleLogout = () => {
    setLogoutConfirm(true);
  };

  const confirmLogout = () => {
    dispatch(logout());
    localStorage.removeItem('jwt');
    setOpen(false);
    setLogoutConfirm(false);
    navigate('/login');
  };

  const cancelLogout = () => setLogoutConfirm(false);
  const openAlarms = () => {
    try {
      if (window.location.pathname !== '/vibration') {
        navigate('/vibration');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-vibration-thresholds'));
        }, 100);
      } else {
        window.dispatchEvent(new CustomEvent('open-vibration-thresholds'));
      }
    } catch {
      // no-op
    }
  };

  return (
    <Box sx={{ display: 'flex', position: 'relative', width: '100vw', minHeight: '100vh', bgcolor: '#fff' }}>
      {/* Minimal menu button at top left */}
      <IconButton
        color="primary"
        edge="start"
        onClick={() => setOpen(!open)}
        sx={{ position: 'fixed', top: 12, left: 12, zIndex: 1300, bgcolor: '#fff', boxShadow: 2 }}
      >
        <MenuIcon />
      </IconButton>

      {/* Mini icon rail shown when drawer is hidden */}
      {!open && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: railWidth,
            bgcolor: '#fff',
            borderRight: '1px solid #e0e0e0',
            zIndex: 900,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 7,
            gap: 0.5,
          }}
        >
          <Tooltip title="Master Dashboard" placement="right"><IconButton component={Link} to="/"><HomeIcon /></IconButton></Tooltip>
          <Tooltip title="Bluetooth DB" placement="right"><IconButton component={Link} to="/bluetooth"><BluetoothIcon /></IconButton></Tooltip>
          {/* WiFi Data removed */}
          <Tooltip title="Historical Data" placement="right"><IconButton component={Link} to="/historical"><HistoryIcon /></IconButton></Tooltip>
          <Tooltip title="Vibration" placement="right"><IconButton component={Link} to="/vibration"><VibrationIcon /></IconButton></Tooltip>
          <Tooltip title="Devices" placement="right"><IconButton component={Link} to="/devices"><DevicesIcon /></IconButton></Tooltip>
          <Tooltip title="Tiltmeter Dashboard" placement="right"><IconButton component={Link} to="/tiltmeter"><DevicesIcon /></IconButton></Tooltip>
          <Tooltip title="Tiltmeter 2" placement="right"><IconButton component={Link} to="/tiltmeter2"><BatteryFullIcon /></IconButton></Tooltip>
          {!auth.token ? (
            <Tooltip title="Login" placement="right"><IconButton component={Link} to="/login"><AccountCircleIcon /></IconButton></Tooltip>
          ) : (
            <Tooltip title={`Logged in (${auth.role})`} placement="right"><IconButton onClick={handleLogout}><LogoutIcon /></IconButton></Tooltip>
          )}
        </Box>
      )}

      <Drawer
        variant="persistent"
        open={open}
        sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}
      >
        <Toolbar />
        <List>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/">
              <ListItemIcon><HomeIcon /></ListItemIcon>
              <ListItemText primary="Master Dashboard" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/bluetooth">
              <ListItemIcon><BluetoothIcon /></ListItemIcon>
              <ListItemText primary="Bluetooth DB" />
            </ListItemButton>
          </ListItem>
          {/* WiFi Data removed */}
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/historical">
              <ListItemIcon><HistoryIcon /></ListItemIcon>
              <ListItemText primary="Historical Data" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/vibration">
              <ListItemIcon><VibrationIcon /></ListItemIcon>
              <ListItemText primary="Vibration" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/devices">
              <ListItemIcon><DevicesIcon /></ListItemIcon>
              <ListItemText primary="Devices" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/tiltmeter">
              <ListItemIcon><DevicesIcon /></ListItemIcon>
              <ListItemText primary="Tiltmeter Dashboard" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/tiltmeter2">
              <ListItemIcon><BatteryFullIcon /></ListItemIcon>
              <ListItemText primary="Tiltmeter 2" />
            </ListItemButton>
          </ListItem>
          {!auth.token ? (
            <ListItem disablePadding>
              <ListItemButton component={Link} to="/login">
                <ListItemIcon><AccountCircleIcon /></ListItemIcon>
                <ListItemText primary="Login" />
              </ListItemButton>
            </ListItem>
          ) : (
            <ListItem disablePadding>
              <ListItemButton onClick={handleLogout}>
                <ListItemIcon><LogoutIcon /></ListItemIcon>
                <ListItemText primary={`Logout (${auth.role})`} />
              </ListItemButton>
            </ListItem>
          )}
        </List>
      </Drawer>

      {/* Click-away overlay to close drawer when clicking outside */}
      {open && (
        <Box onClick={() => setOpen(false)} sx={{ position: 'fixed', inset: 0, zIndex: 1100, bgcolor: 'transparent' }} />
      )}

      <Box component="main" sx={{ flexGrow: 1, p: 3, pb: 8, ml: open ? `${drawerWidth}px` : `${railWidth}px`, transition: 'margin 0.3s', width: '100%' }}>
        {/* Add spacing for the menu button */}
        <Box sx={{ height: 56 }} />
        {children}
      </Box>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutConfirm} onClose={cancelLogout} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to log out of your session?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelLogout} variant="text">Cancel</Button>
          <Button onClick={confirmLogout} color="error" variant="contained">Logout</Button>
        </DialogActions>
      </Dialog>

      {/* Slim Bottom Toolbar (global) */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 30,
          bgcolor: '#f5f5f7',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          zIndex: 1200,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Status">
            <IconButton size="small"><SpeedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Notifications">
            <IconButton size="small"><NotificationsIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={online ? 'Online' : 'Offline'}>
            <span>
              <IconButton size="small" color={online ? 'primary' : 'default'} sx={{ opacity: online ? 1 : 0.4 }}>
                <WifiIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {appVersion && (
            <Typography variant="caption" sx={{ color: '#666', ml: 0.5 }}>v{appVersion}</Typography>
          )}
          {auth.token && <Typography variant="caption">Role: {auth.role}</Typography>}
          <Tooltip title="Info">
            <IconButton size="small"><InfoIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Alarms">
            <IconButton size="small" onClick={openAlarms}><AlarmIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton size="small"><SettingsIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Report">
            <IconButton size="small"><BugReportIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      </Box>
      {/* Offline snackbar notification */}
      <Snackbar
        open={offlineSnack}
        // autoHideDuration={4000}
        onClose={() => setOfflineSnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setOfflineSnack(false)} severity="warning" variant="filled" sx={{ fontSize: 12, py: 0.5 }}>
          You're offline
        </Alert>
      </Snackbar>
    </Box>
  );
}
