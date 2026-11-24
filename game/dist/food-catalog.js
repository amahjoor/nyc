// Which model each thing on a menu is served as. Model names are stable: orders,
// hands, tables and saved meals all refer to them.
const plates={
  // by the slice
  'Slice':'pizza','Pepperoni slice':'pizza-pepperoni','Sicilian slice':'pizza-sicilian','White slice':'pizza-white','Two slices and a soda':'pizza-combo',
  'Garlic knots':'garlic-knots','Calzone':'calzone','Margherita pie':'pizza-margherita','Margherita pizza':'pizza-margherita',
  // counters and carts
  'Egg roll':'egg-roll','Spring rolls':'spring-rolls','Pork fried rice':'fried-rice',"General Tso's chicken combo":'tso','Chicken lo mein':'lo-mein',
  'Beef with broccoli':'beef-broccoli','Pork dumplings':'dumplings','Wonton soup':'wonton-soup','Roast pork bun':'pork-bun',
  'Chicken over rice':'chicken-rice','Lamb over rice':'lamb-rice','Lamb gyro':'gyro','Falafel sandwich':'falafel','Chicken shawarma':'shawarma',
  'Hummus and pita':'hummus','Greek salad':'greek-salad','Spinach pie':'spanakopita','Baklava':'baklava',
  'Taco':'taco','Carnitas tacos':'tacos','Burrito':'burrito','Chips and guacamole':'guacamole','Quesadilla':'quesadilla','Nachos':'nachos','Elote':'elote','Tamales':'tamales','Churros':'churros',
  'Pernil with rice and beans':'pernil','Empanada':'empanada','Pollo guisado':'pollo-guisado','Mofongo':'mofongo','Cubano':'cubano','Tostones':'tostones','Sweet plantains':'plantains','Arepa':'arepa','Flan':'flan',
  'Beef patty':'beef-patty','Jerk chicken with rice and peas':'jerk','Oxtail':'oxtail','Curry goat':'curry-goat','Doubles':'doubles','Chicken roti':'roti','Festival':'festival',
  'Cornbread':'cornbread','Barbecue ribs with slaw':'bbq-ribs','Brisket plate':'brisket','Pulled pork sandwich':'pulled-pork','Mac and cheese':'mac-cheese','Collard greens':'collards','Banana pudding':'banana-pudding',
  'Potato knish':'knish','Pastrami on rye':'pastrami','Matzo ball soup':'matzo-ball','Corned beef Reuben':'reuben','Potato latkes':'latkes','Hot dog':'hot-dog','Half-sour pickles':'pickle-plate',
  'Scallion pancake':'scallion-pancake','Vegetable stir-fry':'stir-fry','Pho':'pho','Banh mi':'banh-mi','Summer rolls':'summer-rolls',
  'Fried plantains':'plantains','Jollof rice with chicken':'jollof','Suya':'suya','Egusi with fufu':'egusi','Injera platter':'injera','Meat pie':'meat-pie','Puff puff':'puff-puff',
  'Miso soup':'miso','Salmon roll':'sushi','Ramen':'ramen','Nigiri set':'nigiri','Chicken katsu curry':'katsu-curry','Gyoza':'gyoza','Shrimp tempura':'tempura','Edamame':'edamame','Onigiri':'onigiri','Mochi':'mochi',
  'Kimbap':'kimbap','Bibimbap':'bibimbap','Korean fried chicken':'korean-fried-chicken','Bulgogi':'bulgogi','Tteokbokki':'tteokbokki','Kimchi stew':'kimchi-jjigae','Japchae':'japchae',
  'Pad thai':'pad-thai','Green curry':'green-curry','Tom yum soup':'tom-yum','Papaya salad':'papaya-salad','Chicken satay':'satay','Mango sticky rice':'mango-sticky-rice',
  'Samosa':'samosa','Chicken tikka masala':'tikka','Saag paneer':'saag-paneer','Chicken biryani':'biryani','Garlic naan':'naan','Masala dosa':'dosa','Chana masala':'chana','Gulab jamun':'gulab-jamun',
  'Three pieces and a biscuit':'fried-chicken','Wings':'wings','Fries':'fries','Chicken sandwich':'chicken-sandwich','Tenders':'tenders','Coleslaw':'coleslaw',
  'Cheeseburger':'burger','Burger deluxe':'burger-deluxe','Pub burger':'burger-deluxe','Double cheeseburger':'burger-double','Bacon burger':'bacon-burger','Onion rings':'onion-rings','Sliders':'sliders','Mozzarella sticks':'mozz-sticks',
  'Turkey hero':'hero','Italian hero':'italian-hero','Chicken cutlet hero':'cutlet-hero','Grilled cheese':'grilled-cheese','BLT':'blt','Soup':'soup','Bag of chips':'chips','Chocolate chip cookie':'cookie',
  'Bacon, egg and cheese':'bec','Egg and cheese on a roll':'egg-cheese','Chopped cheese':'chopped-cheese','Sandwich from the deli counter':'deli-sandwich','Rotisserie chicken':'roast-chicken',
  // bakeries and cafes
  'Roll with butter':'butter-roll','Black and white cookie':'bw-cookie','Loaf of rye':'rye','Pastry':'croissant','Croissant':'croissant','Cheesecake':'cheesecake','Cannoli':'cannoli',
  'Cupcake':'cupcake','Rugelach':'rugelach','Challah':'challah','Chocolate babka':'babka','Blueberry muffin':'muffin',
  'Glazed doughnut':'doughnut','Chocolate frosted doughnut':'doughnut-chocolate','Sprinkle doughnut':'doughnut-sprinkle','Jelly doughnut':'doughnut-jelly','Boston cream':'boston-cream','Half dozen':'doughnut-box',
  'Bagel with cream cheese':'bagel','Bagel with lox':'lox','Everything bagel with butter':'bagel-everything','Bacon, egg and cheese on a bagel':'bagel-bec','Bialy':'bialy',
  'Acai bowl':'acai','Avocado toast':'avocado-toast','Fruit cup':'cut-fruit',
  'Cone':'cone','Sundae':'sundae','Soft serve':'soft-serve','Two scoops in a cup':'ice-cream-cup','Banana split':'banana-split','Ice cream sandwich':'ice-cream-sandwich','Italian ice':'italian-ice',
  // dining rooms
  'Spaghetti pomodoro':'pasta','Veal parmigiana':'parm','Spaghetti and meatballs':'meatballs','Lasagna':'lasagna','Fettuccine Alfredo':'alfredo','Caprese salad':'caprese','Fried calamari':'calamari','Tiramisu':'tiramisu',
  'Eggs, home fries and toast':'eggs','Slice of pie':'pie','Pancakes':'pancakes','Western omelette':'omelette','Turkey club':'club','Meatloaf':'meatloaf','Caesar salad':'caesar',
  'Quiche Lorraine':'quiche','Steak frites':'steak-frites','French onion soup':'onion-soup','Croque monsieur':'croque','Moules frites':'moules','Duck confit':'duck-confit','Creme brulee':'creme-brulee','Crepe':'crepe',
  'Fish sandwich':'fish-sandwich','Grilled salmon with potatoes':'grilled-salmon','Fish and chips':'fish-chips','Lobster roll':'lobster-roll','Oysters on the half shell':'oysters','Clam chowder':'chowder','Shrimp cocktail':'shrimp-cocktail','Steamed lobster':'lobster',
  'Strip steak':'steak','Creamed spinach':'spinach','Ribeye':'ribeye','Wedge salad':'wedge-salad','Baked potato':'baked-potato','Thick-cut bacon':'bacon-slab',
  'Mushroom soup':'mushroom-soup','Roast chicken with potatoes':'chicken-potatoes','Pierogi':'pierogi','Bratwurst with sauerkraut':'bratwurst','Schnitzel':'schnitzel','Borscht':'borscht','Goulash':'goulash','Apple strudel':'strudel',
  'Soft pretzel':'pretzel',"Shepherd's pie":'shepherds-pie',
  // stands, and the headings older saves ordered under
  'Banana':'banana','Bag of oranges':'oranges','Cut fruit':'cut-fruit','Fruit':'fruit','Apple':'fruit','Mango with chili':'mango-cup','Candy bar':'chocolate','Popcorn':'popcorn',
  'Slice or small plate':'small-plate','Lunch special':'lunch-special','Lunch':'lunch','Dinner':'dinner',
};
const drinks={
  'Coffee':'coffee','Coffee, regular':'coffee','Iced coffee':'iced-coffee','Vietnamese iced coffee':'iced-coffee','Espresso':'espresso','Cafe con leche':'latte','Latte':'latte','Cappuccino':'cappuccino',
  'Matcha latte':'matcha','Hot chocolate':'hot-chocolate','Tea':'tea','Hot tea':'green-tea','Masala chai':'chai','Green tea':'green-tea','Barley tea':'barley-tea',
  'Soda':'soda','Can of soda':'soda-can','Bottle of soda':'soda-bottle','Lemonade':'lemonade','Iced tea':'iced-tea','Sweet tea':'iced-tea','Thai iced tea':'thai-tea','Horchata':'horchata','Morir sonando':'morir-sonando',
  'Agua de jamaica':'jamaica','Sorrel':'sorrel','Bissap':'sorrel','Bubble tea':'boba','Egg cream':'egg-cream','Ginger beer':'ginger-beer','Bottle of water':'water',
  'Orange juice':'orange-juice','Carrot juice':'carrot-juice','Green juice':'green-juice','Wheatgrass shot':'wheatgrass','Smoothie':'smoothie','Mango lassi':'lassi','Protein shake':'protein-shake','Shake':'shake',
  'Beer':'beer','Stout':'stout','Cocktail':'cocktail','Martini':'martini','Margarita':'margarita','Mojito':'mojito','Old fashioned':'old-fashioned','Whiskey':'whiskey','Vodka soda':'vodka-soda',
  'Glass of red wine':'red-wine','Glass of white wine':'white-wine','Champagne':'champagne','Tequila shot':'shot','Sake':'sake','Soju':'soju','Bottle of wine':'wine',
};
export const dishStyle=name=>plates[name];
export const drinkStyle=name=>drinks[name];
export const plateStyles=Object.freeze([...new Set(Object.values(plates))]);
export const drinkStyles=Object.freeze([...new Set(Object.values(drinks))]);
/** The model a menu item is served as: at a table coffee comes in a mug, to go in a paper cup. */
export function servingFor(item,dineIn=false){
  const name=typeof item==='string'?item:item?.preparation||item?.name;
  if(plates[name])return 'plate-'+plates[name];
  const drink=drinks[name];
  if(drink==='coffee')return dineIn?'mug':'cup';
  return drink?'drink-'+drink:null;
}
// Two is the full serving. Suffixes preserve the amount left, including old half servings.
export const portionKey=(base,level)=>level===2?base:base+'@'+level;
export const portionBase=key=>key?.split('@')[0];
// Service travels with the item. Sitting down later must not replate a packed meal.
export const takeawayServing=item=>{
  const base=servingFor(item);
  return base?.startsWith('plate-')?base.replace('plate-','plate-togo-'):base;
};
const pastries=new Set([
  'doughnut','doughnut-chocolate','doughnut-sprinkle','doughnut-jelly','boston-cream',
  'croissant','muffin','cookie','bw-cookie','cupcake','butter-roll','pretzel','ice-cream-sandwich',
]);
export const isPastry=style=>pastries.has(style);
export const isWrappedServing=key=>key?.startsWith('plate-togo-') && isPastry(portionBase(key).slice(11));
const sliceStyles=new Set(['pizza','pizza-pepperoni','pizza-white','pizza-sicilian','pizza-combo','small-plate']);
export const isSliceServing=style=>sliceStyles.has(style);
export function portionLevel(key){
  const suffix=key?.split('@')[1];
  if(suffix===undefined || suffix==='')return 2;
  const level=Number(suffix);
  return Number.isFinite(level) && level>=0 && level<=2?level:2;
}
