// No need to import React in modern TSX
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function GradientTitle() {
  return (
    <Box sx={{ width: '100%', textAlign: 'center', py: 4 }}>
      <Typography
        variant="h2"
        sx={{
          fontWeight: 900,
          letterSpacing: 1.5,
          background: 'linear-gradient(90deg, #1976d2 0%, #43a047 50%, #e53935 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textFillColor: 'transparent',
          fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem' },
          mb: 2,
        }}
      >
        geonet dashboard
      </Typography>
    </Box>
  );
}
