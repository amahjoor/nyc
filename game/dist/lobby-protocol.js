// All clients use city world metres and radians. Name, mode and activity IDs
// come from this shared vocabulary, including on the standalone lobby server.
export const LEGACY_PROTOCOL = 'concrete-jungle.v1';
export const PROTOCOL = 'concrete-jungle.v2';
export const TICK_MS = 100;
export const RADIUS = 650;
export const MAX_NEARBY = 32;
export const MODES = ['walk','sedan','taxi','police','bike','skate'];
export const SIGNALS = ['Waving hello', 'Follow me', 'Nice ride', 'Ready to race'];
export const COLOURS = [0xe68a53,0x4aa59b,0xedc45f,0x7599c2,0xba809c,0x91aa67,0xcc6761,0xa69ac9];
export const RENDEZVOUS = {name:'SoHo lobby meetup',x:139,z:189};
export const SPRINT = [
  {name:'Broadway & Spring', x:138.66,z:189.03},
  {name:'Broadway north', x:312.95,z:-82.63},
  {name:'Broadway finish', x:70.62,z:294.89},
];
