import { useEffect, useRef, useState } from 'react';

export default function Visible({ children, rootMargin = '200px', once = true }: { children: JSX.Element; rootMargin?: string; once?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisible(true);
          if (once) io.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      }
    }, { root: null, rootMargin, threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, once]);

  return <div ref={ref} style={{ minHeight: 24 }}>{visible ? children : null}</div>;
}
