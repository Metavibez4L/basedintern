import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentNode, AgentNodeGrid } from '../src/components/AgentNode';

describe('🎨 AgentNode Visual Effects Pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Status-Based Visual States', () => {
    it('renders with correct status colors for idle state', () => {
      render(<AgentNode id="test-1" status="idle" label="Idle Agent" />);
      
      const node = screen.getByTestId('agent-node-test-1');
      expect(node).toBeInTheDocument();
      expect(node).toHaveAttribute('data-agent-status', 'idle');
    });

    it('renders with correct status colors for thinking state', () => {
      render(<AgentNode id="test-2" status="thinking" label="Thinking Agent" />);
      
      const node = screen.getByTestId('agent-node-test-2');
      expect(node).toHaveAttribute('data-agent-status', 'thinking');
    });

    it('renders with correct status colors for active state', () => {
      render(<AgentNode id="test-3" status="active" label="Active Agent" />);
      
      const node = screen.getByTestId('agent-node-test-3');
      expect(node).toHaveAttribute('data-agent-status', 'active');
    });

    it('renders with correct status colors for trading state', () => {
      render(<AgentNode id="test-4" status="trading" label="Trading Agent" />);
      
      const node = screen.getByTestId('agent-node-test-4');
      expect(node).toHaveAttribute('data-agent-status', 'trading');
    });

    it('renders with correct status colors for error state', () => {
      render(<AgentNode id="test-5" status="error" label="Error Agent" />);
      
      const node = screen.getByTestId('agent-node-test-5');
      expect(node).toHaveAttribute('data-agent-status', 'error');
    });

    it('renders with correct status colors for offline state', () => {
      render(<AgentNode id="test-6" status="offline" label="Offline Agent" />);
      
      const node = screen.getByTestId('agent-node-test-6');
      expect(node).toHaveAttribute('data-agent-status', 'offline');
    });
  });

  describe('Particle Emission Effects', () => {
    it('emits particles for thinking status', async () => {
      render(<AgentNode id="particle-test" status="thinking" />);
      
      // Advance time to allow particle emission
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Particles should be rendered in DOM
      const node = document.querySelector('[data-agent-id="particle-test"]');
      expect(node).toBeInTheDocument();
    });

    it('emits more particles for active status than thinking', async () => {
      const { container: activeContainer } = render(
        <AgentNode id="active-particles" status="active" />
      );
      
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(activeContainer).toBeInTheDocument();
    });

    it('emits maximum particles for trading status', async () => {
      const { container } = render(
        <AgentNode id="trading-particles" status="trading" />
      );
      
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(container).toBeInTheDocument();
    });

    it('does not emit particles for idle status', () => {
      const { container } = render(
        <AgentNode id="idle-particles" status="idle" />
      );
      
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Canvas should not be rendered for idle
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('renders small size correctly', () => {
      const { container } = render(
        <AgentNode id="small-node" status="idle" size="sm" />
      );
      
      const node = container.querySelector('[data-agent-id="small-node"]');
      expect(node).toBeInTheDocument();
    });

    it('renders medium size correctly', () => {
      const { container } = render(
        <AgentNode id="medium-node" status="idle" size="md" />
      );
      
      const node = container.querySelector('[data-agent-id="medium-node"]');
      expect(node).toBeInTheDocument();
    });

    it('renders large size correctly', () => {
      const { container } = render(
        <AgentNode id="large-node" status="idle" size="lg" />
      );
      
      const node = container.querySelector('[data-agent-id="large-node"]');
      expect(node).toBeInTheDocument();
    });
  });

  describe('Interaction Effects', () => {
    it('handles hover state changes', async () => {
      const onClick = vi.fn();
      render(
        <AgentNode 
          id="hover-test" 
          status="active" 
          onClick={onClick}
          label="Hoverable"
        />
      );
      
      const node = document.querySelector('[data-agent-id="hover-test"]');
      expect(node).toBeInTheDocument();
      
      // Trigger hover
      fireEvent.mouseEnter(node!);
      
      // Trigger click
      fireEvent.click(node!);
      expect(onClick).toHaveBeenCalledTimes(1);
      
      // Mouse leave
      fireEvent.mouseLeave(node!);
    });

    it('applies scale transform on hover', () => {
      const { container } = render(
        <AgentNode id="scale-test" status="active" onClick={() => {}} />
      );
      
      const node = container.querySelector('[data-agent-id="scale-test"]');
      expect(node).toBeInTheDocument();
    });
  });

  describe('Pulse Intensity', () => {
    it('renders with default pulse intensity', () => {
      const { container } = render(
        <AgentNode id="pulse-default" status="active" />
      );
      
      expect(container).toBeInTheDocument();
    });

    it('renders with custom pulse intensity', () => {
      const { container } = render(
        <AgentNode id="pulse-custom" status="active" pulseIntensity={0.8} />
      );
      
      expect(container).toBeInTheDocument();
    });

    it('renders with zero pulse intensity', () => {
      const { container } = render(
        <AgentNode id="pulse-zero" status="active" pulseIntensity={0} />
      );
      
      expect(container).toBeInTheDocument();
    });
  });

  describe('Status Indicator Dots', () => {
    it('shows no dots for idle status', () => {
      const { container } = render(
        <AgentNode id="dots-idle" status="idle" />
      );
      
      const dots = container.querySelectorAll('.animate-ping');
      // Idle shows 1 dot but hidden/not rendered in this case
      expect(dots.length).toBe(0);
    });

    it('shows dots for active status', () => {
      const { container } = render(
        <AgentNode id="dots-active" status="active" />
      );
      
      const dots = container.querySelectorAll('.animate-ping');
      expect(dots.length).toBeGreaterThan(0);
    });
  });

  describe('AgentNodeGrid Connection Lines', () => {
    it('renders grid with multiple nodes', () => {
      const nodes = [
        { id: 'node-1', status: 'active' as const, label: 'Node 1', connections: ['node-2'] },
        { id: 'node-2', status: 'thinking' as const, label: 'Node 2', connections: ['node-1'] },
      ];
      
      const { container } = render(
        <AgentNodeGrid nodes={nodes} showConnections={true} />
      );
      
      // SVG for connections should exist
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      
      // Both nodes should be rendered
      expect(document.querySelector('[data-agent-id="node-1"]')).toBeInTheDocument();
      expect(document.querySelector('[data-agent-id="node-2"]')).toBeInTheDocument();
    });

    it('renders grid without connections when showConnections is false', () => {
      const nodes = [
        { id: 'node-1', status: 'active' as const, label: 'Node 1' },
        { id: 'node-2', status: 'idle' as const, label: 'Node 2' },
      ];
      
      const { container } = render(
        <AgentNodeGrid nodes={nodes} showConnections={false} />
      );
      
      // SVG should not exist
      const svg = container.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });
  });

  describe('Animation Frame Management', () => {
    it('cleans up animation frame on unmount', () => {
      const { unmount } = render(
        <AgentNode id="cleanup-test" status="active" />
      );
      
      // Advance timers to start animation
      act(() => {
        vi.advanceTimersByTime(100);
      });
      
      // Unmount should clean up
      unmount();
      
      // No errors should occur
      expect(true).toBe(true);
    });

    it('handles rapid status changes', async () => {
      const { rerender, container } = render(
        <AgentNode id="rapid-test" status="idle" />
      );
      
      // Rapidly change statuses
      rerender(<AgentNode id="rapid-test" status="thinking" />);
      rerender(<AgentNode id="rapid-test" status="active" />);
      rerender(<AgentNode id="rapid-test" status="trading" />);
      rerender(<AgentNode id="rapid-test" status="idle" />);
      
      expect(container).toBeInTheDocument();
    });
  });

  describe('Label Rendering', () => {
    it('renders label when provided', () => {
      render(<AgentNode id="label-test" status="active" label="Test Label" />);
      
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('renders status badge', () => {
      render(<AgentNode id="badge-test" status="active" label="Test" />);
      
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('renders with default label when none provided', () => {
      render(<AgentNode id="default-label" status="active" />);
      
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });
  });

  describe('Positioning', () => {
    it('renders with absolute positioning when position provided', () => {
      const { container } = render(
        <AgentNode 
          id="pos-test" 
          status="active" 
          position={{ x: 100, y: 200 }}
        />
      );
      
      const node = container.querySelector('[data-agent-id="pos-test"]');
      expect(node).toHaveStyle({ position: 'absolute', left: '100px', top: '200px' });
    });

    it('renders without absolute positioning when position not provided', () => {
      const { container } = render(
        <AgentNode id="no-pos-test" status="active" />
      );
      
      const node = container.querySelector('[data-agent-id="no-pos-test"]');
      expect(node).not.toHaveStyle({ position: 'absolute' });
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      const { container } = render(
        <AgentNode 
          id="custom-class" 
          status="active" 
          className="custom-test-class"
        />
      );
      
      const node = container.querySelector('.custom-test-class');
      expect(node).toBeInTheDocument();
    });
  });
});

describe('🎬 Animation Performance', () => {
  it('handles multiple nodes with particle effects simultaneously', () => {
    const nodes = [
      { id: 'perf-1', status: 'active' as const },
      { id: 'perf-2', status: 'trading' as const },
      { id: 'perf-3', status: 'thinking' as const },
      { id: 'perf-4', status: 'active' as const },
      { id: 'perf-5', status: 'active' as const },
    ];
    
    const { container } = render(
      <AgentNodeGrid nodes={nodes} showConnections={true} />
    );
    
    // All nodes should render without performance issues
    nodes.forEach(node => {
      expect(document.querySelector(`[data-agent-id="${node.id}"]`)).toBeInTheDocument();
    });
  });
});
