import SensorsIcon from '@mui/icons-material/Sensors';
import { Box, Typography } from '@mui/material';
import { formatTime } from '../../domain/format';
import { delayColor, delayStatus, formatDelay } from '../../domain/realtime';
import { useTimeZone } from '../time-zone';

/** Hora prevista en verde (puntual) o rojo/naranja (retraso/adelanto) con la programada tachada debajo. */
export function RealtimeTime({ time, scheduled, delaySeconds }: { time: string; scheduled: string; delaySeconds: number }) {
  const tz = useTimeZone();
  const status = delayStatus(delaySeconds);
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <Typography component="span" variant="body2" fontWeight={500} sx={{ color: delayColor(status) }}>
        {formatTime(time, tz)}
      </Typography>
      {status !== 'on-time' && (
        <Typography component="s" variant="caption" color="text.secondary" aria-label={`Programada ${formatTime(scheduled, tz)}`}>
          {formatTime(scheduled, tz)}
        </Typography>
      )}
    </Box>
  );
}

/** "((·)) Tiempo real · 3 min de retraso" */
export function RealtimeStatus({ delaySeconds }: { delaySeconds: number }) {
  const color = delayColor(delayStatus(delaySeconds));
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color }}>
      <SensorsIcon sx={{ fontSize: 16 }} />
      <Typography component="span" variant="caption" fontWeight={500}>
        Tiempo real · {formatDelay(delaySeconds)}
      </Typography>
    </Box>
  );
}
