// import { Link } from 'react-router-dom';

// export default function Navigation() {
//   return (
//     <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', background: '#eee' }}>
//       <Link to="/bluetooth">Bluetooth DB</Link>
//       <Link to="/wifi">WiFi Data</Link>
//       <Link to="/historical">Historical Data</Link>
//       <Link to="/devices">Devices</Link>
//       <Link to="/user">User Account/Login</Link>
//     </nav>
//   );
// }

import { Link } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import HistoryIcon from '@mui/icons-material/History';
import DevicesIcon from '@mui/icons-material/Devices';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

const navItems = [
  { text: 'Bluetooth DB', icon: <BluetoothIcon />, path: '/bluetooth' },
  { text: 'WiFi Data', icon: <WifiIcon />, path: '/wifi' },
  { text: 'Historical Data', icon: <HistoryIcon />, path: '/historical' },
  { text: 'Devices', icon: <DevicesIcon />, path: '/devices' },
  { text: 'User Account', icon: <AccountCircleIcon />, path: '/user' },
];

export default function Navigation() {
  return (
    <Drawer variant="permanent" anchor="left">
      <List>
        {navItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton component={Link} to={item.path}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}