import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '../../src/application/hooks/useNow';
import { ServicesProvider, useServices } from '../../src/application/services';
import { fakeApi, fakeGeolocation } from '../fixtures';

describe('useNow', () => {
  afterEach(() => vi.useRealTimers());

  it('se actualiza periódicamente y limpia el intervalo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { result, unmount } = renderHook(() => useNow(5000));
    expect(result.current).toBe(1000);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(6000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('por defecto cada 30 s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(30_000);
  });
});

describe('ServicesProvider / useServices', () => {
  it('expone los servicios inyectados', () => {
    const services = { api: fakeApi(), geolocation: fakeGeolocation() };
    function Probe() {
      return <span>{useServices() === services ? 'ok' : 'ko'}</span>;
    }
    render(
      <ServicesProvider services={services}>
        <Probe />
      </ServicesProvider>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('falla fuera del proveedor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useServices())).toThrow(/ServicesProvider/);
  });
});
