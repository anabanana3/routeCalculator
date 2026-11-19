import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RoomIcon from '@mui/icons-material/Room';
import SignpostIcon from '@mui/icons-material/Signpost';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { Autocomplete, Box, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import { MIN_SEARCH_CHARS, usePlaceSearch } from '../../application/hooks/usePlaceSearch';
import { CURRENT_LOCATION_LABEL } from '../../domain/trip-search';
import type { LatLon } from '../../domain/types/api';
import type { SelectedPlace } from '../../domain/types/place';

const CURRENT_LOCATION: SelectedPlace = { kind: 'current', label: CURRENT_LOCATION_LABEL, lat: NaN, lon: NaN };

interface Props {
  value: SelectedPlace | null;
  placeholder: string;
  icon: ReactNode;
  active: boolean;
  locating: boolean;
  /** Punto hacia el que se priorizan los resultados de búsqueda. */
  searchFocus?: LatLon;
  onFocus: () => void;
  onChange: (place: SelectedPlace | null) => void;
  onLocate: () => void;
}

export function OptionIcon({ kind }: { kind: SelectedPlace['kind'] }) {
  const sx = { color: 'text.secondary', fontSize: 20 };
  switch (kind) {
    case 'current':
      return <MyLocationIcon data-testid="icon-current" sx={{ ...sx, color: 'primary.main' }} />;
    case 'stop':
      return <DirectionsBusIcon data-testid="icon-stop" sx={sx} />;
    case 'street':
      return <SignpostIcon data-testid="icon-street" sx={sx} />;
    case 'poi':
      return <StorefrontIcon data-testid="icon-poi" sx={sx} />;
    case 'map':
      return <RoomIcon data-testid="icon-map" sx={sx} />;
    default:
      return <LocationOnIcon data-testid="icon-address" sx={sx} />;
  }
}

/** Campo de origen/destino con autocompletado de direcciones, paradas y "Tu ubicación". */
export function PlaceSearchField(props: Props) {
  const { value, searchFocus } = props;
  const [inputValue, setInputValue] = useState(value?.label ?? '');
  const { results, loading, warning, typing } = usePlaceSearch(inputValue, value?.label, searchFocus);

  // Si el lugar cambia desde fuera (mapa, intercambio, geolocalización) se refleja en el texto.
  useEffect(() => {
    setInputValue(value?.label ?? '');
  }, [value?.label, value?.lat, value?.lon]);

  const options = [CURRENT_LOCATION, ...results];

  return (
    <Autocomplete<SelectedPlace, false, false, true>
      freeSolo
      openOnFocus
      fullWidth
      size="small"
      value={value}
      inputValue={inputValue}
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      isOptionEqualToValue={(a, b) => a.kind === b.kind && a.label === b.label && a.lat === b.lat && a.lon === b.lon}
      onInputChange={(_, v, reason) => {
        if (reason === 'input' || reason === 'clear') setInputValue(v);
      }}
      onBlur={() => setInputValue(value?.label ?? '')}
      onChange={(_, option) => {
        if (option === null) return props.onChange(null);
        // Enter con texto libre: se elige el primer resultado.
        const chosen = typeof option === 'string' ? results[0] : option;
        if (!chosen) return;
        if (chosen.kind === 'current') return props.onLocate();
        props.onChange(chosen);
      }}
      renderOption={(liProps, option, state) => {
        const { key: _key, ...rest } = liProps as typeof liProps & { key: string };
        return (
          <Box
            component="li"
            key={`${option.kind}-${option.lat}-${option.lon}-${state.index}`}
            {...rest}
            sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}
          >
            <OptionIcon kind={option.kind} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.kind === 'current' && props.locating ? 'Obteniendo tu ubicación…' : option.label}
              </Typography>
              {option.secondary && (
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {option.secondary}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      noOptionsText={typing ? 'Sin resultados' : `Escribe al menos ${MIN_SEARCH_CHARS} letras`}
      loadingText="Buscando…"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={props.placeholder}
          focused={props.active || undefined}
          onFocus={props.onFocus}
          helperText={warning}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: <InputAdornment position="start">{props.icon}</InputAdornment>,
              endAdornment: (
                <>
                  {(loading || (props.locating && props.active)) && <CircularProgress size={16} sx={{ mr: 1 }} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
