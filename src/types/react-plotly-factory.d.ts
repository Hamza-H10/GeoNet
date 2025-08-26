declare module 'react-plotly.js/factory' {
    import * as React from 'react';
    export default function createPlotlyComponent(plotly: unknown): React.ComponentType<{ data: unknown[]; layout?: unknown; config?: unknown; style?: React.CSSProperties }>;
}
