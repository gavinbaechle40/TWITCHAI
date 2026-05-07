export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
