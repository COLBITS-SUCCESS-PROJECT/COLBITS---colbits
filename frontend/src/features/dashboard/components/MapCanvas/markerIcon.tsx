/** Builds a Leaflet icon from our MapMarker molecule, so map pins keep the Figma design (ADR-0006). */
import { divIcon, type DivIcon } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapMarker, type MapMarkerVariant } from '../MapMarker/MapMarker'
import { MARKER_SIZE_PX } from '../MapMarker/mapMarker.constants'

export function createMarkerIcon(variant: MapMarkerVariant, label: string): DivIcon {
  const { width, height } = MARKER_SIZE_PX[variant.kind]

  return divIcon({
    html: renderToStaticMarkup(<MapMarker {...variant} label={label} />),
    // Empty class: drops Leaflet's default white box around div icons.
    className: '',
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
  })
}
