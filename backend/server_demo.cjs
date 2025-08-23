const express = require('express');
const cors = require('cors');
const app = express();
// const PORT = 3001;
const PORT = 5174;

app.use(cors());
app.use(express.json());

// Example endpoints
app.get('/api/bluetooth', (req, res) => {
  res.json({ data: 'Bluetooth DB data' });
});
app.get('/api/wifi', (req, res) => {
  res.json({ data: 'WiFi data' });
});
app.get('/api/historical', (req, res) => {
  res.json({ data: 'Historical data' });
});
app.get('/api/devices', (req, res) => {
  res.json({ data: 'Devices data' });
});

// User login endpoint (mock)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  // Simple role logic
  if (username === 'admin') {
    res.json({ role: 'admin', token: 'admin-token' });
  } else {
    res.json({ role: 'user', token: 'user-token' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
