import { useState, useEffect } from 'react';

export type GPUTier = 'high' | 'medium' | 'low';

export interface GPUTierConfig {
  particleCount: number;
  enableBloom: boolean;
  enablePostProcessing: boolean;
  shadowQuality: 'high' | 'medium' | 'low' | 'none';
  geometryDetail: number;
}

const TIER_CONFIGS: Record<GPUTier, GPUTierConfig> = {
  high: {
    particleCount: 5000,
    enableBloom: true,
    enablePostProcessing: true,
    shadowQuality: 'high',
    geometryDetail: 64,
  },
  medium: {
    particleCount: 3000,
    enableBloom: true,
    enablePostProcessing: false,
    shadowQuality: 'medium',
    geometryDetail: 32,
  },
  low: {
    particleCount: 1500,
    enableBloom: false,
    enablePostProcessing: false,
    shadowQuality: 'none',
    geometryDetail: 16,
  },
};

export function useGPUTier(): { tier: GPUTier; config: GPUTierConfig } {
  const [tier, setTier] = useState<GPUTier>('medium');

  useEffect(() => {
    const detectGPUTier = () => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl) {
          setTier('low');
          return;
        }

        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) {
          setTier('medium');
          return;
        }

        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

        // High-end GPU detection
        const highEndPatterns = [
          /RTX\s*(30|40|50)/i,
          /RX\s*(6[89]|7)/i,
          /M[1-4]\s*(Pro|Max|Ultra)?/i,
          /A[1-2][0-9]\s*(Pro|Max)?/i,
          /GeForce\s*GTX\s*(1080|1070)/i,
          /Radeon\s*RX\s*5[89]/i,
          /Intel.*Arc/i,
        ];

        // Mid-range GPU detection
        const midRangePatterns = [
          /GTX\s*(1060|1650|1660)/i,
          /RX\s*(5[56]|6[0-5])/i,
          /Intel.*Iris\s*(Plus|Xe)/i,
          /Radeon\s*(Pro\s*)?5[0-5]/i,
          /GeForce\s*MX/i,
        ];

        const rendererStr = `${vendor} ${renderer}`.toLowerCase();

        if (highEndPatterns.some(pattern => pattern.test(rendererStr))) {
          setTier('high');
        } else if (midRangePatterns.some(pattern => pattern.test(rendererStr))) {
          setTier('medium');
        } else {
          // Check for integrated graphics as low tier
          if (/intel.*hd|integrated|mali|adreno/i.test(rendererStr)) {
            setTier('low');
          } else {
            // Default to medium if we can't determine
            setTier('medium');
          }
        }

        // Also check device memory if available
        if ('deviceMemory' in navigator) {
          const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
          if (memory && memory < 4) {
            setTier('low');
          }
        }

        canvas.remove();
      } catch (error) {
        console.warn('GPU detection failed, defaulting to medium tier:', error);
        setTier('medium');
      }
    };

    detectGPUTier();
  }, []);

  return { tier, config: TIER_CONFIGS[tier] };
}

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
