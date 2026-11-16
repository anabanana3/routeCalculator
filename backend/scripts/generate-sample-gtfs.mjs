// Genera un feed GTFS ficticio de ejemplo en data/gtfs-sample (centro de Madrid).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve('data/gtfs-sample');
mkdirSync(out, { recursive: true });

const files = {
  'agency.txt': `agency_id,agency_name,agency_url,agency_timezone,agency_lang
DEMO,Transportes Demo,https://example.com,Europe/Madrid,es
`,
  'stops.txt': `stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station
S1,101,Sol,40.4169,-3.7035,0,
S2,102,Callao,40.4200,-3.7058,0,
S3,103,Plaza de España,40.4233,-3.7122,0,
S4,104,Ópera,40.4180,-3.7096,0,
S5,105,Tirso de Molina,40.4124,-3.7046,0,
S6,106,Atocha,40.4066,-3.6907,0,
S7,107,Cibeles,40.4193,-3.6930,0,
S8,108,Retiro,40.4200,-3.6830,0,
S9,109,Gran Vía,40.4197,-3.7016,0,
S10,110,Lavapiés,40.4089,-3.7010,0,
S11,111,Príncipe Pío,40.4210,-3.7200,0,
S12,112,Embajadores,40.4045,-3.7030,0,
`,
  'routes.txt': `route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color
L1,DEMO,1,Príncipe Pío - Retiro,3,D32F2F,FFFFFF
L2,DEMO,2,Ópera - Embajadores,3,1976D2,FFFFFF
L3,DEMO,T3,Plaza de España - Atocha,0,388E3C,FFFFFF
`,
  'calendar.txt': `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
ALL,1,1,1,1,1,1,1,20240101,20301231
`,
  'trips.txt': `route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
L1,ALL,L1_0,Retiro,0,SH_L1_0
L1,ALL,L1_1,Príncipe Pío,1,SH_L1_1
L2,ALL,L2_0,Embajadores,0,
L2,ALL,L2_1,Ópera,1,
L2,ALL,L2_N,Embajadores (nocturno),0,
L3,ALL,L3_0,Atocha,0,
L3,ALL,L3_1,Plaza de España,1,
`,
  'frequencies.txt': `trip_id,start_time,end_time,headway_secs
L1_0,06:00:00,24:00:00,600
L1_1,06:05:00,24:00:00,600
L2_0,06:00:00,23:30:00,720
L2_1,06:02:00,23:30:00,720
L3_0,06:00:00,24:00:00,900
L3_1,06:07:00,24:00:00,900
`,
};

const coords = {
  S1: [40.4169, -3.7035], S2: [40.42, -3.7058], S3: [40.4233, -3.7122], S4: [40.418, -3.7096],
  S5: [40.4124, -3.7046], S6: [40.4066, -3.6907], S7: [40.4193, -3.693], S8: [40.42, -3.683],
  S9: [40.4197, -3.7016], S10: [40.4089, -3.701], S11: [40.421, -3.72], S12: [40.4045, -3.703],
};

// [parada, minutos desde el inicio del viaje]
const seq = {
  L1: [['S11', 0], ['S3', 3], ['S2', 6], ['S9', 8], ['S7', 12], ['S8', 16]],
  L2: [['S4', 0], ['S1', 3], ['S5', 6], ['S10', 9], ['S12', 12]],
  L3: [['S3', 0], ['S4', 3], ['S1', 6], ['S7', 10], ['S6', 14]],
};
const reverse = (list) => {
  const total = list[list.length - 1][1];
  return [...list].reverse().map(([s, t]) => [s, total - t]);
};
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

let stopTimes = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n';
const addTrip = (tripId, list, startMin) =>
  list.forEach(([stop, t], i) => {
    const time = fmt(startMin + t);
    stopTimes += `${tripId},${time},${time},${stop},${i + 1}\n`;
  });
addTrip('L1_0', seq.L1, 360);
addTrip('L1_1', reverse(seq.L1), 365);
addTrip('L2_0', seq.L2, 360);
addTrip('L2_1', reverse(seq.L2), 362);
addTrip('L2_N', seq.L2, 24 * 60 + 30); // viaje nocturno con horario > 24h
addTrip('L3_0', seq.L3, 360);
addTrip('L3_1', reverse(seq.L3), 367);
files['stop_times.txt'] = stopTimes;

// Shape de la línea 1 con puntos intermedios ligeramente desviados para que se aprecie el trazado.
const pts = seq.L1.map(([s]) => coords[s]);
const dense = [];
for (let i = 0; i < pts.length - 1; i++) {
  const [a, b] = [pts[i], pts[i + 1]];
  for (let k = 0; k < 4; k++) {
    const f = k / 4;
    dense.push([a[0] + (b[0] - a[0]) * f + (k === 2 ? 0.0006 : 0), a[1] + (b[1] - a[1]) * f]);
  }
}
dense.push(pts[pts.length - 1]);
let shapes = 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n';
dense.forEach((p, i) => (shapes += `SH_L1_0,${p[0].toFixed(6)},${p[1].toFixed(6)},${i + 1}\n`));
[...dense].reverse().forEach((p, i) => (shapes += `SH_L1_1,${p[0].toFixed(6)},${p[1].toFixed(6)},${i + 1}\n`));
files['shapes.txt'] = shapes;

for (const [name, content] of Object.entries(files)) writeFileSync(path.join(out, name), content);
console.log(`GTFS de ejemplo generado en ${out}`);
