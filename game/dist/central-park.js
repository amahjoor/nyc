// Central Park was the first park drawn from maps of what is in it, and the
// game still asks for it by name. There are now several such parks, listed
// in parks.json and kept by mapped-parks.js; this is that module under the
// old name.
export { createMappedParks as createCentralPark, createMappedPark } from './mapped-parks.js';
