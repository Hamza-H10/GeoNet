import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, TextField, Button, Typography, InputAdornment } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import { login } from '../slices/authSlice';
import loginBanner from '../assets/loginBanner.jpg';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLoginSubmit = async () => {
    setLoading(true);
    setInfo('');
    try {
      const API_BASE =
        import.meta.env.VITE_API_BASE_URL ||
        'http://127.0.0.1:5174';

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      // Direct login - no OTP required
      dispatch(login({ role: json.role, token: json.token }));
      localStorage.setItem('jwt', json.token);
      // Store session expiry (24 hours from now)
      const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
      localStorage.setItem('sessionExpiry', expiryTime.toString());
      // Navigate based on user role
      if (json.role === 'user') {
        navigate('/tiltmeter2');
      } else {
        navigate('/');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
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

          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth sx={{ mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon /></InputAdornment> }}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth sx={{ mb: 2 }}
            onKeyPress={(e) => e.key === 'Enter' && !loading && username && password && handleLoginSubmit()}
            InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon /></InputAdornment> }}
          />
          <Button
            variant="contained"
            fullWidth
            onClick={handleLoginSubmit}
            disabled={loading || !username || !password}
            sx={{ mb: 3 }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          {!!info && (
            <Typography
              variant="body2"
              color="error"
              sx={{ mt: 2, p: 1, bgcolor: '#ffebee', borderRadius: 1 }}
            >
              {info}
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
