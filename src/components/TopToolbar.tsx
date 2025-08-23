import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppBar, Toolbar, IconButton, Tooltip, Modal, Box } from '@mui/material';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import BluetoothDb from '../pages/BluetoothDb';

const iconStyle = { color: '#232837', fontSize: 28, mx: 1 };

type TopToolbarProps = {
  serialInput: string;
  setSerialInput: Dispatch<SetStateAction<string>>;
  serialLogs: string[];
  setSerialLogs: Dispatch<SetStateAction<string[]>>;
  sendSerialData: () => Promise<void>;
};

export default function TopToolbar({ serialInput, setSerialInput, serialLogs, setSerialLogs, sendSerialData }: TopToolbarProps) {
  const [openBluetooth, setOpenBluetooth] = useState(false);
  // Add more modal states for other icons if needed

  return (
    <AppBar position="static" sx={{ bgcolor: '#f5f5f7', boxShadow: 1, borderBottom: '1px solid #e0e0e0', zIndex: 100 }}>
      <Toolbar sx={{ minHeight: 56, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Tooltip title="Devices">
          <IconButton>
            <DeviceHubIcon sx={iconStyle} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Bluetooth">
          <IconButton onClick={() => setOpenBluetooth(true)}>
            <BluetoothIcon sx={iconStyle} />
          </IconButton>
        </Tooltip>
        <Tooltip title="WiFi">
          <IconButton>
            <WifiIcon sx={iconStyle} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Radio Frequency">
          <IconButton>
            <SettingsInputAntennaIcon sx={iconStyle} />
          </IconButton>
        </Tooltip>
      </Toolbar>
      <Modal open={openBluetooth} onClose={() => setOpenBluetooth(false)}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: '#fff', boxShadow: 24, p: 3, borderRadius: 2, minWidth: 600, minHeight: 400 }}>
          <BluetoothDb
            serialInput={serialInput}
            setSerialInput={setSerialInput}
            serialLogs={serialLogs}
            setSerialLogs={setSerialLogs}
            sendSerialData={sendSerialData}
          />
        </Box>
      </Modal>
    </AppBar>
  );
}
