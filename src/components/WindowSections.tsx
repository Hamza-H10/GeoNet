import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

type ThemeMode = 'dark' | 'light';

const baseColors: Record<ThemeMode, { bg: string; header: string; border: string; text: string; accent: string }> = {
  dark: { bg: '#1e1f22', header: '#2c2d30', border: '#3a3b3e', text: '#e0e0e0', accent: '#1976d2' },
  light: { bg: '#fafafa', header: '#f0f0f3', border: '#d4d5d8', text: '#222', accent: '#1976d2' },
};

interface SectionContainerProps {
  title: string;
  children?: React.ReactNode;
  themeMode: ThemeMode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  id: string;
  draggable?: boolean;
}

const SectionContainer: React.FC<SectionContainerProps> = ({ title, children, themeMode, collapsible, collapsed, onToggleCollapse, id, draggable }) => {
  const colors = baseColors[themeMode];
  return (
    <Box
      data-section-id={id}
      sx={{
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: colors.bg,
        color: colors.text,
        fontSize: 14,
        borderRight: `1px solid ${colors.border}`,
        borderLeft: `1px solid ${colors.border}`,
        userSelect: 'none',
      }}
    >
      <Box
        className="section-header"
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/section-id', id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/section-id')) e.preventDefault();
        }}
        onDrop={(e) => {
          const from = e.dataTransfer.getData('text/section-id');
          if (from && from !== id) {
            const swapEvent = new CustomEvent('section-swap', { detail: { from, to: id } });
            window.dispatchEvent(swapEvent);
          }
        }}
        sx={{ p: 1, px: 1.25, bgcolor: colors.header, borderBottom: `1px solid ${colors.border}`, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, cursor: draggable ? 'grab' : 'default' }}
      >
        <Box sx={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</Box>
        {collapsible && (
          <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
            <IconButton size="small" onClick={onToggleCollapse} sx={{ color: colors.text }}>
              {collapsed ? <UnfoldMoreIcon fontSize="inherit" /> : <UnfoldLessIcon fontSize="inherit" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ p: 1.25, flex: 1, overflow: 'auto', display: collapsed ? 'none' : 'block' }}>
        {children || <Typography variant="body2" sx={{ opacity: 0.6 }}>Content area</Typography>}
      </Box>
    </Box>
  );
};

export default function WindowSections() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('homeTheme') as ThemeMode) || 'dark');
  const [collapsed, setCollapsed] = useState<{ [k: string]: boolean }>({});
  const [order, setOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('homeOrder');
    return saved ? JSON.parse(saved) : ['explorer', 'workspaceGroup', 'side'];
  });
  const [sizes, setSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('homeSizes');
    return saved ? JSON.parse(saved) : [20, 55, 25];
  });

  // Persist theme
  useEffect(() => { localStorage.setItem('homeTheme', themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem('homeOrder', JSON.stringify(order)); }, [order]);
  useEffect(() => { localStorage.setItem('homeSizes', JSON.stringify(sizes)); }, [sizes]);

  // Handle section swap
  useEffect(() => {
    type SwapDetail = { from: string; to: string };
    const handler = (e: Event) => {
      const custom = e as CustomEvent<SwapDetail>;
      const { from, to } = custom.detail || { from: '', to: '' };
      if (!from || !to) return;
      setOrder(o => {
        const idxA = o.indexOf(from);
        const idxB = o.indexOf(to);
        if (idxA === -1 || idxB === -1) return o;
        const copy = [...o];
        [copy[idxA], copy[idxB]] = [copy[idxB], copy[idxA]];
        return copy;
      });
    };
    window.addEventListener('section-swap', handler as EventListener);
    return () => window.removeEventListener('section-swap', handler as EventListener);
  }, []);

  const toggleCollapse = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }));
  const resetLayout = () => {
    setOrder(['explorer', 'workspaceGroup', 'side']);
    setSizes([20, 55, 25]);
    setCollapsed({});
  };

  const onHorizontalLayout = useCallback((newSizes: number[]) => {
    setSizes(newSizes);
  }, []);

  const colors = baseColors[themeMode];

  const sections = useMemo(() => {
    return order.map(k => {
      if (k === 'explorer') return { key: k, node: <SectionContainer id="explorer" title="Explorer" themeMode={themeMode} collapsible collapsed={collapsed['explorer']} onToggleCollapse={() => toggleCollapse('explorer')} draggable /> };
      if (k === 'workspaceGroup') return { key: k, node: (
        <PanelGroup direction="vertical" style={{ height: '100%' }}>
          <Panel defaultSize={60} minSize={30}>
            <SectionContainer id="workspace" title="Main Workspace" themeMode={themeMode} collapsible collapsed={collapsed['workspace']} onToggleCollapse={() => toggleCollapse('workspace')} />
          </Panel>
          <PanelResizeHandle style={{ height: 4, cursor: 'row-resize', background: colors.border }} />
          <Panel defaultSize={40} minSize={20}>
            <SectionContainer id="console" title="Details / Console" themeMode={themeMode} collapsible collapsed={collapsed['console']} onToggleCollapse={() => toggleCollapse('console')} />
          </Panel>
        </PanelGroup>
      )};
      if (k === 'side') return { key: k, node: <SectionContainer id="side" title="Side Info" themeMode={themeMode} collapsible collapsed={collapsed['side']} onToggleCollapse={() => toggleCollapse('side')} draggable /> };
      return { key: k, node: <SectionContainer id={k} title={k} themeMode={themeMode} /> };
    });
  }, [order, themeMode, collapsed, colors.border]);

  return (
    <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: colors.bg }}>
      {/* Top bar controls */}
      <Box sx={{ height: 36, display: 'flex', alignItems: 'center', gap: 1, px: 1, bgcolor: colors.header, borderBottom: `1px solid ${colors.border}` }}>
        <Tooltip title="Toggle Theme">
          <IconButton size="small" onClick={() => setThemeMode(m => m === 'dark' ? 'light' : 'dark')} sx={{ color: colors.text }}>
            {themeMode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset Layout">
          <IconButton size="small" onClick={resetLayout} sx={{ color: colors.text }}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Drag headers to swap sections">
          <SwapHorizIcon fontSize="small" sx={{ color: colors.accent, ml: 0.5 }} />
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ opacity: 0.6 }}>Resizable Sections Demo</Typography>
      </Box>
      <PanelGroup direction="horizontal" style={{ width: '100%', height: '100%' }} onLayout={onHorizontalLayout}>
        {/* Map horizontal sections with sizes */}
        {sections.map((s, idx) => (
          <React.Fragment key={s.key}>
            <Panel defaultSize={sizes[idx]} minSize={10} maxSize={60}>
              {s.node}
            </Panel>
            {idx < sections.length - 1 && <PanelResizeHandle style={{ width: 4, cursor: 'col-resize', background: colors.border }} />}
          </React.Fragment>
        ))}
      </PanelGroup>
    </Box>
  );
}
