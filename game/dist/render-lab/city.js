import * as THREE from '../vendor/three.module.min.js';
import { catalogVehicles } from '../fleet.js';
import { TRANSPORT, BOARDINGS } from '../transport-catalog.js';

const dist = new URL('../', import.meta.url);
const standard = [{ id: 'standard', label: 'Standard' }];
const kerb = [{ points: [[-5, 0], [5, 0]], normals: [[0, 1]] }];
const frontage = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
const releases = new WeakMap();

async function asset(path) {
  const response = await fetch(new URL(path, dist));
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response;
}

function owned(object, release) {
  releases.set(object, release);
  return object;
}

function dispose(object) {
  object.removeFromParent();
  releases.get(object)?.();
  releases.delete(object);
}

// Only for objects whose geometry, materials and textures all belong to this build.
function ownMeshTree(object) {
  return owned(object, () => {
    const resources = new Set(), images = new Set();
    object.traverse(node => {
      if (!node.isMesh) return;
      if (node.isInstancedMesh) resources.add(node);
      resources.add(node.geometry);
      for (const material of [node.material].flat()) {
        resources.add(material);
        for (const texture of Object.values(material).filter(value => value?.isTexture)) {
          resources.add(texture);
          images.add(texture.source.data);
        }
      }
    });
    for (const resource of resources) resource.dispose();
    for (const image of images) image?.close?.();
  });
}

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bodyNames = { sedan: 'Sedan', suv: 'SUV', hatch: 'Hatchback', minivan: 'Minivan', coupe: 'Coupe', wagon: 'Wagon', pickup: 'Pickup', van: 'Van' };
const fleets = {
  passenger: { name: '', group: 'Passenger cars', color: 0x607e91 },
  taxis: { name: 'Yellow cab', group: 'Yellow taxis', color: 0xf3ba31 },
  boroTaxis: { name: 'Green cab', group: 'Green taxis', color: 0x74b541 },
  work: { name: 'Commercial', group: 'Commercial vehicles', color: 0xd6d7d4 },
};

async function buildCar(car, fleet) {
  const [{ createCar }, { designFor }, { generateVehicle }, { decodeVehicleMesh }] = await Promise.all([
    import('../world.js'), import('../vehicle-designs.js'), import('../vehicle-generator.js'), import('../vehicle-assets.js'),
  ]);
  const taxi = fleet === 'taxis' || fleet === 'boroTaxis';
  const livery = taxi ? 'taxi' : fleet === 'work' && car.shape === 'van' ? 'cargo' : null;
  const spec = car.asset || designFor(car.make, car.model, car.year, car.shape, livery);
  const model = spec.generated ? generateVehicle(spec) : decodeVehicleMesh(await (await asset(spec.url)).arrayBuffer(), spec);
  const object = createCar({ type: taxi ? 'taxi' : 'sedan', model, shape: car.shape, color: fleets[fleet].color, seed: spec.id });
  // createCar shares tires, paint, interiors and wheels across vehicles. Only the
  // custom body, its lamp geometry and the personalized plates belong to the preview.
  return owned(object, () => {
    object.userData.detail.plates.geometry.dispose();
    model.body.dispose();
    model.lamps.dispose();
  });
}

function vehicleEntries(rows, fleet) {
  const groups = new Map();
  for (const car of rows) {
    const key = car.make + '/' + car.model;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(car);
  }
  return [...groups.values()].map(cars => {
    const first = cars[0];
    const label = first.make + ' ' + first.model;
    const imported = [...new Set(cars.map(car => car.asset).filter(Boolean))];
    // Prefer a licensed exterior when this make/model has one. All other year and
    // body combinations remain individually selectable.
    cars.sort((a, b) => Number(Boolean(b.asset)) - Number(Boolean(a.asset)) || b.year - a.year || a.shape.localeCompare(b.shape));
    const byId = new Map(cars.map(car => [car.year + '-' + car.shape, car]));
    const variants = [...byId].map(([id, car]) => ({ id, label: car.year + ' · ' + bodyNames[car.shape] }));
    const role = fleets[fleet];
    return {
      id: 'vehicle-' + slug(fleet + '-' + label),
      name: role.name ? label + ' · ' + role.name : label,
      collection: 'Vehicles', group: role.group, source: imported.length ? 'assets/vehicles/index.json' : 'vehicle-designs.js',
      model: label, tags: [first.make, first.model, role.group, ...new Set(cars.map(car => bodyNames[car.shape]))],
      variants, detail: imported.map(spec => spec.title + ' · ' + spec.author + ' · ' + spec.license).join(' / '),
      build: id => buildCar(byId.get(id) || cars[0], fleet), dispose,
    };
  });
}

function transportEntries() {
  const categories = { street: 'Road transport', rotor: 'Aircraft', plane: 'Aircraft', boat: 'Watercraft', cable: 'Cable transit', rail: 'Rail transit' };
  return Object.entries(TRANSPORT).map(([id, spec]) => ({
    id: 'transport-' + slug(id), name: spec.name, collection: 'Transport', group: categories[spec.kind],
    source: 'transport-models.js', model: id, places: BOARDINGS.filter(stop => stop.type === id).map(stop => stop.place), variants: standard,
    async build() {
      const { createTransportModel } = await import('../transport-models.js');
      return createTransportModel(id); // The renderer owns and caches the underlying geometry.
    }, dispose,
  }));
}

const streetCollection = 'Street furniture';
function cityItem(id, name, collection, group, source, build, variants = standard) {
  return { id: 'city-' + id, name, collection, group, model: id, source, variants, build, dispose };
}

function installed(handle) {
  return owned(handle.mesh || handle.group, () => handle.dispose());
}

function streetEntries() {
  const entries = [];
  for (const [id, name] of [['newsstand', 'Sidewalk newsstand'], ['fruitstand', 'Fruit cart']]) {
    entries.push(cityItem(id, name, streetCollection, 'Street vendors', 'stands.js', async () => {
      const { createStandMesh } = await import('../stands.js');
      const handle = createStandMesh({ capacity: 40 });
      handle.update([{ ...frontage, nz: -1, kind: id }]);
      return installed(handle);
    }));
  }
  for (const [key, id, name] of [['shelters', 'bus-shelter', 'Bus shelter'], ['baskets', 'litter-basket', 'Litter basket']]) {
    entries.push(cityItem(id, name, streetCollection, 'Sidewalk fixtures', 'street-props.js', async () => {
      const { createStreetProps } = await import('../street-props.js');
      const handle = createStreetProps({ capacity: 1, data: { [key]: [0, 0] } });
      handle.update(kerb);
      return installed(handle);
    }));
  }
  entries.push(cityItem('outdoor-dining', 'Sidewalk café tables', streetCollection, 'Outdoor dining', 'dining.js', async id => {
    const { createDiningMesh } = await import('../dining.js');
    const handle = createDiningMesh({ capacity: 128 });
    handle.update([{ ...frontage, tables: id === 'five' ? 5 : 2 }]);
    return installed(handle);
  }, [{ id: 'two', label: 'Two tables' }, { id: 'five', label: 'Five tables' }]));

  entries.push(cityItem('sidewalk-shed', 'Sidewalk construction shed', streetCollection, 'Sidewalk fixtures', 'sheds.js', async id => {
    const { createShedMesh, SHED } = await import('../sheds.js');
    const handle = createShedMesh({ capacity: 32 });
    const length = SHED.bay * (id === 'six' ? 6 : 2);
    handle.update([{ ax: -length / 2, az: 0, bx: length / 2, bz: 0, nx: 0, nz: 1, length }]);
    return installed(handle);
  }, [{ id: 'two', label: 'Two bays' }, { id: 'six', label: 'Six bays' }]));
  for (const [personal, id, name] of [[false, 'citi-bike', 'Citi Bike'], [true, 'city-bicycle', 'City bicycle']]) {
    entries.push(cityItem(id, name, 'Transport', 'Bicycles and boards', 'bikes.js', async () => {
      const { bikeGeometry } = await import('../bikes.js');
      return ownMeshTree(new THREE.Mesh(bikeGeometry(personal), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .3 })));
    }));
  }
  entries.push(cityItem('skateboard', 'Skateboard', 'Transport', 'Bicycles and boards', 'skateboard.js', async () => {
    const { createSkateboard } = await import('../skateboard.js');
    const board = createSkateboard();
    board.visible = true;
    return ownMeshTree(board);
  }));
  entries.push({
    ...cityItem('statue-of-liberty', 'Statue of Liberty', 'Landmarks', 'Liberty Island', 'liberty.js', async id => {
      const { GLTFLoader } = await import('../vendor/GLTFLoader.min.js');
      const level = id === 'harbor' ? 'harbor' : 'island';
      const buffer = await (await asset('liberty-island/statue-' + level + '.glb')).arrayBuffer();
      const { scene } = await new GLTFLoader().parseAsync(buffer, '');
      return ownMeshTree(scene);
    }, [{ id: 'island', label: 'Island detail' }, { id: 'harbor', label: 'Harbor detail' }]),
    detail: 'Statue Of Liberty Low Poly · e-sfera · CC BY 4.0', places: ['Liberty Island'],
  });
  return entries;
}

export async function cityEntries() {
  const [registrations, art, working] = await Promise.all(
    ['vehicle-catalog.json', 'assets/vehicles/index.json', 'working-vehicles.json'].map(async path => (await asset(path)).json()),
  );
  const vehicles = vehicleEntries(catalogVehicles(registrations, art.models), 'passenger');
  for (const fleet of ['taxis', 'boroTaxis', 'work']) {
    const cars = working[fleet].variants.map(([make, model, year, shape]) => ({ make, model, year, shape }));
    vehicles.push(...vehicleEntries(cars, fleet));
  }
  return [...transportEntries(), ...streetEntries(), ...vehicles];
}
