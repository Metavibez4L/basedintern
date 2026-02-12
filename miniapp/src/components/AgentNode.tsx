'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface AgentNodeProps {
  /** Unique identifier for the agent node */
  id: string;
  /** Agent name or label */
  label?: string;
  /** Agent status affecting visual state */
  status: 'idle' | 'thinking' | 'active' | 'trading' | 'error' | 'offline';
  /** Node size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional pulse intensity (0-1) */
  pulseIntensity?: number;
  /** Custom className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Position for absolute positioning */
  position?: { x: number; y: number };
  /** Connection targets for drawing lines */
  connections?: string[];
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/**
 * AgentNode - Animated visual representation of an AI agent
 * 
 * Features:
 * - Status-based color coding and animation
 * - Particle emission effects for active states
 * - Pulsing glow animations
 * - Connection line rendering
 * - Hover and interaction states
 */
export const AgentNode: React.FC<AgentNodeProps> = ({
  id,
  label = 'Agent',
  status,
  size = 'md',
  pulseIntensity = 0.5,
  className,
  onClick,
  position,
  connections = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const particleIdRef = useRef(0);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Status-based configuration
  const statusConfig = {
    idle: {
      color: '#64748B',
      glowColor: 'rgba(100, 116, 139, 0.3)',
      particleColor: '#94A3B8',
      animation: 'pulse-slow',
      emissionRate: 0,
    },
    thinking: {
      color: '#8B5CF6',
      glowColor: 'rgba(139, 92, 246, 0.5)',
      particleColor: '#A78BFA',
      animation: 'pulse-medium',
      emissionRate: 2,
    },
    active: {
      color: '#0052FF',
      glowColor: 'rgba(0, 82, 255, 0.6)',
      particleColor: '#60A5FA',
      animation: 'pulse-fast',
      emissionRate: 5,
    },
    trading: {
      color: '#10B981',
      glowColor: 'rgba(16, 185, 129, 0.7)',
      particleColor: '#34D399',
      animation: 'pulse-intense',
      emissionRate: 8,
    },
    error: {
      color: '#EF4444',
      glowColor: 'rgba(239, 68, 68, 0.6)',
      particleColor: '#F87171',
      animation: 'shake',
      emissionRate: 0,
    },
    offline: {
      color: '#374151',
      glowColor: 'rgba(55, 65, 81, 0.2)',
      particleColor: '#6B7280',
      animation: 'none',
      emissionRate: 0,
    },
  };

  const config = statusConfig[status];

  // Size configuration
  const sizeConfig = {
    sm: { node: 48, ring: 56, font: 'text-xs' },
    md: { node: 72, ring: 84, font: 'text-sm' },
    lg: { node: 96, ring: 112, font: 'text-base' },
  };

  const { node: nodeSize, ring: ringSize, font } = sizeConfig[size];

  // Particle emission
  const emitParticle = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    const newParticle: Particle = {
      id: particleIdRef.current++,
      x: 0,
      y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 60,
      maxLife: 60,
      size: 2 + Math.random() * 3,
      color: config.particleColor,
    };
    setParticles(prev => [...prev.slice(-20), newParticle]);
  }, [config.particleColor]);

  // Particle animation loop
  useEffect(() => {
    if (config.emissionRate === 0) {
      setParticles([]);
      return;
    }

    let lastEmit = 0;
    const animate = (timestamp: number) => {
      // Emit new particles based on rate
      if (timestamp - lastEmit > 1000 / config.emissionRate) {
        emitParticle();
        lastEmit = timestamp;
      }

      // Update particles
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            life: p.life - 1,
            vx: p.vx * 0.98,
            vy: p.vy * 0.98,
          }))
          .filter(p => p.life > 0)
      );

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [config.emissionRate, emitParticle]);

  // Status indicator dots
  const renderStatusDots = () => {
    const dotCount = status === 'active' ? 3 : status === 'thinking' ? 2 : 1;
    return (
      <div className="absolute -bottom-1 -right-1 flex gap-0.5">
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'block w-2 h-2 rounded-full animate-ping',
              status === 'trading' && 'bg-emerald-400',
              status === 'active' && 'bg-blue-400',
              status === 'thinking' && 'bg-violet-400',
              status === 'idle' && 'bg-slate-400'
            )}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      ref={nodeRef}
      data-testid={`agent-node-${id}`}
      className={cn(
        'relative inline-flex flex-col items-center gap-2',
        'transition-transform duration-300',
        isHovered && 'scale-110',
        onClick && 'cursor-pointer',
        className
      )}
      style={position ? { position: 'absolute', left: position.x, top: position.y } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      data-agent-id={id}
      data-agent-status={status}
    >
      {/* Outer glow ring */}
      <div
        className={cn(
          'absolute rounded-full transition-all duration-500',
          config.animation === 'pulse-slow' && 'animate-pulse-slow',
          config.animation === 'pulse-medium' && 'animate-pulse-medium',
          config.animation === 'pulse-fast' && 'animate-pulse-fast',
          config.animation === 'pulse-intense' && 'animate-pulse-intense',
          config.animation === 'shake' && 'animate-shake'
        )}
        style={{
          width: ringSize,
          height: ringSize,
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          opacity: pulseIntensity,
        }}
      />

      {/* Particle canvas */}
      {particles.length > 0 && (
        <canvas
          ref={canvasRef}
          width={nodeSize * 3}
          height={nodeSize * 3}
          className="absolute pointer-events-none"
          style={{
            width: nodeSize * 3,
            height: nodeSize * 3,
            left: -nodeSize,
            top: -nodeSize,
          }}
        />
      )}

      {/* Main node circle */}
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'border-2 border-white/20 backdrop-blur-sm',
          'transition-all duration-300',
          isHovered && 'border-white/40 shadow-lg'
        )}
        style={{
          width: nodeSize,
          height: nodeSize,
          background: `linear-gradient(135deg, ${config.color}20 0%, ${config.color}40 100%)`,
          boxShadow: `0 0 ${20 * pulseIntensity}px ${config.color}40, inset 0 0 20px ${config.color}20`,
        }}
      >
        {/* Inner gradient orb */}
        <div
          className={cn(
            'w-3/4 h-3/4 rounded-full',
            'bg-gradient-to-br from-white/30 to-transparent'
          )}
          style={{
            background: `radial-gradient(circle at 30% 30%, ${config.color}60, ${config.color}20)`,
          }}
        />

        {/* Status dots */}
        {status !== 'idle' && status !== 'offline' && renderStatusDots()}

        {/* Particles rendered as DOM elements for better performance */}
        {particles.map(particle => (
          <span
            key={particle.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              left: `calc(50% + ${particle.x}px)`,
              top: `calc(50% + ${particle.y}px)`,
              opacity: particle.life / particle.maxLife,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
            }}
          />
        ))}
      </div>

      {/* Label */}
      {label && (
        <span
          className={cn(
            font,
            'font-medium text-white/90 whitespace-nowrap',
            'transition-opacity duration-300',
            isHovered ? 'opacity-100' : 'opacity-80'
          )}
        >
          {label}
        </span>
      )}

      {/* Status badge */}
      <span
        className={cn(
          'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full',
          'bg-black/30 text-white/70 backdrop-blur-sm',
          'transition-all duration-300',
          isHovered && 'bg-black/50 text-white/90'
        )}
      >
        {status}
      </span>
    </div>
  );
};

/**
 * AgentNodeGrid - Grid layout for multiple agent nodes with connection lines
 */
export interface AgentNodeGridProps {
  nodes: AgentNodeProps[];
  showConnections?: boolean;
  className?: string;
}

export const AgentNodeGrid: React.FC<AgentNodeGridProps> = ({
  nodes,
  showConnections = true,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; color: string }>>([]);

  // Calculate connection lines
  useEffect(() => {
    if (!showConnections) return;

    const calculateLines = () => {
      const newLines: typeof lines = [];
      
      nodes.forEach((node, i) => {
        if (!node.connections) return;
        
        const sourceEl = document.querySelector(`[data-agent-id="${node.id}"]`);
        if (!sourceEl) return;
        
        const sourceRect = sourceEl.getBoundingClientRect();
        const containerRect = svgRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left;
        const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;

        node.connections.forEach(targetId => {
          const targetEl = document.querySelector(`[data-agent-id="${targetId}"]`);
          if (!targetEl) return;
          
          const targetRect = targetEl.getBoundingClientRect();
          const x2 = targetRect.left + targetRect.width / 2 - containerRect.left;
          const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

          newLines.push({
            x1, y1, x2, y2,
            color: node.status === 'active' ? '#0052FF' : '#64748B',
          });
        });
      });

      setLines(newLines);
    };

    calculateLines();
    window.addEventListener('resize', calculateLines);
    return () => window.removeEventListener('resize', calculateLines);
  }, [nodes, showConnections]);

  return (
    <div className={cn('relative', className)}>
      {/* Connection lines SVG */}
      {showConnections && (
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        >
          {lines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.4}
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="8"
                dur="1s"
                repeatCount="indefinite"
              />
            </line>
          ))}
        </svg>
      )}

      {/* Nodes */}
      <div className="relative z-10 flex flex-wrap gap-8 justify-center items-center p-8">
        {nodes.map(node => (
          <AgentNode key={node.id} {...node} />
        ))}
      </div>
    </div>
  );
};

export default AgentNode;
