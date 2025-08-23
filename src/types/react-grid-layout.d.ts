declare module 'react-grid-layout' {
    import * as React from 'react';
    export interface Layout {
        i: string;
        x: number;
        y: number;
        w: number;
        h: number;
        minW?: number;
        minH?: number;
        maxW?: number;
        maxH?: number;
        static?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
    }
    export interface GridLayoutProps {
        className?: string;
        layout?: Layout[];
        cols?: number;
        rowHeight?: number;
        width?: number;
        isDraggable?: boolean;
        isResizable?: boolean;
        draggableHandle?: string;
        children?: React.ReactNode;
    }
    export default class GridLayout extends React.Component<GridLayoutProps> { }
    export function WidthProvider<P>(component: React.ComponentType<P>): React.ComponentType<P>;
}
