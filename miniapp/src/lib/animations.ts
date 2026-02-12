/**
 * Animation and Effects Pipeline for Based Intern Agent Visualization
 * 
 * Provides:
 * - CSS keyframe animations for agent nodes
 * - Effect triggers and sequencing
 * - Animation state management
 * - Performance-optimized transforms
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type AnimationType = 
  | 'pulse-slow'
  | 'pulse-medium' 
  | 'pulse-fast'
  | 'pulse-intense'
  | 'shake'
  | 'glow'
  | 'ripple'
  | 'float'
  | 'none';

export type EffectType =
  | 'particle-burst'
  | 'connection-flash'
  | 'status-change'
  | 'trade-execute'
  | 'error-flash'
  | 'success-ring';

export interface AnimationConfig {
  type: AnimationType;
  duration?: number;
  delay?: number;
  iterations?: number;
  easing?: string;
}

export interface EffectConfig {
  type: EffectType;
  intensity?: number;
  color?: string;
  duration?: number;
  position?: { x: number; y: number };
}

// ============================================================================
// CSS Keyframe Definitions
// ============================================================================

export const AGENT_NODE_ANIMATIONS = `
/* Slow pulse for idle state */
@keyframes pulse-slow {
  0%, 100% {
    transform: scale(1);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.5;
  }
}

/* Medium pulse for thinking state */
@keyframes pulse-medium {
  0%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.7;
  }
}

/* Fast pulse for active state */
@keyframes pulse-fast {
  0%, 100% {
    transform: scale(1);
    opacity: 0.5;
    filter: brightness(1);
  }
  50% {
    transform: scale(1.15);
    opacity: 0.9;
    filter: brightness(1.2);
  }
}

/* Intense pulse for trading state */
@keyframes pulse-intense {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
    filter: brightness(1) saturate(1);
  }
  25% {
    transform: scale(1.1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
    filter: brightness(1.3) saturate(1.2);
  }
  75% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

/* Shake animation for error state */
@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  10%, 30%, 50%, 70%, 90% {
    transform: translateX(-3px);
  }
  20%, 40%, 60%, 80% {
    transform: translateX(3px);
  }
}

/* Glow pulse effect */
@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 5px currentColor, 0 0 10px currentColor;
  }
  50% {
    box-shadow: 0 0 20px currentColor, 0 0 40px currentColor, 0 0 60px currentColor;
  }
}

/* Ripple expansion */
@keyframes ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

/* Floating animation */
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* Connection line dash animation */
@keyframes dash-flow {
  0% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -20;
  }
}

/* Particle fade and move */
@keyframes particle-fade {
  0% {
    opacity: 1;
    transform: scale(1) translate(0, 0);
  }
  100% {
    opacity: 0;
    transform: scale(0) translate(var(--tx, 50px), var(--ty, 50px));
  }
}

/* Success ring expansion */
@keyframes success-ring {
  0% {
    transform: scale(0.8);
    opacity: 1;
    border-width: 4px;
  }
  100% {
    transform: scale(2);
    opacity: 0;
    border-width: 0;
  }
}

/* Trade execution flash */
@keyframes trade-flash {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(16, 185, 129, 0.3);
  }
}
`;

// ============================================================================
// Animation Utility Hooks
// ============================================================================

/**
 * Hook to manage animation classes with cleanup
 */
export function useAnimation(
  config: AnimationConfig,
  deps: React.DependencyList = []
) {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || config.type === 'none') return;

    // Apply animation
    element.style.animation = `${config.type} ${config.duration || 2}s ${config.easing || 'ease-in-out'} ${config.iterations || 'infinite'}`;
    if (config.delay) {
      element.style.animationDelay = `${config.delay}s`;
    }

    return () => {
      element.style.animation = '';
      element.style.animationDelay = '';
    };
  }, [config, ...deps]);

  return elementRef;
}

/**
 * Hook to trigger one-off effects
 */
export function useEffectTrigger() {
  const triggersRef = useRef<Map<string, () => void>>(new Map());

  const register = useCallback((id: string, callback: () => void) => {
    triggersRef.current.set(id, callback);
  }, []);

  const trigger = useCallback((id: string) => {
    const callback = triggersRef.current.get(id);
    if (callback) callback();
  }, []);

  const unregister = useCallback((id: string) => {
    triggersRef.current.delete(id);
  }, []);

  return { register, trigger, unregister };
}

/**
 * Hook for sequenced animations
 */
export function useAnimationSequence(
  steps: Array<{ id: string; animation: AnimationConfig; delay: number }>,
  onComplete?: () => void
) {
  const [currentStep, setCurrentStep] = useState(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const start = useCallback(() => {
    // Clear any existing timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setCurrentStep(0);

    // Schedule each step
    steps.forEach((step, index) => {
      const timeout = setTimeout(() => {
        setCurrentStep(index);
        if (index === steps.length - 1 && onComplete) {
          const completeTimeout = setTimeout(onComplete, (step.animation.duration || 1) * 1000);
          timeoutsRef.current.push(completeTimeout);
        }
      }, step.delay * 1000);
      timeoutsRef.current.push(timeout);
    });
  }, [steps, onComplete]);

  const reset = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setCurrentStep(0);
  }, []);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  return { currentStep, start, reset, currentAnimation: steps[currentStep]?.animation };
}

// ============================================================================
// Effect Renderers
// ============================================================================

/**
 * Create particle burst effect
 */
export function createParticleBurst(
  x: number,
  y: number,
  count: number = 12,
  color: string = '#0052FF'
): HTMLDivElement[] {
  const particles: HTMLDivElement[] = [];

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    const angle = (i / count) * Math.PI * 2;
    const distance = 50 + Math.random() * 50;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;

    particle.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${4 + Math.random() * 4}px;
      height: ${4 + Math.random() * 4}px;
      background-color: ${color};
      border-radius: 50%;
      pointer-events: none;
      z-index: 9999;
      --tx: ${tx}px;
      --ty: ${ty}px;
      animation: particle-fade 0.8s ease-out forwards;
    `;

    document.body.appendChild(particle);
    particles.push(particle);

    // Cleanup
    setTimeout(() => particle.remove(), 800);
  }

  return particles;
}

/**
 * Create ripple effect
 */
export function createRipple(
  x: number,
  y: number,
  color: string = '#0052FF'
): HTMLDivElement {
  const ripple = document.createElement('div');
  
  ripple.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 20px;
    height: 20px;
    border: 2px solid ${color};
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 9998;
    animation: ripple 0.6s ease-out forwards;
  `;

  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);

  return ripple;
}

/**
 * Create success ring effect
 */
export function createSuccessRing(
  element: HTMLElement,
  color: string = '#10B981'
): HTMLDivElement {
  const rect = element.getBoundingClientRect();
  const ring = document.createElement('div');

  ring.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top + rect.height / 2}px;
    width: ${Math.max(rect.width, rect.height)}px;
    height: ${Math.max(rect.width, rect.height)}px;
    border: 3px solid ${color};
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 9997;
    animation: success-ring 0.5s ease-out forwards;
  `;

  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 500);

  return ring;
}

// ============================================================================
// Performance Utilities
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Throttle animation frames for performance
 */
export function throttleRAF<T extends (...args: unknown[]) => void>(
  callback: T,
  fps: number = 30
): T {
  let lastTime = 0;
  const interval = 1000 / fps;

  return ((...args: unknown[]) => {
    const now = performance.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      callback(...args);
    }
  }) as T;
}

/**
 * Batch multiple DOM reads/writes for performance
 */
export function batchDOMUpdates(
  reads: (() => void)[],
  writes: (() => void)[]
): void {
  // First, all reads
  reads.forEach(read => read());
  
  // Then, schedule writes on next frame
  requestAnimationFrame(() => {
    writes.forEach(write => write());
  });
}

// ============================================================================
// Status-based Animation Mapping
// ============================================================================

export const STATUS_ANIMATIONS: Record<string, AnimationConfig> = {
  idle: { type: 'pulse-slow', duration: 3 },
  thinking: { type: 'pulse-medium', duration: 1.5 },
  active: { type: 'pulse-fast', duration: 1 },
  trading: { type: 'pulse-intense', duration: 0.8 },
  error: { type: 'shake', duration: 0.5, iterations: 3 },
  offline: { type: 'none' },
};

export const STATUS_COLORS: Record<string, string> = {
  idle: '#64748B',
  thinking: '#8B5CF6',
  active: '#0052FF',
  trading: '#10B981',
  error: '#EF4444',
  offline: '#374151',
};

export function getAnimationForStatus(status: string): AnimationConfig {
  return STATUS_ANIMATIONS[status] || { type: 'none' };
}

export function getColorForStatus(status: string): string {
  return STATUS_COLORS[status] || '#64748B';
}

// ============================================================================
// Export CSS for injection
// ============================================================================

export function injectAnimationStyles(): void {
  if (typeof document === 'undefined') return;
  
  const styleId = 'agent-node-animations';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = AGENT_NODE_ANIMATIONS;
  document.head.appendChild(style);
}

// Auto-inject on import
if (typeof document !== 'undefined') {
  injectAnimationStyles();
}
