// Generate random color for name, using DJB2
export function colorFor(name) {
  const colors = [0xa188a6, 0x315867, 0x2a9d8f, 0x5a9fba, 0xe9c46a, 0xf4a261, 0xe76f51];
  const chars = name.toLowerCase().split('').map((str) => str.charCodeAt(0));
  const hash = chars.reduce((prev, curr) => ((prev << 5) + prev) + curr, 5381);
  return colors[Math.abs(hash) % colors.length];
};

// Lighten color
export function lighten(num, amt) {
  let r = (num >> 16) + amt;
  if (r > 255) {
    r = 255;
  } else if (r < 0) {
    r = 0;
  }
  let b = ((num >> 8) & 0x00FF) + amt;
  if (b > 255) {
    b = 255;
  } else if (b < 0) {
    b = 0;
  }
  let g = (num & 0x0000FF) + amt;
  if (g > 255) {
    g = 255;
  } else if (g < 0) {
    g = 0;
  }
  return (g | (b << 8) | (r << 16));
}
