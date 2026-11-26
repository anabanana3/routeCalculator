import type { TransitNetwork } from '../network/model.js';
import type { RealtimeConnections } from '../realtime/realtime-index.js';
import { SECONDS_PER_DAY } from '../time/service-time.js';

export const INF = 0x3fffffff;

/** Parada alcanzable a pie desde el origen o hacia el destino. */
export interface Access {
  stop: number;
  seconds: number;
  meters: number;
}

/**
 * Tramo en vehículo: conexiones de subida y bajada. Si realtime=true son índices
 * de RealtimeConnections; si no, de TransitNetwork.connections.
 */
export type RawLeg =
  | { kind: 'access'; toStop: number; seconds: number; meters: number }
  | { kind: 'egress'; fromStop: number; seconds: number; meters: number }
  | { kind: 'transfer'; fromStop: number; toStop: number; seconds: number; meters: number }
  | { kind: 'transit'; board: number; alight: number; shift: number; realtime?: true };

export interface RawJourney {
  legs: RawLeg[];
  /** Hora de llegada al destino (segundos desde la base del día de servicio). */
  arrival: number;
}

/** Datos en tiempo real para el escaneo. */
export interface RealtimeScan {
  connections: RealtimeConnections;
  /** Nº de viajes con datos en tiempo real (RealtimeIndex.instances). */
  instanceCount: number;
  /** epoch s de la base del día de servicio consultado. */
  baseSec: number;
  /** Viajes sustituidos por sus datos en tiempo real para el día anterior, el consultado y el siguiente. */
  replaced: [Uint8Array, Uint8Array, Uint8Array];
}

export interface ScanParams {
  /** Hora de salida en segundos desde la base del día de servicio consultado. */
  departure: number;
  access: Access[];
  egress: Map<number, Access>;
  /** Servicios activos para el día anterior, el consultado y el siguiente. */
  activeByDayOffset: [Uint8Array, Uint8Array, Uint8Array];
  minTransferSeconds: number;
  maxSearchSeconds: number;
  realtime?: RealtimeScan;
}

export function lowerBound(arr: Int32Array | Float64Array, count: number, value: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Connection Scan Algorithm (llegada más temprana).
 * Recorre las conexiones ordenadas por hora de salida mezclando tres "flujos":
 * los servicios del día anterior (horarios > 24h), del día consultado y del siguiente.
 * Con datos en tiempo real hay un cuarto flujo con las horas previstas de los viajes
 * que los tienen, y esos viajes se omiten en los flujos programados.
 */
export function scanEarliestArrival(data: TransitNetwork, p: ScanParams): RawJourney | null {
  const C = data.connections;
  const nStops = data.stops.length;
  const rt = p.realtime;
  const R = rt?.connections;
  const baseSec = rt?.baseSec ?? 0;

  const arrival = new Int32Array(nStops).fill(INF);
  const viaConn = new Int32Array(nStops).fill(-1);
  const viaBoard = new Int32Array(nStops).fill(-1);
  const viaShift = new Int32Array(nStops);
  const viaRealtime = new Uint8Array(nStops);
  const viaFoot = new Int32Array(nStops).fill(-1);
  const viaFootSec = new Int32Array(nStops);
  const viaFootMeters = new Int32Array(nStops);
  const tripBoard = new Int32Array(data.trips.length * 3).fill(-1);
  const rtBoard = new Int32Array(rt?.instanceCount ?? 0).fill(-1);

  const accessByStop = new Map<number, Access>();
  for (const a of p.access) {
    const t = p.departure + a.seconds;
    if (t < arrival[a.stop]) {
      arrival[a.stop] = t;
      accessByStop.set(a.stop, a);
    }
  }

  let best = INF;
  let bestStop = -1;
  const limit = p.departure + p.maxSearchSeconds;

  const streams = [-1, 0, 1].map((offset, k) => {
    const shift = offset * SECONDS_PER_DAY;
    return {
      shift,
      active: p.activeByDayOffset[k],
      replaced: rt?.replaced[k],
      pos: lowerBound(C.depTime, C.count, p.departure - shift),
    };
  });
  let rpos = R ? lowerBound(R.depTime, R.count, p.departure + baseSec) : 0;

  const relaxEgress = (stop: number, time: number) => {
    const eg = p.egress.get(stop);
    if (eg && time + eg.seconds < best) {
      best = time + eg.seconds;
      bestStop = stop;
    }
  };

  for (;;) {
    let sel = -1;
    let selTime = INF;
    for (let k = 0; k < 3; k++) {
      const s = streams[k];
      const replaced = s.replaced;
      while (
        s.pos < C.count &&
        (s.active[data.tripService[C.trip[s.pos]]] === 0 || (replaced !== undefined && replaced[C.trip[s.pos]] === 1))
      ) {
        s.pos++;
      }
      if (s.pos < C.count) {
        const t = C.depTime[s.pos] + s.shift;
        if (t < selTime) {
          selTime = t;
          sel = k;
        }
      }
    }
    if (R && rpos < R.count) {
      const t = R.depTime[rpos] - baseSec;
      if (t < selTime) {
        selTime = t;
        sel = 3;
      }
    }
    if (sel === -1 || selTime >= best || selTime > limit) break;

    let c: number;
    let ds: number;
    let as: number;
    let at: number;
    let boards: Int32Array;
    let key: number;
    let shift = 0;
    if (sel === 3) {
      c = rpos++;
      ds = R!.depStop[c];
      as = R!.arrStop[c];
      at = R!.arrTime[c] - baseSec;
      boards = rtBoard;
      key = R!.instance[c];
    } else {
      const stream = streams[sel];
      c = stream.pos++;
      ds = C.depStop[c];
      as = C.arrStop[c];
      shift = stream.shift;
      at = C.arrTime[c] + shift;
      boards = tripBoard;
      key = C.trip[c] * 3 + sel;
    }
    let board = boards[key];

    if (board === -1) {
      const a = arrival[ds];
      if (a !== INF) {
        // Se exige un tiempo mínimo de transbordo si se llega en otro vehículo a la misma parada.
        const slack = viaConn[ds] !== -1 ? p.minTransferSeconds : 0;
        if (a + slack <= selTime) {
          board = c;
          boards[key] = c;
        }
      }
    }
    if (board === -1) continue;

    if (at >= arrival[as]) continue;

    arrival[as] = at;
    viaConn[as] = c;
    viaBoard[as] = board;
    viaShift[as] = shift;
    viaRealtime[as] = sel === 3 ? 1 : 0;
    viaFoot[as] = -1;
    accessByStop.delete(as);
    relaxEgress(as, at);

    for (const fp of data.footpaths[as]) {
      const ft = at + fp.seconds;
      if (ft < arrival[fp.to]) {
        arrival[fp.to] = ft;
        viaConn[fp.to] = -1;
        viaFoot[fp.to] = as;
        viaFootSec[fp.to] = fp.seconds;
        viaFootMeters[fp.to] = fp.meters;
        accessByStop.delete(fp.to);
        relaxEgress(fp.to, ft);
      }
    }
  }

  if (bestStop === -1) return null;

  // Reconstrucción del viaje hacia atrás.
  const legs: RawLeg[] = [];
  const eg = p.egress.get(bestStop)!;
  legs.push({ kind: 'egress', fromStop: bestStop, seconds: eg.seconds, meters: eg.meters });
  let s = bestStop;
  for (let guard = 0; guard < 1000; guard++) {
    if (viaConn[s] !== -1) {
      const board = viaBoard[s];
      if (viaRealtime[s]) {
        legs.push({ kind: 'transit', board, alight: viaConn[s], shift: 0, realtime: true });
        s = R!.depStop[board];
      } else {
        legs.push({ kind: 'transit', board, alight: viaConn[s], shift: viaShift[s] });
        s = C.depStop[board];
      }
    } else if (viaFoot[s] !== -1) {
      legs.push({ kind: 'transfer', fromStop: viaFoot[s], toStop: s, seconds: viaFootSec[s], meters: viaFootMeters[s] });
      s = viaFoot[s];
    } else {
      const a = accessByStop.get(s);
      if (!a) return null;
      legs.push({ kind: 'access', toStop: s, seconds: a.seconds, meters: a.meters });
      break;
    }
  }
  legs.reverse();
  return { legs, arrival: best };
}
