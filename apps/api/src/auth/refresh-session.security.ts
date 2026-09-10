export function constantWorkEqual(expected: string, received: string): boolean {
  const comparisonLength = Math.max(expected.length, received.length);
  let difference = expected.length ^ received.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    difference |=
      (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  }

  return difference === 0;
}
