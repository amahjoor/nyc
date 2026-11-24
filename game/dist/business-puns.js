// The local development server serves a second copy of the module graph under this
// prefix. Workers and previews therefore use the same mode as the page that made them.
import { publicBuild } from './release-mode.js';
export const punMode = publicBuild || new URL(import.meta.url).pathname.startsWith('/__puns/');

const chains = {
  'life-time-fitness':'Lift Time', dunkin:'Dunk Again', 'chase-bank':'Chased Bank',
  'mcdonald-s':'McDawdle’s', 't-mobile-us':'Tea Mobile', starbucks:'Starborks',
  subway:'Subpar Way', 'chipotle-mexican-grill':'Chip O’Lay', popeyes:'Pope Fries',
  'bank-of-america':'Bank of A-merry-cash', 'td-bank-n-a':'Tee Dee Posit', citibank:'Sitibucks',
  'cvs-pharmacy':'Receipt Repeat', walgreens:'Wall of Greens', 'duane-reade':'Duane Receipts',
  'domino-s':'Doughminoes', 'taco-bell':'Taco Decibel', verizon:'Verizone Out',
  'dollar-tree':'Dollar Twig', 'key-food':'Off-Key Food', 'at-t':'Chat & Tea',
  'burger-king':'Burger Next of Kin', 'wendy-s':'When’s Lunch?', citymd:'City Remedy',
  'boost-mobile':'Roost Mobile', carvel:'Carve-a-Scoop', 'santander-bank':'Stand & Deliver',
  wingstop:'Wing Layover', 'capital-one':'Capital Pun', 'citizens-financial-group':'Centsizens',
  'the-ups-store':'The Oops Store', '7-eleven':'Seven Eventually', 'just-salad':'Just a Leaf',
  'paris-baguette':'Pardon My Baguette', sweetgreen:'Sweet Greens Are Made of Leaves',
  'target-corporation':'Near Miss', 'pret-a-manger':'Prêt à Munch', 'family-dollar':'Distant Cousin Dollar',
  'planet-fitness':'Planet Fatness', 'c-town-supermarkets':'Sea Town Market',
  'charter-spectrum':'Spectator Cable', 'van-leeuwen-ice-cream':'Van Scoopin’', 'fedex-office':'FretEx',
  'shake-shack':'Shake Shanty', 'wells-fargo':'Wells Far Gone', 'golden-krust-caribbean-bakery-grill':'Golden Crumbs',
  'gong-cha':'Gong Sip', kfc:'Kentucky Fried Maybe', 'papa-john-s':'Papa Yawns',
  'joe-the-juice':'Joe & the Squeeze', 'little-caesars':'Little Slicers',
  'apple-bank-for-savings':'Apple Turnover Bank', 'european-wax-center':'Continental Drift Wax',
  'chick-fil-a':'Chick Delay', 'flagstar-bank':'Flagship Interest', 'le-pain-quotidien':'No Pain No Grain',
  ihop:'I Flop', 'pizza-hut':'Pizza Hovel', 'blink-fitness':'Wink Fitness', chopt:'Chop Fiction',
  'playa-bowls':'Bowl Player', 'kung-fu-tea':'Brew Jitsu', 'luckin-coffee':'Lucky Sip',
  'panera-bread':'Pan Era', 'staples-inc':'Paper Jam', 'blank-street-coffee':'Blank Stare Coffee',
  'dollar-general':'Major Change', sephora:'Sephorum', 'xi-an-famous-foods':'Fame and Noodles',
  'cricket-wireless':'Chirp Wireless', marshalls:'Marsh Aisles', 'white-castle':'Off-White Fortress',
  'insomnia-cookies':'Still Awake Cookies', 'orangetheory-fitness':'Citrus Hypothesis',
  'panda-express':'Panda Eventually', 'blue-bottle-coffee':'Blew the Budget Coffee',
  'equinox-fitness':'Equisquats', 'gregorys-coffee':'Gregrounds', 'juice-generation':'Juice Relations',
  petco:'Pet Co-Worker', 'whole-foods-market':'Whole Paycheck Market', 'trader-joe-s':'Barter Joe',
  'nike-inc':'Sike', 'apple-store':'Core Sample', 'h-m':'Hem & Haw', zara:'Hemisphere',
  uniqlo:'Uni Sew', 'best-buy':'Second-Best Buy', 'the-home-depot':'The Gnome Depot',
  'rite-aid':'Write Aid', 'five-guys':'Five Tries', 'baskin-robbins':'Askin’ for Scoops',
  'tim-hortons':'Tim Shortens', hsbc:'Hold Some Bank Change', 'foot-locker':'Sock Locker', 'gap-inc':'The Gasp',
  'united-states-postal-service':'Post Haste',
};

// Put longer matches first. The same substitutions work on collaboration credits.
const houses = [
  ['Maison Martin Margiela','Maison Margin Error'], ['Maison Margiela','Maison Margin Error'],
  ['Comme des Garçons','Comme des Garments'], ['Comme des Garcons','Comme des Garments'],
  ['Raf Simons','Rough Simmons'], ['Rick Owens','Brick Owns'], ['Louis Vuitton','Loose Coupons'],
  ['The North Face','The Wrong Face'], ['North Face','Wrong Face'], ['Supreme','Subordinate'],
  ['Adidas','Daddydas'], ['Nike','Sike'], ['Prada','Prattle'], ['Gucci','Goochy'],
  ['Dior','DeTour'], ['Helmut Lang','Helmet Long'], ['Stone Island','Pebble Peninsula'],
  ['Balenciaga','Baloneyagah'], ['Saint Laurent','Saint Low Rent'], ['Yohji Yamamoto','Yarnji Sewamoto'],
  ['Issey Miyake','Pleats Excuse Me'], ['Junya Watanabe','Junya Wanna Hem'], ['Undercover','Under Cover Charge'],
  ['Number (N)ine','Number (N)ope'], ['Jil Sander','Jill Sandpaper'], ['Givenchy','Given an Inch'],
  ['Vivienne Westwood','Westward Wardrobe'], ['Alexander McQueen','Alexander McSeam'],
  ['Jean Paul Gaultier','Jean Pool Couture'], ['Hussein Chalayan','Hemline Challenger'],
  ['Carol Christian Poell','Carol Stitch & Spool'], ['Ann Demeulemeester','Ann the Hem-Meister'],
  ['Boris Bidjan Saberi','Boris Stitchin’ Savory'], ['Guidi','Guide Feet'], ['Julius','July-ish'],
  ['C.P. Company','Seam P. Company'], ['Kapital','Cap It All'], ['Visvim','Visible Hem'],
  ['BAPE','A Bathing Grape'], ['Chrome Hearts','Chrome Parts'], ['Miu Miu','Mew Mew'],
  ['Craig Green','Craig Evergreen'], ['Sterling Ruby','Spare Change Ruby'], ['Eastpak','Least Pack'],
  ['Carhartt','Cart Heart'], ["Levi's",'Sleevi’s'], ['Brooks Brothers','Books Brothers'],
  ['Canada Goose','Canada Loose'], ['New Balance','New Imbalance'], ['Timberland','Timber Landing'],
  ['Pendleton','Pendulum'], ['Schott','Long Schott'], ['Barbour','Barber Jacket'],
  ['Seil Marschall','Sew Marshal'], ['Hervier Productions','Hem Here Productions'],
  ['Malcolm McLaren','Malcolm McLining'], ['Hedi Slimane','Hemmy Slimline'],
  ['Tom Ford','Tom Fold'], ['Demna','Hemna'], ['Nicolas Ghesquière','Nicolas Guesswear'],
  ['Riccardo Tisci','Riccardo Stitchi'], ['Kanye West','Knitwear West'], ['KAWS','PAWS'],
  ['IM MEN','HEM MEN'], ['Kith','Knit & Kin'], ['Dover Street Market','Overstreet Markup'],
  ['The RealReal','The Reel Deal'], ['Saks Fifth Avenue','Slacks Fifth Avenue'],
  ['Old Navy','Old Gravy'], ['TJ Maxx','TJ Maxed Out'], ['Crunch Fitness','Brunch Fitness'],
  ['Kennedy Fried Chicken','Kennedy Fry Cabinet'], ['Crown Fried Chicken','Crown Fry Jewels'],
  ['Fine Fare','Fine Print Fare'], ['Bravo Supermarket','Encore Market'],
];
const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'");
const houseNames = new Map(houses.map(([name,alias])=>[fold(name),alias]));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern = new RegExp('(?<![a-z0-9])('+houses.map(([name])=>escape(name)).join('|')+')(?![a-z0-9])','gi');
export const parodyLabel = text => text.replace(pattern, name=>houseNames.get(fold(name)));

const trades = {
  pizza:'Slice of the Action|Pie Another Day', chinese:'Wok This Way|Wok Around the Block',
  coffee:'Grounds for Appeal|Bean There', bakery:'Upper Crust|Flour Power',
  donuts:'Hole in One|Glazed and Confused', juice:'Squeeze Play|Pulp Fictional',
  mexican:'Wrap Sheet|Taco the Town', seafood:'Off the Hook|Catch Phrase', sushi:'Roll Call|Roll Models',
  japanese:'Roll Call|Roll Models', italian:'Pasta Bedtime|Penne for Your Thoughts',
  chicken:'Fowl Play|Pecking Order', burgers:'Patty Pending|Bun Voyage',
  sandwiches:'Bread Letter Day|Sub Plot', bagels:'Hole Story|On a Roll', icecream:'Scoop of the Day|Cone Artist',
  steakhouse:'High Steaks|Grill Seeker', bbq:'Joint Custody BBQ|Smoke Signals',
  bodega:'Deli Dalliance|Deli Departed', grocery:'Aisle Be There|Checkout Line Dancing',
  pharmacy:'Pill of Rights|Refill Harmonic', gas:'Pump Fiction|Tank You',
  butcher:'Meat Cute|Prime Suspect', fishmarket:'Cod Squad|Reel Deal', liquor:'Pour Decisions|Bottle Service',
  electronics:'Current Affairs|Ohm Sweet Ohm', pawn:'Pawn Arrival|Loan Ranger', storage:'Space Case|Box Office',
  nails:'Nailed It|Polished Argument', salon:'Fringe Benefits|Shear Luck', barber:'Close Shave|Cut to the Chase',
  repair:'Brake Time|Spare Me', bodyshop:'Dent Intent|Fender Bender Mender', carwash:'Suds Appeal|Wax Poetic',
  parking:'Lot to Offer|Parallel Universe', hotel:'Suite Dreams|Room for Improvement',
  clothes:'Seams Legit|Hem and Haw', shoes:'Sole Searching|Lace Case', bank:'Common Cents|Vault of Confidence',
  laundromat:'Spin Cycle Drama|Loads of Fun', cleaners:'Press Release|Wrinkle in Time', books:'Shelf Awareness|Spine Time',
  hardware:'Screw Loose|Nailed the Brief', florist:'Petal Pusher|Stem Cellar', optician:'Frame of Mind|Specs Appeal',
  phones:'Call Waiting Room|Ring Leader', jewelry:'Karats and Sticks|Setting Example', gym:'Weight for It|Reps Pending',
  bikes:'Spoke Too Soon|Chain Reaction', pets:'Paws for Thought|Fur Closure', furniture:'Sofa So Good|Chair Apparent',
  tattoo:'Ink Twice|Needle to Say', smoke:'Puff Piece|Up in Smoke', dispensary:'Joint Venture|Higher Education',
  cosmetics:'Makeup Exam|Blush Hour', toys:'Play on Words|Game Face', department:'Floor It|Up the Escalator',
  sports:'Sporting Chance|Court Order', stationery:'Write Angle|Paper Trail', music:'Sound Investment|Beat the Rush',
  art:'Brush Hour|Draw a Crowd', bags:'Case Study|Handle With Flair', copyshop:'Fine Print|Copy That',
  tailor:'Sew It Goes|Alter Ego', travel:'Fare Enough|Depart Mental', massage:'Knead a Minute|Pressing Matters',
  housewares:'Pot Luck|Pan Handling', cinema:'Reel Time|Plot Thickens', vet:'Pet Project|Paws and Effect',
  dentist:'Tooth Be Told|Crown Control', clinic:'Patient Pending|Practice Makes Perfect',
  theatre:'Stage Fright|Play It Again', dealer:'Wheel Deal|Shift Happens', tow:'Tow the Line|Hooked on Arrival',
  fruitstand:'Pear Pressure|Ripe Timing', newsstand:'Extra Credit|Print Condition', produce:'Lettuce Begin|Pear Pressure',
  gift:'Present Company|Wrap Session', gifts:'Present Company|Wrap Session', secondhand:'Buygones|Twice as Nice',
};
const groupNames = {
  food:'Dish It Out|Plate Expectations', dining:'Table of Contents|Course Correction', cafe:'Steep Learning Curve|Mug Shot',
  market:'Aisle Be Back|Till We Meet Again', bar:'Bar None|Raising the Bar', shop:'Shopportunity|Counter Argument',
  stand:'Stand and Deliver|Outstanding', auto:'Wheel Intentions|Gear Here',
};
function hash(text) {
  let h = 2166136261;
  for(const ch of text) h = Math.imul(h ^ ch.charCodeAt(0),16777619);
  return h >>> 0;
}
const streets = 'Amber Apple Ash Aspen Aster Bay Beech Birch Brass Briar Brick Cedar Cherry Chestnut Clay Clover Copper Coral Cotton Cypress Elm Fern Field Finch Flint Fox Fulton Garnet Grove Hazel Heron Hickory Holly Iris Ivy Jasper Juniper Laurel Linden Maple Marble Mercer Moss Myrtle Oak Olive Opal Orchard Palmer Park Pearl Pine Plum Poplar Reed River Rose Rowan Sage Spruce Stone Walnut Willow Wren'.split(' ');
const corners = 'Alley Arcade Avenue Bank Bend Boulevard Bridge Circle Close Corner Court Cove Crescent Crossing Drive Gardens Gate Green Grove Heights Hill Lane Landing Loop Mews Park Passage Path Pier Place Plaza Point Rise Road Row Square Steps Street Terrace Trail Walk Way Wharf Yard'.split(' ');
export function businessPun(name, kind, group, x, z, brand) {
  if(group==='public' || !group) return name;
  if(Object.hasOwn(chains,brand)) return chains[brand];
  const edited = parodyLabel(name);
  if(edited !== name) return edited;
  const options=(trades[kind] || groupNames[group] || groupNames.shop).split('|');
  const seed=hash(name ? fold(name.trim()) : x+','+z);
  const hook=options[seed % options.length];
  // The register seeds the sign without putting an individual's or an
  // unreviewed company's name back on a fictional business.
  const street = streets[(seed >>> 9) % streets.length];
  const corner = corners[(seed >>> 17) % corners.length];
  return hook + ' on ' + street + ' ' + corner;
}

// Never sample an archive print or its embossed normal map in the parody build.
// Keep the cut, and pick an unprinted fabric in the garment's colour family.
const fabricPalette = {ink:'24252a',slate:'657080',denim:'3f566e',sand:'ae977d',moss:'5d6651',wine:'934e58',chalk:'d6d0c5'};
export function parodyFabric(part) {
  if(!part.map?.startsWith('archive/')) return part;
  const rgb = hex => (hex.match(/[a-f0-9]{2}/gi) || []).map(pair=>parseInt(pair,16));
  const colour = rgb(part.dyeBase || '#555555');
  let fabric='ink', distance=Infinity;
  for(const [name,hex] of Object.entries(fabricPalette)){
    const other=rgb(hex), delta=other.reduce((sum,n,i)=>sum+(n-colour[i])**2,0);
    if(delta<distance){fabric=name;distance=delta;}
  }
  if(part.id==='supreme-box-logo-hoodie') fabric='subordinate';
  return {...part,map:'fictional/'+fabric+'.png',normal:null};
}
