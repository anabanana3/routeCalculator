import { Alert, Box, Button, Collapse, Link, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { alertLevel, alertTitle } from '../../domain/realtime';
import type { AlertDto } from '../../domain/types/api';

function AlertItem({ alert }: { alert: AlertDto }) {
  const [open, setOpen] = useState(false);
  return (
    // Los clics dentro del aviso no deben enfocar el tramo en el mapa.
    <Alert severity={alertLevel(alert)} sx={{ py: 0, '& .MuiAlert-message': { minWidth: 0 } }} onClick={(e) => e.stopPropagation()}>
      <Typography variant="body2" fontWeight={500}>
        {alertTitle(alert)}
      </Typography>
      {alert.description && (
        <>
          <Collapse in={open}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
              {alert.description}
            </Typography>
          </Collapse>
          <Button size="small" color="inherit" onClick={() => setOpen((o) => !o)} sx={{ px: 0, minWidth: 0 }}>
            {open ? 'Ver menos' : 'Ver más'}
          </Button>
        </>
      )}
      {alert.url && (
        <Box>
          <Link href={alert.url} target="_blank" rel="noopener noreferrer" variant="body2" color="inherit">
            Más información
          </Link>
        </Box>
      )}
    </Alert>
  );
}

/** Avisos de incidencias (GTFS-Realtime Alerts). */
export function AlertList({ alerts }: { alerts: AlertDto[] }) {
  if (alerts.length === 0) return null;
  return (
    <Stack spacing={0.5}>
      {alerts.map((a) => (
        <AlertItem key={a.id} alert={a} />
      ))}
    </Stack>
  );
}
