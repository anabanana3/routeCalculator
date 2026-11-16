import L from 'leaflet';

function pinHtml(color: string): string {
  return `
    <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11.6 16 26 16 26s16-14.4 16-26C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>`;
}

export const originIcon = L.divIcon({
  className: 'map-pin',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#1a73e8;border:4px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export const destinationIcon = L.divIcon({
  className: 'map-pin',
  html: pinHtml('#ea4335'),
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});
