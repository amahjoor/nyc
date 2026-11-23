// A look changes only clothes. Garment IDs can also be selected independently.
const look=(name,occasion,top,bottom,shoes,topColour,bottomColour,shoeColour=null)=>({
  name,occasion,clothes:{top,bottom,shoes,topColour,bottomColour,shoeColour}
});

export const FASHION_LOOKS=[
  look('Gallery opening','casual','gallery-box-tee','broadcloth-trousers','piped-flats','#ddd9cb','#827968'),
  look('Bookshop shift','casual','service-polo','broadcloth-trousers','welt-ankle-boots','#435343','#827968'),
  look('Ferry weather','casual','breakwater-crew','switchback-cargos','shoes05','#ccc4b0','#5a6252'),
  look('Sunday paper','casual','tucked-ringer','wrap-mini','piped-flats','#c5bdac','#767168'),
  look('East River study','casual','river-survey-tee','repair-cutoffs','shoes06','#49625e','#526780'),
  look('Night flight','casual','auditorium-tee','waxed-cargos','foldover-boots','#39363c','#363a3b'),
  look('Basement matinee','casual','auditorium-tee','basement-tier-skirt','welt-ankle-boots','#39363c','#533f4b'),
  look('Last train','casual','offset-long-tee','balloon-trousers','foldover-boots','#302d33','#494550'),
  look('Soundcheck','casual','nightshift-knit','repair-cutoffs','foldover-boots','#45373f','#414554'),
  look('Concrete steps','casual','offset-long-tee','waxed-cargos','foldover-boots','#8a827d','#363a3b'),
  look('Afterimage','casual','bias-halter','bias-full-skirt','piped-flats','#37363b','#525562'),
  look('Orchard Street','casual','bound-camisole','balloon-trousers','welt-ankle-boots','#bfa89e','#494550'),
  look('Cold front','casual','nightshift-knit','bias-full-skirt','welt-ankle-boots','#949281','#373b42'),
  look('Weekend edition','casual','gallery-box-tee','switchback-cargos','shoes02','#77868d','#67604f'),
  look('Listening room','business','long-vent-jacket','balloon-trousers','welt-ankle-boots','#303136','#37373d'),
  look('Chalk study','business','chalkline-jacket','knife-stripe-trousers','welt-ankle-boots','#383944','#383944'),
  look('Museum stairs','business','bound-camisole','broadcloth-trousers','piped-flats','#d0c2b1','#514c4c'),
  look('Evening bias','business','bias-halter','bias-full-skirt','welt-ankle-boots','#58494f','#38383f'),
  look('First edition','business','service-polo','knife-stripe-trousers','shoes01','#a5b6af','#383944'),
  look('Rain at closing','business','long-vent-jacket','bias-full-skirt','foldover-boots','#424b4a','#525562'),
  // More for the people behind counters and at desks, who were sharing six: jackets, knits and polos over trousers.
  look('Front desk','business','long-vent-jacket','broadcloth-trousers','welt-ankle-boots','#2b2f3a','#3d4047'),
  look('Quarter end','business','long-vent-jacket','knife-stripe-trousers','shoes01','#3a3d45','#2c3140'),
  look('Site visit','business','chalkline-jacket','broadcloth-trousers','welt-ankle-boots','#4a4f58','#6e6552'),
  look('Second interview','business','chalkline-jacket','balloon-trousers','piped-flats','#23262b','#37373d'),
  look('Floor manager','business','service-polo','broadcloth-trousers','shoes01','#1e2230','#514c4c'),
  look('Open house','business','service-polo','knife-stripe-trousers','welt-ankle-boots','#e9ebee','#383944'),
  look('Stock take','business','breakwater-crew','broadcloth-trousers','shoes04','#c9d8ea','#2b2f38'),
  look('Late shift','business','breakwater-crew','knife-stripe-trousers','welt-ankle-boots','#3b3d42','#383944'),
  look('Reading room','business','nightshift-knit','broadcloth-trousers','piped-flats','#6f6a5c','#3d4047'),
  look('Closing count','business','nightshift-knit','knife-stripe-trousers','shoes01','#22304f','#2c3140'),
  look('Till training','business','gallery-box-tee','broadcloth-trousers','shoes04','#dfe7f2','#1e2230'),
  look('Showroom','business','offset-long-tee','balloon-trousers','foldover-boots','#1b1c1f','#494550'),
  look('Riverside relay','athletic','relay-polo','repair-cutoffs','shoes06','#343e57','#526780'),
  look('Court stripe','athletic','relay-polo','female_sportsuit01-bottom','shoes02','#4e655a','#373e48'),
  look('Track meet','athletic','tucked-ringer','female_sportsuit01-bottom','shoes05','#b5ada3','#353942'),
  look('Park loop','athletic','river-survey-tee','female_sportsuit01-bottom','shoes06','#49625e','#424952')
];
