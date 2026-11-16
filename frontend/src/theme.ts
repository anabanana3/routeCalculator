import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1a73e8' },
    secondary: { main: '#34a853' },
    background: { default: '#f5f5f5' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 } } },
  },
});
