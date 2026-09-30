/** Formats a city for display as "City, ST", e.g. "Nashville, TN". */
export function formatCityState(city: string, stateCode: string): string {
  return `${city.trim()}, ${stateCode.trim().toUpperCase()}`;
}
