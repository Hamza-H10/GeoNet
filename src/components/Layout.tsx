// import React from 'react';
import NavigationDrawer from './NavigationDrawer';
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';

export default function Layout() {
  return (
    <NavigationDrawer>
      <Box sx={{ bgcolor: '#fff', minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </NavigationDrawer>
  );
}
