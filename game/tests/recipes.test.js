import test from 'node:test';
import assert from 'node:assert/strict';
import { dishStyle, drinkStyle, plateStyles, drinkStyles } from '../dist/food-catalog.js';
import { techniques } from '../dist/prep-motion.js';
import { KINDS } from '../dist/places.js';
import { menuFor } from '../dist/menu.js';
import { STATIONS, WARES, DISHES, DRINKS, BY_KIND, recipeFor, foodTone } from '../dist/recipes.js';

const total = steps => steps.reduce((sum, step) => sum + step.secs, 0);
const HEX = /^#[0-9a-f]{6}$/;
// Every step is at a real station, with real cookware, said the way the cook's line reads.
function sound(steps, label) {
  assert.ok(Array.isArray(steps) && steps.length, label);
  for (const step of steps) {
    assert.ok(step.actions.length && step.actions.every(a=>Object.hasOwn(techniques,a)), label+' '+step.actions);
    assert.ok(STATIONS.includes(step.at), `${label}: station ${step.at}`);
    assert.ok(step.ware === undefined || WARES.includes(step.ware), `${label}: ware ${step.ware}`);
    assert.ok(typeof step.say === 'string' && step.say.length > 0 && step.say.length <= 62, `${label}: "${step.say}" is ${step.say?.length} long`);
    assert.ok(/^[A-Z][a-zé-]+ing\b/.test(step.say) && !/[.!?]$/.test(step.say) && !/\byou(r)?\b/i.test(step.say), `${label}: "${step.say}"`);
    assert.ok(step.secs >= 1 && step.secs <= 6, `${label}: ${step.secs}s`);
  }
}
// A cooked dish takes its 6 to 20 seconds over two to five steps; something handed over ready takes a moment.
function dish(steps, label) {
  sound(steps, label);
  const secs = total(steps);
  assert.ok(steps.length <= 5, `${label}: ${steps.length} steps`);
  if (steps.length >= 3) assert.ok(secs >= 6 && secs <= 20, `${label}: ${secs}s`);
  else assert.ok(secs >= 1.5 && secs <= 8, `${label}: ${secs}s for something ready-made`);
  assert.ok(['pass', 'board', 'case', 'steam', 'scoop'].includes(steps.at(-1).at), `${label}: ends at ${steps.at(-1).at}`);
}
function drink(steps, label) {
  sound(steps, label);
  assert.ok(steps.length <= 3 && total(steps) >= 1.5 && total(steps) <= 12, `${label}: ${steps.length} steps, ${total(steps)}s`);
}

test('every dish and drink the catalog knows has a recipe, and nothing else does', () => {
  assert.deepEqual(Object.keys(DISHES).sort(), [...plateStyles].sort());
  assert.deepEqual(Object.keys(DRINKS).sort(), [...drinkStyles].sort());
  for (const style of plateStyles) { dish(recipeFor({ name: style }), style); assert.match(foodTone({ name: style }), HEX); }
  for (const style of drinkStyles) { drink(recipeFor({ name: style }), style); assert.match(foodTone({ name: style }), HEX); }
  // Kitchens work hot more often than not, and every station is used by something.
  const used = new Set(Object.values({ ...DISHES, ...DRINKS }).flat().map(([where]) => where.split('/')[0]));
  assert.deepEqual([...used].sort(), [...STATIONS].sort());
  assert.ok(plateStyles.filter(style => recipeFor(style).length >= 3).length > plateStyles.length * .7);
});

test('a kind of place that makes it its own way is as sound as the rest', () => {
  const kinds = new Set(KINDS.map(kind => kind.id));
  for (const [style, byKind] of Object.entries(BY_KIND)) {
    const isDish = style in DISHES;
    assert.ok(isDish || style in DRINKS, style);
    for (const kind of Object.keys(byKind)) {
      assert.ok(kinds.has(kind), `${style}: ${kind} is not a kind of place`);
      const steps = recipeFor({ name: style }, kind);
      assert.notEqual(steps, recipeFor({ name: style }), `${style} at ${kind}`);
      (isDish ? dish : drink)(steps, `${style} at ${kind}`);
    }
  }
  // The pizzeria boxes a whole pie, the trattoria plates one; a slice only ever comes from under the glass.
  assert.equal(recipeFor({ name: 'Margherita pie' }, 'pizza').at(-1).at, 'board');
  assert.equal(recipeFor({ name: 'Margherita pizza' }, 'italian').at(-1).at, 'pass');
  assert.deepEqual(recipeFor({ name: 'Slice' }, 'pizza').map(step => [step.at, step.ware]), [['case', 'pie'], ['oven', 'pie'], ['pass', undefined]]);
  assert.equal(recipeFor({ name: 'Coffee, regular' }, 'bodega')[0].say, 'Filling a paper cup from the urn, milk and two sugars');
});

test('everything on every menu that is food or drink can be made there', () => {
  const kinds = ['american', 'chinese', 'mediterranean', 'mexican', 'latin', 'caribbean', 'bbq', 'kosher', 'asian', 'african', 'japanese', 'korean', 'indian', 'thai', 'chicken', 'burgers', 'sandwiches',
    'bakery', 'donuts', 'bagels', 'juice', 'icecream', 'italian', 'french', 'seafood', 'european', 'steakhouse', 'pub', 'bar', 'club', 'pizza', 'coffee', 'cafe', 'bodega', ...KINDS.map(kind => kind.id)];
  let made = 0;
  for (const kind of new Set(kinds)) for (const item of menuFor({ kind })) {
    const name = item.preparation || item.name;
    if (dishStyle(name)) dish(recipeFor(item, kind), `${name} at ${kind}`);
    else if (drinkStyle(name)) drink(recipeFor(item, kind), `${name} at ${kind}`);
    else { assert.equal(recipeFor(item, kind), null, name); continue; }
    assert.match(foodTone(item), HEX); made++;
  }
  assert.ok(made > 300, `${made} items made`);
});

test('what is not food is not cooked, and a recipe is the same one each time it is asked for', () => {
  for (const item of [{ name: 'Lottery scratch-off' }, { name: 'Cover charge' }, { name: 'constructor' }, { name: '' }, {}, null, undefined]) assert.equal(recipeFor(item, 'bodega'), null);
  assert.equal(foodTone({ name: 'Cover charge' }), '#c9a36b');
  // A plate ordered under another name is made as what it is served as.
  assert.equal(recipeFor({ name: 'Apple', preparation: 'Spaghetti pomodoro' }, 'italian'), recipeFor('Spaghetti pomodoro'));
  const pasta = recipeFor({ name: 'Spaghetti pomodoro' }, 'italian');
  assert.equal(pasta, recipeFor({ name: 'Spaghetti pomodoro' }, 'italian')); assert.ok(Object.isFrozen(pasta) && Object.isFrozen(pasta[0]));
  assert.deepEqual(pasta[0], { at: 'range', ware: 'pot', say: 'Dropping spaghetti into salted boiling water', secs: 4, actions:['tongs'] });
  assert.equal(pasta.at(-1).at, 'pass');
  assert.equal(foodTone({ name: 'Spaghetti pomodoro' }), '#c4432c'); assert.notEqual(foodTone({ name: 'Saag paneer' }), foodTone({ name: 'Fries' }));
});
