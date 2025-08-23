import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, TextField, Button, Typography, InputAdornment } from '@mui/material';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import LockIcon from '@mui/icons-material/Lock';
import KeyIcon from '@mui/icons-material/Key';
import { login, setTempToken } from '../slices/authSlice';
import loginBanner from '../assets/loginBanner.jpg';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'password' | 'otp'>('password');
  const [info, setInfo] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [tempTokenLocal, setTempTokenLocal] = useState<string | null>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handlePasswordSubmit = async () => {
    setLoading(true);
    setInfo('');
    try {
      const res = await fetch('http://localhost:5174/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      dispatch(setTempToken({ phone, tempToken: json.tempToken }));
      setTempTokenLocal(json.tempToken);
      sessionStorage.setItem('tempToken', json.tempToken);
      setInfo(`OTP sent. Dev OTP: ${json.devOtp || '******'}`);
      setStage('otp');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setInfo(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    setLoading(true);
    setInfo('');
    try {
      const tempToken = tempTokenLocal || sessionStorage.getItem('tempToken') || '';
      const res = await fetch('http://localhost:5174/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, tempToken })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'OTP verification failed');
      dispatch(login({ role: json.role, token: json.token }));
      localStorage.setItem('jwt', json.token);
      navigate('/');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'OTP verification failed';
      setInfo(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        bgcolor: '#fff',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          borderRadius: 0,
        }}
      >
        {/* Left side banner image (now docked on the left) */}
        <Box
          sx={{
            display: { xs: 'none', md: 'block' },
            width: { md: '50%' },
            bgcolor: '#ddd',
            backgroundImage: `url(${loginBanner})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            height: '100%',
          }}
          aria-label="Login banner"
        />

        {/* Right side form */}
        <Box sx={{ p: 3, width: { xs: '100%', md: '50%' }, height: '100%', overflowY: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Login</Typography>
          {stage === 'password' ? (
            <>
              <TextField
                label="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth sx={{ mb: 2 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIphoneIcon /></InputAdornment> }}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth sx={{ mb: 2 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon /></InputAdornment> }}
              />
              <Button variant="contained" fullWidth onClick={handlePasswordSubmit} disabled={loading || !phone || !password}>Continue</Button>
            </>
          ) : (
            <>
              <TextField
                label="OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                fullWidth sx={{ mb: 2 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><KeyIcon /></InputAdornment> }}
              />
              <Button variant="contained" fullWidth onClick={handleOtpSubmit} disabled={loading || !otp}>Verify OTP</Button>
            </>
          )}
          {!!info && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{info}</Typography>}
        </Box>
      </Paper>
    </Box>
  );
}
