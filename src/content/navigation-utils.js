export function clampScrollTarget(target, maximum) {
  return Math.max(0, Math.min(target, Math.max(0, maximum)));
}

export function getActiveSectionIndex(headerTops, readingLine, isAtPageEnd = false) {
  if (isAtPageEnd && headerTops.length > 0) return headerTops.length - 1;

  return headerTops.reduce(
    (activeIndex, top, index) => (top <= readingLine ? index : activeIndex),
    0
  );
}

export function hasReachedScrollTarget(current, target, tolerance = 4) {
  return Math.abs(current - target) <= tolerance;
}

export function areTocEntriesEqual(current, next) {
  if (current.length !== next.length) return false;

  return current.every((entry, index) => (
    entry.id === next[index]?.id &&
    entry.text === next[index]?.text &&
    entry.level === next[index]?.level
  ));
}
