// Each row supplies the actual item a worker handles and where it belongs.
const desks={
  stock:['Receiving dock','Open case','Shelf placement','Stock','Face up the shelf and sign the delivery',[
    ['Chickpeas · canned goods','Aisle 4'],['Wednesday yogurt · short date','Front of dairy shelf'],['Friday yogurt · new delivery','Back of dairy shelf'],['Split flour bag · hold','Damaged goods bin']]],
  cashier:['Checkout','Scan basket','Cash drawer','Give change','Print receipt and close drawer',[
    ['Coffee $2.50 · paid $5','$2.50'],['Sandwich $6.75 · paid $10','$3.25'],['Two drinks $3 · paid $5','$2.00'],['Bagels $7.50 · paid $20','$12.50']]],
  usher:['Lobby podium','Scan ticket','Seating chart','Escort to','Show guest to the marked seat',[
    ['Orchestra left · F12','Row F, left aisle'],['Mezzanine center · B8','Mezzanine row B'],['Orchestra right · C2','Row C, right aisle'],['Balcony left · A4','Balcony row A']]],
  desk:['Hotel desk','Open reservation','Room rack','Issue key for','Encode key and hand it to the guest',[
    ['Mendez · two queens','408 · two queens'],['Wu · accessible king','201 · accessible king'],['Okafor · courtyard suite','512 · courtyard suite'],['Bell · single twin','305 · single twin']]],
  porter:['Service dispatch','Collect work order','Maintenance cart','Use','Return cart and sign off the round',[
    ['Wet lobby tiles','Floor sign and mop'],['Full paper bin','Recycling cart'],['Boxes at receiving','Box cutter and baling twine'],['Dust on vent grilles','Extension duster']]],
  photo:['Studio prep','Pull shoot brief','Equipment bench','Set up','Take a test exposure',[
    ['Full-length portrait · white sweep','White seamless roll'],['Window portrait · fill shadows','Silver reflector'],['Product shoot · soften key','Large softbox'],['Outdoor stand · wind','Stand weights']]],
  freight:['Receiving dock','Scan pallet','Warehouse bays','Wheel to','Confirm bay on scanner',[
    ['FR-091 · chilled dairy','Cold room'],['FR-184 · marked fragile','Padded staging bay'],['FR-227 · torn shrink wrap','Inspection hold'],['FR-310 · outbound express','Dispatch lane']]],
  bike:['Repair stand','Inspect bicycle','Tool bench','Fit','Check the repair and release bicycle',[
    ['700 × 32 commuter · puncture','700 × 28–35 tube'],['Worn rim brake blocks','Rim brake pads'],['Slipping nine-speed drivetrain','Nine-speed chain'],['Frayed shifter inner','Shift cable']]],
  florist:['Flower bench','Pull order slip','Stem buckets','Wrap','Tie ribbon and hand over bouquet',[
    ['Birthday · six yellow tulips','Yellow tulips'],['Anniversary · red roses','Red roses'],['Table setting · white lilies','White lilies'],['Pickup · lavender bunch','Lavender stems']]],
  custodian:['School rounds','Open room request','Supply cart','Take','Finish the room and initial the checklist',[
    ['Washroom · empty dispenser','Hand towel rolls'],['Corridor · wet footprints','Mop and floor sign'],['Classroom · overflowing bin','Fresh liner'],['Art room · paint on tables','Cleaning cloths']]],
  laundry:['Wash and fold','Read garment tag','Laundry floor','Send to','Attach the matching claim tag',[
    ['Wool sweater · dry flat','Mesh drying rack'],['Towels · tumble hot','High-heat dryer'],['Silk blouse · hand wash','Hand-wash sink'],['Cotton shirts · press','Ironing board']]],
  retail:['Pickup counter','Scan pickup slip','Stockroom','Bag','Seal the bag and release pickup',[
    ['Navy crew · medium','Navy / M'],['Olive jacket · large','Olive / L'],['Black jeans · 30','Black / 30'],['Cream sweater · small','Cream / S']]],
  mail:['Mailroom','Scan envelope','Sorting rack','File in','Scan box label to confirm delivery',[
    ['Mason · suite 302','Box 302'],['Singh · suite 320','Box 320'],['Chen · suite 203','Box 203'],['Alvarez · suite 230','Box 230']]],
  ferry:['Boarding hall','Read sailing board','Gate controls','Open','Announce boarding and release queue',[
    ['Whitehall · gate 3 · boarding cleared','Gate 3'],['Harbor shuttle · gate 1 · boarding cleared','Gate 1'],['Island ferry · gate 2 · boarding cleared','Gate 2'],['Harbor express · gate 4 · boarding cleared','Gate 4']]],
  print:['Print desk','Load client file','Print queue','Run','Inspect proof and release print run',[
    ['Portrait booklet · double sided','Duplex, long edge'],['Landscape flip chart','Duplex, short edge'],['Poster proof · color','Single-sided color'],['Invoice copies · grayscale','Single-sided monochrome']]],
  homecare:['Visit bag','Read client preference','Visit supplies','Set out','Confirm the setup with the client',[
    ['Tea with breakfast','Teapot and mug'],['Choose clothing for walk','Requested outfit choices'],['Write a letter','Stationery and pen'],['Read large print','Large-print books']]],
  childcare:['Activity room','Check activity sheet','Supply cupboard','Set out','Lay out the activity at the tables',[
    ['Painting session','Washable paints'],['Story circle','Picture books'],['Block building','Wooden blocks'],['Outdoor chalk drawing','Sidewalk chalk']]],
  admin:['Office desk','Open inbox item','Office routing','Send to','Enter reference in the routing log',[
    ['Vendor invoice · payment due','Accounts payable'],['Projector broken · 4B','IT support'],['Interview invitation','Recruiting calendar'],['Badge request · new hire','Facilities desk']]],
};
export function deskTicket(shift){
  const [desk,open,station,verb,complete,rows]=desks[shift.job];
  const index=(shift.seed+shift.block)%rows.length;
  const [item,result]=rows[index];
  const actions=rows.map(([,target])=>({name:verb+' '+target,match:target===result}));
  return {desk,open,station,item,result,actions,complete};
}
