/** Builds a Leaflet icon from our MapMarker molecule, so map pins keep the Figma design (ADR-0006). */
import { divIcon, type DivIcon } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapMarker, type MapMarkerVariant } from '../MapMarker/MapMarker'

/** Figma marker sizes in px — Leaflet needs them to center the icon on the coordinate. */
const MARKER_HEIGHT_PX = 32
const SINGLE_MARKER_WIDTH_PX = 32
const DOUBLE_MARKER_WIDTH_PX = 58

export function createMarkerIcon(variant: MapMarkerVariant, label: string): DivIcon {
  const width = variant.kind === 'both' ? DOUBLE_MARKER_WIDTH_PX : SINGLE_MARKER_WIDTH_PX

  return divIcon({
    html: renderToStaticMarkup(<MapMarker {...variant} label={label} />),
    // Empty class: drops Leaflet's default white box around div icons.
    className: '',
    iconSize: [width, MARKER_HEIGHT_PX],
    iconAnchor: [width / 2, MARKER_HEIGHT_PX / 2],
  })
}
