// Recordings are credited by source model and year in assets/audio/ride-sources.tsv.
// A make/model match uses its recorded horn across model years.
const models = new Map(Object.entries({
  'honda accord':'accord', 'honda civic':'civic', 'honda element':'element',
  'nissan altima':'altima', 'nissan maxima':'maxima', 'toyota corolla':'corolla', 'toyota camry':'camry',
  'hyundai sonata':'sonata', 'hyundai sonata hybrid':'sonata', 'dodge charger':'charger',
  'ford escape':'escape', 'ford escape hybrid':'escape', 'ford mustang':'mustang',
  'chevrolet silverado':'silverado', 'chevrolet silverado 1500':'silverado',
  'audi a1':'a1', 'bmw 114i':'114i', 'renault master':'master', 'mazda 626':'626',
  'mercedes-benz 190e':'190e', 'mitsubishi i-miev':'imiev',
}));
const soundsByBody = {
  sedan:['accord','camry','maxima','altima','sonata','190e'], hatch:['a1','suzuki','corolla','114i','imiev'],
  coupe:['mustang','charger','114i'], wagon:['626','accord','escape'], suv:['element','escape','charger'],
  pickup:['silverado','escape'], van:['master','silverado'], minivan:['element','camry','master'],
};

export function vehicleHorn(car) {
  const id = car.identity || {};
  const makeModel = [id.make, id.model].filter(Boolean).join(' ').trim().toLowerCase();
  const named = models.get(makeModel);
  if (named) return {name:named, rate:1};
  const body = id.shape || car.shape || car.type;
  if (body === 'bus' || body === 'truck') return {name:'airHorn', rate:1};
  const choices = soundsByBody[body] || soundsByBody.sedan;
  let hash = 2166136261;
  for (const char of makeModel || String(car.id ?? body))
    hash = Math.imul(hash ^ char.charCodeAt(0),16777619) >>> 0;
  return {name:choices[hash % choices.length], rate:.98 + ((hash >>> 9) % 41)/1000};
}

// Each pair gives a start offset and a press duration, both in seconds.
export const hornGestures = {
  tap:[[0,.18]], courteous:[[0,.11],[.25,.12]], ordinary:[[0,.38]],
  impatient:[[0,.85],[1.04,.28]], insistent:[[0,1.22],[1.43,.46]],
};
