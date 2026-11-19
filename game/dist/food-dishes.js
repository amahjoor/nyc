// Every dish by its model name, each plated on a clean bench.
import { handheld } from './food-dishes-handheld.js';
import { plates } from './food-dishes-plates.js';
import { small } from './food-dishes-small.js';
import { bowls } from './food-dishes-bowls.js';
import { sweets } from './food-dishes-sweets.js';

export const dishes={...handheld,...plates,...small,...bowls,...sweets};
