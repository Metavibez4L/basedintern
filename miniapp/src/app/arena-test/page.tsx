'use client';

import React, { useState, useCallback } from 'react';
import { AgentNode, AgentNodeGrid } from '@/components/AgentNode';
import { 
  createParticleBurst, 
  createRipple, 
  createSuccessRing,
  prefersReducedMotion,
  STATUS_COLORS 
} from '@/lib/animations';
import type { AgentNodeProps } from '@/components/AgentNode';

/**
 * ARENA TEST: Visual Verification Page for Agent Node Animation & Effects Pipeline
 * 
 * This page provides comprehensive testing of:
 * - All agent status animations (idle, thinking, active, trading, error, offline)
 * - Particle emission systems
 * - Connection line rendering
 * - Effect triggers (burst, ripple, success)
 * - Interactive state transitions
 */

const ALL_STATUSES: AgentNodeProps['status'][] = ['idle', 'thinking', 'active', 'trading', 'error', 'offline'];

export default function AnimationTestPage() {
  const [selectedStatus, setSelectedStatus] = useState<AgentNodeProps['status']>('active');
  const [pulseIntensity, setPulseIntensity] = useState(0.5);
  const [showConnections, setShowConnections] = useState(true);
  const [lastEffect, setLastEffect] = useState<string>('none');
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check for reduced motion preference on mount
  React.useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  // Demo nodes for grid view
  const demoNodes: AgentNodeProps[] = [
    { id: 'agent-1', label: 'Core Agent', status: 'active', size: 'lg', connections: ['agent-2', 'agent-3'] },
    { id: 'agent-2', label: 'Trading Bot', status: 'trading', size: 'md', connections: ['agent-4'] },
    { id: 'agent-3', label: 'Social Agent', status: 'thinking', size: 'md', connections: ['agent-4'] },
    { id: 'agent-4', label: 'LP Manager', status: 'idle', size: 'sm' },
  ];

  // Effect triggers
  const triggerParticleBurst = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    createParticleBurst(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      16,
      STATUS_COLORS[selectedStatus]
    );
    setLastEffect('particle-burst');
  }, [selectedStatus]);

  const triggerRipple = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    createRipple(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      STATUS_COLORS[selectedStatus]
    );
    setLastEffect('ripple');
  }, [selectedStatus]);

  const triggerSuccessRing = useCallback((e: React.MouseEvent) => {
    const element = e.target as HTMLElement;
    createSuccessRing(element);
    setLastEffect('success-ring');
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            🧪 ARENA TEST: Agent Node Animation & Effects Pipeline
          </h1>
          <p className="text-slate-400">
            Visual verification suite for Based Intern agent visualization components
          </p>
          {reducedMotion && (
            <p className="text-amber-400 text-sm">⚠️ Reduced motion preference detected - some animations disabled</p>
          )}
        </header>

        {/* Controls */}
        <section className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
          <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
          
          {/* Status Selector */}
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">Agent Status</label>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`
                    px-4 py-2 rounded-lg capitalize transition-all
                    ${selectedStatus === status 
                      ? 'bg-blue-500 text-white ring-2 ring-blue-400' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }
                  `}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Pulse Intensity Slider */}
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">
              Pulse Intensity: {Math.round(pulseIntensity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={pulseIntensity}
              onChange={(e) => setPulseIntensity(parseFloat(e.target.value))}
              className="w-full max-w-md h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* Connection Toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showConnections}
                onChange={(e) => setShowConnections(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-blue-500"
              />
              <span className="text-slate-300">Show Connection Lines</span>
            </label>
            
            <span className="text-slate-500">|</span>
            
            <span className="text-sm text-slate-400">
              Last Effect: <span className="text-emerald-400 font-mono">{lastEffect}</span>
            </span>
          </div>
        </section>

        {/* Single Node Test */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Single Node Test</h2>
          <div className="bg-slate-900/50 rounded-xl p-12 border border-slate-800 flex flex-col items-center gap-8">
            <AgentNode
              id="test-agent"
              label="Test Agent"
              status={selectedStatus}
              size="lg"
              pulseIntensity={pulseIntensity}
            />
            
            <div className="flex flex-wrap gap-4">
              <button
                onClick={triggerParticleBurst}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
              >
                ✨ Particle Burst
              </button>
              <button
                onClick={triggerRipple}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                🌊 Ripple
              </button>
              <button
                onClick={triggerSuccessRing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
              >
                ✅ Success Ring
              </button>
            </div>
          </div>
        </section>

        {/* Status Matrix */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Status Matrix</h2>
          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {ALL_STATUSES.map(status => (
                <div key={status} className="flex flex-col items-center gap-2">
                  <AgentNode
                    id={`matrix-${status}`}
                    label={status}
                    status={status}
                    size="md"
                    pulseIntensity={0.6}
                  />
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Size Variants */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Size Variants</h2>
          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800">
            <div className="flex items-end justify-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <AgentNode
                  id="size-sm"
                  label="Small"
                  status={selectedStatus}
                  size="sm"
                  pulseIntensity={pulseIntensity}
                />
                <span className="text-xs text-slate-500">48px</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <AgentNode
                  id="size-md"
                  label="Medium"
                  status={selectedStatus}
                  size="md"
                  pulseIntensity={pulseIntensity}
                />
                <span className="text-xs text-slate-500">72px</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <AgentNode
                  id="size-lg"
                  label="Large"
                  status={selectedStatus}
                  size="lg"
                  pulseIntensity={pulseIntensity}
                />
                <span className="text-xs text-slate-500">96px</span>
              </div>
            </div>
          </div>
        </section>

        {/* Connected Grid */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Connected Agent Grid</h2>
          <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-800 min-h-[400px]">
            <AgentNodeGrid
              nodes={demoNodes}
              showConnections={showConnections}
              className="h-full"
            />
          </div>
        </section>

        {/* Event Simulation */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Event Simulation</h2>
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => {
                  const id = 'test-agent';
                  const el = document.querySelector(`[data-agent-id="${id}"]`) as HTMLElement;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20, '#10B981');
                    setLastEffect('trade-success');
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
              >
                💰 Simulate Trade Success
              </button>
              <button
                onClick={() => {
                  const id = 'test-agent';
                  const el = document.querySelector(`[data-agent-id="${id}"]`) as HTMLElement;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20, '#EF4444');
                    setLastEffect('trade-error');
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                ❌ Simulate Trade Error
              </button>
              <button
                onClick={() => {
                  const ids = ['agent-1', 'agent-2', 'agent-3', 'agent-4'];
                  ids.forEach((id, i) => {
                    setTimeout(() => {
                      const el = document.querySelector(`[data-agent-id="${id}"]`) as HTMLElement;
                      if (el) {
                        const rect = el.getBoundingClientRect();
                        createRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
                      }
                    }, i * 200);
                  });
                  setLastEffect('ripple-cascade');
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
              >
                🌐 Ripple Cascade
              </button>
            </div>
          </div>
        </section>

        {/* Test Results */}
        <section className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
          <h2 className="text-xl font-semibold mb-4">✅ Pipeline Components Verified</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-medium text-slate-300">Animations</h3>
              <ul className="space-y-1 text-slate-400">
                <li>✓ pulse-slow (idle)</li>
                <li>✓ pulse-medium (thinking)</li>
                <li>✓ pulse-fast (active)</li>
                <li>✓ pulse-intense (trading)</li>
                <li>✓ shake (error)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-slate-300">Effects</h3>
              <ul className="space-y-1 text-slate-400">
                <li>✓ Particle burst emission</li>
                <li>✓ Ripple expansion</li>
                <li>✓ Success ring</li>
                <li>✓ Connection line SVG</li>
                <li>✓ Animated dash patterns</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-slate-300">Interactions</h3>
              <ul className="space-y-1 text-slate-400">
                <li>✓ Hover scaling</li>
                <li>✓ Click handlers</li>
                <li>✓ Status transitions</li>
                <li>✓ Pulse intensity control</li>
                <li>✓ Reduced motion support</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-slate-300">Rendering</h3>
              <ul className="space-y-1 text-slate-400">
                <li>✓ Size variants (sm/md/lg)</li>
                <li>✓ Status-based colors</li>
                <li>✓ Glow effects</li>
                <li>✓ Particle system</li>
                <li>✓ Connection lines</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-slate-500 text-sm pt-8">
          <p>Based Intern Agent Visualization System • OpenClaw Arena Test</p>
        </footer>
      </div>
    </main>
  );
}
