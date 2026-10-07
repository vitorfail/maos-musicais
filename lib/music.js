export const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const FING = ["✊ punho","☝️ 1 dedo","✌️ 2 dedos","3 dedos","4 dedos","🖐️ 5 dedos"];

export const ZONES = [
  { label: "baixa", desc: "mão esquerda na parte de baixo da tela", roots: ["C","D","E","F","G"] },
  { label: "meio",  desc: "mão esquerda no meio da tela",           roots: ["A","B","C#","D#","F#"] },
  { label: "alta",  desc: "mão esquerda no topo da tela",           roots: ["G#","A#"] },
];

export const TYPES = {
  0: ["", [0,4,7]], 1: ["m", [0,3,7]], 2: ["7", [0,4,7,10]],
  3: ["sus4", [0,5,7]], 4: ["maj7", [0,4,7,11]], 5: ["dim", [0,3,6]],
};

export const HARM = [[1,1],[2,.8],[3,.5],[4,.4],[6,.2],[8,.1]];

export function rootOf(z, l) {
  const n = ZONES[z].roots[l - 1];
  if (!n) return null;
  const pc = NAMES.indexOf(n);
  return [n, pc <= 7 ? 48 + pc : 36 + pc];
}
export const noteNames = (root, ints) => ints.map((i) => NAMES[(root + i) % 12]);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
