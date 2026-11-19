import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ServicesProvider, type Services } from './application/services';
import { appConfig } from './infrastructure/config';
import { createBrowserGeolocation } from './infrastructure/geolocation/browser-geolocation';
import { createHttpTransitApi } from './infrastructure/http/api-client';
import App from './ui/App';
import { theme } from './ui/theme';

// Raíz de composición: aquí se eligen las implementaciones concretas de los puertos.
const services: Services = {
  api: createHttpTransitApi(appConfig.apiUrl),
  geolocation: createBrowserGeolocation(),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App mapConfig={appConfig.map} />
      </ThemeProvider>
    </ServicesProvider>
  </StrictMode>,
);
