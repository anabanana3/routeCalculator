import AdmZip from 'adm-zip';

export function makeZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  return zip.toBuffer();
}

export const MINIMAL_GTFS = {
  'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nAG,Test,https://example.com,Europe/Madrid\n',
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Uno,40.4,-3.7\nB,Dos,40.41,-3.7\n',
};
