import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login } from './slices/authSlice';
import type { RootState } from './store';
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

import { lazy, Suspense } from 'react';
const MasterDashboard = lazy(() => import('./pages/MasterDashboard'));
const BluetoothDb = lazy(() => import('./pages/BluetoothDb'));
const HistoricalData = lazy(() => import('./pages/HistoricalData'));
const Devices = lazy(() => import('./pages/Devices'));
const UserAccount = lazy(() => import('./pages/UserAccount'));
const TiltmeterDashboard = lazy(() => import('./pages/tiltmeterDb'));
const TiltmeterDashboard2 = lazy(() => import('./pages/tiltmeterDb2'));
const VibrationDb = lazy(() => import('./pages/VibrationDb'));
const LoginPage = lazy(() => import('./pages/login'));
import Layout from './components/Layout';

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
  const auth = useSelector((state: RootState) => state.auth);
  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }
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
        <Route path="/login" element={<Suspense fallback={<div />}><LoginPage /></Suspense>} />
        <Route element={<Layout />}>
          <Route path="/" element={<Suspense fallback={<div /> }><ProtectedRoute element={<MasterDashboard />} /></Suspense>} />
          <Route
            path="/bluetooth"
            element={
              <Suspense fallback={<div /> }>
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
              </Suspense>
            }
          />
          {/* WiFi route removed */}
          <Route path="/historical" element={<Suspense fallback={<div /> }><ProtectedRoute element={<HistoricalData />} /></Suspense>} />
          <Route path="/devices" element={<Suspense fallback={<div /> }><ProtectedRoute element={<Devices />} /></Suspense>} />
          <Route path="/tiltmeter" element={<Suspense fallback={<div /> }><ProtectedRoute element={<TiltmeterDashboard />} /></Suspense>} />
          <Route path="/tiltmeter2" element={<Suspense fallback={<div /> }><ProtectedRoute element={<TiltmeterDashboard2 />} /></Suspense>} />
          <Route path="/vibration" element={<Suspense fallback={<div /> }><ProtectedRoute element={<VibrationDb />} /></Suspense>} />
          <Route path="/user" element={<Suspense fallback={<div /> }><ProtectedRoute element={<UserAccount />} /></Suspense>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

