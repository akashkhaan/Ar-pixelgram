/** Navigation for taps on story media, relative to the viewer itself. */
export function getStoryTapDirection(clientX: number, left: number, width: number): 'previous' | 'next' {
  return clientX - left < width / 2 ? 'previous' : 'next';
}
