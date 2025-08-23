import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { login } from './slices/authSlice';
// Add type for window.electronAPI if present
declare global {
  interface Window {
    electronAPI?: {
      listSerialPorts?: () => Promise<{ path: string; manufacturer?: string }[]>;
      connectSerial?: (port: string) => Promise<void>;
      onSerialData?: (cb: (data: string) => void) => void;
      sendSerial?: (data: string) => Promise<void>;
      onMenuAction?: (cb: (payload: { action: string }) => void) => void;
    };
  }
}

import MasterDashboard from './pages/MasterDashboard';
import BluetoothDb from './pages/BluetoothDb';
import HistoricalData from './pages/HistoricalData';
import Devices from './pages/Devices';
import UserAccount from './pages/UserAccount';
import TiltmeterDashboard from './pages/tiltmeterDb';
import VibrationDb from './pages/VibrationDb';
import Layout from './components/Layout';
// import LoginPage from './pages/login'; // temporarily disabled
// import type { RootState } from './store';

function MenuActionListener() {
  const navigate = useNavigate();
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onMenuAction) {
      window.electronAPI.onMenuAction((p: { action: string }) => {
        if (p?.action === 'open-home') navigate('/');
        if (p?.action === 'open-graph') navigate('/historical');
        if (p?.action === 'open-editor') navigate('/devices');
      });
    }
  }, [navigate]);
  return null;
}

function ProtectedRoute({ element }: { element: JSX.Element; roles?: Array<'user' | 'admin'> }) {
  // Auth temporarily bypassed while login is disabled
  return element;
}

function App() {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const dispatch = useDispatch();

  // Restore session on refresh using JWT -> fetch role
  useEffect(() => {
    const jwt = localStorage.getItem('jwt');
    if (jwt) {
      fetch('http://localhost:5174/api/auth/me', {
        headers: { Authorization: `Bearer ${jwt}` },
      })
        .then(async (res) => {
          const json = await res.json();
          if (res.ok && json?.role) {
            dispatch(login({ role: json.role, token: jwt }));
          }
        })
        .catch(() => undefined);
    }
  }, [dispatch]);

  // For Electron+IPC:
  useEffect(() => {
    // Fallback for browser context
    if (window.electronAPI && window.electronAPI.onSerialData) {
      window.electronAPI.onSerialData((data: string) => setLogs((logs) => [...logs, data]));
    }
  }, []);

  // Use Electron IPC for serial send
  const sendData = async () => {
    if (window.electronAPI && window.electronAPI.sendSerial) {
      try {
        await window.electronAPI.sendSerial(input);
        setLogs((logs) => [...logs, `Sent: ${input}`]);
        setInput('');
      } catch {
        setLogs((logs) => [...logs, `Error sending: ${input}`]);
      }
    } else {
      setLogs((logs) => [...logs, 'Serial API not available. Not running in Electron?']);
    }
  };

  return (
    <Router basename="/">
      <MenuActionListener />
      <Routes>
  {/* <Route path="/login" element={<LoginPage />} /> login disabled */}
        <Route element={<Layout />}>
          <Route path="/" element={<ProtectedRoute element={<MasterDashboard />} />} />
          <Route
            path="/bluetooth"
            element={
              <ProtectedRoute
                element={
                  <BluetoothDb
                    serialInput={input}
                    setSerialInput={setInput}
                    serialLogs={logs}
                    setSerialLogs={setLogs}
                    sendSerialData={sendData}
                  />
                }
              />
            }
          />
          {/* WiFi route removed */}
          <Route path="/historical" element={<ProtectedRoute element={<HistoricalData />} />} />
          <Route path="/devices" element={<ProtectedRoute element={<Devices />} />} />
          <Route path="/tiltmeter" element={<ProtectedRoute element={<TiltmeterDashboard />} />} />
          <Route path="/vibration" element={<ProtectedRoute element={<VibrationDb />} />} />
          <Route path="/user" element={<ProtectedRoute element={<UserAccount />} />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

