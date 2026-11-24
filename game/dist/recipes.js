// How each thing on a menu is made on the line of the kind of place that sells
// it: which station the cook stands at, what is on it, what they are doing and
// for how long. Short-order practice, not a home recipe: slices are reheated,
// stews are ladled from the steam table, steaks rest before they are cut.
import { dishStyle, drinkStyle } from './food-catalog.js';

export const STATIONS = ['range', 'wok', 'flat', 'grill', 'fry', 'oven', 'board', 'cold', 'steam', 'sushi', 'spit', 'smoker', 'espresso', 'blender', 'fountain', 'brew', 'bar', 'case', 'scoop', 'pass'];
export const WARES = ['pan', 'pot', 'wok', 'basket', 'tray', 'pie', 'board', 'bowl', 'plate', 'ladle', 'cup', 'griddle'];

// Each step: [ 'station' or 'station/ware', description, seconds, motions in working order ].
export const DISHES = {
  // by the slice: pies wait under glass, a slice goes back on the deck to order
  pizza: [['case/pie', 'Lifting a plain slice from the pie under the glass', 2, 'turn'], ['oven/pie', 'Sliding it onto the oven deck to crisp the bottom', 4, 'peel'], ['pass', 'Peeling it out onto a paper plate over wax paper', 2, 'turn']],
  'pizza-pepperoni': [['case/pie', 'Taking a pepperoni slice from the pie under the glass', 2, 'turn'], ['oven/pie', 'Reheating it on the deck until the pepperoni cups', 4, 'peel'], ['pass', 'Sliding it onto a paper plate, the grease still bubbling', 2, 'turn']],
  'pizza-sicilian': [['case/tray', 'Cutting a square from the Sicilian pan under the glass', 2.5, 'slice'], ['oven/tray', 'Setting the square on the deck to crisp its fried bottom', 4.5, 'peel'], ['pass', 'Lifting the thick square onto a paper plate', 2, 'turn']],
  'pizza-white': [['case/pie', 'Taking a white slice, ricotta and mozzarella, from the case', 2, 'turn'], ['oven/pie', 'Warming it on the deck until the ricotta just colours', 4, 'peel'], ['pass', 'Sliding it onto a paper plate with a pinch of oregano', 2, 'turn']],
  'pizza-combo': [['case/pie', 'Pulling two plain slices from the pie under the glass', 2.5, 'turn'], ['oven/pie', 'Running both slices onto the deck to reheat', 4, 'peel'], ['pass', 'Overlapping the two slices on a paper plate', 2, 'turn'], ['case/cup', 'Grabbing a cold can of soda from the cooler', 1.5, 'fetch']],
  'garlic-knots': [['oven/tray', 'Warming a tray of knotted dough ends in the deck oven', 3.5, 'tray'], ['board/bowl', 'Tossing the hot knots in garlic oil, parsley and parmesan', 3, 'stir'], ['pass', 'Bagging them with a cup of marinara', 2, 'fold']],
  calzone: [['board', 'Stretching a dough round, spooning on ricotta and mozzarella', 3.5, 'stretch/ladle'], ['board', 'Folding it over, crimping the edge and cutting a vent', 2.5, 'fold'], ['oven/pie', 'Baking it on the deck until blistered and golden', 5, 'peel'], ['pass', 'Brushing it with garlic oil, a cup of marinara beside', 2.5, 'brush']],
  'pizza-margherita': [['board/pie', 'Stretching a dough ball over the knuckles to a wide round', 3.5, 'stretch'], ['board/pie', 'Ladling crushed tomato in a spiral, laying on mozzarella', 3, 'ladle/place'], ['oven/pie', 'Launching the pie off the peel onto the deck, turning it once', 5, 'peel'], ['board/pie', 'Tearing basil over it, wheeling it into eight and boxing it', 3, 'garnish/slice']],
  // Chinese take-out: one wok, one fryer, a pot of water
  'egg-roll': [['fry', 'Dropping a cabbage-and-pork egg roll into the fryer', 4, 'lower'], ['fry', 'Lifting the basket when the wrapper blisters brown', 2, 'drain'], ['board', 'Slipping it into a wax bag with duck sauce and mustard', 2, 'fold']],
  'spring-rolls': [['fry', 'Lowering thin vegetable spring rolls into the hot oil', 4, 'lower'], ['fry', 'Shaking the basket and draining them crisp', 2.5, 'drain'], ['pass', 'Stacking them cut on the bias beside sweet chili sauce', 2.5, 'slice/place']],
  'fried-rice': [['wok', 'Scrambling egg in a smoking wok, day-old rice in after it', 3.5, 'stir'], ['wok', 'Tossing the rice with roast pork, scallion and bean sprouts', 4, 'toss'], ['wok', 'Splashing soy round the rim and tossing until it jumps', 3, 'pour/toss'], ['pass', 'Mounding it into a take-out container', 2, 'scoop']],
  tso: [['board/bowl', 'Dredging marinated chicken thigh chunks in cornstarch', 2.5, 'dredge'], ['fry', 'Frying the chicken twice until it crackles', 4, 'lower'], ['wok', 'Blooming dried chilies and garlic, pouring in the sauce', 3, 'stir/pour'], ['wok', 'Tossing the chicken until it wears a sticky glaze', 2.5, 'toss'], ['pass', 'Boxing it over white rice with steamed broccoli', 2.5, 'scoop']],
  'lo-mein': [['range/pot', 'Dunking fresh egg noodles in boiling water to loosen', 2.5, 'tongs'], ['wok', 'Searing sliced chicken, cabbage and carrot in a smoking wok', 3.5, 'stir'], ['wok', 'Tossing in the noodles with soy and oyster sauce', 3.5, 'toss'], ['pass', 'Twisting the noodles into a container with tongs', 2, 'tongs']],
  'beef-broccoli': [['range/pot', 'Blanching broccoli florets in the water pot', 2.5, 'tongs'], ['wok', 'Passing velveted flank steak through hot oil', 3, 'stir'], ['wok', 'Tossing beef and broccoli, ladling in brown garlic sauce', 3.5, 'toss/ladle'], ['pass', 'Sliding it glossy into a container beside white rice', 2, 'turn']],
  dumplings: [['steam/tray', 'Setting pork-and-chive dumplings in the steamer', 4, 'tongs'], ['wok', 'Crisping them on one side in an oiled wok', 3, 'turn'], ['pass', 'Boxing eight with a cup of soy-ginger dipping sauce', 2.5, 'tongs']],
  'wonton-soup': [['range/pot', 'Dropping pork wontons into boiling water until they float', 4, 'tongs'], ['steam/ladle', 'Ladling clear chicken broth into a container', 2.5, 'ladle'], ['pass/bowl', 'Adding the wontons, scallion and slices of roast pork', 2.5, 'garnish']],
  'pork-bun': [['steam/tray', 'Lifting a roast pork bun from the steamer cabinet', 3.5, 'tongs'], ['board', 'Dropping it hot into a wax bag', 2.5, 'fold']],
  // halal carts and gyro counters
  'chicken-rice': [['flat', 'Throwing marinated chicken thighs on the flat-top', 3.5, 'tongs'], ['flat', 'Chopping the chicken on the griddle with two scrapers', 3.5, 'scrape'], ['steam/tray', 'Scooping yellow rice into a foil tray, lettuce beside it', 2.5, 'scoop'], ['pass', 'Piling on the chicken, white sauce and a stripe of red', 2.5, 'drizzle']],
  'lamb-rice': [['flat', 'Dropping shaved gyro lamb on the flat-top to crisp', 3.5, 'turn'], ['flat', 'Chopping it fine with the scraper, onions mixed in', 3.5, 'scrape'], ['steam/tray', 'Scooping yellow rice into a foil tray with salad', 2.5, 'scoop'], ['pass', 'Topping with lamb, heavy white sauce and a line of hot', 2.5, 'drizzle']],
  gyro: [['spit', 'Shaving ribbons of lamb off the turning cone', 3.5, 'carve'], ['flat', 'Warming a pita on the griddle until soft', 2.5, 'turn'], ['board', 'Loading lamb, tomato, onion and tzatziki onto the pita', 3, 'place'], ['pass', 'Rolling it tight in foil and paper', 2, 'fold']],
  falafel: [['board/bowl', 'Pressing chickpea mix into balls with the falafel scoop', 2.5, 'scoop'], ['fry', 'Frying the falafel to a dark, craggy brown', 4, 'lower'], ['board', 'Stuffing a pita with falafel, salad and pickled turnip', 3, 'place'], ['pass', 'Pouring tahini over and wrapping it in foil', 2, 'drizzle/fold']],
  shawarma: [['spit', 'Carving crisp chicken off the shawarma spit', 3.5, 'carve'], ['flat', 'Tossing the shavings on the griddle to crisp the edges', 2.5, 'turn'], ['board', 'Rolling it in flatbread with garlic sauce and pickles', 3, 'fold'], ['flat', 'Pressing the wrap on the griddle to seal and toast it', 2.5, 'press'], ['pass', 'Halving it on the bias and wrapping it in paper', 2, 'slice/fold']],
  hummus: [['cold/bowl', 'Swirling hummus round a shallow bowl with a spoon', 3, 'spread'], ['oven', 'Warming pita in the oven until it puffs', 3, 'tray'], ['pass/bowl', 'Pooling olive oil in the well; paprika, chickpeas, parsley', 3, 'drizzle']],
  'greek-salad': [['board', 'Cutting cucumber, tomato, green pepper and red onion', 3.5, 'slice'], ['cold/bowl', 'Tossing them with olives, oregano, oil and wine vinegar', 3, 'stir'], ['pass/bowl', 'Setting a slab of feta on top with pepperoncini', 2.5, 'place']],
  spanakopita: [['case/tray', 'Cutting a square of spinach pie from the tray', 2.5, 'slice'], ['oven', 'Crisping the phyllo in the oven', 4, 'tray'], ['pass', 'Plating the flaky square with a wedge of lemon', 2, 'turn']],
  baklava: [['case/tray', 'Lifting a diamond of baklava from the syrupy tray', 2.5, 'turn'], ['pass', 'Setting it in a paper cup, crushed pistachio on top', 2, 'place']],
  // taqueria
  taco: [['flat', 'Searing chopped carne asada on the plancha', 3.5, 'turn'], ['flat', 'Warming two stacked corn tortillas in the meat fat', 2.5, 'turn'], ['board', 'Filling the doubled tortillas, onion and cilantro on top', 2.5, 'place'], ['pass', 'Plating with a lime wedge, radish and salsa verde', 2, 'garnish']],
  tacos: [['steam/tray', 'Pulling carnitas from the pan of its own lard', 2.5, 'tongs'], ['flat', 'Crisping the pork on the plancha until the edges frizzle', 3.5, 'turn'], ['flat', 'Heating corn tortillas two by two alongside', 2.5, 'turn'], ['pass', 'Building three tacos with onion, cilantro, salsa and lime', 3, 'place']],
  burrito: [['flat', 'Warming a big flour tortilla on the plancha until it gives', 2.5, 'turn'], ['steam/tray', 'Laying rice, beans and grilled meat down the centre', 3, 'scoop'], ['board', 'Adding salsa, cheese and crema, tucking the ends, rolling', 3, 'fold'], ['flat', 'Searing the seam shut on the griddle', 2, 'press'], ['pass', 'Wrapping it tight in foil', 1.5, 'fold']],
  guacamole: [['board', 'Halving avocados and scooping them into the molcajete', 3, 'slice/scoop'], ['board/bowl', 'Mashing in onion, cilantro, serrano, lime and salt', 3.5, 'mash'], ['pass/bowl', 'Sending the stone bowl out beside a basket of warm chips', 2.5, 'tray']],
  quesadilla: [['flat', 'Laying a flour tortilla on the plancha, cheese all over', 3, 'place'], ['flat', 'Folding it over the filling and pressing with the spatula', 3, 'press'], ['flat', 'Flipping it when the cheese runs and the tortilla blisters', 2.5, 'turn'], ['pass', 'Cutting it in wedges with pico de gallo and crema', 2.5, 'slice']],
  nachos: [['board/tray', 'Spreading tortilla chips on a platter with beans and cheese', 3, 'place'], ['oven/tray', 'Running it under the broiler until the cheese bubbles', 4, 'tray'], ['pass', 'Topping with pico, jalapeños, guacamole and crema', 3, 'garnish']],
  elote: [['grill', 'Charring a shucked ear of corn over the grill, turning it', 4.5, 'tongs'], ['board', 'Slathering it in mayo and rolling it in cotija', 3, 'brush'], ['pass', 'Dusting with chili powder, a squeeze of lime over it', 2, 'garnish']],
  tamales: [['steam/pot', 'Lifting tamales out of the steamer pot with tongs', 3.5, 'tongs'], ['board', 'Opening the corn husks to let the steam out', 2.5, 'fold'], ['pass', 'Plating two with salsa roja spooned over the masa', 3, 'ladle']],
  churros: [['fry', 'Piping ridged dough straight into the oil, snipping lengths', 4, 'pipe'], ['fry', 'Turning them until deep golden and lifting the basket', 2.5, 'tongs/drain'], ['board/tray', 'Rolling the hot churros in cinnamon sugar', 2.5, 'roll'], ['pass', 'Standing them in a paper cone with chocolate sauce', 2, 'place']],
  // Dominican and Puerto Rican lunch counters: the steam table does the work
  pernil: [['steam/tray', 'Forking pernil from the steam table with a piece of crackling', 3.5, 'tongs'], ['steam/tray', 'Packing in white rice with a big spoon', 2.5, 'scoop'], ['steam/ladle', 'Ladling stewed red beans over the rice', 2.5, 'ladle'], ['pass', 'Spooning pan juices over the pork, sweet plantain beside', 2.5, 'ladle']],
  empanada: [['fry', 'Dropping a beef empanada into the fryer', 4, 'lower'], ['fry', 'Lifting it out when the crust bubbles and browns', 2, 'drain'], ['board', 'Draining it on paper and sliding it into a bag', 2, 'fold']],
  'pollo-guisado': [['steam/ladle', 'Ladling braised chicken in sofrito sauce from the steam table', 3.5, 'ladle'], ['steam/tray', 'Scooping white rice onto the plate', 2.5, 'scoop'], ['steam/ladle', 'Ladling beans alongside and extra sauce over the rice', 2.5, 'ladle'], ['pass', 'Finishing the plate with a slice of avocado', 2, 'garnish']],
  mofongo: [['fry', 'Frying thick rounds of green plantain until tender', 4, 'lower'], ['board/bowl', 'Pounding them in the pilón with garlic and pork cracklings', 4, 'mash'], ['pass', 'Turning the dome out onto a plate with a cup of garlic broth', 3, 'place']],
  cubano: [['board', 'Layering roast pork, ham, Swiss and pickles on Cuban bread', 3.5, 'place'], ['board', 'Spreading mustard and buttering the outside of the loaf', 2, 'spread'], ['flat', 'Pressing it flat in the plancha until the cheese melts', 4.5, 'press'], ['pass', 'Slicing it corner to corner', 2, 'slice']],
  tostones: [['fry', 'Frying thick chunks of green plantain until just tender', 3.5, 'lower'], ['board', 'Smashing each chunk flat in the tostonera', 2.5, 'press'], ['fry', 'Dropping the discs back in the oil to crisp', 3, 'lower'], ['pass', 'Salting them hot, garlic mojo on the side', 2, 'garnish']],
  plantains: [['board', 'Peeling black-ripe plantains and slicing them on the bias', 2.5, 'slice'], ['fry', 'Frying the slices until the edges caramelise dark', 4, 'lower'], ['pass', 'Draining and plating them soft and sticky', 2.5, 'tongs']],
  arepa: [['flat', 'Griddling a patted corn-flour cake until crusted both sides', 4.5, 'turn'], ['board', 'Splitting it open like a pocket', 2, 'slice'], ['board', 'Stuffing it with shredded beef, black beans and white cheese', 3, 'place'], ['pass', 'Wrapping the bottom half in paper', 1.5, 'fold']],
  flan: [['cold', 'Running a knife round a chilled ramekin of flan', 3, 'slice'], ['pass', 'Flipping it onto a plate so the caramel runs down', 3, 'invert']],
  // Caribbean take-out
  'beef-patty': [['case', 'Taking a beef patty from the glass warmer with tongs', 2, 'tongs'], ['board', 'Tucking it into split coco bread and bagging it', 2, 'fold']],
  jerk: [['grill', 'Turning jerk chicken legs over the smoky drum grill', 4.5, 'tongs'], ['board', 'Chopping the chicken through the bone with a cleaver', 3, 'chop'], ['steam/tray', 'Scooping rice and peas with steamed cabbage', 2.5, 'scoop'], ['pass', 'Spooning jerk gravy over the chicken', 2, 'ladle']],
  oxtail: [['steam/ladle', 'Ladling oxtail and butter beans from the braising pot', 3.5, 'ladle'], ['steam/tray', 'Packing rice and peas into the container', 2.5, 'scoop'], ['pass', 'Spooning more gravy over the rice, cabbage and plantain beside', 3, 'ladle']],
  'curry-goat': [['steam/ladle', 'Ladling curry goat, bone-in, from the steam table', 3.5, 'ladle'], ['steam/tray', 'Scooping white rice alongside', 2.5, 'scoop'], ['pass', 'Adding steamed cabbage, curry gravy spooned over the rice', 3, 'ladle']],
  doubles: [['board', 'Laying two soft fried bara on wax paper', 2.5, 'place'], ['steam/ladle', 'Spooning curried channa across the bara', 2.5, 'ladle'], ['board', 'Dashing on tamarind, cucumber chutney and pepper sauce', 2.5, 'drizzle'], ['board', 'Twisting the paper shut around it', 1.5, 'fold']],
  roti: [['flat', 'Warming a dhalpuri roti skin on the tawa', 3, 'turn'], ['steam/ladle', 'Ladling curry chicken and potato into the middle', 3, 'ladle'], ['board', 'Folding the roti into a square parcel round the curry', 2.5, 'fold'], ['pass', 'Wrapping the parcel in wax paper and foil', 2, 'fold']],
  festival: [['fry', 'Dropping fingers of sweet cornmeal dough into the fryer', 4, 'lower'], ['fry', 'Turning them until deep golden', 2.5, 'tongs'], ['board', 'Draining and bagging them hot', 2, 'fold']],
  // smokehouse: the meat was done hours ago, the line cuts and plates it
  cornbread: [['oven/tray', 'Sliding a pan of cornbread out of the oven', 3, 'tray'], ['board', 'Cutting a thick square from the pan', 2, 'slice'], ['pass', 'Plating it with whipped honey butter', 2.5, 'turn']],
  'bbq-ribs': [['smoker', 'Lifting a rack of spare ribs out of the smoker', 3.5, 'tray'], ['grill', 'Mopping it with sauce and setting the glaze over the flame', 3.5, 'brush'], ['board', 'Slicing between the bones with a long knife', 3, 'slice'], ['pass', 'Stacking ribs on butcher paper with slaw and white bread', 2.5, 'place']],
  brisket: [['smoker', 'Unwrapping a brisket from its butcher paper, still steaming', 3.5, 'fold'], ['board', 'Slicing the flat against the grain, pencil-thick', 4, 'slice'], ['board', 'Cubing a few burnt ends off the point', 2.5, 'chop'], ['pass', 'Laying slices on a tray with pickles, onion and white bread', 3, 'tongs']],
  'pulled-pork': [['smoker', 'Pulling a pork shoulder from the smoker, the bone sliding free', 3.5, 'tray'], ['board/bowl', 'Shredding it with two forks, mixing in the bark', 3.5, 'shred'], ['flat', 'Toasting a potato bun on the griddle', 2, 'turn'], ['pass', 'Piling pork on the bun with vinegar sauce and slaw', 2.5, 'tongs']],
  'mac-cheese': [['steam/tray', 'Breaking through the browned top of the mac and cheese pan', 2.5, 'scoop'], ['steam/tray', 'Scooping a creamy spoonful with some of the crust', 2.5, 'scoop'], ['pass/bowl', 'Filling a side cup level and wiping the rim', 2, 'scoop']],
  collards: [['steam/ladle', 'Stirring the pot of collards stewed with smoked turkey', 2.5, 'stir'], ['steam/ladle', 'Lifting out greens with a slotted spoon and a little liquor', 3, 'ladle'], ['pass/bowl', 'Filling a side bowl, a dash of pepper vinegar over it', 2, 'ladle']],
  'banana-pudding': [['cold', 'Spooning banana pudding from the chilled pan, wafers and all', 3, 'scoop'], ['pass/cup', 'Filling a cup and crumbling vanilla wafers over the top', 3, 'scoop/garnish']],
  // kosher delicatessen
  knish: [['oven', 'Warming a potato knish in the oven until the crust crackles', 4, 'tray'], ['board', 'Splitting it open and striping it with brown mustard', 2.5, 'slice/drizzle'], ['pass', 'Setting it on a paper plate over wax paper', 1.5, 'turn']],
  pastrami: [['steam/tray', 'Forking a whole pastrami out of the steam box', 3.5, 'tongs'], ['board', 'Hand-slicing it thick across the grain, steam rising', 4, 'slice'], ['board', 'Stacking the slices high on rye spread with mustard', 3, 'place'], ['pass', 'Halving the sandwich, a half-sour pickle on the plate', 2.5, 'slice']],
  'matzo-ball': [['steam/ladle', 'Lifting a big matzo ball from its simmering pot', 3, 'ladle'], ['steam/ladle', 'Ladling golden chicken broth with carrot and noodles', 3.5, 'ladle'], ['pass/bowl', 'Finishing the bowl with fresh dill', 2.5, 'garnish']],
  reuben: [['steam/tray', 'Slicing hot corned beef from the steam box', 3, 'slice'], ['board', 'Building it on rye with sauerkraut, Swiss and Russian dressing', 3, 'place'], ['flat', 'Griddling it under a weight until the cheese runs', 4.5, 'press'], ['pass', 'Cutting it on the diagonal beside a pickle spear', 2.5, 'slice']],
  latkes: [['board/bowl', 'Grating potato and onion, wringing them dry in a towel', 3.5, 'grate'], ['range/pan', 'Dropping spoonfuls into shallow hot oil, pressing them flat', 4, 'scoop/press'], ['range/pan', 'Flipping them when the lacy edges turn deep brown', 3, 'turn'], ['pass', 'Draining and plating with applesauce and sour cream', 2.5, 'turn']],
  'hot-dog': [['flat', 'Rolling an all-beef frank on the griddle until the skin snaps', 4, 'tongs'], ['flat', 'Warming a split bun beside it', 2, 'turn'], ['board', 'Tucking it in the bun under mustard and sauerkraut', 2.5, 'place']],
  'pickle-plate': [['cold', 'Fishing half-sours out of the brine barrel with tongs', 2.5, 'tongs'], ['pass/bowl', 'Piling them in a steel bowl with pickled green tomato', 2, 'tongs']],
  // noodle shops and banh mi counters
  'scallion-pancake': [['range/pan', 'Laying a coiled scallion pancake in a slick of hot oil', 3.5, 'turn'], ['range/pan', 'Flipping it and pressing until both sides blister', 3.5, 'turn/press'], ['board', 'Scrunching it to open the layers, cutting six wedges', 2.5, 'slice'], ['pass', 'Fanning the wedges round a dish of ginger soy', 2, 'place']],
  'stir-fry': [['board', 'Cutting bok choy, snow peas, peppers and mushrooms', 3, 'slice'], ['wok', 'Flashing garlic and ginger in a smoking wok', 2, 'stir'], ['wok', 'Tossing the vegetables hard, a ladle of stock down the side', 3.5, 'toss'], ['wok', 'Tightening the sauce with a little slurry until glossy', 2, 'stir'], ['pass', 'Sliding it onto a plate beside steamed rice', 2, 'turn']],
  pho: [['range/pot', 'Dunking rice noodles in boiling water in a wire basket', 2.5, 'tongs'], ['board/bowl', 'Laying raw eye-round and brisket over the noodles', 2.5, 'place'], ['steam/ladle', 'Ladling boiling beef broth over to cook the rare beef', 3.5, 'ladle'], ['pass/bowl', 'Scattering scallion, onion and cilantro, herbs on a side plate', 2.5, 'garnish']],
  'banh-mi': [['oven', 'Crisping a short baguette in the oven', 3, 'tray'], ['board', 'Splitting it, spreading mayo and pâté', 2.5, 'slice/spread'], ['board', 'Layering grilled pork, pickled carrot and daikon, cucumber', 3, 'place'], ['pass', 'Tucking in cilantro and jalapeño, wrapping it in paper', 2.5, 'garnish']],
  'summer-rolls': [['board/bowl', 'Dipping a rice paper round in warm water', 2, 'dredge'], ['board', 'Laying shrimp halves, vermicelli, lettuce and mint on it', 3.5, 'place'], ['board', 'Folding the sides in and rolling it tight and clear', 2.5, 'roll'], ['pass', 'Halving the rolls beside a dish of peanut hoisin', 2.5, 'slice']],
  // West and East African kitchens
  jollof: [['steam/pot', 'Scooping jollof from the bottom of the pot, smoky bits and all', 3.5, 'scoop'], ['grill', 'Charring a stewed chicken leg on the grill', 4, 'tongs'], ['pass', 'Plating rice and chicken with plantain and pepper sauce', 3, 'scoop']],
  suya: [['board', 'Threading thin-sliced beef on skewers, patting on peanut spice', 3.5, 'place'], ['grill', 'Grilling the skewers over high flame, brushing with oil', 4.5, 'tongs'], ['board', 'Sliding the meat off and cutting it bite-size', 2.5, 'tongs'], ['pass', 'Wrapping it in paper with raw onion, tomato and more spice', 2.5, 'fold']],
  egusi: [['steam/ladle', 'Ladling egusi stew, melon seed, spinach and goat, into a bowl', 3.5, 'ladle'], ['range/pot', 'Working hot fufu in the pot with a wooden paddle', 3.5, 'stir'], ['board', 'Shaping the fufu into a smooth ball with wet hands', 2.5, 'shape'], ['pass/bowl', 'Setting the fufu beside the stew', 2, 'place']],
  injera: [['board/tray', 'Unrolling a round of injera across a wide platter', 2.5, 'roll'], ['steam/ladle', 'Spooning doro wat, red lentils and collards in mounds', 4, 'ladle'], ['steam/ladle', 'Adding yellow split peas and an egg from the stew', 2.5, 'ladle'], ['pass', 'Tucking rolled injera round the rim of the platter', 2.5, 'place']],
  'meat-pie': [['case', 'Taking a meat pie from the glass warmer', 2, 'tongs'], ['board', 'Slipping it into a paper bag', 1.5, 'fold']],
  'puff-puff': [['fry', 'Squeezing balls of yeasted batter off the fist into the oil', 4, 'shape'], ['fry', 'Rolling them in the fryer until evenly brown', 3, 'tongs'], ['board/bowl', 'Tossing them in sugar and bagging them hot', 2.5, 'stir']],
  // Japanese: sushi board out front, noodle boiler and fryer behind
  miso: [['steam/ladle', 'Whisking miso paste into a ladle of hot dashi', 3, 'whisk'], ['pass/bowl', 'Pouring it over tofu, wakame and scallion in a lacquer bowl', 3, 'ladle']],
  sushi: [['sushi', 'Pressing seasoned rice across a half sheet of nori', 3, 'spread'], ['sushi', 'Laying a strip of salmon along the rice', 2, 'place'], ['sushi', 'Rolling it in the bamboo mat and squaring the edges', 3, 'roll'], ['sushi', 'Cutting six pieces with a wet knife', 2.5, 'slice'], ['pass', 'Plating the roll with pickled ginger and wasabi', 2, 'place']],
  ramen: [['board/bowl', 'Spooning tare and scallion oil into a hot bowl', 2, 'ladle'], ['range/pot', 'Dropping a nest of noodles into the boiler basket', 3.5, 'tongs'], ['steam/ladle', 'Ladling pork-bone broth into the bowl over the tare', 3, 'ladle'], ['range/pot', 'Snapping the noodles dry and folding them into the broth', 2.5, 'drain'], ['pass/bowl', 'Laying on chashu, a soft egg, bamboo, scallion and nori', 3, 'garnish']],
  nigiri: [['sushi', 'Slicing tuna, salmon and yellowtail across the grain', 3.5, 'slice'], ['sushi', 'Shaping small pads of rice in a wet palm', 3, 'shape'], ['sushi', 'Dabbing wasabi and pressing each slice over its rice', 3, 'shape'], ['pass', 'Lining up the pieces with ginger, a brush of soy on top', 2.5, 'place']],
  'katsu-curry': [['board', 'Breading a pounded chicken cutlet in flour, egg and panko', 3, 'dredge'], ['fry', 'Frying the cutlet until the panko is deep gold', 4.5, 'lower'], ['board', 'Slicing the katsu into strips', 2, 'slice'], ['steam/ladle', 'Ladling dark curry sauce beside a mound of rice', 2.5, 'ladle'], ['pass', 'Leaning the katsu on the rice with red pickles', 2, 'place']],
  gyoza: [['range/pan', 'Lining gyoza in an oiled pan, pleats up', 3, 'tongs'], ['range/pan', 'Pouring in water and clamping the lid to steam them', 3.5, 'pour/tray'], ['range/pan', 'Lifting the lid so the bottoms fry crisp', 2.5, 'tray'], ['pass', 'Inverting them onto a plate, crust up, with dipping sauce', 2.5, 'invert']],
  tempura: [['board/bowl', 'Stirring ice-cold batter with chopsticks, lumps left in', 2.5, 'stir'], ['fry', 'Dipping butterflied shrimp and dropping them in the oil', 3.5, 'dredge/tongs'], ['fry', 'Flicking batter over them for a lacy crust', 2.5, 'garnish'], ['pass', 'Stacking them on paper with grated daikon and dipping broth', 2.5, 'tongs']],
  edamame: [['range/pot', 'Boiling soybean pods in salted water', 3.5, 'stir'], ['board/bowl', 'Draining and tossing them with flaky sea salt', 2.5, 'stir'], ['pass/bowl', 'Heaping them in a bowl with a dish for the shells', 2, 'scoop']],
  onigiri: [['sushi/bowl', 'Wetting and salting the palms, taking a handful of warm rice', 2.5, 'shape'], ['sushi', 'Pressing salted salmon into the middle, shaping a triangle', 3, 'shape'], ['pass', 'Wrapping it in crisp nori and setting it on a plate', 2, 'fold']],
  mochi: [['cold', 'Taking mochi ice cream from the freezer and halving each piece', 3.5, 'tongs/slice'], ['pass', 'Fanning the halves on a small plate', 2.5, 'place']],
  // Korean
  kimbap: [['sushi', 'Spreading sesame-oiled rice over a sheet of seaweed', 3, 'spread'], ['sushi', 'Lining up spinach, carrot, pickled radish, egg and fish cake', 3, 'place'], ['sushi', 'Rolling it tight in the mat and brushing it with sesame oil', 3, 'roll'], ['pass', 'Slicing it into coins and sprinkling sesame seeds', 2.5, 'slice']],
  bibimbap: [['range/bowl', 'Heating a stone bowl on the burner, sesame oil and rice in', 3.5, 'tray'], ['board', 'Arranging seasoned spinach, sprouts, carrot and zucchini', 3.5, 'place'], ['range/pan', 'Frying an egg sunny-side up', 2.5, 'turn'], ['pass/bowl', 'Crowning it with beef, the egg and a spoon of gochujang', 2.5, 'garnish']],
  'korean-fried-chicken': [['fry', 'Frying battered wings low and slow the first time', 4, 'lower'], ['fry', 'Resting them, then frying again hot for a glassy crust', 4, 'drain/lower'], ['board/bowl', 'Tossing them in soy-garlic glaze in a steel bowl', 3, 'stir'], ['pass', 'Piling them up with cubes of pickled radish', 2, 'tongs']],
  bulgogi: [['grill', 'Spreading marinated ribeye slices over the hot grill', 4, 'tongs'], ['grill', 'Turning the beef with onion and scallion until caramelised', 3.5, 'tongs'], ['pass', 'Sliding it onto a sizzling platter with rice and lettuce', 3, 'turn']],
  tteokbokki: [['range/pan', 'Simmering anchovy stock with gochujang and chili flakes', 3.5, 'stir'], ['range/pan', 'Adding rice cakes and fish cake, stirring as it thickens', 4.5, 'stir'], ['pass/bowl', 'Spooning it glossy into a bowl with scallion and a boiled egg', 2.5, 'ladle']],
  'kimchi-jjigae': [['range/pot', 'Frying pork belly and old kimchi in an earthenware pot', 4, 'stir'], ['range/pot', 'Pouring in stock and kimchi brine, bringing it to a hard boil', 4, 'pour'], ['range/pot', 'Sliding in slabs of tofu and scallion', 2.5, 'place'], ['pass/bowl', 'Sending it out still bubbling with a bowl of rice', 2, 'tray']],
  japchae: [['range/pot', 'Boiling sweet potato glass noodles until springy', 3.5, 'tongs'], ['range/pan', 'Stir-frying beef, spinach, carrot, onion and mushrooms', 3.5, 'stir'], ['range/pan', 'Tossing the noodles through with soy, sugar and sesame oil', 3, 'toss'], ['pass', 'Mounding it on a plate with egg ribbons and sesame seeds', 2.5, 'tongs']],
  // Thai
  'pad-thai': [['wok', 'Frying tofu, shallot and shrimp in a hot wok', 3, 'stir'], ['wok', 'Adding soaked rice noodles and tamarind sauce, tossing', 3.5, 'tongs'], ['wok', 'Pushing them aside to scramble an egg, folding it through', 3, 'stir'], ['wok', 'Throwing in bean sprouts and garlic chives at the end', 2, 'toss'], ['pass', 'Plating with crushed peanuts, lime and chili flakes', 2.5, 'garnish']],
  'green-curry': [['wok', 'Cracking coconut cream in the wok, frying green curry paste', 3.5, 'stir'], ['wok', 'Simmering chicken, Thai eggplant and bamboo in coconut milk', 4.5, 'stir'], ['wok', 'Seasoning with fish sauce and palm sugar, wilting in basil', 2.5, 'pour'], ['pass/bowl', 'Ladling it into a bowl beside jasmine rice', 2.5, 'ladle']],
  'tom-yum': [['range/pot', 'Bruising lemongrass, galangal and lime leaf into boiling stock', 3.5, 'mash'], ['range/pot', 'Poaching shrimp and mushrooms in the broth', 3.5, 'stir'], ['range/pot', 'Stirring in chili jam, fish sauce and lime off the heat', 3, 'stir'], ['pass/bowl', 'Ladling it out with cilantro on top', 2, 'ladle']],
  'papaya-salad': [['board', 'Shredding green papaya into long threads', 3, 'grate'], ['board/bowl', 'Pounding garlic, chilies, long beans and tomato in the mortar', 3.5, 'mash'], ['board/bowl', 'Tossing in papaya, lime, fish sauce and palm sugar', 3, 'stir'], ['pass', 'Plating with roasted peanuts and a wedge of cabbage', 2.5, 'garnish']],
  satay: [['grill', 'Laying turmeric-marinated chicken skewers over the coals', 4, 'tongs'], ['grill', 'Turning and basting them with coconut milk', 3, 'tongs/brush'], ['range/pan', 'Warming peanut sauce in a small pan', 2, 'stir'], ['pass', 'Plating the skewers with peanut sauce and cucumber relish', 2.5, 'place']],
  'mango-sticky-rice': [['steam/bowl', 'Scooping warm sticky rice soaked in sweet coconut milk', 3, 'scoop'], ['board', 'Peeling a ripe mango and slicing the cheek', 3.5, 'slice'], ['pass', 'Pouring salted coconut cream over, toasted mung beans on top', 2.5, 'pour']],
  // Indian: tandoor, curry pans, the dosa griddle
  samosa: [['fry', 'Lowering potato-and-pea samosas into the fryer', 4, 'lower'], ['fry', 'Lifting them when the pastry blisters golden', 2, 'drain'], ['pass', 'Plating two with tamarind and mint chutneys', 2.5, 'tongs']],
  tikka: [['oven', 'Roasting skewers of yogurt-marinated chicken in the tandoor', 4.5, 'tongs'], ['range/pan', 'Simmering tomato-cream masala with fenugreek and butter', 3.5, 'stir'], ['range/pan', 'Sliding the charred tikka into the sauce to finish', 3, 'tongs'], ['pass/bowl', 'Serving it in a copper bowl with a swirl of cream, rice beside', 2.5, 'ladle']],
  'saag-paneer': [['range/pan', 'Browning cubes of paneer in ghee', 3, 'turn'], ['range/pan', 'Frying cumin, garlic and ginger, adding puréed spinach', 3.5, 'stir'], ['range/pan', 'Folding the paneer in and finishing with cream', 3, 'stir'], ['pass/bowl', 'Spooning it into a bowl with a thread of cream', 2, 'ladle']],
  biryani: [['steam/pot', 'Lifting the lid of the sealed pot, saffron steam rising', 3, 'tray'], ['steam/pot', 'Scooping layered rice and chicken from the bottom up', 3.5, 'scoop'], ['pass', 'Mounding it with fried onions and mint, raita on the side', 3, 'scoop']],
  naan: [['board', 'Stretching a ball of dough into a teardrop', 2.5, 'stretch'], ['oven', 'Slapping it onto the wall of the tandoor', 3.5, 'place'], ['oven', 'Hooking it out blistered and charred with the skewers', 2, 'tongs'], ['pass', 'Brushing it with garlic butter and cilantro, into a basket', 2.5, 'brush']],
  dosa: [['flat', 'Spreading fermented batter in a thin spiral on the griddle', 3.5, 'spread'], ['flat', 'Drizzling ghee and letting the edges lift and crisp', 3, 'drizzle'], ['flat', 'Spooning spiced potato down the middle and rolling it', 3, 'scoop/roll'], ['pass', 'Plating the long roll with sambar and coconut chutney', 2.5, 'turn']],
  chana: [['range/pan', 'Frying onion, ginger, garlic and whole cumin', 3, 'stir'], ['range/pan', 'Adding tomato, ground spices and simmered chickpeas', 4, 'stir'], ['range/pan', 'Mashing a few chickpeas to thicken the gravy', 2.5, 'mash'], ['pass/bowl', 'Finishing with ginger slivers, cilantro and lemon', 2.5, 'garnish']],
  'gulab-jamun': [['steam/ladle', 'Lifting two gulab jamun from warm rose-cardamom syrup', 3, 'ladle'], ['pass/bowl', 'Serving them in a small bowl with syrup and pistachio', 3, 'ladle']],
  // fried chicken counters
  'fried-chicken': [['board/bowl', 'Dredging a breast, thigh and leg in seasoned flour', 3, 'dredge'], ['fry', 'Lowering the pieces into the pressure fryer', 5, 'lower'], ['fry', 'Lifting the basket and letting the oil drain', 2.5, 'drain'], ['pass', 'Boxing three pieces with a split buttermilk biscuit', 2.5, 'tongs']],
  wings: [['fry', 'Dropping a basket of naked wings into the fryer', 4.5, 'lower'], ['fry', 'Shaking the basket and hanging it to drain', 2, 'drain'], ['board/bowl', 'Tossing them in a steel bowl with hot sauce and butter', 3, 'stir'], ['pass', 'Piling them up with celery, carrots and blue cheese', 2.5, 'tongs']],
  fries: [['fry', 'Dropping a basket of fries into the oil', 4, 'lower'], ['fry', 'Shaking the basket and hanging it to drain', 2, 'drain'], ['board/tray', 'Dumping them under the heat lamp and salting them', 2, 'garnish'], ['pass', 'Scooping them into a paper sleeve', 1.5, 'scoop']],
  'chicken-sandwich': [['fry', 'Frying a buttermilk-brined chicken breast', 5, 'lower'], ['flat', 'Toasting a buttered potato bun on the griddle', 2.5, 'turn'], ['board', 'Spreading mayo, laying pickle chips, setting the chicken on', 2.5, 'spread/place'], ['pass', 'Wrapping it in foil-lined paper', 1.5, 'fold']],
  tenders: [['board/bowl', 'Breading chicken tenderloins in seasoned flour', 2.5, 'dredge'], ['fry', 'Frying them until they float and turn golden', 4.5, 'lower'], ['fry', 'Hanging the basket to drain', 2, 'drain'], ['pass', 'Boxing them with honey mustard and barbecue dip', 2, 'tongs']],
  coleslaw: [['cold', 'Scooping creamy coleslaw from the cold well', 2.5, 'scoop'], ['pass/cup', 'Packing it into a side cup and snapping on the lid', 2, 'scoop']],
  // burger joints: everything happens on the flat-top
  burger: [['flat', 'Smashing a ball of beef onto the flat-top, salt and pepper', 3.5, 'press'], ['flat', 'Scraping and flipping it, laying American cheese on', 3, 'turn'], ['flat', 'Toasting the bun face-down in the beef fat', 2, 'turn'], ['board', 'Dressing the bun with pickles, onion, ketchup and mustard', 2.5, 'place'], ['pass', 'Wrapping it in paper', 1.5, 'fold']],
  'burger-deluxe': [['flat', 'Pressing a thick patty onto the flat-top', 4, 'press'], ['flat', 'Flipping it and melting cheese under a dome', 3, 'turn/place'], ['fry', 'Dropping fries for the deluxe plate', 3, 'lower'], ['board', 'Setting lettuce, tomato and raw onion on the toasted bun', 2.5, 'place'], ['pass', 'Plating it open-faced with fries, a pickle and slaw', 2.5, 'tray']],
  'burger-double': [['flat', 'Smashing two balls of beef onto the flat-top', 3.5, 'press'], ['flat', 'Flipping both, a slice of American cheese on each', 3, 'turn/place'], ['flat', 'Stacking one patty on the other and toasting the bun', 2.5, 'turn'], ['board', 'Dressing it with pickles, onion and burger sauce', 2.5, 'place'], ['pass', 'Wrapping the double in paper', 1.5, 'fold']],
  'bacon-burger': [['flat', 'Laying bacon strips on the flat-top under a press', 3.5, 'tongs'], ['flat', 'Smashing the patty in the bacon fat, flipping, cheese on', 4, 'press'], ['flat', 'Toasting the bun beside it', 2, 'turn'], ['board', 'Crossing the bacon over the patty, lettuce and tomato on', 2.5, 'place'], ['pass', 'Wrapping it in paper', 1.5, 'fold']],
  'onion-rings': [['board/bowl', 'Dipping thick onion rings in beer batter', 2.5, 'dredge'], ['fry', 'Dropping them one by one into the fryer', 4, 'lower'], ['fry', 'Turning them and lifting the basket when golden', 2.5, 'drain'], ['pass', 'Salting and stacking them in a paper boat', 2, 'garnish']],
  sliders: [['flat', 'Pressing three small patties onto a bed of griddled onions', 4, 'press'], ['flat', 'Flipping them, cheese on, buns set on top to steam', 3.5, 'turn'], ['board', 'Capping each with a pickle chip', 2, 'place'], ['pass', 'Lining the three up on a plate, a pick through each', 2, 'place']],
  'mozz-sticks': [['fry', 'Dropping breaded mozzarella sticks into the fryer', 3.5, 'lower'], ['fry', 'Pulling them the moment the cheese starts to ooze', 2, 'drain'], ['steam/ladle', 'Ladling warm marinara into a dipping cup', 2, 'ladle'], ['pass', 'Stacking them log-cabin style round the marinara', 2, 'place']],
  // sandwich shops and the bodega griddle
  hero: [['board', 'Slicing roast turkey to order on the slicer', 3.5, 'slice'], ['board', 'Splitting a hero roll, layering on turkey and Swiss', 3, 'slice/place'], ['board', 'Topping with shredded lettuce, tomato, onion and mayo', 3, 'garnish'], ['pass', 'Halving it and rolling it tight in deli paper', 2, 'slice/fold']],
  'italian-hero': [['board', 'Slicing ham, salami, capicola and provolone on the slicer', 4, 'slice'], ['board', 'Shingling the meats and cheese along a seeded hero', 3, 'place'], ['board', 'Piling on lettuce, tomato, onion, oil, vinegar and oregano', 3, 'garnish'], ['pass', 'Halving it and wrapping it in deli paper', 2, 'slice/fold']],
  'cutlet-hero': [['fry', 'Frying a breaded chicken cutlet until crisp', 4.5, 'lower'], ['board', 'Splitting a hero, spreading mayo, laying on the cutlet', 3, 'slice/spread'], ['board', 'Adding lettuce, tomato, salt, pepper, oil and vinegar', 2.5, 'place'], ['pass', 'Cutting it in half and wrapping it in foil and paper', 2, 'slice/fold']],
  'grilled-cheese': [['flat', 'Laying two buttered slices of white bread on the griddle', 3, 'place'], ['flat', 'Covering them with American cheese and closing the sandwich', 2.5, 'place'], ['flat', 'Flipping it golden and pressing it with the spatula', 3, 'turn/press'], ['pass', 'Cutting it corner to corner so the cheese pulls', 2, 'slice']],
  blt: [['flat', 'Crisping bacon on the griddle under a press', 4, 'tongs'], ['oven', 'Running white bread through the toaster', 2, 'tray'], ['board', 'Spreading mayo, stacking bacon, tomato slices and iceberg', 3, 'spread/place'], ['pass', 'Cutting it in triangles and pinning them with picks', 2, 'slice']],
  soup: [['steam/ladle', 'Stirring the chicken noodle in the soup well', 2.5, 'stir'], ['steam/ladle', 'Ladling a pint container full', 2.5, 'ladle'], ['pass/bowl', 'Snapping the lid on, a packet of crackers alongside', 2, 'fold']],
  chips: [['case', 'Pulling a bag of potato chips off the clip rack', 1.5, 'fetch']],
  cookie: [['case', 'Lifting a chocolate chip cookie from the jar with wax tissue', 2, 'tongs']],
  bec: [['flat', 'Laying bacon on the griddle', 3, 'tongs'], ['flat', 'Cracking two eggs, breaking the yolks, folding them square', 3.5, 'crack'], ['flat', 'Melting American cheese over the eggs, bacon on top', 2.5, 'turn'], ['board', 'Sliding it onto a buttered kaiser roll; salt, pepper, ketchup', 2.5, 'turn'], ['pass', 'Wrapping it tight in foil', 1.5, 'fold']],
  'egg-cheese': [['flat', 'Cracking two eggs on the griddle and scrambling them flat', 3.5, 'crack'], ['flat', 'Folding the eggs and melting American cheese over', 2.5, 'turn'], ['board', 'Scooping it onto a split, buttered roll', 2.5, 'turn'], ['pass', 'Wrapping it in foil', 1.5, 'fold']],
  'chopped-cheese': [['flat', 'Throwing ground beef and onions on the griddle', 3.5, 'turn'], ['flat', 'Chopping the meat with the spatula as it browns', 3.5, 'scrape'], ['flat', 'Laying American cheese over and chopping it in to melt', 2.5, 'place'], ['board', 'Scraping it into a hero with lettuce, tomato, ketchup, mayo', 3, 'turn'], ['pass', 'Pressing the hero shut and wrapping it in foil', 2, 'fold']],
  'deli-sandwich': [['board', 'Shaving cold cuts to order on the slicer', 3.5, 'slice'], ['board', 'Building the sandwich on a roll with cheese, lettuce, tomato', 3, 'place'], ['pass', 'Cutting it in half and wrapping it in deli paper', 2, 'slice/fold']],
  'roast-chicken': [['spit', 'Sliding a browned chicken off the rotisserie spit', 3, 'tray'], ['board', 'Tying its legs and sealing it in a hot foil-lined bag', 3, 'fold']],
  // bakeries: baked before dawn, sold from the case
  'butter-roll': [['board', 'Slicing a kaiser roll and spreading butter edge to edge', 3, 'slice/spread'], ['board', 'Wrapping it in wax paper', 1.5, 'fold']],
  'bw-cookie': [['case', 'Lifting a black and white cookie from the tray with tissue', 2, 'tongs']],
  rye: [['case', 'Taking a seeded rye from the shelf', 2, 'fetch'], ['board', 'Running it through the bread slicer and bagging it', 2.5, 'slice']],
  croissant: [['case', 'Lifting a croissant from the case with tongs', 2, 'tongs']],
  cheesecake: [['cold', 'Cutting a wedge of cheesecake with a hot, wet knife', 3, 'slice'], ['pass', 'Setting the wedge on a plate with a fork', 2.5, 'turn']],
  cannoli: [['board', 'Piping sweet ricotta into a crisp shell from both ends', 3, 'pipe'], ['pass', 'Dipping the ends in chocolate chips, dusting with sugar', 2.5, 'garnish']],
  cupcake: [['case', 'Lifting a frosted cupcake from the case into a clear box', 2, 'tongs']],
  rugelach: [['case', 'Tonging rugelach from the tray into a white paper bag', 2.5, 'tongs']],
  challah: [['case', 'Taking a braided challah from the rack and bagging it', 2.5, 'fold']],
  babka: [['case', 'Sliding a chocolate babka loaf into a box, tying the string', 3, 'fold']],
  muffin: [['case', 'Lifting a blueberry muffin from the case with tissue', 2, 'tongs']],
  doughnut: [['case', 'Picking a glazed doughnut off the rack with wax tissue', 2, 'tongs']],
  'doughnut-chocolate': [['case', 'Lifting a chocolate frosted doughnut from the tray', 2, 'tongs']],
  'doughnut-sprinkle': [['case', 'Picking a sprinkle doughnut from the tray with tissue', 2, 'tongs']],
  'doughnut-jelly': [['case', 'Taking a sugared jelly doughnut from the rack', 2, 'tongs']],
  'boston-cream': [['case', 'Lifting a Boston cream from the tray, minding the glaze', 2, 'tongs']],
  'doughnut-box': [['case', 'Unfolding a box and filling it with six from the racks', 3.5, 'fold/tongs'], ['case', 'Closing the lid and taping it shut', 2, 'fold']],
  // bagel shops
  bagel: [['board', 'Slicing a bagel through the middle with the long knife', 2.5, 'slice'], ['board', 'Scraping on a thick schmear of cream cheese', 2.5, 'spread'], ['board', 'Closing it, cutting it in half and wrapping it in paper', 2, 'slice/fold']],
  lox: [['board', 'Slicing a bagel and spreading it with cream cheese', 3, 'slice/spread'], ['board', 'Hand-slicing nova paper-thin off the side of salmon', 3.5, 'slice'], ['board', 'Draping the lox, adding tomato, red onion and capers', 3, 'place'], ['pass', 'Halving it and wrapping it in wax paper', 2, 'slice/fold']],
  'bagel-everything': [['board', 'Slicing an everything bagel in two', 2, 'slice'], ['oven', 'Running the halves through the conveyor toaster', 2.5, 'tray'], ['board', 'Buttering both halves hot, closing and wrapping it', 2.5, 'spread/fold']],
  'bagel-bec': [['flat', 'Frying bacon and two eggs on the griddle', 4, 'tongs/crack'], ['flat', 'Folding the eggs, cheese on top to melt', 2.5, 'turn'], ['board', 'Slicing a bagel and loading it with egg, cheese and bacon', 3, 'slice/place'], ['pass', 'Wrapping it in foil', 1.5, 'fold']],
  bialy: [['case', 'Bagging an onion bialy from the wire bin', 2, 'fold']],
  // juice bars
  acai: [['blender', 'Blending frozen açaí with banana until thick as sorbet', 4, 'blend'], ['board/bowl', 'Scraping it into a bowl and levelling the top', 2.5, 'scoop'], ['pass/bowl', 'Lining up granola, banana, strawberry and a thread of honey', 3, 'garnish']],
  'avocado-toast': [['oven', 'Toasting a thick slice of sourdough', 3, 'tray'], ['board/bowl', 'Smashing avocado with lemon, salt and olive oil', 3, 'mash'], ['board', 'Spreading it thick on the toast', 2, 'spread'], ['pass', 'Finishing with chili flakes, sea salt and sliced radish', 2.5, 'garnish']],
  'cut-fruit': [['board', 'Cutting melon, pineapple and mango into chunks', 3.5, 'slice'], ['pass/cup', 'Filling a clear cup with fruit and snapping on the lid', 2.5, 'scoop']],
  // ice-cream parlours
  cone: [['scoop', 'Rolling a ball of ice cream with a dipped scoop', 3, 'scoop'], ['scoop', 'Pressing it firmly onto a sugar cone', 2, 'scoop']],
  sundae: [['scoop', 'Dipping two scoops of vanilla into a tulip glass', 3, 'scoop'], ['scoop/ladle', 'Ladling hot fudge over so it runs down the sides', 2.5, 'ladle'], ['pass', 'Topping with whipped cream, chopped nuts and a cherry', 2.5, 'pipe/garnish']],
  'soft-serve': [['scoop', 'Pulling the lever and swirling soft serve up a cone', 3.5, 'dispense']],
  'ice-cream-cup': [['scoop', 'Dipping two scoops and packing them into a paper cup', 4, 'scoop']],
  'banana-split': [['board', 'Splitting a banana lengthwise into a boat dish', 2.5, 'slice'], ['scoop', 'Setting vanilla, chocolate and strawberry between the halves', 3.5, 'scoop'], ['scoop/ladle', 'Saucing each scoop: pineapple, fudge, strawberry', 3, 'ladle'], ['pass', 'Piping whipped cream, scattering nuts, three cherries on top', 2.5, 'pipe/garnish']],
  'ice-cream-sandwich': [['scoop', 'Pressing a scoop of vanilla between two chocolate chip cookies', 3.5, 'scoop'], ['board', 'Squaring the edge and wrapping it in wax paper', 2, 'fold']],
  'italian-ice': [['scoop', 'Scraping lemon ice from the tub with a flat paddle', 3, 'scoop'], ['scoop/cup', 'Packing it into a pleated paper cup', 2, 'scoop']],
  // Italian dining rooms
  pasta: [['range/pot', 'Dropping spaghetti into salted boiling water', 4, 'tongs'], ['range/pan', 'Simmering crushed tomatoes with garlic and basil', 4, 'stir'], ['range/pan', 'Tossing the spaghetti through the sauce', 3, 'toss'], ['pass/bowl', 'Twirling it into a warm bowl with basil and parmesan', 2.5, 'tongs']],
  parm: [['board', 'Pounding a veal cutlet thin and breading it', 3, 'pound'], ['range/pan', 'Pan-frying the cutlet in olive oil until golden', 4, 'turn'], ['oven', 'Spooning on marinara and mozzarella, into the broiler', 3.5, 'ladle/tray'], ['pass', 'Plating it bubbling beside a twirl of spaghetti', 2.5, 'turn']],
  meatballs: [['range/pan', 'Simmering meatballs in a pan of tomato gravy', 4, 'stir'], ['range/pot', 'Dropping spaghetti into salted boiling water', 4, 'tongs'], ['range/pan', 'Tossing the spaghetti in the sauce with pasta water', 3, 'toss'], ['pass/bowl', 'Setting three meatballs on top, grating pecorino over', 2.5, 'tongs']],
  lasagna: [['board/tray', 'Cutting a square from the tray of lasagna', 2.5, 'slice'], ['oven', 'Baking the portion in a gratin dish with extra sauce', 5, 'tray'], ['oven', 'Flashing it under the salamander to blister the cheese', 2.5, 'tray'], ['pass', 'Setting the hot dish on a plate, basil and parmesan over', 2.5, 'tray']],
  alfredo: [['range/pot', 'Dropping fresh fettuccine into salted boiling water', 3.5, 'tongs'], ['range/pan', 'Melting butter with cream and a ladle of pasta water', 3, 'stir'], ['range/pan', 'Tossing the fettuccine with handfuls of parmesan', 3.5, 'toss'], ['pass/bowl', 'Twirling it into a warm bowl, black pepper over', 2.5, 'tongs']],
  caprese: [['board', 'Slicing beefsteak tomato and fresh mozzarella', 3.5, 'slice'], ['cold/plate', 'Shingling them on a plate with whole basil leaves', 3, 'place'], ['pass', 'Dressing with olive oil, sea salt and cracked pepper', 2.5, 'drizzle']],
  calamari: [['board/bowl', 'Tossing squid rings and tentacles in seasoned flour', 2.5, 'dredge'], ['fry', 'Frying them fast in very hot oil', 3.5, 'lower'], ['fry', 'Draining the basket and salting at once', 2, 'drain'], ['pass', 'Heaping them on paper with lemon and warm marinara', 2.5, 'tongs']],
  tiramisu: [['cold/tray', 'Cutting a square of tiramisu from the chilled pan', 3, 'slice'], ['pass', 'Dusting it with cocoa through a sieve', 2.5, 'garnish']],
  // diners: the short-order cook and the flat-top
  eggs: [['flat', 'Scraping home fries across the flat-top with onions', 3.5, 'scrape'], ['flat', 'Cracking two eggs onto the griddle, over easy', 3.5, 'crack'], ['oven', 'Dropping two slices of rye in the toaster', 2, 'tray'], ['pass', 'Plating eggs and home fries, buttered toast in triangles', 2.5, 'turn']],
  pie: [['case', 'Cutting a wedge of apple pie from the rotating case', 2.5, 'slice'], ['pass', 'Sliding it onto a plate with a squirt of whipped cream', 2, 'turn']],
  pancakes: [['flat', 'Ladling three rounds of buttermilk batter onto the griddle', 3.5, 'ladle'], ['flat', 'Flipping them when the bubbles pop and hold', 3.5, 'turn'], ['pass', 'Stacking them with a scoop of butter and warm syrup', 2.5, 'turn']],
  omelette: [['flat', 'Sautéing diced ham, peppers and onions on the griddle', 3, 'turn'], ['range/pan', 'Pouring beaten eggs into a hot buttered pan', 3, 'pour'], ['range/pan', 'Scattering in the ham and peppers, folding it over', 3, 'turn'], ['oven', 'Dropping two slices of white in the toaster', 2, 'tray'], ['pass', 'Plating it with home fries and buttered toast', 2.5, 'turn']],
  club: [['flat', 'Crisping bacon on the griddle', 3.5, 'tongs'], ['oven', 'Toasting three slices of white bread', 2.5, 'tray'], ['board', 'Building two decks: turkey and lettuce, bacon and tomato', 3.5, 'place'], ['board', 'Pinning it with frill picks and cutting it in quarters', 2.5, 'slice'], ['pass', 'Standing the quarters round a pile of fries and a pickle', 2.5, 'place']],
  meatloaf: [['flat', 'Searing a thick slice of meatloaf on the griddle', 4, 'turn'], ['steam/ladle', 'Scooping mashed potatoes and ladling brown gravy', 3, 'scoop/ladle'], ['pass', 'Plating with gravy over the loaf and buttered green beans', 3, 'ladle']],
  caesar: [['board', 'Chopping chilled romaine hearts', 3, 'chop'], ['cold/bowl', 'Tossing with Caesar dressing, anchovy, lemon and croutons', 3.5, 'stir'], ['pass/bowl', 'Plating it high and shaving parmesan over', 2.5, 'garnish']],
  // French bistro
  quiche: [['board', 'Cutting a wedge from the quiche Lorraine', 2.5, 'slice'], ['oven', 'Warming the slice until the custard just trembles', 4, 'tray'], ['pass', 'Plating it with dressed green leaves', 2.5, 'turn']],
  'steak-frites': [['range/pan', 'Searing a hanger steak hard in a black steel pan', 4, 'tongs'], ['fry', 'Dropping hand-cut fries for their second fry', 3.5, 'lower'], ['range/pan', 'Basting the steak with butter, thyme and garlic', 3, 'baste'], ['board', 'Resting it, then slicing against the grain', 3, 'rest/slice'], ['pass', 'Fanning the steak by a tangle of frites, herb butter on top', 2.5, 'place']],
  'onion-soup': [['steam/ladle', 'Ladling caramelised onion broth into a crock', 3, 'ladle'], ['board/bowl', 'Floating a crouton, covering it with grated Gruyère', 2.5, 'place'], ['oven/bowl', 'Sliding the crock under the salamander until it blisters', 4, 'tray'], ['pass/bowl', 'Setting the bubbling crock on a lined plate', 2, 'tray']],
  croque: [['board', 'Spreading béchamel on bread, layering ham and Gruyère', 3, 'spread'], ['flat', 'Griddling the sandwich in butter on both sides', 3.5, 'press'], ['oven', 'Topping with béchamel and cheese, under the salamander', 3.5, 'spread/tray'], ['pass', 'Plating it blistered with cornichons and salad', 2.5, 'turn']],
  moules: [['range/pot', 'Sweating shallot and garlic in butter in a deep pot', 2.5, 'stir'], ['range/pot', 'Tipping in mussels and white wine, clamping on the lid', 4, 'pour'], ['fry', 'Frying a basket of frites', 3.5, 'lower'], ['range/pot', 'Shaking the pot, finishing with cream and parsley', 2.5, 'stir'], ['pass/pot', 'Sending out the pot with a cone of frites and a shell bowl', 2.5, 'tray']],
  'duck-confit': [['range/pan', 'Crisping a confit duck leg skin-down in a pan', 4.5, 'turn'], ['oven', 'Finishing it in the oven until the skin shatters', 3.5, 'tray'], ['range/pan', 'Frying sliced potatoes in duck fat with garlic and parsley', 3.5, 'turn'], ['pass', 'Setting the leg on the potatoes with dressed frisée', 2.5, 'tongs']],
  'creme-brulee': [['cold/bowl', 'Taking a set custard from the reach-in, sugaring the top', 3, 'fetch'], ['pass/bowl', 'Torching the sugar to an amber glass', 3, 'torch']],
  crepe: [['flat', 'Spreading thin batter on the crêpe iron with the rake', 3.5, 'spread'], ['flat', 'Flipping it, scattering sugar and a squeeze of lemon', 3, 'turn'], ['flat', 'Folding it in quarters on the iron', 2, 'fold'], ['pass', 'Plating it under a snow of powdered sugar', 2, 'garnish']],
  // seafood houses
  'fish-sandwich': [['board/bowl', 'Dipping a cod fillet in batter', 2.5, 'dredge'], ['fry', 'Frying the fillet until crisp and floating', 4.5, 'lower'], ['flat', 'Toasting a buttered bun', 2, 'turn'], ['pass', 'Building it with tartar sauce, lettuce and pickles', 2.5, 'place']],
  'grilled-salmon': [['grill', 'Laying a salmon fillet skin-down on the oiled grill', 4.5, 'turn'], ['range/pan', 'Browning boiled potatoes in butter with parsley', 3.5, 'turn'], ['grill', 'Turning the salmon once, just to medium', 3, 'turn'], ['pass', 'Plating the fillet over the potatoes with lemon and dill', 2.5, 'turn']],
  'fish-chips': [['board/bowl', 'Dragging cod fillets through beer batter', 2.5, 'dredge'], ['fry', 'Lowering the fish into the oil, laying it away from the hand', 4.5, 'lower'], ['fry', 'Dropping a basket of thick chips in the second fryer', 3.5, 'lower'], ['pass', 'Plating both with tartar sauce, lemon and malt vinegar', 2.5, 'tongs']],
  'lobster-roll': [['board/bowl', 'Dressing claw and knuckle meat lightly with mayo and lemon', 3.5, 'stir'], ['flat', 'Griddling a split-top bun in butter on both flat sides', 3, 'turn'], ['board', 'Heaping the lobster into the bun, chives on top', 2.5, 'scoop'], ['pass', 'Plating it with chips and a pickle', 2, 'place']],
  oysters: [['cold', 'Pulling six oysters off the ice', 2, 'tongs'], ['cold/board', 'Shucking each at the hinge and cutting the muscle free', 4.5, 'shuck'], ['cold/tray', 'Bedding the shells level on crushed ice', 2.5, 'place'], ['pass/tray', 'Adding lemon, mignonette and cocktail sauce', 2, 'garnish']],
  chowder: [['steam/ladle', 'Stirring the chowder kettle so the clams come up', 2.5, 'stir'], ['steam/ladle', 'Ladling it thick with potato into a warm bowl', 3, 'ladle'], ['pass/bowl', 'Finishing with parsley, black pepper and oyster crackers', 2.5, 'garnish']],
  'shrimp-cocktail': [['cold', 'Taking poached jumbo shrimp from the ice bath', 2.5, 'tongs'], ['cold/bowl', 'Hanging them round a coupe of crushed ice', 3, 'place'], ['pass/bowl', 'Spooning in horseradish cocktail sauce, lemon on the rim', 2.5, 'ladle']],
  lobster: [['range/pot', 'Dropping a live lobster into the steamer pot, lid on', 5, 'tongs'], ['board', 'Cracking the claws and splitting the tail', 3.5, 'slice'], ['range/pan', 'Melting butter and skimming it clear', 2, 'stir'], ['pass', 'Plating it bright red with drawn butter and lemon', 2.5, 'tray']],
  // steakhouse: sear, baste, rest, slice
  steak: [['grill', 'Salting a dry-aged strip and laying it under the broiler', 4.5, 'garnish/tongs'], ['grill', 'Flipping it once the crust is dark', 3.5, 'tongs'], ['range/pan', 'Basting it with foaming butter', 3, 'baste'], ['board', 'Resting it, then slicing across the grain', 3.5, 'rest/slice'], ['pass', 'Sending it out on a scorching plate in its own butter', 2.5, 'tray']],
  ribeye: [['range/pan', 'Searing a bone-in ribeye in a ripping-hot iron pan', 4.5, 'tongs'], ['range/pan', 'Basting it with butter, garlic and thyme', 3.5, 'baste'], ['oven', 'Finishing it in the oven to medium-rare', 3, 'tray'], ['board', 'Resting it, then carving it off the bone in thick slices', 3.5, 'rest/slice'], ['pass', 'Fanning the slices by the bone with flaky salt and pan juices', 2.5, 'place']],
  spinach: [['range/pan', 'Sweating shallot in butter, stirring in flour and cream', 3.5, 'stir'], ['range/pan', 'Folding in chopped blanched spinach, nutmeg and parmesan', 3.5, 'stir'], ['pass/bowl', 'Spooning it into a hot side dish', 2, 'scoop']],
  'wedge-salad': [['board', 'Cutting a cold head of iceberg into a quarter wedge', 3, 'slice'], ['cold/plate', 'Pouring blue cheese dressing over the wedge', 3, 'drizzle'], ['pass', 'Scattering bacon, tomato, chives and crumbled blue cheese', 3, 'garnish']],
  'baked-potato': [['oven', 'Pulling a salt-crusted russet from the oven', 3.5, 'tray'], ['board', 'Slitting it and pinching the ends to fluff it open', 2.5, 'slice'], ['pass', 'Loading it with butter, sour cream, chives and bacon', 3, 'place']],
  'bacon-slab': [['grill', 'Laying a thick slab of smoked bacon under the broiler', 4.5, 'tongs'], ['grill', 'Turning it as the fat renders and the edges char', 3.5, 'tongs'], ['pass', 'Plating the slab sizzling on a hot dish', 2.5, 'tongs']],
  // Central and Eastern European
  'mushroom-soup': [['steam/ladle', 'Ladling creamy mushroom soup from the well', 3, 'ladle'], ['range/pan', 'Frying sliced mushrooms in butter for the garnish', 3, 'turn'], ['pass/bowl', 'Finishing the bowl with the mushrooms, dill and sour cream', 3, 'garnish']],
  'chicken-potatoes': [['oven', 'Pulling a roast half chicken from the oven, skin crackling', 4, 'tray'], ['range/pan', 'Crisping roast potatoes in the chicken drippings', 3.5, 'turn'], ['board', 'Carving the leg from the breast', 2.5, 'carve'], ['pass', 'Plating it over the potatoes, pan jus spooned on top', 2.5, 'turn']],
  pierogi: [['range/pot', 'Boiling potato-and-cheese pierogi until they float', 3.5, 'tongs'], ['range/pan', 'Frying them in butter with onions until golden', 4, 'turn'], ['pass', 'Plating with the fried onions and a spoon of sour cream', 2.5, 'tongs']],
  bratwurst: [['flat', 'Browning a bratwurst on the griddle, turning it often', 4.5, 'tongs'], ['range/pan', 'Warming sauerkraut with caraway', 3, 'stir'], ['pass', 'Plating the sausage on the kraut with mustard and rye', 2.5, 'tongs']],
  schnitzel: [['board', 'Pounding a veal cutlet paper-thin under plastic wrap', 3, 'pound'], ['board/tray', 'Breading it in flour, egg and fine crumbs', 2.5, 'dredge'], ['range/pan', 'Shallow-frying it, swirling the pan so the crust puffs', 4, 'turn/toss'], ['pass', 'Plating it with lemon, parsley potatoes and lingonberry', 2.5, 'turn']],
  borscht: [['steam/ladle', 'Stirring the borscht pot, beets and cabbage rising', 2.5, 'stir'], ['steam/ladle', 'Ladling it into a deep bowl', 2.5, 'ladle'], ['pass/bowl', 'Finishing with sour cream, dill and a slice of rye', 2.5, 'garnish']],
  goulash: [['steam/ladle', 'Ladling paprika-braised beef from the pot', 3.5, 'ladle'], ['range/pan', 'Tossing spaetzle in butter in a pan', 3, 'toss'], ['pass/bowl', 'Plating the goulash beside the spaetzle, sour cream on top', 2.5, 'ladle']],
  strudel: [['oven', 'Warming a slice of apple strudel in the oven', 3.5, 'tray'], ['pass', 'Dusting with powdered sugar, vanilla sauce alongside', 2.5, 'garnish']],
  pretzel: [['oven', 'Warming a soft pretzel in the oven', 3.5, 'tray'], ['board', 'Brushing it with butter and coarse salt', 2, 'brush'], ['pass', 'Serving it with grain mustard and beer cheese', 2, 'place']],
  'shepherds-pie': [['oven/bowl', 'Baking a crock of lamb and gravy under mashed potato', 5, 'tray'], ['oven/bowl', 'Browning the ridged potato top under the broiler', 3, 'tray'], ['pass/bowl', 'Setting the crock on a plate, parsley over', 2, 'tray']],
  // stands and counters where nothing is cooked
  banana: [['case', 'Snapping a banana off the bunch', 1.5, 'fetch']],
  oranges: [['case', 'Bagging navel oranges from the pile', 2.5, 'fold']],
  fruit: [['case', 'Picking a ripe piece of fruit and polishing it on the apron', 2, 'fetch']],
  'mango-cup': [['board', 'Peeling a mango and cutting the cheeks into spears', 3.5, 'slice'], ['board/cup', 'Standing the spears in a cup, squeezing lime over', 2.5, 'place'], ['board/cup', 'Shaking on chili-lime salt and chamoy', 2, 'garnish']],
  chocolate: [['case', 'Taking a candy bar from the rack', 1.5, 'fetch']],
  popcorn: [['case', 'Scooping popcorn from the kettle warmer into a tub', 2.5, 'scoop'], ['case', 'Pumping butter topping over it', 1.5, 'drizzle']],
  // the headings older saves ordered under
  'small-plate': [['case', 'Taking a portion from the hot case', 2, 'tongs'], ['oven', 'Warming it through in the oven', 3.5, 'tray'], ['pass', 'Sliding it onto a paper plate', 2, 'turn']],
  'lunch-special': [['steam/tray', 'Scooping rice into a three-compartment container', 2.5, 'scoop'], ['steam/ladle', 'Ladling the main of the day from the steam table', 3, 'ladle'], ['steam/tray', 'Adding the vegetable side', 2, 'scoop'], ['pass', 'Closing the container, fork and napkins on top', 2, 'fold']],
  lunch: [['range/pan', 'Searing a chicken breast skin-down in a hot pan', 4, 'tongs'], ['range/pan', 'Deglazing with white wine, mounting butter into a sauce', 3.5, 'pour/stir'], ['cold/bowl', 'Dressing a handful of greens', 2.5, 'stir'], ['pass', 'Slicing the chicken beside the salad, sauce spooned round', 2.5, 'slice']],
  dinner: [['range/pan', 'Searing the fish of the day skin-side down', 4, 'turn'], ['range/pan', 'Basting it with butter and thyme', 3, 'baste'], ['range/pan', 'Glazing seasonal vegetables in a second pan', 3, 'toss'], ['pass', 'Plating fish over vegetables, sauce round, herbs on top', 3, 'turn']],
};

export const DRINKS = {
  coffee: [['brew', 'Pouring fresh drip coffee from the carafe into a cup', 2.5, 'pour']],
  'iced-coffee': [['brew', 'Scooping ice into a cup', 1.5, 'scoop'], ['brew', 'Pouring cold brew over the ice, a splash of milk', 2.5, 'pour']],
  espresso: [['espresso', 'Grinding a dose and tamping it level', 2.5, 'dose/tamp'], ['espresso', 'Pulling a short shot into a warm demitasse', 3.5, 'lock/extract']],
  latte: [['espresso', 'Grinding, tamping and pulling a double shot', 3.5, 'dose/tamp/lock/extract'], ['espresso', 'Steaming milk to a glossy microfoam', 3, 'steam'], ['espresso', 'Pouring a rosetta into the cup', 2, 'milkArt']],
  cappuccino: [['espresso', 'Grinding, tamping and pulling a double shot', 3.5, 'dose/tamp/lock/extract'], ['espresso', 'Aerating the milk, then rolling it into a thicker microfoam', 3, 'steamFoam'], ['espresso', 'Pouring it so the foam domes above the rim', 2, 'milkPour']],
  matcha: [['brew/bowl', 'Sifting matcha into a bowl and whisking it with hot water', 3.5, 'whisk'], ['espresso', 'Steaming milk with the wand', 2.5, 'steam'], ['espresso', 'Pouring the milk through the green tea', 2, 'milkPour']],
  'hot-chocolate': [['espresso', 'Steaming milk with dark chocolate until thick', 4, 'steam'], ['espresso', 'Pouring it into a mug, whipped cream on top', 2, 'milkPour/pipe']],
  tea: [['brew', 'Filling a cup from the hot water tap over a tea bag', 2.5, 'dispense/steep']],
  'green-tea': [['brew/pot', 'Steeping green tea leaves in a small iron pot', 3.5, 'steep'], ['brew', 'Pouring it into a handleless cup', 1.5, 'pour']],
  chai: [['range/pot', 'Boiling black tea with ginger, cardamom and milk', 4, 'stir'], ['brew', 'Pulling it through a strainer into a cup', 2, 'strain']],
  'barley-tea': [['brew', 'Pouring roasted barley tea from the big kettle', 2.5, 'pour']],
  soda: [['fountain', 'Scooping ice and pressing the cup to the soda fountain', 2.5, 'scoop/dispense']],
  'soda-can': [['case', 'Grabbing a cold can of soda from the cooler', 1.5, 'fetch']],
  'soda-bottle': [['case', 'Pulling a glass bottle of soda from the cooler, cap popped', 2, 'fetch/open']],
  lemonade: [['fountain', 'Filling a cup of ice from the lemonade dispenser', 2.5, 'scoop/dispense']],
  'iced-tea': [['fountain', 'Filling a cup of ice from the iced tea urn, lemon on the rim', 2.5, 'dispense/garnish']],
  'thai-tea': [['fountain', 'Pouring strong brewed orange tea over crushed ice', 2.5, 'pour'], ['fountain', 'Floating evaporated milk on top so it clouds down', 2, 'milkPour']],
  horchata: [['fountain', 'Stirring the horchata barrel and ladling it over ice', 3, 'stir/ladle']],
  'morir-sonando': [['fountain', 'Pouring evaporated milk and sugar over crushed ice', 2.5, 'milkPour'], ['fountain', 'Streaming in cold orange juice, stirring so it stays smooth', 3, 'pour/stir']],
  jamaica: [['fountain', 'Ladling deep red hibiscus water from the barrel over ice', 3, 'ladle']],
  sorrel: [['fountain', 'Pouring chilled sorrel, hibiscus with ginger and clove, on ice', 3, 'pour']],
  boba: [['fountain', 'Scooping warm tapioca pearls into a cup', 2, 'scoop'], ['fountain', 'Shaking milk tea with ice and syrup, pouring it over', 3.5, 'shake/strain'], ['fountain', 'Sealing the cup under the film press', 1.5, 'seal']],
  'egg-cream': [['fountain', 'Stirring chocolate syrup into cold milk in a tall glass', 2.5, 'stir'], ['fountain', 'Jetting in seltzer off the spoon to raise a white head', 3, 'dispense']],
  'ginger-beer': [['case', 'Taking a cold bottle of ginger beer from the cooler', 1.5, 'fetch']],
  water: [['case', 'Pulling a bottle of water from the cooler', 1.5, 'fetch']],
  'orange-juice': [['fountain', 'Feeding halved oranges through the press into a cup', 4, 'juice']],
  'carrot-juice': [['blender', 'Pushing whole carrots through the juicer with a knob of ginger', 4, 'juice'], ['blender', 'Skimming the foam and pouring it into a cup', 2, 'pour']],
  'green-juice': [['blender', 'Feeding kale, cucumber, celery and green apple to the juicer', 4.5, 'juice'], ['blender', 'Squeezing in lemon and pouring it off', 2, 'pour']],
  wheatgrass: [['blender', 'Cranking a fistful of cut wheatgrass through the press', 3.5, 'crank']],
  smoothie: [['blender', 'Loading the pitcher with frozen berries, banana and juice', 2.5, 'place'], ['blender', 'Blending until smooth and pouring it into a tall cup', 3.5, 'blend/pour']],
  lassi: [['blender', 'Blending yogurt, mango pulp, milk and a pinch of cardamom', 3.5, 'blend'], ['blender', 'Pouring it thick into a tall glass', 2, 'pour']],
  'protein-shake': [['blender', 'Scooping protein powder over milk, banana and ice', 2.5, 'scoop'], ['blender', 'Blending and pouring it into a shaker cup', 3, 'blend/pour']],
  shake: [['scoop', 'Dropping three scoops of ice cream into the steel mixing cup', 2.5, 'scoop'], ['blender', 'Adding milk and syrup, spinning it on the spindle mixer', 3.5, 'blend'], ['blender', 'Pouring it into a tall glass, the extra left in the tin', 2, 'pour']],
  beer: [['bar', 'Tilting a pint glass under the tap, straightening for a head', 3.5, 'tap']],
  stout: [['bar', 'Pulling the stout to three-quarters and letting it settle', 4, 'tap/settle'], ['bar', 'Topping it off to a creamy dome', 2, 'topOff']],
  cocktail: [['bar', 'Measuring spirit, citrus and syrup into the shaker', 3, 'measure/decant'], ['bar', 'Shaking hard over ice', 2.5, 'shake'], ['bar', 'Double-straining into a chilled coupe with a twist', 2.5, 'strain/garnish']],
  martini: [['bar', 'Stirring gin and dry vermouth over ice until frost-cold', 4, 'barStir'], ['bar', 'Straining it into a chilled glass, three olives on a pick', 2.5, 'strain/garnish']],
  margarita: [['bar', 'Salting the rim of a rocks glass with a lime wedge', 2, 'rim'], ['bar', 'Shaking tequila, lime juice and orange liqueur over ice', 3, 'measure/decant/shake'], ['bar', 'Straining it over fresh ice', 2, 'strain']],
  mojito: [['bar', 'Muddling mint, lime and sugar in a tall glass', 3, 'muddle'], ['bar', 'Adding rum and crushed ice, churning with a spoon', 3, 'bottlePour/stirGlass'], ['bar', 'Topping with soda and a sprig of mint', 2, 'dispense/garnish']],
  'old-fashioned': [['bar', 'Stirring sugar, bitters and bourbon over one big ice cube', 4, 'bottlePour/stirGlass'], ['bar', 'Expressing an orange peel over the glass', 2, 'twist']],
  whiskey: [['bar', 'Pouring two fingers of whiskey, neat', 2.5, 'bottlePour']],
  'vodka-soda': [['bar', 'Pouring vodka over ice, soda from the gun, a lime wedge', 3, 'bottlePour/dispense/garnish']],
  'red-wine': [['bar', 'Pouring a glass of red to the widest point of the bowl', 2.5, 'winePour']],
  'white-wine': [['bar', 'Pouring a chilled white from the ice well', 2.5, 'winePour']],
  champagne: [['bar', 'Easing the cork out of a cold bottle with a sigh', 3, 'uncork'], ['bar', 'Pouring it down the side of a flute', 2.5, 'winePour']],
  shot: [['bar', 'Measuring tequila into a shot glass, salt and lime beside', 2.5, 'bottlePour']],
  sake: [['bar', 'Warming a flask of sake in the hot water bath', 3, 'steep'], ['bar', 'Setting it out with two small ceramic cups', 2, 'tray']],
  soju: [['bar', 'Cracking a cold bottle of soju, setting out shot glasses', 2.5, 'open/place']],
  wine: [['case', 'Taking a bottle of wine from the rack and bagging it', 2.5, 'fetch/fold']],
};

// The same name is made differently at some kinds of place.
export const BY_KIND = {
  // a slice shop boxes an eight-cut pie; a trattoria fires a small one for the plate
  'pizza-margherita': { italian: [['board/pie', 'Pressing out a dough ball, leaving a puffy rim', 3, 'stretch'], ['board/pie', 'Spreading crushed tomato, torn mozzarella and basil', 3, 'spread'], ['oven/pie', 'Firing it at the mouth of the oven, turning it with the peel', 4.5, 'peel'], ['pass/pie', 'Finishing with olive oil and fresh basil, cut in six', 2.5, 'drizzle/slice']] },
  // a diner griddles its burger for a platter; a pub char-grills it
  'burger-deluxe': { pub: [['grill', 'Char-grilling a half-pound patty to medium', 4.5, 'tongs'], ['grill', 'Melting cheddar over it and toasting a brioche bun', 3, 'place'], ['fry', 'Dropping a basket of fries', 3, 'lower'], ['pass', 'Building it with lettuce, tomato and onion, fries in a cup', 3, 'place']] },
  'hot-dog': { cinema: [['flat', 'Taking a frank off the roller grill with tongs', 2.5, 'tongs'], ['board', 'Dropping it in a steamed bun and a paper boat', 2, 'place']] },
  nachos: { cinema: [['case/tray', 'Shaking tortilla chips into a paper tray', 2, 'place'], ['steam/ladle', 'Ladling warm cheese sauce into the corner, jalapeños on top', 2.5, 'ladle']] },
  cheesecake: { bakery: [['case', 'Cutting a wedge of cheesecake in the case with a hot knife', 3, 'slice'], ['case', 'Sliding the wedge into a pastry box', 2, 'turn']] },
  coffee: {
    bodega: [['brew', 'Filling a paper cup from the urn, milk and two sugars', 2.5, 'dispense'], ['brew', 'Stirring it and pressing on the lid', 1.5, 'stir/seal']],
    american: [['brew', 'Pouring from the glass pot on the burner into a thick mug', 2.5, 'pour']],
  },
  latte: { latin: [['espresso', 'Pulling a dark shot and stirring in sugar', 3, 'lock/extract/barStir'], ['espresso', 'Scalding milk with the steam wand and filling the cup', 3, 'steam/milkPour']] },
  'iced-coffee': { asian: [['brew', 'Dripping dark roast through a phin over condensed milk', 4, 'steep'], ['brew', 'Stirring it and pouring it over a tall glass of ice', 2, 'stir/pour']] },
  'green-tea': { chinese: [['brew', 'Pouring hot tea from the urn into a paper cup', 2.5, 'dispense']] },
  'iced-tea': { bbq: [['fountain', 'Pouring sweet tea from the dispenser over a cup of ice', 2.5, 'dispense']] },
  sorrel: { african: [['fountain', 'Pouring cold bissap, hibiscus steeped with mint, over ice', 3, 'pour']] },
  soda: { bar: [['bar', 'Shooting cola from the soda gun over a glass of ice', 2.5, 'dispense']], pub: [['bar', 'Shooting cola from the soda gun over a glass of ice', 2.5, 'dispense']] },
  beer: { thai: [['bar', 'Popping the cap off a cold bottle of lager', 2, 'open']] },
};

const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined;
const made = new Map();
const steps = rows => {
  if (!made.has(rows)) made.set(rows, Object.freeze(rows.map(([where, say, secs, actions]) => { const [at, ware] = where.split('/'); return Object.freeze({ at, ware, say, secs, actions: Object.freeze(actions.split('/')) }); })));
  return made.get(rows);
};
const named = item => typeof item === 'string' ? item : item?.preparation || item?.name;
// A menu name, or a style key itself, to [table, style].
function styled(item) {
  const name = named(item), dish = dishStyle(name) || name, drink = drinkStyle(name) || name;
  return own(DISHES, dish) ? [DISHES, dish] : own(DRINKS, drink) ? [DRINKS, drink] : null;
}

/** The kitchen steps for a menu item at a kind of place: [{ at, ware, say, secs }], never empty for food or drink the catalog knows; null for anything else (lottery tickets, cover charge). */
export function recipeFor(item, kind) {
  const found = styled(item);
  if (!found) return null;
  const [table, style] = found;
  return steps(own(own(BY_KIND, style) || {}, kind) || table[style]);
}

// What is seen in the pan, pot or bowl: one colour per family of dishes.
const TONES = {
  '#c4432c': 'pizza pizza-pepperoni pizza-sicilian pizza-combo pizza-margherita pasta parm meatballs lasagna small-plate chana tteokbokki kimchi-jjigae jollof goulash tom-yum pollo-guisado nachos',
  '#d6a23c': 'egg-roll spring-rolls empanada tostones festival fries tenders fried-chicken onion-rings mozz-sticks calamari tempura churros samosa puff-puff latkes fish-chips fish-sandwich schnitzel katsu-curry cutlet-hero chicken-sandwich chips popcorn',
  '#b5521f': 'tso wings korean-fried-chicken jerk suya satay bbq-ribs tikka',
  '#7a4a2b': 'burger burger-deluxe burger-double bacon-burger sliders steak ribeye steak-frites brisket pulled-pork pastrami reuben oxtail bulgogi meatloaf gyro lamb-rice pernil beef-broccoli chopped-cheese duck-confit bratwurst bacon-slab beef-patty meat-pie hot-dog taco tacos cubano shepherds-pie dinner',
  '#c08a4a': 'roast-chicken chicken-potatoes shawarma falafel plantains fried-rice lo-mein pad-thai japchae scallion-pancake dumplings gyoza pierogi lunch lunch-special burrito quesadilla arepa mofongo',
  '#d9bd8c': 'garlic-knots calzone naan pretzel bagel bagel-everything bialy butter-roll rye challah croissant knish pork-bun hero italian-hero deli-sandwich club blt grilled-cheese croque banh-mi doughnut doughnut-box doughnut-jelly doughnut-sprinkle muffin rugelach cornbread strudel pie crepe pancakes tamales doubles roti injera',
  '#e2b33a': 'eggs omelette bec egg-cheese bagel-bec curry-goat chicken-rice biryani mac-cheese quiche dosa elote banana mango-cup mango-sticky-rice flan creme-brulee boston-cream banana-pudding banana-split',
  '#5f8f3e': 'saag-paneer spinach collards guacamole edamame caesar greek-salad wedge-salad papaya-salad avocado-toast stir-fry spanakopita pickle-plate egusi summer-rolls',
  '#9fb86a': 'green-curry coleslaw',
  '#c9a45c': 'wonton-soup matzo-ball pho ramen miso soup onion-soup baklava gulab-jamun',
  '#ece2cb': 'pizza-white alfredo hummus cheesecake cannoli tiramisu mochi chowder mushroom-soup baked-potato caprese onigiri kimbap bibimbap cone sundae soft-serve ice-cream-cup ice-cream-sandwich italian-ice cupcake',
  '#f0876a': 'lox grilled-salmon sushi nigiri shrimp-cocktail lobster-roll',
  '#d5402b': 'lobster',
  '#b9b3a6': 'oysters moules',
  '#8e1f3a': 'borscht',
  '#4a2c1a': 'doughnut-chocolate babka bw-cookie cookie chocolate',
  '#4b2545': 'acai',
  '#f08c1e': 'oranges cut-fruit fruit',
  // drinks
  '#3b2416': 'coffee iced-coffee espresso soda soda-can soda-bottle stout',
  '#b98b5e': 'latte cappuccino chai boba hot-chocolate egg-cream protein-shake',
  '#a8662a': 'tea barley-tea iced-tea whiskey old-fashioned',
  '#8fae4b': 'matcha green-tea green-juice wheatgrass mojito',
  '#e8843a': 'thai-tea orange-juice carrot-juice morir-sonando',
  '#f3e9d2': 'horchata shake lassi sake soju',
  '#f1df7a': 'lemonade margarita white-wine champagne ginger-beer',
  '#e0a526': 'beer shot',
  '#8e1230': 'jamaica sorrel red-wine wine cocktail',
  '#c94f7c': 'smoothie',
  '#dfe9ee': 'water vodka-soda martini',
};
const TONE = {};
for (const [hex, styles] of Object.entries(TONES)) for (const style of styles.split(' ')) TONE[style] = hex;

/** A tint for the food seen in the cookware for this item, a hex string. */
export function foodTone(item) {
  const found = styled(item);
  return found && own(TONE, found[1]) || '#c9a36b';
}
