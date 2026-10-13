import type { Cloud } from './types';
import type { Dirty, Section } from './contracts';
export const LEGACY_SERVER = 'https://77.223.107.226';
export const CURRENT_SERVER = 'https://80.47.238.200';
export function recoverServerFields(cloud: Cloud, pending: Dirty, previous: string, next: string, remote: Cloud): Dirty {
  if (previous !== LEGACY_SERVER || next !== CURRENT_SERVER) return pending;
  const recovered = structuredClone(pending);
  for (const section of ['preferences','folders','smartPlaylists','likedAt','trackFeedback'] as Section[]) {
    const missing = Object.fromEntries(Object.entries(cloud[section]).filter(([key])=>!Object.hasOwn(remote[section],key)));
    recovered[section] = {...missing,...recovered[section]};
  }
  return recovered;
}
