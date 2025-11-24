/**
 * Get the full URL for a static asset, handling the base URL correctly for different environments (Web/Electron).
 * @param path The path to the asset, relative to the public directory (e.g., 'icons/logo.png').
 *             Leading slash is optional.
 * @returns The full URL to the asset.
 */
export function getAssetUrl(path: string): string {
  const baseUrl = import.meta.env.BASE_URL;
  // Ensure baseUrl ends with a slash if it's not empty
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  // Remove leading slash from path to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${cleanPath}`;
}
