// How each thing on a menu is made on the line of the kind of place that sells
// it: which station the cook stands at, what is on it, what they are doing and
// for how long. Short-order practice, not a home recipe: slices are reheated,
// stews are ladled from the steam table, steaks rest before they are cut.
import { dishStyle, drinkStyle } from './food-catalog.js';

export const STATIONS = ['range', 'wok', 'flat', 'grill', 'fry', 'oven', 'board', 'cold', 'steam', 'sushi', 'spit', 'smoker', 'espresso', 'blender', 'fountain', 'brew', 'bar', 'case', 'scoop', 'pass'];
export const WARES = ['pan', 'pot', 'wok', 'basket', 'tray', 'pie', 'board', 'bowl', 'plate', 'ladle', 'cup', 'griddle'];

// Each step: [ 'station' or 'station/ware', what the cook is doing, seconds ].
export const DISHES = {
  // by the slice: pies wait under glass, a slice goes back on the deck to order
  pizza: [['case/pie', 'Lifting a plain slice from the pie under the glass', 2], ['oven/pie', 'Sliding it onto the oven deck to crisp the bottom', 4], ['pass', 'Peeling it out onto a paper plate over wax paper', 2]],
  'pizza-pepperoni': [['case/pie', 'Taking a pepperoni slice from the pie under the glass', 2], ['oven/pie', 'Reheating it on the deck until the pepperoni cups', 4], ['pass', 'Sliding it onto a paper plate, the grease still bubbling', 2]],
  'pizza-sicilian': [['case/tray', 'Cutting a square from the Sicilian pan under the glass', 2.5], ['oven/tray', 'Setting the square on the deck to crisp its fried bottom', 4.5], ['pass', 'Lifting the thick square onto a paper plate', 2]],
  'pizza-white': [['case/pie', 'Taking a white slice, ricotta and mozzarella, from the case', 2], ['oven/pie', 'Warming it on the deck until the ricotta just colours', 4], ['pass', 'Sliding it onto a paper plate with a pinch of oregano', 2]],
  'pizza-combo': [['case/pie', 'Pulling two plain slices from the pie under the glass', 2.5], ['oven/pie', 'Running both slices onto the deck to reheat', 4], ['pass', 'Overlapping the two slices on a paper plate', 2], ['case/cup', 'Grabbing a cold can of soda from the cooler', 1.5]],
  'garlic-knots': [['oven/tray', 'Warming a tray of knotted dough ends in the deck oven', 3.5], ['board/bowl', 'Tossing the hot knots in garlic oil, parsley and parmesan', 3], ['pass', 'Bagging them with a cup of marinara', 2]],
  calzone: [['board', 'Stretching a dough round, spooning on ricotta and mozzarella', 3.5], ['board', 'Folding it over, crimping the edge and cutting a vent', 2.5], ['oven/pie', 'Baking it on the deck until blistered and golden', 5], ['pass', 'Brushing it with garlic oil, a cup of marinara beside', 2.5]],
  'pizza-margherita': [['board/pie', 'Stretching a dough ball over the knuckles to a wide round', 3.5], ['board/pie', 'Ladling crushed tomato in a spiral, laying on mozzarella', 3], ['oven/pie', 'Launching the pie off the peel onto the deck, turning it once', 5], ['board/pie', 'Tearing basil over it, wheeling it into eight and boxing it', 3]],
  // Chinese take-out: one wok, one fryer, a pot of water
  'egg-roll': [['fry', 'Dropping a cabbage-and-pork egg roll into the fryer', 4], ['fry', 'Lifting the basket when the wrapper blisters brown', 2], ['board', 'Slipping it into a wax bag with duck sauce and mustard', 2]],
  'spring-rolls': [['fry', 'Lowering thin vegetable spring rolls into the hot oil', 4], ['fry', 'Shaking the basket and draining them crisp', 2.5], ['pass', 'Stacking them cut on the bias beside sweet chili sauce', 2.5]],
  'fried-rice': [['wok', 'Scrambling egg in a smoking wok, day-old rice in after it', 3.5], ['wok', 'Tossing the rice with roast pork, scallion and bean sprouts', 4], ['wok', 'Splashing soy round the rim and tossing until it jumps', 3], ['pass', 'Mounding it into a take-out container', 2]],
  tso: [['board/bowl', 'Dredging marinated chicken thigh chunks in cornstarch', 2.5], ['fry', 'Frying the chicken twice until it crackles', 4], ['wok', 'Blooming dried chilies and garlic, pouring in the sauce', 3], ['wok', 'Tossing the chicken until it wears a sticky glaze', 2.5], ['pass', 'Boxing it over white rice with steamed broccoli', 2.5]],
  'lo-mein': [['range/pot', 'Dunking fresh egg noodles in boiling water to loosen', 2.5], ['wok', 'Searing sliced chicken, cabbage and carrot in a smoking wok', 3.5], ['wok', 'Tossing in the noodles with soy and oyster sauce', 3.5], ['pass', 'Twisting the noodles into a container with tongs', 2]],
  'beef-broccoli': [['range/pot', 'Blanching broccoli florets in the water pot', 2.5], ['wok', 'Passing velveted flank steak through hot oil', 3], ['wok', 'Tossing beef and broccoli, ladling in brown garlic sauce', 3.5], ['pass', 'Sliding it glossy into a container beside white rice', 2]],
  dumplings: [['steam/tray', 'Setting pork-and-chive dumplings in the steamer', 4], ['wok', 'Crisping them on one side in an oiled wok', 3], ['pass', 'Boxing eight with a cup of soy-ginger dipping sauce', 2.5]],
  'wonton-soup': [['range/pot', 'Dropping pork wontons into boiling water until they float', 4], ['steam/ladle', 'Ladling clear chicken broth into a container', 2.5], ['pass/bowl', 'Adding the wontons, scallion and slices of roast pork', 2.5]],
  'pork-bun': [['steam/tray', 'Lifting a roast pork bun from the steamer cabinet', 3.5], ['board', 'Dropping it hot into a wax bag', 2.5]],
  // halal carts and gyro counters
  'chicken-rice': [['flat', 'Throwing marinated chicken thighs on the flat-top', 3.5], ['flat', 'Chopping the chicken on the griddle with two scrapers', 3.5], ['steam/tray', 'Scooping yellow rice into a foil tray, lettuce beside it', 2.5], ['pass', 'Piling on the chicken, white sauce and a stripe of red', 2.5]],
  'lamb-rice': [['flat', 'Dropping shaved gyro lamb on the flat-top to crisp', 3.5], ['flat', 'Chopping it fine with the scraper, onions mixed in', 3.5], ['steam/tray', 'Scooping yellow rice into a foil tray with salad', 2.5], ['pass', 'Topping with lamb, heavy white sauce and a line of hot', 2.5]],
  gyro: [['spit', 'Shaving ribbons of lamb off the turning cone', 3.5], ['flat', 'Warming a pita on the griddle until soft', 2.5], ['board', 'Loading lamb, tomato, onion and tzatziki onto the pita', 3], ['pass', 'Rolling it tight in foil and paper', 2]],
  falafel: [['board/bowl', 'Pressing chickpea mix into balls with the falafel scoop', 2.5], ['fry', 'Frying the falafel to a dark, craggy brown', 4], ['board', 'Stuffing a pita with falafel, salad and pickled turnip', 3], ['pass', 'Pouring tahini over and wrapping it in foil', 2]],
  shawarma: [['spit', 'Carving crisp chicken off the shawarma spit', 3.5], ['flat', 'Tossing the shavings on the griddle to crisp the edges', 2.5], ['board', 'Rolling it in flatbread with garlic sauce and pickles', 3], ['flat', 'Pressing the wrap on the griddle to seal and toast it', 2.5], ['pass', 'Halving it on the bias and wrapping it in paper', 2]],
  hummus: [['cold/bowl', 'Swirling hummus round a shallow bowl with a spoon', 3], ['oven', 'Warming pita in the oven until it puffs', 3], ['pass/bowl', 'Pooling olive oil in the well; paprika, chickpeas, parsley', 3]],
  'greek-salad': [['board', 'Cutting cucumber, tomato, green pepper and red onion', 3.5], ['cold/bowl', 'Tossing them with olives, oregano, oil and wine vinegar', 3], ['pass/bowl', 'Setting a slab of feta on top with pepperoncini', 2.5]],
  spanakopita: [['case/tray', 'Cutting a square of spinach pie from the tray', 2.5], ['oven', 'Crisping the phyllo in the oven', 4], ['pass', 'Plating the flaky square with a wedge of lemon', 2]],
  baklava: [['case/tray', 'Lifting a diamond of baklava from the syrupy tray', 2.5], ['pass', 'Setting it in a paper cup, crushed pistachio on top', 2]],
  // taqueria
  taco: [['flat', 'Searing chopped carne asada on the plancha', 3.5], ['flat', 'Warming two stacked corn tortillas in the meat fat', 2.5], ['board', 'Filling the doubled tortillas, onion and cilantro on top', 2.5], ['pass', 'Plating with a lime wedge, radish and salsa verde', 2]],
  tacos: [['steam/tray', 'Pulling carnitas from the pan of its own lard', 2.5], ['flat', 'Crisping the pork on the plancha until the edges frizzle', 3.5], ['flat', 'Heating corn tortillas two by two alongside', 2.5], ['pass', 'Building three tacos with onion, cilantro, salsa and lime', 3]],
  burrito: [['flat', 'Warming a big flour tortilla on the plancha until it gives', 2.5], ['steam/tray', 'Laying rice, beans and grilled meat down the centre', 3], ['board', 'Adding salsa, cheese and crema, tucking the ends, rolling', 3], ['flat', 'Searing the seam shut on the griddle', 2], ['pass', 'Wrapping it tight in foil', 1.5]],
  guacamole: [['board', 'Halving avocados and scooping them into the molcajete', 3], ['board/bowl', 'Mashing in onion, cilantro, serrano, lime and salt', 3.5], ['pass/bowl', 'Sending the stone bowl out beside a basket of warm chips', 2.5]],
  quesadilla: [['flat', 'Laying a flour tortilla on the plancha, cheese all over', 3], ['flat', 'Folding it over the filling and pressing with the spatula', 3], ['flat', 'Flipping it when the cheese runs and the tortilla blisters', 2.5], ['pass', 'Cutting it in wedges with pico de gallo and crema', 2.5]],
  nachos: [['board/tray', 'Spreading tortilla chips on a platter with beans and cheese', 3], ['oven/tray', 'Running it under the broiler until the cheese bubbles', 4], ['pass', 'Topping with pico, jalapeños, guacamole and crema', 3]],
  elote: [['grill', 'Charring a shucked ear of corn over the grill, turning it', 4.5], ['board', 'Slathering it in mayo and rolling it in cotija', 3], ['pass', 'Dusting with chili powder, a squeeze of lime over it', 2]],
  tamales: [['steam/pot', 'Lifting tamales out of the steamer pot with tongs', 3.5], ['board', 'Opening the corn husks to let the steam out', 2.5], ['pass', 'Plating two with salsa roja spooned over the masa', 3]],
  churros: [['fry', 'Piping ridged dough straight into the oil, snipping lengths', 4], ['fry', 'Turning them until deep golden and lifting the basket', 2.5], ['board/tray', 'Rolling the hot churros in cinnamon sugar', 2.5], ['pass', 'Standing them in a paper cone with chocolate sauce', 2]],
  // Dominican and Puerto Rican lunch counters: the steam table does the work
  pernil: [['steam/tray', 'Forking pernil from the steam table with a piece of crackling', 3.5], ['steam/tray', 'Packing in white rice with a big spoon', 2.5], ['steam/ladle', 'Ladling stewed red beans over the rice', 2.5], ['pass', 'Spooning pan juices over the pork, sweet plantain beside', 2.5]],
  empanada: [['fry', 'Dropping a beef empanada into the fryer', 4], ['fry', 'Lifting it out when the crust bubbles and browns', 2], ['board', 'Draining it on paper and sliding it into a bag', 2]],
  'pollo-guisado': [['steam/ladle', 'Ladling braised chicken in sofrito sauce from the steam table', 3.5], ['steam/tray', 'Scooping white rice onto the plate', 2.5], ['steam/ladle', 'Ladling beans alongside and extra sauce over the rice', 2.5], ['pass', 'Finishing the plate with a slice of avocado', 2]],
  mofongo: [['fry', 'Frying thick rounds of green plantain until tender', 4], ['board/bowl', 'Pounding them in the pilón with garlic and pork cracklings', 4], ['pass', 'Turning the dome out onto a plate with a cup of garlic broth', 3]],
  cubano: [['board', 'Layering roast pork, ham, Swiss and pickles on Cuban bread', 3.5], ['board', 'Spreading mustard and buttering the outside of the loaf', 2], ['flat', 'Pressing it flat in the plancha until the cheese melts', 4.5], ['pass', 'Slicing it corner to corner', 2]],
  tostones: [['fry', 'Frying thick chunks of green plantain until just tender', 3.5], ['board', 'Smashing each chunk flat in the tostonera', 2.5], ['fry', 'Dropping the discs back in the oil to crisp', 3], ['pass', 'Salting them hot, garlic mojo on the side', 2]],
  plantains: [['board', 'Peeling black-ripe plantains and slicing them on the bias', 2.5], ['fry', 'Frying the slices until the edges caramelise dark', 4], ['pass', 'Draining and plating them soft and sticky', 2.5]],
  arepa: [['flat', 'Griddling a patted corn-flour cake until crusted both sides', 4.5], ['board', 'Splitting it open like a pocket', 2], ['board', 'Stuffing it with shredded beef, black beans and white cheese', 3], ['pass', 'Wrapping the bottom half in paper', 1.5]],
  flan: [['cold', 'Running a knife round a chilled ramekin of flan', 3], ['pass', 'Flipping it onto a plate so the caramel runs down', 3]],
  // Caribbean take-out
  'beef-patty': [['case', 'Taking a beef patty from the glass warmer with tongs', 2], ['board', 'Tucking it into split coco bread and bagging it', 2]],
  jerk: [['grill', 'Turning jerk chicken legs over the smoky drum grill', 4.5], ['board', 'Chopping the chicken through the bone with a cleaver', 3], ['steam/tray', 'Scooping rice and peas with steamed cabbage', 2.5], ['pass', 'Spooning jerk gravy over the chicken', 2]],
  oxtail: [['steam/ladle', 'Ladling oxtail and butter beans from the braising pot', 3.5], ['steam/tray', 'Packing rice and peas into the container', 2.5], ['pass', 'Spooning more gravy over the rice, cabbage and plantain beside', 3]],
  'curry-goat': [['steam/ladle', 'Ladling curry goat, bone-in, from the steam table', 3.5], ['steam/tray', 'Scooping white rice alongside', 2.5], ['pass', 'Adding steamed cabbage, curry gravy spooned over the rice', 3]],
  doubles: [['board', 'Laying two soft fried bara on wax paper', 2.5], ['steam/ladle', 'Spooning curried channa across the bara', 2.5], ['board', 'Dashing on tamarind, cucumber chutney and pepper sauce', 2.5], ['board', 'Twisting the paper shut around it', 1.5]],
  roti: [['flat', 'Warming a dhalpuri roti skin on the tawa', 3], ['steam/ladle', 'Ladling curry chicken and potato into the middle', 3], ['board', 'Folding the roti into a square parcel round the curry', 2.5], ['pass', 'Wrapping the parcel in wax paper and foil', 2]],
  festival: [['fry', 'Dropping fingers of sweet cornmeal dough into the fryer', 4], ['fry', 'Turning them until deep golden', 2.5], ['board', 'Draining and bagging them hot', 2]],
  // smokehouse: the meat was done hours ago, the line cuts and plates it
  cornbread: [['oven/tray', 'Sliding a pan of cornbread out of the oven', 3], ['board', 'Cutting a thick square from the pan', 2], ['pass', 'Plating it with whipped honey butter', 2.5]],
  'bbq-ribs': [['smoker', 'Lifting a rack of spare ribs out of the smoker', 3.5], ['grill', 'Mopping it with sauce and setting the glaze over the flame', 3.5], ['board', 'Slicing between the bones with a long knife', 3], ['pass', 'Stacking ribs on butcher paper with slaw and white bread', 2.5]],
  brisket: [['smoker', 'Unwrapping a brisket from its butcher paper, still steaming', 3.5], ['board', 'Slicing the flat against the grain, pencil-thick', 4], ['board', 'Cubing a few burnt ends off the point', 2.5], ['pass', 'Laying slices on a tray with pickles, onion and white bread', 3]],
  'pulled-pork': [['smoker', 'Pulling a pork shoulder from the smoker, the bone sliding free', 3.5], ['board/bowl', 'Shredding it with two forks, mixing in the bark', 3.5], ['flat', 'Toasting a potato bun on the griddle', 2], ['pass', 'Piling pork on the bun with vinegar sauce and slaw', 2.5]],
  'mac-cheese': [['steam/tray', 'Breaking through the browned top of the mac and cheese pan', 2.5], ['steam/tray', 'Scooping a creamy spoonful with some of the crust', 2.5], ['pass/bowl', 'Filling a side cup level and wiping the rim', 2]],
  collards: [['steam/ladle', 'Stirring the pot of collards stewed with smoked turkey', 2.5], ['steam/ladle', 'Lifting out greens with a slotted spoon and a little liquor', 3], ['pass/bowl', 'Filling a side bowl, a dash of pepper vinegar over it', 2]],
  'banana-pudding': [['cold', 'Spooning banana pudding from the chilled pan, wafers and all', 3], ['pass/cup', 'Filling a cup and crumbling vanilla wafers over the top', 3]],
  // kosher delicatessen
  knish: [['oven', 'Warming a potato knish in the oven until the crust crackles', 4], ['board', 'Splitting it open and striping it with brown mustard', 2.5], ['pass', 'Setting it on a paper plate over wax paper', 1.5]],
  pastrami: [['steam/tray', 'Forking a whole pastrami out of the steam box', 3.5], ['board', 'Hand-slicing it thick across the grain, steam rising', 4], ['board', 'Stacking the slices high on rye spread with mustard', 3], ['pass', 'Halving the sandwich, a half-sour pickle on the plate', 2.5]],
  'matzo-ball': [['steam/ladle', 'Lifting a big matzo ball from its simmering pot', 3], ['steam/ladle', 'Ladling golden chicken broth with carrot and noodles', 3.5], ['pass/bowl', 'Finishing the bowl with fresh dill', 2.5]],
  reuben: [['steam/tray', 'Slicing hot corned beef from the steam box', 3], ['board', 'Building it on rye with sauerkraut, Swiss and Russian dressing', 3], ['flat', 'Griddling it under a weight until the cheese runs', 4.5], ['pass', 'Cutting it on the diagonal beside a pickle spear', 2.5]],
  latkes: [['board/bowl', 'Grating potato and onion, wringing them dry in a towel', 3.5], ['range/pan', 'Dropping spoonfuls into shallow hot oil, pressing them flat', 4], ['range/pan', 'Flipping them when the lacy edges turn deep brown', 3], ['pass', 'Draining and plating with applesauce and sour cream', 2.5]],
  'hot-dog': [['flat', 'Rolling an all-beef frank on the griddle until the skin snaps', 4], ['flat', 'Warming a split bun beside it', 2], ['board', 'Tucking it in the bun under mustard and sauerkraut', 2.5]],
  'pickle-plate': [['cold', 'Fishing half-sours out of the brine barrel with tongs', 2.5], ['pass/bowl', 'Piling them in a steel bowl with pickled green tomato', 2]],
  // noodle shops and banh mi counters
  'scallion-pancake': [['range/pan', 'Laying a coiled scallion pancake in a slick of hot oil', 3.5], ['range/pan', 'Flipping it and pressing until both sides blister', 3.5], ['board', 'Scrunching it to open the layers, cutting six wedges', 2.5], ['pass', 'Fanning the wedges round a dish of ginger soy', 2]],
  'stir-fry': [['board', 'Cutting bok choy, snow peas, peppers and mushrooms', 3], ['wok', 'Flashing garlic and ginger in a smoking wok', 2], ['wok', 'Tossing the vegetables hard, a ladle of stock down the side', 3.5], ['wok', 'Tightening the sauce with a little slurry until glossy', 2], ['pass', 'Sliding it onto a plate beside steamed rice', 2]],
  pho: [['range/pot', 'Dunking rice noodles in boiling water in a wire basket', 2.5], ['board/bowl', 'Laying raw eye-round and brisket over the noodles', 2.5], ['steam/ladle', 'Ladling boiling beef broth over to cook the rare beef', 3.5], ['pass/bowl', 'Scattering scallion, onion and cilantro, herbs on a side plate', 2.5]],
  'banh-mi': [['oven', 'Crisping a short baguette in the oven', 3], ['board', 'Splitting it, spreading mayo and pâté', 2.5], ['board', 'Layering grilled pork, pickled carrot and daikon, cucumber', 3], ['pass', 'Tucking in cilantro and jalapeño, wrapping it in paper', 2.5]],
  'summer-rolls': [['board/bowl', 'Dipping a rice paper round in warm water', 2], ['board', 'Laying shrimp halves, vermicelli, lettuce and mint on it', 3.5], ['board', 'Folding the sides in and rolling it tight and clear', 2.5], ['pass', 'Halving the rolls beside a dish of peanut hoisin', 2.5]],
  // West and East African kitchens
  jollof: [['steam/pot', 'Scooping jollof from the bottom of the pot, smoky bits and all', 3.5], ['grill', 'Charring a stewed chicken leg on the grill', 4], ['pass', 'Plating rice and chicken with plantain and pepper sauce', 3]],
  suya: [['board', 'Threading thin-sliced beef on skewers, patting on peanut spice', 3.5], ['grill', 'Grilling the skewers over high flame, brushing with oil', 4.5], ['board', 'Sliding the meat off and cutting it bite-size', 2.5], ['pass', 'Wrapping it in paper with raw onion, tomato and more spice', 2.5]],
  egusi: [['steam/ladle', 'Ladling egusi stew, melon seed, spinach and goat, into a bowl', 3.5], ['range/pot', 'Working hot fufu in the pot with a wooden paddle', 3.5], ['board', 'Shaping the fufu into a smooth ball with wet hands', 2.5], ['pass/bowl', 'Setting the fufu beside the stew', 2]],
  injera: [['board/tray', 'Unrolling a round of injera across a wide platter', 2.5], ['steam/ladle', 'Spooning doro wat, red lentils and collards in mounds', 4], ['steam/ladle', 'Adding yellow split peas and an egg from the stew', 2.5], ['pass', 'Tucking rolled injera round the rim of the platter', 2.5]],
  'meat-pie': [['case', 'Taking a meat pie from the glass warmer', 2], ['board', 'Slipping it into a paper bag', 1.5]],
  'puff-puff': [['fry', 'Squeezing balls of yeasted batter off the fist into the oil', 4], ['fry', 'Rolling them in the fryer until evenly brown', 3], ['board/bowl', 'Tossing them in sugar and bagging them hot', 2.5]],
  // Japanese: sushi board out front, noodle boiler and fryer behind
  miso: [['steam/ladle', 'Whisking miso paste into a ladle of hot dashi', 3], ['pass/bowl', 'Pouring it over tofu, wakame and scallion in a lacquer bowl', 3]],
  sushi: [['sushi', 'Pressing seasoned rice across a half sheet of nori', 3], ['sushi', 'Laying a strip of salmon along the rice', 2], ['sushi', 'Rolling it in the bamboo mat and squaring the edges', 3], ['sushi', 'Cutting six pieces with a wet knife', 2.5], ['pass', 'Plating the roll with pickled ginger and wasabi', 2]],
  ramen: [['board/bowl', 'Spooning tare and scallion oil into a hot bowl', 2], ['range/pot', 'Dropping a nest of noodles into the boiler basket', 3.5], ['steam/ladle', 'Ladling pork-bone broth into the bowl over the tare', 3], ['range/pot', 'Snapping the noodles dry and folding them into the broth', 2.5], ['pass/bowl', 'Laying on chashu, a soft egg, bamboo, scallion and nori', 3]],
  nigiri: [['sushi', 'Slicing tuna, salmon and yellowtail across the grain', 3.5], ['sushi', 'Shaping small pads of rice in a wet palm', 3], ['sushi', 'Dabbing wasabi and pressing each slice over its rice', 3], ['pass', 'Lining up the pieces with ginger, a brush of soy on top', 2.5]],
  'katsu-curry': [['board', 'Breading a pounded chicken cutlet in flour, egg and panko', 3], ['fry', 'Frying the cutlet until the panko is deep gold', 4.5], ['board', 'Slicing the katsu into strips', 2], ['steam/ladle', 'Ladling dark curry sauce beside a mound of rice', 2.5], ['pass', 'Leaning the katsu on the rice with red pickles', 2]],
  gyoza: [['range/pan', 'Lining gyoza in an oiled pan, pleats up', 3], ['range/pan', 'Pouring in water and clamping the lid to steam them', 3.5], ['range/pan', 'Lifting the lid so the bottoms fry crisp', 2.5], ['pass', 'Inverting them onto a plate, crust up, with dipping sauce', 2.5]],
  tempura: [['board/bowl', 'Stirring ice-cold batter with chopsticks, lumps left in', 2.5], ['fry', 'Dipping butterflied shrimp and dropping them in the oil', 3.5], ['fry', 'Flicking batter over them for a lacy crust', 2.5], ['pass', 'Stacking them on paper with grated daikon and dipping broth', 2.5]],
  edamame: [['range/pot', 'Boiling soybean pods in salted water', 3.5], ['board/bowl', 'Draining and tossing them with flaky sea salt', 2.5], ['pass/bowl', 'Heaping them in a bowl with a dish for the shells', 2]],
  onigiri: [['sushi/bowl', 'Wetting and salting the palms, taking a handful of warm rice', 2.5], ['sushi', 'Pressing salted salmon into the middle, shaping a triangle', 3], ['pass', 'Wrapping it in crisp nori and setting it on a plate', 2]],
  mochi: [['cold', 'Taking mochi ice cream from the freezer and halving each piece', 3.5], ['pass', 'Fanning the halves on a small plate', 2.5]],
  // Korean
  kimbap: [['sushi', 'Spreading sesame-oiled rice over a sheet of seaweed', 3], ['sushi', 'Lining up spinach, carrot, pickled radish, egg and fish cake', 3], ['sushi', 'Rolling it tight in the mat and brushing it with sesame oil', 3], ['pass', 'Slicing it into coins and sprinkling sesame seeds', 2.5]],
  bibimbap: [['range/bowl', 'Heating a stone bowl on the burner, sesame oil and rice in', 3.5], ['board', 'Arranging seasoned spinach, sprouts, carrot and zucchini', 3.5], ['range/pan', 'Frying an egg sunny-side up', 2.5], ['pass/bowl', 'Crowning it with beef, the egg and a spoon of gochujang', 2.5]],
  'korean-fried-chicken': [['fry', 'Frying battered wings low and slow the first time', 4], ['fry', 'Resting them, then frying again hot for a glassy crust', 4], ['board/bowl', 'Tossing them in soy-garlic glaze in a steel bowl', 3], ['pass', 'Piling them up with cubes of pickled radish', 2]],
  bulgogi: [['grill', 'Spreading marinated ribeye slices over the hot grill', 4], ['grill', 'Turning the beef with onion and scallion until caramelised', 3.5], ['pass', 'Sliding it onto a sizzling platter with rice and lettuce', 3]],
  tteokbokki: [['range/pan', 'Simmering anchovy stock with gochujang and chili flakes', 3.5], ['range/pan', 'Adding rice cakes and fish cake, stirring as it thickens', 4.5], ['pass/bowl', 'Spooning it glossy into a bowl with scallion and a boiled egg', 2.5]],
  'kimchi-jjigae': [['range/pot', 'Frying pork belly and old kimchi in an earthenware pot', 4], ['range/pot', 'Pouring in stock and kimchi brine, bringing it to a hard boil', 4], ['range/pot', 'Sliding in slabs of tofu and scallion', 2.5], ['pass/bowl', 'Sending it out still bubbling with a bowl of rice', 2]],
  japchae: [['range/pot', 'Boiling sweet potato glass noodles until springy', 3.5], ['range/pan', 'Stir-frying beef, spinach, carrot, onion and mushrooms', 3.5], ['range/pan', 'Tossing the noodles through with soy, sugar and sesame oil', 3], ['pass', 'Mounding it on a plate with egg ribbons and sesame seeds', 2.5]],
  // Thai
  'pad-thai': [['wok', 'Frying tofu, shallot and shrimp in a hot wok', 3], ['wok', 'Adding soaked rice noodles and tamarind sauce, tossing', 3.5], ['wok', 'Pushing them aside to scramble an egg, folding it through', 3], ['wok', 'Throwing in bean sprouts and garlic chives at the end', 2], ['pass', 'Plating with crushed peanuts, lime and chili flakes', 2.5]],
  'green-curry': [['wok', 'Cracking coconut cream in the wok, frying green curry paste', 3.5], ['wok', 'Simmering chicken, Thai eggplant and bamboo in coconut milk', 4.5], ['wok', 'Seasoning with fish sauce and palm sugar, wilting in basil', 2.5], ['pass/bowl', 'Ladling it into a bowl beside jasmine rice', 2.5]],
  'tom-yum': [['range/pot', 'Bruising lemongrass, galangal and lime leaf into boiling stock', 3.5], ['range/pot', 'Poaching shrimp and mushrooms in the broth', 3.5], ['range/pot', 'Stirring in chili jam, fish sauce and lime off the heat', 3], ['pass/bowl', 'Ladling it out with cilantro on top', 2]],
  'papaya-salad': [['board', 'Shredding green papaya into long threads', 3], ['board/bowl', 'Pounding garlic, chilies, long beans and tomato in the mortar', 3.5], ['board/bowl', 'Tossing in papaya, lime, fish sauce and palm sugar', 3], ['pass', 'Plating with roasted peanuts and a wedge of cabbage', 2.5]],
  satay: [['grill', 'Laying turmeric-marinated chicken skewers over the coals', 4], ['grill', 'Turning and basting them with coconut milk', 3], ['range/pan', 'Warming peanut sauce in a small pan', 2], ['pass', 'Plating the skewers with peanut sauce and cucumber relish', 2.5]],
  'mango-sticky-rice': [['steam/bowl', 'Scooping warm sticky rice soaked in sweet coconut milk', 3], ['board', 'Peeling a ripe mango and slicing the cheek', 3.5], ['pass', 'Pouring salted coconut cream over, toasted mung beans on top', 2.5]],
  // Indian: tandoor, curry pans, the dosa griddle
  samosa: [['fry', 'Lowering potato-and-pea samosas into the fryer', 4], ['fry', 'Lifting them when the pastry blisters golden', 2], ['pass', 'Plating two with tamarind and mint chutneys', 2.5]],
  tikka: [['oven', 'Roasting skewers of yogurt-marinated chicken in the tandoor', 4.5], ['range/pan', 'Simmering tomato-cream masala with fenugreek and butter', 3.5], ['range/pan', 'Sliding the charred tikka into the sauce to finish', 3], ['pass/bowl', 'Serving it in a copper bowl with a swirl of cream, rice beside', 2.5]],
  'saag-paneer': [['range/pan', 'Browning cubes of paneer in ghee', 3], ['range/pan', 'Frying cumin, garlic and ginger, adding puréed spinach', 3.5], ['range/pan', 'Folding the paneer in and finishing with cream', 3], ['pass/bowl', 'Spooning it into a bowl with a thread of cream', 2]],
  biryani: [['steam/pot', 'Lifting the lid of the sealed pot, saffron steam rising', 3], ['steam/pot', 'Scooping layered rice and chicken from the bottom up', 3.5], ['pass', 'Mounding it with fried onions and mint, raita on the side', 3]],
  naan: [['board', 'Stretching a ball of dough into a teardrop', 2.5], ['oven', 'Slapping it onto the wall of the tandoor', 3.5], ['oven', 'Hooking it out blistered and charred with the skewers', 2], ['pass', 'Brushing it with garlic butter and cilantro, into a basket', 2.5]],
  dosa: [['flat', 'Spreading fermented batter in a thin spiral on the griddle', 3.5], ['flat', 'Drizzling ghee and letting the edges lift and crisp', 3], ['flat', 'Spooning spiced potato down the middle and rolling it', 3], ['pass', 'Plating the long roll with sambar and coconut chutney', 2.5]],
  chana: [['range/pan', 'Frying onion, ginger, garlic and whole cumin', 3], ['range/pan', 'Adding tomato, ground spices and simmered chickpeas', 4], ['range/pan', 'Mashing a few chickpeas to thicken the gravy', 2.5], ['pass/bowl', 'Finishing with ginger slivers, cilantro and lemon', 2.5]],
  'gulab-jamun': [['steam/ladle', 'Lifting two gulab jamun from warm rose-cardamom syrup', 3], ['pass/bowl', 'Serving them in a small bowl with syrup and pistachio', 3]],
  // fried chicken counters
  'fried-chicken': [['board/bowl', 'Dredging a breast, thigh and leg in seasoned flour', 3], ['fry', 'Lowering the pieces into the pressure fryer', 5], ['fry', 'Lifting the basket and letting the oil drain', 2.5], ['pass', 'Boxing three pieces with a split buttermilk biscuit', 2.5]],
  wings: [['fry', 'Dropping a basket of naked wings into the fryer', 4.5], ['fry', 'Shaking the basket and hanging it to drain', 2], ['board/bowl', 'Tossing them in a steel bowl with hot sauce and butter', 3], ['pass', 'Piling them up with celery, carrots and blue cheese', 2.5]],
  fries: [['fry', 'Dropping a basket of fries into the oil', 4], ['fry', 'Shaking the basket and hanging it to drain', 2], ['board/tray', 'Dumping them under the heat lamp and salting them', 2], ['pass', 'Scooping them into a paper sleeve', 1.5]],
  'chicken-sandwich': [['fry', 'Frying a buttermilk-brined chicken breast', 5], ['flat', 'Toasting a buttered potato bun on the griddle', 2.5], ['board', 'Spreading mayo, laying pickle chips, setting the chicken on', 2.5], ['pass', 'Wrapping it in foil-lined paper', 1.5]],
  tenders: [['board/bowl', 'Breading chicken tenderloins in seasoned flour', 2.5], ['fry', 'Frying them until they float and turn golden', 4.5], ['fry', 'Hanging the basket to drain', 2], ['pass', 'Boxing them with honey mustard and barbecue dip', 2]],
  coleslaw: [['cold', 'Scooping creamy coleslaw from the cold well', 2.5], ['pass/cup', 'Packing it into a side cup and snapping on the lid', 2]],
  // burger joints: everything happens on the flat-top
  burger: [['flat', 'Smashing a ball of beef onto the flat-top, salt and pepper', 3.5], ['flat', 'Scraping and flipping it, laying American cheese on', 3], ['flat', 'Toasting the bun face-down in the beef fat', 2], ['board', 'Dressing the bun with pickles, onion, ketchup and mustard', 2.5], ['pass', 'Wrapping it in paper', 1.5]],
  'burger-deluxe': [['flat', 'Pressing a thick patty onto the flat-top', 4], ['flat', 'Flipping it and melting cheese under a dome', 3], ['fry', 'Dropping fries for the deluxe plate', 3], ['board', 'Setting lettuce, tomato and raw onion on the toasted bun', 2.5], ['pass', 'Plating it open-faced with fries, a pickle and slaw', 2.5]],
  'burger-double': [['flat', 'Smashing two balls of beef onto the flat-top', 3.5], ['flat', 'Flipping both, a slice of American cheese on each', 3], ['flat', 'Stacking one patty on the other and toasting the bun', 2.5], ['board', 'Dressing it with pickles, onion and burger sauce', 2.5], ['pass', 'Wrapping the double in paper', 1.5]],
  'bacon-burger': [['flat', 'Laying bacon strips on the flat-top under a press', 3.5], ['flat', 'Smashing the patty in the bacon fat, flipping, cheese on', 4], ['flat', 'Toasting the bun beside it', 2], ['board', 'Crossing the bacon over the patty, lettuce and tomato on', 2.5], ['pass', 'Wrapping it in paper', 1.5]],
  'onion-rings': [['board/bowl', 'Dipping thick onion rings in beer batter', 2.5], ['fry', 'Dropping them one by one into the fryer', 4], ['fry', 'Turning them and lifting the basket when golden', 2.5], ['pass', 'Salting and stacking them in a paper boat', 2]],
  sliders: [['flat', 'Pressing three small patties onto a bed of griddled onions', 4], ['flat', 'Flipping them, cheese on, buns set on top to steam', 3.5], ['board', 'Capping each with a pickle chip', 2], ['pass', 'Lining the three up on a plate, a pick through each', 2]],
  'mozz-sticks': [['fry', 'Dropping breaded mozzarella sticks into the fryer', 3.5], ['fry', 'Pulling them the moment the cheese starts to ooze', 2], ['steam/ladle', 'Ladling warm marinara into a dipping cup', 2], ['pass', 'Stacking them log-cabin style round the marinara', 2]],
  // sandwich shops and the bodega griddle
  hero: [['board', 'Slicing roast turkey to order on the slicer', 3.5], ['board', 'Splitting a hero roll, layering on turkey and Swiss', 3], ['board', 'Topping with shredded lettuce, tomato, onion and mayo', 3], ['pass', 'Halving it and rolling it tight in deli paper', 2]],
  'italian-hero': [['board', 'Slicing ham, salami, capicola and provolone on the slicer', 4], ['board', 'Shingling the meats and cheese along a seeded hero', 3], ['board', 'Piling on lettuce, tomato, onion, oil, vinegar and oregano', 3], ['pass', 'Halving it and wrapping it in deli paper', 2]],
  'cutlet-hero': [['fry', 'Frying a breaded chicken cutlet until crisp', 4.5], ['board', 'Splitting a hero, spreading mayo, laying on the cutlet', 3], ['board', 'Adding lettuce, tomato, salt, pepper, oil and vinegar', 2.5], ['pass', 'Cutting it in half and wrapping it in foil and paper', 2]],
  'grilled-cheese': [['flat', 'Laying two buttered slices of white bread on the griddle', 3], ['flat', 'Covering them with American cheese and closing the sandwich', 2.5], ['flat', 'Flipping it golden and pressing it with the spatula', 3], ['pass', 'Cutting it corner to corner so the cheese pulls', 2]],
  blt: [['flat', 'Crisping bacon on the griddle under a press', 4], ['oven', 'Running white bread through the toaster', 2], ['board', 'Spreading mayo, stacking bacon, tomato slices and iceberg', 3], ['pass', 'Cutting it in triangles and pinning them with picks', 2]],
  soup: [['steam/ladle', 'Stirring the chicken noodle in the soup well', 2.5], ['steam/ladle', 'Ladling a pint container full', 2.5], ['pass/bowl', 'Snapping the lid on, a packet of crackers alongside', 2]],
  chips: [['case', 'Pulling a bag of potato chips off the clip rack', 1.5]],
  cookie: [['case', 'Lifting a chocolate chip cookie from the jar with wax tissue', 2]],
  bec: [['flat', 'Laying bacon on the griddle', 3], ['flat', 'Cracking two eggs, breaking the yolks, folding them square', 3.5], ['flat', 'Melting American cheese over the eggs, bacon on top', 2.5], ['board', 'Sliding it onto a buttered kaiser roll; salt, pepper, ketchup', 2.5], ['pass', 'Wrapping it tight in foil', 1.5]],
  'egg-cheese': [['flat', 'Cracking two eggs on the griddle and scrambling them flat', 3.5], ['flat', 'Folding the eggs and melting American cheese over', 2.5], ['board', 'Scooping it onto a split, buttered roll', 2.5], ['pass', 'Wrapping it in foil', 1.5]],
  'chopped-cheese': [['flat', 'Throwing ground beef and onions on the griddle', 3.5], ['flat', 'Chopping the meat with the spatula as it browns', 3.5], ['flat', 'Laying American cheese over and chopping it in to melt', 2.5], ['board', 'Scraping it into a hero with lettuce, tomato, ketchup, mayo', 3], ['pass', 'Pressing the hero shut and wrapping it in foil', 2]],
  'deli-sandwich': [['board', 'Shaving cold cuts to order on the slicer', 3.5], ['board', 'Building the sandwich on a roll with cheese, lettuce, tomato', 3], ['pass', 'Cutting it in half and wrapping it in deli paper', 2]],
  'roast-chicken': [['spit', 'Sliding a browned chicken off the rotisserie spit', 3], ['board', 'Tying its legs and sealing it in a hot foil-lined bag', 3]],
  // bakeries: baked before dawn, sold from the case
  'butter-roll': [['board', 'Slicing a kaiser roll and spreading butter edge to edge', 3], ['board', 'Wrapping it in wax paper', 1.5]],
  'bw-cookie': [['case', 'Lifting a black and white cookie from the tray with tissue', 2]],
  rye: [['case', 'Taking a seeded rye from the shelf', 2], ['board', 'Running it through the bread slicer and bagging it', 2.5]],
  croissant: [['case', 'Lifting a croissant from the case with tongs', 2]],
  cheesecake: [['cold', 'Cutting a wedge of cheesecake with a hot, wet knife', 3], ['pass', 'Setting the wedge on a plate with a fork', 2.5]],
  cannoli: [['board', 'Piping sweet ricotta into a crisp shell from both ends', 3], ['pass', 'Dipping the ends in chocolate chips, dusting with sugar', 2.5]],
  cupcake: [['case', 'Lifting a frosted cupcake from the case into a clear box', 2]],
  rugelach: [['case', 'Tonging rugelach from the tray into a white paper bag', 2.5]],
  challah: [['case', 'Taking a braided challah from the rack and bagging it', 2.5]],
  babka: [['case', 'Sliding a chocolate babka loaf into a box, tying the string', 3]],
  muffin: [['case', 'Lifting a blueberry muffin from the case with tissue', 2]],
  doughnut: [['case', 'Picking a glazed doughnut off the rack with wax tissue', 2]],
  'doughnut-chocolate': [['case', 'Lifting a chocolate frosted doughnut from the tray', 2]],
  'doughnut-sprinkle': [['case', 'Picking a sprinkle doughnut from the tray with tissue', 2]],
  'doughnut-jelly': [['case', 'Taking a sugared jelly doughnut from the rack', 2]],
  'boston-cream': [['case', 'Lifting a Boston cream from the tray, minding the glaze', 2]],
  'doughnut-box': [['case', 'Unfolding a box and filling it with six from the racks', 3.5], ['case', 'Closing the lid and taping it shut', 2]],
  // bagel shops
  bagel: [['board', 'Slicing a bagel through the middle with the long knife', 2.5], ['board', 'Scraping on a thick schmear of cream cheese', 2.5], ['board', 'Closing it, cutting it in half and wrapping it in paper', 2]],
  lox: [['board', 'Slicing a bagel and spreading it with cream cheese', 3], ['board', 'Hand-slicing nova paper-thin off the side of salmon', 3.5], ['board', 'Draping the lox, adding tomato, red onion and capers', 3], ['pass', 'Halving it and wrapping it in wax paper', 2]],
  'bagel-everything': [['board', 'Slicing an everything bagel in two', 2], ['oven', 'Running the halves through the conveyor toaster', 2.5], ['board', 'Buttering both halves hot, closing and wrapping it', 2.5]],
  'bagel-bec': [['flat', 'Frying bacon and two eggs on the griddle', 4], ['flat', 'Folding the eggs, cheese on top to melt', 2.5], ['board', 'Slicing a bagel and loading it with egg, cheese and bacon', 3], ['pass', 'Wrapping it in foil', 1.5]],
  bialy: [['case', 'Bagging an onion bialy from the wire bin', 2]],
  // juice bars
  acai: [['blender', 'Blending frozen açaí with banana until thick as sorbet', 4], ['board/bowl', 'Scraping it into a bowl and levelling the top', 2.5], ['pass/bowl', 'Lining up granola, banana, strawberry and a thread of honey', 3]],
  'avocado-toast': [['oven', 'Toasting a thick slice of sourdough', 3], ['board/bowl', 'Smashing avocado with lemon, salt and olive oil', 3], ['board', 'Spreading it thick on the toast', 2], ['pass', 'Finishing with chili flakes, sea salt and sliced radish', 2.5]],
  'cut-fruit': [['board', 'Cutting melon, pineapple and mango into chunks', 3.5], ['pass/cup', 'Filling a clear cup with fruit and snapping on the lid', 2.5]],
  // ice-cream parlours
  cone: [['scoop', 'Rolling a ball of ice cream with a dipped scoop', 3], ['scoop', 'Pressing it firmly onto a sugar cone', 2]],
  sundae: [['scoop', 'Dipping two scoops of vanilla into a tulip glass', 3], ['scoop/ladle', 'Ladling hot fudge over so it runs down the sides', 2.5], ['pass', 'Topping with whipped cream, chopped nuts and a cherry', 2.5]],
  'soft-serve': [['scoop', 'Pulling the lever and swirling soft serve up a cone', 3.5]],
  'ice-cream-cup': [['scoop', 'Dipping two scoops and packing them into a paper cup', 4]],
  'banana-split': [['board', 'Splitting a banana lengthwise into a boat dish', 2.5], ['scoop', 'Setting vanilla, chocolate and strawberry between the halves', 3.5], ['scoop/ladle', 'Saucing each scoop: pineapple, fudge, strawberry', 3], ['pass', 'Piping whipped cream, scattering nuts, three cherries on top', 2.5]],
  'ice-cream-sandwich': [['scoop', 'Pressing a scoop of vanilla between two chocolate chip cookies', 3.5], ['board', 'Squaring the edge and wrapping it in wax paper', 2]],
  'italian-ice': [['scoop', 'Scraping lemon ice from the tub with a flat paddle', 3], ['scoop/cup', 'Packing it into a pleated paper cup', 2]],
  // Italian dining rooms
  pasta: [['range/pot', 'Dropping spaghetti into salted boiling water', 4], ['range/pan', 'Simmering crushed tomatoes with garlic and basil', 4], ['range/pan', 'Tossing the spaghetti through the sauce', 3], ['pass/bowl', 'Twirling it into a warm bowl with basil and parmesan', 2.5]],
  parm: [['board', 'Pounding a veal cutlet thin and breading it', 3], ['range/pan', 'Pan-frying the cutlet in olive oil until golden', 4], ['oven', 'Spooning on marinara and mozzarella, into the broiler', 3.5], ['pass', 'Plating it bubbling beside a twirl of spaghetti', 2.5]],
  meatballs: [['range/pan', 'Simmering meatballs in a pan of tomato gravy', 4], ['range/pot', 'Dropping spaghetti into salted boiling water', 4], ['range/pan', 'Tossing the spaghetti in the sauce with pasta water', 3], ['pass/bowl', 'Setting three meatballs on top, grating pecorino over', 2.5]],
  lasagna: [['board/tray', 'Cutting a square from the tray of lasagna', 2.5], ['oven', 'Baking the portion in a gratin dish with extra sauce', 5], ['oven', 'Flashing it under the salamander to blister the cheese', 2.5], ['pass', 'Setting the hot dish on a plate, basil and parmesan over', 2.5]],
  alfredo: [['range/pot', 'Dropping fresh fettuccine into salted boiling water', 3.5], ['range/pan', 'Melting butter with cream and a ladle of pasta water', 3], ['range/pan', 'Tossing the fettuccine with handfuls of parmesan', 3.5], ['pass/bowl', 'Twirling it into a warm bowl, black pepper over', 2.5]],
  caprese: [['board', 'Slicing beefsteak tomato and fresh mozzarella', 3.5], ['cold/plate', 'Shingling them on a plate with whole basil leaves', 3], ['pass', 'Dressing with olive oil, sea salt and cracked pepper', 2.5]],
  calamari: [['board/bowl', 'Tossing squid rings and tentacles in seasoned flour', 2.5], ['fry', 'Frying them fast in very hot oil', 3.5], ['fry', 'Draining the basket and salting at once', 2], ['pass', 'Heaping them on paper with lemon and warm marinara', 2.5]],
  tiramisu: [['cold/tray', 'Cutting a square of tiramisu from the chilled pan', 3], ['pass', 'Dusting it with cocoa through a sieve', 2.5]],
  // diners: the short-order cook and the flat-top
  eggs: [['flat', 'Scraping home fries across the flat-top with onions', 3.5], ['flat', 'Cracking two eggs onto the griddle, over easy', 3.5], ['oven', 'Dropping two slices of rye in the toaster', 2], ['pass', 'Plating eggs and home fries, buttered toast in triangles', 2.5]],
  pie: [['case', 'Cutting a wedge of apple pie from the rotating case', 2.5], ['pass', 'Sliding it onto a plate with a squirt of whipped cream', 2]],
  pancakes: [['flat', 'Ladling three rounds of buttermilk batter onto the griddle', 3.5], ['flat', 'Flipping them when the bubbles pop and hold', 3.5], ['pass', 'Stacking them with a scoop of butter and warm syrup', 2.5]],
  omelette: [['flat', 'Sautéing diced ham, peppers and onions on the griddle', 3], ['range/pan', 'Pouring beaten eggs into a hot buttered pan', 3], ['range/pan', 'Scattering in the ham and peppers, folding it over', 3], ['oven', 'Dropping two slices of white in the toaster', 2], ['pass', 'Plating it with home fries and buttered toast', 2.5]],
  club: [['flat', 'Crisping bacon on the griddle', 3.5], ['oven', 'Toasting three slices of white bread', 2.5], ['board', 'Building two decks: turkey and lettuce, bacon and tomato', 3.5], ['board', 'Pinning it with frill picks and cutting it in quarters', 2.5], ['pass', 'Standing the quarters round a pile of fries and a pickle', 2.5]],
  meatloaf: [['flat', 'Searing a thick slice of meatloaf on the griddle', 4], ['steam/ladle', 'Scooping mashed potatoes and ladling brown gravy', 3], ['pass', 'Plating with gravy over the loaf and buttered green beans', 3]],
  caesar: [['board', 'Chopping chilled romaine hearts', 3], ['cold/bowl', 'Tossing with Caesar dressing, anchovy, lemon and croutons', 3.5], ['pass/bowl', 'Plating it high and shaving parmesan over', 2.5]],
  // French bistro
  quiche: [['board', 'Cutting a wedge from the quiche Lorraine', 2.5], ['oven', 'Warming the slice until the custard just trembles', 4], ['pass', 'Plating it with dressed green leaves', 2.5]],
  'steak-frites': [['range/pan', 'Searing a hanger steak hard in a black steel pan', 4], ['fry', 'Dropping hand-cut fries for their second fry', 3.5], ['range/pan', 'Basting the steak with butter, thyme and garlic', 3], ['board', 'Resting it, then slicing against the grain', 3], ['pass', 'Fanning the steak by a tangle of frites, herb butter on top', 2.5]],
  'onion-soup': [['steam/ladle', 'Ladling caramelised onion broth into a crock', 3], ['board/bowl', 'Floating a crouton, covering it with grated Gruyère', 2.5], ['oven/bowl', 'Sliding the crock under the salamander until it blisters', 4], ['pass/bowl', 'Setting the bubbling crock on a lined plate', 2]],
  croque: [['board', 'Spreading béchamel on bread, layering ham and Gruyère', 3], ['flat', 'Griddling the sandwich in butter on both sides', 3.5], ['oven', 'Topping with béchamel and cheese, under the salamander', 3.5], ['pass', 'Plating it blistered with cornichons and salad', 2.5]],
  moules: [['range/pot', 'Sweating shallot and garlic in butter in a deep pot', 2.5], ['range/pot', 'Tipping in mussels and white wine, clamping on the lid', 4], ['fry', 'Frying a basket of frites', 3.5], ['range/pot', 'Shaking the pot, finishing with cream and parsley', 2.5], ['pass/pot', 'Sending out the pot with a cone of frites and a shell bowl', 2.5]],
  'duck-confit': [['range/pan', 'Crisping a confit duck leg skin-down in a pan', 4.5], ['oven', 'Finishing it in the oven until the skin shatters', 3.5], ['range/pan', 'Frying sliced potatoes in duck fat with garlic and parsley', 3.5], ['pass', 'Setting the leg on the potatoes with dressed frisée', 2.5]],
  'creme-brulee': [['cold/bowl', 'Taking a set custard from the reach-in, sugaring the top', 3], ['pass/bowl', 'Torching the sugar to an amber glass', 3]],
  crepe: [['flat', 'Spreading thin batter on the crêpe iron with the rake', 3.5], ['flat', 'Flipping it, scattering sugar and a squeeze of lemon', 3], ['flat', 'Folding it in quarters on the iron', 2], ['pass', 'Plating it under a snow of powdered sugar', 2]],
  // seafood houses
  'fish-sandwich': [['board/bowl', 'Dipping a cod fillet in batter', 2.5], ['fry', 'Frying the fillet until crisp and floating', 4.5], ['flat', 'Toasting a buttered bun', 2], ['pass', 'Building it with tartar sauce, lettuce and pickles', 2.5]],
  'grilled-salmon': [['grill', 'Laying a salmon fillet skin-down on the oiled grill', 4.5], ['range/pan', 'Browning boiled potatoes in butter with parsley', 3.5], ['grill', 'Turning the salmon once, just to medium', 3], ['pass', 'Plating the fillet over the potatoes with lemon and dill', 2.5]],
  'fish-chips': [['board/bowl', 'Dragging cod fillets through beer batter', 2.5], ['fry', 'Lowering the fish into the oil, laying it away from the hand', 4.5], ['fry', 'Dropping a basket of thick chips in the second fryer', 3.5], ['pass', 'Plating both with tartar sauce, lemon and malt vinegar', 2.5]],
  'lobster-roll': [['board/bowl', 'Dressing claw and knuckle meat lightly with mayo and lemon', 3.5], ['flat', 'Griddling a split-top bun in butter on both flat sides', 3], ['board', 'Heaping the lobster into the bun, chives on top', 2.5], ['pass', 'Plating it with chips and a pickle', 2]],
  oysters: [['cold', 'Pulling six oysters off the ice', 2], ['cold/board', 'Shucking each at the hinge and cutting the muscle free', 4.5], ['cold/tray', 'Bedding the shells level on crushed ice', 2.5], ['pass/tray', 'Adding lemon, mignonette and cocktail sauce', 2]],
  chowder: [['steam/ladle', 'Stirring the chowder kettle so the clams come up', 2.5], ['steam/ladle', 'Ladling it thick with potato into a warm bowl', 3], ['pass/bowl', 'Finishing with parsley, black pepper and oyster crackers', 2.5]],
  'shrimp-cocktail': [['cold', 'Taking poached jumbo shrimp from the ice bath', 2.5], ['cold/bowl', 'Hanging them round a coupe of crushed ice', 3], ['pass/bowl', 'Spooning in horseradish cocktail sauce, lemon on the rim', 2.5]],
  lobster: [['range/pot', 'Dropping a live lobster into the steamer pot, lid on', 5], ['board', 'Cracking the claws and splitting the tail', 3.5], ['range/pan', 'Melting butter and skimming it clear', 2], ['pass', 'Plating it bright red with drawn butter and lemon', 2.5]],
  // steakhouse: sear, baste, rest, slice
  steak: [['grill', 'Salting a dry-aged strip and laying it under the broiler', 4.5], ['grill', 'Flipping it once the crust is dark', 3.5], ['range/pan', 'Basting it with foaming butter', 3], ['board', 'Resting it, then slicing across the grain', 3.5], ['pass', 'Sending it out on a scorching plate in its own butter', 2.5]],
  ribeye: [['range/pan', 'Searing a bone-in ribeye in a ripping-hot iron pan', 4.5], ['range/pan', 'Basting it with butter, garlic and thyme', 3.5], ['oven', 'Finishing it in the oven to medium-rare', 3], ['board', 'Resting it, then carving it off the bone in thick slices', 3.5], ['pass', 'Fanning the slices by the bone with flaky salt and pan juices', 2.5]],
  spinach: [['range/pan', 'Sweating shallot in butter, stirring in flour and cream', 3.5], ['range/pan', 'Folding in chopped blanched spinach, nutmeg and parmesan', 3.5], ['pass/bowl', 'Spooning it into a hot side dish', 2]],
  'wedge-salad': [['board', 'Cutting a cold head of iceberg into a quarter wedge', 3], ['cold/plate', 'Pouring blue cheese dressing over the wedge', 3], ['pass', 'Scattering bacon, tomato, chives and crumbled blue cheese', 3]],
  'baked-potato': [['oven', 'Pulling a salt-crusted russet from the oven', 3.5], ['board', 'Slitting it and pinching the ends to fluff it open', 2.5], ['pass', 'Loading it with butter, sour cream, chives and bacon', 3]],
  'bacon-slab': [['grill', 'Laying a thick slab of smoked bacon under the broiler', 4.5], ['grill', 'Turning it as the fat renders and the edges char', 3.5], ['pass', 'Plating the slab sizzling on a hot dish', 2.5]],
  // Central and Eastern European
  'mushroom-soup': [['steam/ladle', 'Ladling creamy mushroom soup from the well', 3], ['range/pan', 'Frying sliced mushrooms in butter for the garnish', 3], ['pass/bowl', 'Finishing the bowl with the mushrooms, dill and sour cream', 3]],
  'chicken-potatoes': [['oven', 'Pulling a roast half chicken from the oven, skin crackling', 4], ['range/pan', 'Crisping roast potatoes in the chicken drippings', 3.5], ['board', 'Carving the leg from the breast', 2.5], ['pass', 'Plating it over the potatoes, pan jus spooned on top', 2.5]],
  pierogi: [['range/pot', 'Boiling potato-and-cheese pierogi until they float', 3.5], ['range/pan', 'Frying them in butter with onions until golden', 4], ['pass', 'Plating with the fried onions and a spoon of sour cream', 2.5]],
  bratwurst: [['flat', 'Browning a bratwurst on the griddle, turning it often', 4.5], ['range/pan', 'Warming sauerkraut with caraway', 3], ['pass', 'Plating the sausage on the kraut with mustard and rye', 2.5]],
  schnitzel: [['board', 'Pounding a veal cutlet paper-thin under plastic wrap', 3], ['board/tray', 'Breading it in flour, egg and fine crumbs', 2.5], ['range/pan', 'Shallow-frying it, swirling the pan so the crust puffs', 4], ['pass', 'Plating it with lemon, parsley potatoes and lingonberry', 2.5]],
  borscht: [['steam/ladle', 'Stirring the borscht pot, beets and cabbage rising', 2.5], ['steam/ladle', 'Ladling it into a deep bowl', 2.5], ['pass/bowl', 'Finishing with sour cream, dill and a slice of rye', 2.5]],
  goulash: [['steam/ladle', 'Ladling paprika-braised beef from the pot', 3.5], ['range/pan', 'Tossing spaetzle in butter in a pan', 3], ['pass/bowl', 'Plating the goulash beside the spaetzle, sour cream on top', 2.5]],
  strudel: [['oven', 'Warming a slice of apple strudel in the oven', 3.5], ['pass', 'Dusting with powdered sugar, vanilla sauce alongside', 2.5]],
  pretzel: [['oven', 'Warming a soft pretzel in the oven', 3.5], ['board', 'Brushing it with butter and coarse salt', 2], ['pass', 'Serving it with grain mustard and beer cheese', 2]],
  'shepherds-pie': [['oven/bowl', 'Baking a crock of lamb and gravy under mashed potato', 5], ['oven/bowl', 'Browning the ridged potato top under the broiler', 3], ['pass/bowl', 'Setting the crock on a plate, parsley over', 2]],
  // stands and counters where nothing is cooked
  banana: [['case', 'Snapping a banana off the bunch', 1.5]],
  oranges: [['case', 'Bagging navel oranges from the pile', 2.5]],
  fruit: [['case', 'Picking a ripe piece of fruit and polishing it on the apron', 2]],
  'mango-cup': [['board', 'Peeling a mango and cutting the cheeks into spears', 3.5], ['board/cup', 'Standing the spears in a cup, squeezing lime over', 2.5], ['board/cup', 'Shaking on chili-lime salt and chamoy', 2]],
  chocolate: [['case', 'Taking a candy bar from the rack', 1.5]],
  popcorn: [['case', 'Scooping popcorn from the kettle warmer into a tub', 2.5], ['case', 'Pumping butter topping over it', 1.5]],
  // the headings older saves ordered under
  'small-plate': [['case', 'Taking a portion from the hot case', 2], ['oven', 'Warming it through in the oven', 3.5], ['pass', 'Sliding it onto a paper plate', 2]],
  'lunch-special': [['steam/tray', 'Scooping rice into a three-compartment container', 2.5], ['steam/ladle', 'Ladling the main of the day from the steam table', 3], ['steam/tray', 'Adding the vegetable side', 2], ['pass', 'Closing the container, fork and napkins on top', 2]],
  lunch: [['range/pan', 'Searing a chicken breast skin-down in a hot pan', 4], ['range/pan', 'Deglazing with white wine, mounting butter into a sauce', 3.5], ['cold/bowl', 'Dressing a handful of greens', 2.5], ['pass', 'Slicing the chicken beside the salad, sauce spooned round', 2.5]],
  dinner: [['range/pan', 'Searing the fish of the day skin-side down', 4], ['range/pan', 'Basting it with butter and thyme', 3], ['range/pan', 'Glazing seasonal vegetables in a second pan', 3], ['pass', 'Plating fish over vegetables, sauce round, herbs on top', 3]],
};

export const DRINKS = {
  coffee: [['brew', 'Drawing a cup of fresh drip coffee from the brewer', 2.5]],
  'iced-coffee': [['brew', 'Scooping ice into a cup', 1.5], ['brew', 'Pouring cold brew over the ice, a splash of milk', 2.5]],
  espresso: [['espresso', 'Grinding a dose and tamping it level', 2.5], ['espresso', 'Pulling a short shot into a warm demitasse', 3.5]],
  latte: [['espresso', 'Grinding, tamping and pulling a double shot', 3.5], ['espresso', 'Steaming milk to a glossy microfoam', 3], ['espresso', 'Pouring a rosetta into the cup', 2]],
  cappuccino: [['espresso', 'Grinding, tamping and pulling a double shot', 3.5], ['espresso', 'Stretching the milk into a thick, dry foam', 3], ['espresso', 'Pouring it so the foam domes above the rim', 2]],
  matcha: [['brew/bowl', 'Sifting matcha into a bowl and whisking it with hot water', 3.5], ['espresso', 'Steaming milk with the wand', 2.5], ['espresso', 'Pouring the milk through the green tea', 2]],
  'hot-chocolate': [['espresso', 'Steaming milk with dark chocolate until thick', 4], ['espresso', 'Pouring it into a mug, whipped cream on top', 2]],
  tea: [['brew', 'Filling a cup from the hot water tap over a tea bag', 2.5]],
  'green-tea': [['brew/pot', 'Steeping green tea leaves in a small iron pot', 3.5], ['brew', 'Pouring it into a handleless cup', 1.5]],
  chai: [['range/pot', 'Boiling black tea with ginger, cardamom and milk', 4], ['brew', 'Pulling it through a strainer into a cup', 2]],
  'barley-tea': [['brew', 'Pouring roasted barley tea from the big kettle', 2.5]],
  soda: [['fountain', 'Scooping ice and pressing the cup to the soda fountain', 2.5]],
  'soda-can': [['case', 'Grabbing a cold can of soda from the cooler', 1.5]],
  'soda-bottle': [['case', 'Pulling a glass bottle of soda from the cooler, cap popped', 2]],
  lemonade: [['fountain', 'Filling a cup of ice from the lemonade dispenser', 2.5]],
  'iced-tea': [['fountain', 'Filling a cup of ice from the iced tea urn, lemon on the rim', 2.5]],
  'thai-tea': [['fountain', 'Pouring strong brewed orange tea over crushed ice', 2.5], ['fountain', 'Floating evaporated milk on top so it clouds down', 2]],
  horchata: [['fountain', 'Stirring the horchata barrel and ladling it over ice', 3]],
  'morir-sonando': [['fountain', 'Pouring evaporated milk and sugar over crushed ice', 2.5], ['fountain', 'Streaming in cold orange juice, stirring so it stays smooth', 3]],
  jamaica: [['fountain', 'Ladling deep red hibiscus water from the barrel over ice', 3]],
  sorrel: [['fountain', 'Pouring chilled sorrel, hibiscus with ginger and clove, on ice', 3]],
  boba: [['fountain', 'Scooping warm tapioca pearls into a cup', 2], ['fountain', 'Shaking milk tea with ice and syrup, pouring it over', 3.5], ['fountain', 'Sealing the cup under the film press', 1.5]],
  'egg-cream': [['fountain', 'Stirring chocolate syrup into cold milk in a tall glass', 2.5], ['fountain', 'Jetting in seltzer off the spoon to raise a white head', 3]],
  'ginger-beer': [['case', 'Taking a cold bottle of ginger beer from the cooler', 1.5]],
  water: [['case', 'Pulling a bottle of water from the cooler', 1.5]],
  'orange-juice': [['fountain', 'Feeding halved oranges through the press into a cup', 4]],
  'carrot-juice': [['blender', 'Pushing whole carrots through the juicer with a knob of ginger', 4], ['blender', 'Skimming the foam and pouring it into a cup', 2]],
  'green-juice': [['blender', 'Feeding kale, cucumber, celery and green apple to the juicer', 4.5], ['blender', 'Squeezing in lemon and pouring it off', 2]],
  wheatgrass: [['blender', 'Cranking a fistful of cut wheatgrass through the press', 3.5]],
  smoothie: [['blender', 'Loading the pitcher with frozen berries, banana and juice', 2.5], ['blender', 'Blending until smooth and pouring it into a tall cup', 3.5]],
  lassi: [['blender', 'Blending yogurt, mango pulp, milk and a pinch of cardamom', 3.5], ['blender', 'Pouring it thick into a tall glass', 2]],
  'protein-shake': [['blender', 'Scooping protein powder over milk, banana and ice', 2.5], ['blender', 'Blending and pouring it into a shaker cup', 3]],
  shake: [['scoop', 'Dropping three scoops of ice cream into the steel mixing cup', 2.5], ['blender', 'Adding milk and syrup, spinning it on the spindle mixer', 3.5], ['blender', 'Pouring it into a tall glass, the extra left in the tin', 2]],
  beer: [['bar', 'Tilting a pint glass under the tap, straightening for a head', 3.5]],
  stout: [['bar', 'Pulling the stout to three-quarters and letting it settle', 4], ['bar', 'Topping it off to a creamy dome', 2]],
  cocktail: [['bar', 'Measuring spirit, citrus and syrup into the shaker', 3], ['bar', 'Shaking hard over ice', 2.5], ['bar', 'Double-straining into a chilled coupe with a twist', 2.5]],
  martini: [['bar', 'Stirring gin and dry vermouth over ice until frost-cold', 4], ['bar', 'Straining it into a chilled glass, three olives on a pick', 2.5]],
  margarita: [['bar', 'Salting the rim of a rocks glass with a lime wedge', 2], ['bar', 'Shaking tequila, lime juice and orange liqueur over ice', 3], ['bar', 'Straining it over fresh ice', 2]],
  mojito: [['bar', 'Muddling mint, lime and sugar in a tall glass', 3], ['bar', 'Adding rum and crushed ice, churning with a spoon', 3], ['bar', 'Topping with soda and a sprig of mint', 2]],
  'old-fashioned': [['bar', 'Stirring sugar, bitters and bourbon over one big ice cube', 4], ['bar', 'Expressing an orange peel over the glass', 2]],
  whiskey: [['bar', 'Pouring two fingers of whiskey, neat', 2.5]],
  'vodka-soda': [['bar', 'Pouring vodka over ice, soda from the gun, a lime wedge', 3]],
  'red-wine': [['bar', 'Pouring a glass of red to the widest point of the bowl', 2.5]],
  'white-wine': [['bar', 'Pouring a chilled white from the ice well', 2.5]],
  champagne: [['bar', 'Easing the cork out of a cold bottle with a sigh', 3], ['bar', 'Pouring it down the side of a flute', 2.5]],
  shot: [['bar', 'Pouring a shot of tequila to the line, salt and lime beside', 2.5]],
  sake: [['bar', 'Warming a flask of sake in the hot water bath', 3], ['bar', 'Setting it out with two small ceramic cups', 2]],
  soju: [['bar', 'Cracking a cold bottle of soju, setting out shot glasses', 2.5]],
  wine: [['case', 'Taking a bottle of wine from the rack and bagging it', 2.5]],
};

// The same name is made differently at some kinds of place.
export const BY_KIND = {
  // a slice shop boxes an eight-cut pie; a trattoria fires a small one for the plate
  'pizza-margherita': { italian: [['board/pie', 'Pressing out a dough ball, leaving a puffy rim', 3], ['board/pie', 'Spreading crushed tomato, torn mozzarella and basil', 3], ['oven/pie', 'Firing it at the mouth of the oven, turning it with the peel', 4.5], ['pass/pie', 'Finishing with olive oil and fresh basil, cut in six', 2.5]] },
  // a diner griddles its burger for a platter; a pub char-grills it
  'burger-deluxe': { pub: [['grill', 'Char-grilling a half-pound patty to medium', 4.5], ['grill', 'Melting cheddar over it and toasting a brioche bun', 3], ['fry', 'Dropping a basket of fries', 3], ['pass', 'Building it with lettuce, tomato and onion, fries in a cup', 3]] },
  'hot-dog': { cinema: [['flat', 'Taking a frank off the roller grill with tongs', 2.5], ['board', 'Dropping it in a steamed bun and a paper boat', 2]] },
  nachos: { cinema: [['case/tray', 'Shaking tortilla chips into a paper tray', 2], ['steam/ladle', 'Ladling warm cheese sauce into the corner, jalapeños on top', 2.5]] },
  cheesecake: { bakery: [['case', 'Cutting a wedge of cheesecake in the case with a hot knife', 3], ['case', 'Sliding the wedge into a pastry box', 2]] },
  coffee: {
    bodega: [['brew', 'Filling a paper cup from the urn, milk and two sugars', 2.5], ['brew', 'Stirring it and pressing on the lid', 1.5]],
    american: [['brew', 'Pouring from the glass pot on the burner into a thick mug', 2.5]],
  },
  latte: { latin: [['espresso', 'Pulling a dark shot and stirring in sugar', 3], ['espresso', 'Scalding milk with the steam wand and filling the cup', 3]] },
  'iced-coffee': { asian: [['brew', 'Dripping dark roast through a phin over condensed milk', 4], ['brew', 'Stirring it and pouring it over a tall glass of ice', 2]] },
  'green-tea': { chinese: [['brew', 'Pouring hot tea from the urn into a paper cup', 2.5]] },
  'iced-tea': { bbq: [['fountain', 'Pouring sweet tea from the dispenser over a cup of ice', 2.5]] },
  sorrel: { african: [['fountain', 'Pouring cold bissap, hibiscus steeped with mint, over ice', 3]] },
  soda: { bar: [['bar', 'Shooting cola from the soda gun over a glass of ice', 2.5]], pub: [['bar', 'Shooting cola from the soda gun over a glass of ice', 2.5]] },
  beer: { thai: [['bar', 'Popping the cap off a cold bottle of lager', 2]] },
};

const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined;
const made = new Map();
const steps = rows => {
  if (!made.has(rows)) made.set(rows, Object.freeze(rows.map(([where, say, secs]) => { const [at, ware] = where.split('/'); return Object.freeze({ at, ware, say, secs }); })));
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
