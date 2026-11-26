import L from 'leaflet';
import { DESTINATION_COLOR, ORIGIN_COLOR } from '../../../domain/itinerary';

/** Solo colores hexadecimales: el valor acaba dentro de HTML del marcador. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function pinHtml(color: string): string {
  if (!HEX_COLOR.test(color)) throw new Error(`Color no válido: ${color}`);
  return `
    <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11.6 16 26 16 26s16-14.4 16-26C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>`;
}

export const originIcon = L.divIcon({
  className: 'map-pin',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${ORIGIN_COLOR};border:4px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export const destinationIcon = L.divIcon({
  className: 'map-pin',
  html: pinHtml(DESTINATION_COLOR),
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

/** Vehículo: círculo del color de la línea con una flecha hacia donde se mueve (si se conoce). */
export function vehicleHtml(color: string, bearing?: number): string {
  if (!HEX_COLOR.test(color)) throw new Error(`Color no válido: ${color}`);
  const arrow =
    bearing !== undefined && Number.isFinite(bearing)
      ? `<div style="position:absolute;inset:-8px;transform:rotate(${Math.round(bearing) % 360}deg)">` +
        `<div style="margin:0 auto;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:7px solid ${color}"></div></div>`
      : '';
  return (
    `<div style="position:relative;width:22px;height:22px">${arrow}` +
    `<div style="width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div></div>`
  );
}

const vehicleIcons = new Map<string, L.DivIcon>();

export function vehicleIcon(color: string, bearing?: number): L.DivIcon {
  const key = `${color}|${bearing === undefined ? '' : Math.round(bearing)}`;
  let icon = vehicleIcons.get(key);
  if (!icon) {
    icon = L.divIcon({ className: 'vehicle-marker', html: vehicleHtml(color, bearing), iconSize: [22, 22], iconAnchor: [11, 11] });
    vehicleIcons.set(key, icon);
  }
  return icon;
}
