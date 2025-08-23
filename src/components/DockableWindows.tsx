import React from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Typography from '@mui/material/Typography';

const ReactGridLayout = WidthProvider(GridLayout);

export type DockWindow = {
  key: string;
  title: string;
  content?: React.ReactNode;
};

const initialWindows: DockWindow[] = [
  { key: 'win1', title: 'Window 1' },
  { key: 'win2', title: 'Window 2' },
  { key: 'win3', title: 'Window 3' },
];

export default function DockableWindows() {
  const [windows, setWindows] = React.useState<DockWindow[]>(initialWindows);

  // Default layout: 3 windows side by side
  const layout = windows.map((w, i) => ({
    i: w.key,
    x: i * 4,
    y: 0,
    w: 4,
    h: 8,
    minW: 2,
    minH: 4,
  }));

  const removeWindow = (key: string) => {
    setWindows(ws => ws.filter(w => w.key !== key));
  };

  return (
    <Box sx={{ width: '100%', height: '80vh', minHeight: 400 }}>
      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={40}
        width={1200}
        draggableHandle=".dock-title"
        isResizable
        isDraggable
      >
        {windows.map(win => (
          <Box key={win.key} sx={{ bgcolor: '#f5f5f7', borderRadius: 2, boxShadow: 2, p: 2, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <Box className="dock-title" sx={{ display: 'flex', alignItems: 'center', mb: 1, cursor: 'move', userSelect: 'none' }}>
              <Typography variant="h6" sx={{ flex: 1 }}>{win.title}</Typography>
              <IconButton size="small" onClick={() => removeWindow(win.key)}><CloseIcon /></IconButton>
            </Box>
            <Box sx={{ flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
              {win.content || 'Add chart or table here'}
            </Box>
          </Box>
        ))}
      </ReactGridLayout>
    </Box>
  );
}
