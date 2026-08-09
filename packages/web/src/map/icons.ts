import L from 'leaflet';
import { compactPrice, priceDiffLabel } from '../format.js';
import type { MarkerGroup } from './grouping.js';

const BUILDING_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">' +
  '<path d="M2 15V2.5A.5.5 0 0 1 2.5 2h6a.5.5 0 0 1 .5.5V6h4.5a.5.5 0 0 1 .5.5V15h-2v-2H11v2H2Zm2-2v1h1v-1H4Zm0-3v1h1v-1H4Zm0-3v1h1V7H4Zm0-3v1h1V4H4Zm3 9v1h1v-1H7Zm0-3v1h1v-1H7Zm0-3v1h1V7H7Zm0-3v1h1V4H7Zm4 6v1h1v-1h-1Zm0-3v1h1V7h-1Z"/></svg>';

/**
 * Cenová pilulka. Vykresľuje sa cez `divIcon`, nie cez SVG vrstvu —
 * potrebujeme viacriadkový obsah (počet, cena, zľava) a hover stavy.
 */
export function createPriceIcon(group: MarkerGroup, isSelected: boolean): L.DivIcon {
  const diff = priceDiffLabel(group.priceDiff);
  const countBadge =
    group.count > 1 ? `<span class="pill-count">${BUILDING_SVG}${group.count}</span>` : '';
  const diffBadge = diff ? `<span class="pill-diff">${diff}</span>` : '';
  const newDot = group.hasNew ? '<span class="pill-new" title="Nový inzerát"></span>' : '';

  const html =
    `<div class="marker-pill${isSelected ? ' is-selected' : ''}">` +
    `<div class="pill-body">${countBadge}${newDot}<span class="pill-price">${compactPrice(group.price)}</span></div>` +
    `${diffBadge}` +
    '</div>';

  return L.divIcon({
    html,
    className: 'marker-pill-wrapper',
    iconSize: undefined as unknown as L.PointExpression,
    iconAnchor: [0, 0],
  });
}

/**
 * Zhluk. Veľkosť aj sýtosť rastú s počtom — pri rovnakej veľkosti
 * by sa na úrovni mesta stratil rozdiel medzi 5 a 500 inzerátmi.
 */
export function createClusterIcon(count: number): L.DivIcon {
  const size = count >= 200 ? 54 : count >= 50 ? 46 : count >= 10 ? 40 : 34;
  const tone = count >= 200 ? 'xl' : count >= 50 ? 'lg' : count >= 10 ? 'md' : 'sm';
  const label = count >= 1000 ? `${Math.round(count / 100) / 10}k` : String(count);

  return L.divIcon({
    html: `<div class="marker-cluster tone-${tone}" style="width:${size}px;height:${size}px">${label}</div>`,
    className: 'marker-cluster-wrapper',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
