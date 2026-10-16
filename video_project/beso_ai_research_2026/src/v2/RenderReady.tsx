import {useLayoutEffect} from 'react';
import {continueRender, delayRender, getRemotionEnvironment, useCurrentFrame} from 'remotion';

// Give decoded textures and transformed layers two paint cycles before capture.
export const RenderReady = () => {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    if (!getRemotionEnvironment().isRendering) return;
    const handle = delayRender('Wait for scene compositor');
    let cancelled = false;
    let first = 0;
    let second = 0;
    let timer: ReturnType<typeof setTimeout>;
    Promise.all([...document.images].map(img => img.decode().catch(() => undefined))).then(() => {
      if (cancelled) return;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          timer = setTimeout(() => continueRender(handle), 50);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
      continueRender(handle);
    };
  }, [frame]);
  return null;
};
