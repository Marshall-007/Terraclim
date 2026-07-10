import { color, traffic, statusColor } from '../theme/tokens';
import type { Stage, Status, Traffic, WineStyle } from '../types/api';

export const trafficMeta = (t: Traffic) => traffic[t];
export const statusMeta = (s: Status) => statusColor[s];

const STAGE_LABEL: Record<Stage, string> = {
  dormant: 'Dormant',
  budbreak: 'Budbreak',
  flowering: 'Flowering',
  fruit_set: 'Fruit set',
  veraison: 'Véraison',
  harvest: 'Harvest',
  post_harvest: 'Post-harvest',
};

export const stageLabel = (s: Stage): string => STAGE_LABEL[s];

/** Ordered phenological stages for progress rendering. */
export const STAGE_ORDER: Stage[] = [
  'dormant',
  'budbreak',
  'flowering',
  'fruit_set',
  'veraison',
  'harvest',
  'post_harvest',
];

const STYLE_LABEL: Record<WineStyle, string> = {
  premium_red: 'Premium red',
  red: 'Red',
  white: 'White',
  fresh_white: 'Fresh white',
};

export const styleLabel = (s: WineStyle): string => STYLE_LABEL[s];

/**
 * The map fill for a block. Traffic light drives the base color; a too-wet
 * block additionally reads cool (blue tint) so over-watering is legible at a
 * glance — the product's key differentiator.
 */
export function blockFill(t: Traffic, status: Status): { fill: string; stroke: string } {
  if (status === 'too_wet') {
    return { fill: color.wet, stroke: color.bordeauxDark };
  }
  return { fill: traffic[t].base, stroke: color.bordeauxDark };
}

/** Short verb for a status, used in tight UI. */
export const statusVerb: Record<Status, string> = {
  on_track: 'Hold the line',
  too_dry: 'Water',
  too_wet: 'Stop watering',
};
