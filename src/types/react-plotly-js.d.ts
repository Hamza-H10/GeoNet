declare module 'react-plotly.js' {
    import * as React from 'react';
    interface PlotProps {
        data: unknown[];
        layout?: unknown;
        config?: unknown;
        style?: React.CSSProperties;
        className?: string;
        onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void;
        onUpdate?: (figure: unknown, graphDiv: HTMLElement) => void;
    }
    export default class Plot extends React.Component<PlotProps> { }
}
