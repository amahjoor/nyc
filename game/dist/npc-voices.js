import { KIT, MEMBERS, memberInfo, patrolAppearance } from './human-cast.js';

// LibriTTS-R model speaker IDs for the eight shipped recordings.
export const recordedSpeakers = [12, 45, 76, 101, 207, 311, 530, 745];
const corpusLabels =
  'FFMMFMMMMFFFFFFFMFFMFMMFMFFMMFFMMFMMMFFFFFMMMFFFMMMMMMFMFFMFFFFFFFFMFFFMMFFFFFMF' +
  'FMMFMFMFMMMFMFFFFMFFFFMFMMMFFFMFFMMFMMFMFMFMMFFFFFFFMFMMMMFMFFFFFMMFFFFMMFFMMFMM' +
  'FFFFFFFFMFFFFMMMMFFFFMMMFFMMFMMMFFFFFFMMMMFMMFFFMMFFMFFFMMFMFMMMFMFMFFMMMMFFFFFF' +
  'MFFMFFMFMFFFFMFFMMFMFMFFMFFFFMMMMFFMFFMFFFFFMFMMMMFMFMFMMMFFMFFMMFFFMFFFFFFFFMMF' +
  'MFFFFFMMMMMFMFMMFMMMFMMFFFMFFFMFFMFFFMMFMMMMMFFMMMFMFFMMFFFFMFFFFMMMMFMMMMMMFMMM' +
  'MMMFMMMMFMMFFMMMMMMFFFFMFMMMMMFMMFFMMMMFFMMFFMFFFFFFMFMFMFFMMFFMFMFFFFFFMMMFMMMM' +
  'MMMMMFMFFMMMMFFMMMMMMMMFMFMFMMFMMFMFFFMMMMMMFFMMMFMMFMFFFFMFMMMMMFMMFMFFMFFFFFFM' +
  'FFFMMFFFMMMMMFFMFMMFFFFMMFMFFMFMFFMFMMMFMFMFMMMMMMMFFMFMMFMFMFMFFFFMFMFMMMMFMMFF' +
  'MMMMFMMFMFFFFMMMFFFMMFMMFFMFMMMMFMMFFMMFMFFMMMMMMMMFFFFFMMFFMFFFMFMFFMFFFMFMMFMF' +
  'MMMFMMMFFMMFFFMMMFMMMFMMMFFMFMMMMMFFMFMFMFMMFFFMFMMFMFMFMFMMFMMFMFFMMMFMMMFMFMFM' +
  'MMMMMMMFMMFMMMMFMFMFFMMFMMMMMMFMFFMFMFMMFMMMMFMMMFFMMFMMMMMMFMFMFFMMMFMFFFFFMFMM' +
  'FFMMMMFFMMMMMMFMMFMMMMMF';

export const modelSpeakers = [...recordedSpeakers];
for (let id = 0; id < corpusLabels.length; id++) {
  if (!recordedSpeakers.includes(id)) modelSpeakers.push(id);
}
const pools = { F: [], M: [] };
modelSpeakers.forEach((id, slot) => pools[corpusLabels[id]].push(slot));

const recordedPools = { F: pools.F.filter(slot => slot < recordedSpeakers.length), M: pools.M.filter(slot => slot < recordedSpeakers.length) };

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h ^ (h >>> 16)) >>> 0;
}

export function npcVoice(actor, anonymousIndex) {
  const crew = actor.carId != null && Number.isInteger(actor.uniform);
  const look = actor.look ?? (crew ? patrolAppearance(actor.carId, actor.uniform, actor.unit) : null);
  const member = look?.member ?? actor.member;
  const cast = Number.isInteger(member) && member >= 0 && member < MEMBERS ? memberInfo(member) : null;
  const label = cast ? (cast.woman ? 'F' : 'M') : Number.isInteger(look?.kit) ? (look.kit & KIT.woman ? 'F' : 'M') : null;
  const pool = pools[label];
  const identity = actor.resident?.id ?? actor.voiceKey ?? (crew ? actor.carId + '/' + actor.uniform : actor.id) ?? look?.voiceKey ?? member;
  const seed = identity == null ? anonymousIndex : hash(identity);
  const voice = pool ? pool[seed % pool.length] : seed % modelSpeakers.length;
  const recorded = recordedPools[corpusLabels[modelSpeakers[voice]]];
  return { voice, fallback: recorded[seed % recorded.length], rate: cast?.child ? 1.08 : cast?.old ? .96 : 1 };
}
