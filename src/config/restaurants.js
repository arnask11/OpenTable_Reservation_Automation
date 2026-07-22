/**
 * OpenTable numeric restaurant ids (rid) keyed by normalized name aliases.
 * Add new venues here (and mirror the list in the Vapi system prompt).
 *
 * Find a rid: open the restaurant on OpenTable → URL often has restRef=NNNNN
 * or the booking widget uses rid=NNNNN.
 */
export const RESTAURANTS = [
  {
    rid: 24886,
    name: 'Amber India',
    aliases: ['amber india', 'amber india sf', 'amber india san francisco'],
  },
  // Add Great American Steakhouse once you confirm its OpenTable rid:
  // {
  //   rid: REPLACE_ME,
  //   name: 'Great American Steakhouse',
  //   aliases: ['great american steakhouse', 'great american steak house'],
  // },
];

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function listRestaurants() {
  return RESTAURANTS.map(({ rid, name }) => ({ rid, name }));
}

/**
 * Resolve a restaurant from restaurantName and/or rid.
 * @returns {{ rid: number, name: string } | { error: string }}
 */
export function resolveRestaurant({ restaurantName, rid } = {}) {
  const normalized = normalizeName(restaurantName);

  if (normalized) {
    const byAlias = RESTAURANTS.find(
      (entry) =>
        normalizeName(entry.name) === normalized ||
        entry.aliases.some((alias) => normalizeName(alias) === normalized) ||
        normalized.includes(normalizeName(entry.name)) ||
        entry.aliases.some((alias) => normalized.includes(normalizeName(alias))),
    );
    if (byAlias) {
      return { rid: byAlias.rid, name: byAlias.name };
    }
  }

  const numericRid = rid != null && rid !== '' ? Number(rid) : NaN;
  if (Number.isFinite(numericRid) && numericRid >= 1000) {
    const known = RESTAURANTS.find((entry) => entry.rid === numericRid);
    return { rid: numericRid, name: known?.name || `OpenTable rid ${numericRid}` };
  }

  const known = listRestaurants()
    .map((entry) => `${entry.name} (rid ${entry.rid})`)
    .join('; ');

  return {
    error: normalized
      ? `Unknown restaurant "${restaurantName}". Known: ${known || 'none configured'}. Add it to src/config/restaurants.js with its OpenTable rid.`
      : `Missing restaurant. Pass restaurantName or a valid OpenTable rid (>= 1000). Known: ${known || 'none configured'}.`,
  };
}
