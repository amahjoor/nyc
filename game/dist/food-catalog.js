// Stable model names are shared by menu orders, hands, tables and saved meals.
const plates={
  'Cornbread':'cornbread','Barbecue ribs with slaw':'bbq-ribs','Potato knish':'knish','Pastrami on rye':'pastrami',
  'Scallion pancake':'scallion-pancake','Vegetable stir-fry':'stir-fry','Fried plantains':'plantains','Jollof rice with chicken':'jollof',
  'Quiche Lorraine':'quiche','Steak frites':'steak-frites','Fish sandwich':'fish-sandwich','Grilled salmon with potatoes':'grilled-salmon',
  'Mushroom soup':'mushroom-soup','Roast chicken with potatoes':'chicken-potatoes',
  'Spring rolls':'spring-rolls','Egg roll':'egg-roll','Pork fried rice':'fried-rice',"General Tso's chicken combo":'tso',
  'Chicken over rice':'chicken-rice','Lamb gyro':'gyro','Falafel sandwich':'falafel','Taco':'taco','Burrito':'burrito','Chips and guacamole':'guacamole',
  'Pernil with rice and beans':'pernil','Empanada':'empanada','Beef patty':'beef-patty','Jerk chicken with rice and peas':'jerk','Oxtail':'oxtail',
  'Miso soup':'miso','Salmon roll':'sushi','Ramen':'ramen','Kimbap':'kimbap','Bibimbap':'bibimbap',
  'Samosa':'samosa','Chicken tikka masala':'tikka','Pad thai':'pad-thai','Green curry':'green-curry',
  'Three pieces and a biscuit':'fried-chicken','Wings':'wings','Fries':'fries','Cheeseburger':'burger','Burger deluxe':'burger-deluxe',
  'Eggs, home fries and toast':'eggs','Slice of pie':'pie','Turkey hero':'hero','Soup':'soup','Bag of chips':'chips',
  'Roll with butter':'butter-roll','Black and white cookie':'bw-cookie','Loaf of rye':'rye','Pastry':'croissant',
  'Glazed doughnut':'doughnut','Half dozen':'doughnut-box','Bagel with cream cheese':'bagel','Bagel with lox':'lox',
  'Acai bowl':'acai','Cone':'cone','Sundae':'sundae','Spaghetti pomodoro':'pasta','Veal parmigiana':'parm',
  'Strip steak':'steak','Creamed spinach':'spinach','Bacon, egg and cheese':'bec','Chopped cheese':'chopped-cheese',
  'Sandwich from the deli counter':'deli-sandwich','Rotisserie chicken':'roast-chicken','Slice':'pizza','Two slices and a soda':'pizza-combo',
  'Slice or small plate':'small-plate','Lunch special':'lunch-special','Lunch':'lunch','Dinner':'dinner',
  'Banana':'banana','Bag of oranges':'oranges','Cut fruit':'cut-fruit','Fruit':'fruit','Candy bar':'chocolate','Popcorn':'popcorn',
};
// Vessel, beverage, topping. Vessels have an inner wall and a separate liquid surface.
export const drinkRecipes={
  coffee:['paper',0x41271c,'coffee'],espresso:['demitasse',0x482616,'crema'],latte:['china',0xb5825b,'foam'],
  'iced-coffee':['tumbler',0x76432e,'ice'],soda:['tumbler',0x542e23,'ice'],'soda-can':['can',0x51221c,''],
  beer:['pint',0xd58b2e,'head'],'ginger-beer':['bottle',0xaf8343,''],cocktail:['coupe',0xe69370,'citrus'],
  martini:['martini',0xe4e4d2,'olive'],'vodka-soda':['highball',0xcfdbd9,'lime'],water:['bottle',0xb9dbe0,''],
  wine:['bottle',0x662537,''],horchata:['tumbler',0xe4d2ad,'cinnamon'],'morir-sonando':['tumbler',0xf4b373,'citrus'],
  'green-tea':['teacup',0xa3ab54,''],'barley-tea':['teacup',0xab7438,''],'thai-tea':['tumbler',0xe3974c,'ice'],
  'green-juice':['highball',0x719442,''],smoothie:['smoothie',0xc67483,'straw'],lassi:['smoothie',0xefad45,'straw'],shake:['fluted',0xecd2af,'cream'],
};
const drinks={'Coffee':'coffee','Coffee, regular':'coffee','Iced coffee':'iced-coffee','Espresso':'espresso','Cafe con leche':'latte',
  'Soda':'soda','Can of soda':'soda-can','Beer':'beer','Ginger beer':'ginger-beer','Cocktail':'cocktail','Martini':'martini',
  'Vodka soda':'vodka-soda','Bottle of water':'water','Bottle of wine':'wine','Horchata':'horchata','Morir sonando':'morir-sonando',
  'Green tea':'green-tea','Barley tea':'barley-tea','Thai iced tea':'thai-tea','Green juice':'green-juice','Smoothie':'smoothie','Mango lassi':'lassi','Shake':'shake'};
export const dishStyle=name=>plates[name];
export const drinkStyle=name=>drinks[name];
export const plateStyles=Object.freeze([...new Set(Object.values(plates))]);
export function servingFor(item,dineIn=false){
  const name=typeof item==='string'?item:item?.preparation||item?.name;
  if(plates[name])return 'plate-'+plates[name];
  const drink=drinks[name];
  if(drink==='coffee')return dineIn?'mug':'cup';
  return drink?'drink-'+drink:null;
}
export const portionKey=(base,level)=>level===2?base:base+'@'+level;
export const portionBase=key=>key?.split('@')[0];
export const portionLevel=key=>key?.endsWith('@0')?0:key?.endsWith('@1')?1:2;
