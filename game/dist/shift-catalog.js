// Fictional employers with clock-in points on the city's mapped streets.
// Each shift mixes three decisions from the trade with a fresh supply order.
function shift(role, name, district, sector, x, z, wage, bonus, duties, supply, decisions) {
  return {role, name, district, sector, x, z, wage, bonus, duties, supply, decisions};
}
export const SHIFTS = {
  barista: shift('Barista','Spring Street Coffee','SoHo · Manhattan','Food',101.66,-29.64,78,8,
    'Pull espresso shots and read the morning rush tickets.', 'oat milk cartons', [
      ['An iced latte ticket says decaf and oat. Which cup gets the sticker?', 'Iced decaf with oat', 'Hot decaf with oat', 'Iced espresso with whole milk'],
      ['The shot runs in half the usual time and tastes thin. Which adjustment comes first?', 'Try a finer grind', 'Grind coarser', 'Add ice to the basket'],
      ['Two drinks are waiting for Sam. The receipt says one cold brew. What do you call out?', 'Sam, one cold brew', 'Sam, two hot coffees', 'Both drinks for Sam'],
    ]),
  stock: shift('Grocery stocker','Broadway Market','SoHo · Manhattan','Retail',-110.12,-2.84,84,8,
    'Receive cases, rotate dated stock and fill the shelves.', 'soup cans', [
      ['New yogurt expires Friday. Yesterday’s delivery expires Wednesday. Which goes at the front?', 'Wednesday batch', 'Friday batch', 'Mix both batches'],
      ['A case marked aisle 4 contains chickpeas. The shelf tag says peaches. Where does it go?', 'Find the chickpea shelf tag', 'Under the peaches tag', 'On the first empty shelf'],
      ['The delivery slip lists eight cases. You count seven. What do you record?', 'Seven received, one short', 'Eight received', 'Seven returned'],
    ]),
  cashier: shift('Bodega cashier','Greene Corner Grocery','SoHo · Manhattan','Retail',159.80,-134.61,76,8,
    'Ring up breakfast, count change and balance the drawer.', 'paper bags', [
      ['A regular hands you $10 for a $6.75 breakfast. Count back the change.', '$3.25', '$2.75', '$4.25'],
      ['Two seltzers cost $1.50 each. A sandwich is $6. Which subtotal goes on the register?', '$9.00', '$7.50', '$10.50'],
      ['The reader shows payment approved but the printer is empty. What do you do?', 'Reload paper and reprint', 'Charge the card again', 'Void the sale and keep the cash'],
    ]),
  usher: shift('Theater usher','West 46th Playhouse','Theater District · Manhattan','Hospitality',1447.94,-3866.33,88,9,
    'Seat the orchestra, manage late arrivals and keep the aisles clear.', 'playbills', [
      ['The ticket reads orchestra left, F12. Which section do you show the guest?', 'Left orchestra, row F', 'Left balcony, row F', 'Right orchestra, row L'],
      ['The house manager calls a late-seating hold. Where do new arrivals wait?', 'In the lobby until the cue', 'In the orchestra aisle', 'On the stage steps'],
      ['A bag sticks into the aisle at curtain call. What do you ask its owner to do?', 'Stow it under their seat', 'Move it to the exit', 'Leave it in the aisle'],
    ]),
  desk: shift('Hotel front desk agent','The Marquee Hotel','Midtown · Manhattan','Hospitality',1289.69,-3865.19,108,10,
    'Handle check-ins, room readiness and luggage claims.', 'key sleeves', [
      ['Booking Mendez, two queens. Which clean room matches?', '408 · two queens', '411 · one king', '410 · two queens, cleaning'],
      ['A visitor asks for a guest’s room number. How do you connect them?', 'Offer to call the guest', 'Read out the number', 'Hand over a room key'],
      ['A guest shows luggage claim 204. Which bag do you release?', 'Bag with tag 204', 'Bag with tag 240', 'The next bag by the door'],
    ]),
  porter: shift('Building porter','Forty-Seventh Street Offices','Midtown · Manhattan','Maintenance',1347.86,-4012.09,94,9,
    'Work the lobby rounds, clear spills and close maintenance tickets.', 'bin liners', [
      ['Rain has pooled inside the lobby doors. Which job comes first?', 'Mark the wet floor and mop it', 'Polish the lift doors', 'Empty the dry paper bin'],
      ['A service ticket reports a leak in 5B. Which detail belongs in your handoff?', '5B, leak, current condition', 'Ground floor, lamp out', 'Close as complete without a visit'],
      ['A cardboard pickup is due. How do you prepare the boxes?', 'Flatten and bundle them', 'Put them in the glass bin', 'Leave them across the stairs'],
    ]),
  photo: shift('Photo studio assistant','Bridge Light Studio','DUMBO · Brooklyn','Creative',1005.49,2230.82,102,10,
    'Set up shoots and keep the client’s images organized.', 'backdrop clips', [
      ['The client asks for a white seamless portrait. Which backdrop do you pull?', 'Matte white roll', 'Black velvet', 'Green chroma cloth'],
      ['A light stand sits beside a walkway. What belongs on its base?', 'A sandbag', 'A lens cap', 'A memory card'],
      ['The shoot has wrapped. When can the camera cards be cleared?', 'After verified backup copies', 'As soon as thumbnails appear', 'Before importing'],
    ]),
  bakery: shift('Bakery counter clerk','Water Street Bakehouse','DUMBO · Brooklyn','Food',1200.20,2265.31,82,8,
    'Box pastry orders and track the neighborhood pickup shelf.', 'pastry boxes', [
      ['The order reads two plain bagels and one everything. Which bag is ready?', 'Two plain, one everything', 'One plain, two everything', 'Three sesame'],
      ['A customer asks about sesame in a loaf. What do you check?', 'The recipe and allergen sheet', 'The color of the crust', 'The price tag'],
      ['A prepaid pickup is for Lee at noon. What goes on the bag?', 'Lee · noon · prepaid', 'Lee · balance due', 'Walk-in · unclaimed'],
    ]),
  freight: shift('Warehouse receiver','Arch Street Freight','Long Island City · Queens','Logistics',4504.67,-2341.91,104,10,
    'Check manifests, inspect incoming cartons and sort deliveries.', 'pallet labels', [
      ['Dock B expects pallet BX-17. Which barcode do you scan?', 'BX-17 at dock B', 'BX-71 at dock B', 'BX-17 at dock A'],
      ['A carton arrives crushed along one edge. What happens before sign-off?', 'Log the damage and set it aside', 'Mark it undamaged', 'Cover the dent with a label'],
      ['The manifest has six pallets with five boxes each. How many boxes do you reconcile?', '30 boxes', '11 boxes', '25 boxes'],
    ]),
  bike: shift('Bike shop mechanic','Forty-Seventh Avenue Cycles','Long Island City · Queens','Maintenance',4426.72,-2356.83,108,11,
    'Diagnose punctures, match parts and finish commuter-bike checks.', 'inner tubes', [
      ['A fresh tube goes flat at the same spot as the old one. What do you inspect first?', 'Inside the tire for debris', 'The saddle angle', 'The rear reflector'],
      ['The tire sidewall reads 700 × 32. Which tube matches?', '700 × 28–35', '26 × 1.5', '20 × 2.0'],
      ['A brake pad rubs the tire above the rim. What should you do before handoff?', 'Align it to the braking surface', 'Oil the rim', 'Inflate past the tire limit'],
    ]),
  florist: shift('Florist assistant','Avenue Stem Shop','Long Island City · Queens','Retail',4354.94,-2374.69,81,9,
    'Condition stems, wrap bouquets and match arrangements to orders.', 'bouquet wraps', [
      ['The ticket requests six yellow tulips, no filler. Which bunch is ready?', 'Six yellow tulips', 'Six yellow roses', 'Five tulips and fern'],
      ['Leaves will sit below the vase water. What do you do before arranging?', 'Strip the submerged leaves', 'Tape leaves to the vase', 'Use an empty vase'],
      ['Two bouquets share a recipient name. Which detail confirms the delivery?', 'The full delivery address', 'The ribbon color alone', 'The order printed first'],
    ]),
  custodian: shift('School custodian','Concourse Learning Center','Grand Concourse · Bronx','Maintenance',6671.96,-11528.43,98,9,
    'Reset classrooms and prioritize building work between lessons.', 'hand towel rolls', [
      ['The bell rings in five minutes and glass broke in a corridor. First move?', 'Block the area and clear the glass', 'Refill the office copier', 'Start polishing desks'],
      ['The auditorium needs five rows of eight chairs. How many do you set out?', '40 chairs', '35 chairs', '13 chairs'],
      ['A classroom fixture is flickering. Where should the room number go?', 'On the maintenance ticket', 'On the recycling label', 'On the attendance sheet'],
    ]),
  laundry: shift('Laundry attendant','Walton Wash & Fold','Grand Concourse · Bronx','Hospitality',6557.75,-11606.58,80,8,
    'Tag laundry, read care instructions and reunite orders with customers.', 'laundry tags', [
      ['The care label says lay flat to dry. Where does the sweater go?', 'Onto a drying rack, flat', 'High-heat dryer', 'Back into the hot wash'],
      ['Orders 109 and 190 have identical blue bags. How do you separate them?', 'Match each sewn-in claim tag', 'Use the shade of blue', 'Split both bags by weight'],
      ['The rate is $2 per pound. A bag weighs 14 pounds. What goes on the ticket?', '$28', '$16', '$24'],
    ]),
  retail: shift('Retail sales associate','Concourse Outfitters','Grand Concourse · Bronx','Retail',6723.71,-11570.60,85,9,
    'Find sizes, process exchanges and prepare pickup orders.', 'hangers', [
      ['The order is a navy medium. Which SKU description matches?', 'Navy / M', 'Navy / L', 'Black / M'],
      ['A $40 jacket is marked 25% off. Which price do you quote?', '$30', '$35', '$10'],
      ['A pickup customer has an order confirmation. What do you match before handoff?', 'Order number and pickup name', 'Only the bag color', 'Only the time of day'],
    ]),
  mail: shift('Mailroom clerk','Harbor Post Room','St. George · Staten Island','Logistics',-6339.17,8982.98,91,9,
    'Sort tenant mail, record signatures and prepare outgoing parcels.', 'mailers', [
      ['A parcel label reads suite 302. Which pigeonhole gets the slip?', '302', '320', '203'],
      ['A delivery requires a signature. What completes the log?', 'Recipient signature and time', 'A photo of the empty lobby', 'An unchecked box'],
      ['Express collection leaves at 3 PM, standard at 5. Which sack goes out first?', 'Express at 3', 'Standard at 5', 'Hold both until closing'],
    ]),
  ferry: shift('Ferry terminal attendant','Harbor Passenger Services','St. George · Staten Island','Logistics',-6284.66,8894.90,100,10,
    'Direct boarding queues and relay gate changes at the terminal.', 'boarding leaflets', [
      ['The departure board changes from gate 1 to gate 3. Where do you direct the queue?', 'Gate 3', 'Gate 1', 'The arrivals exit'],
      ['The crew has not opened the boarding gate. What do you tell early passengers?', 'Wait behind the boarding line', 'Walk onto the ramp', 'Use the crew entrance'],
      ['A traveler needs step-free access. Which route do you point out?', 'The posted accessible route', 'The nearest stairs', 'The service ladder'],
    ]),
  print: shift('Print shop operator','Ledger Street Copy','Financial District · Manhattan','Creative',-793.61,1802.84,99,10,
    'Proof print jobs, collate packets and finish rush orders.', 'binding covers', [
      ['A client wants duplex on the long edge for a portrait report. Which setting?', 'Two-sided, flip long edge', 'Single-sided', 'Two-sided, flip short edge'],
      ['A brief needs 12 copies of a five-page packet. How many printed pages?', '60 pages', '17 pages', '50 pages'],
      ['The proof has a clipped margin. What do you do before running 200 copies?', 'Correct the layout and reproof', 'Print the full run', 'Remove the last page'],
    ]),
  pizza: shift('Pizza counter worker','West Broadway Slice','SoHo · Manhattan','Food',66.78,-278.86,84,9,
    'Handle slice orders, time pie pickups and settle the lunch checks.', 'pizza boxes', [
      ['The ticket reads two plain and a Sicilian corner. Which tray goes out?', 'Two plain + square corner', 'Two squares + plain', 'Three plain'],
      ['A pie is cut into eight slices. Three pairs have been sold. How many slices remain?', 'Two slices', 'Five slices', 'Four slices'],
      ['A customer paid online for pickup 42. The next ticket is cash on delivery. Which one goes over the counter?', 'Prepaid pickup 42', 'The delivery order', 'Both orders'],
    ]),
  homecare: shift('Home care aide','Concourse Home Support','Grand Concourse · Bronx','Care',6679.71,-11377.40,96,10,
    'Help clients with everyday routines, meal preferences and visit records.', 'visit journals', [
      ['The client wants to pick their own outfit today. How do you help?', 'Lay out their choices and ask', 'Choose without asking', 'Skip getting dressed'],
      ['Two clients have similar names. Where do you log this visit?', 'The matching client and address', 'The first name on the list', 'The shared building noticeboard'],
      ['A neighbor asks for the client’s schedule. What do you do?', 'Ask the client before sharing', 'Hand over the visit book', 'Post the schedule in the lobby'],
    ]),
  childcare: shift('Childcare assistant','Harbor Children’s Center','St. George · Staten Island','Care',-6507.19,8877.89,87,9,
    'Set up activities, track attendance and help families at pickup.', 'activity folders', [
      ['Four tables each need three paint pots. How many pots go out?', '12 pots', '7 pots', '9 pots'],
      ['The group comes back inside from the yard. What do you check before story time?', 'Names against the attendance list', 'How many chairs look empty', 'Who put away the crayons'],
      ['An unfamiliar adult arrives for pickup. Which record do you check?', 'The authorized pickup list', 'The snack menu', 'The weekly cleaning rota'],
    ]),
  admin: shift('Administrative assistant','Rector Street Offices','Financial District · Manhattan','Office',-898.41,1776.16,103,10,
    'Schedule meeting rooms, prepare packets and route incoming messages.', 'file folders', [
      ['A six-person meeting runs from 2 to 3. Which room can you reserve?', 'Room B · seats 8 · free 2–3', 'Room A · seats 4 · free 2–3', 'Room C · seats 8 · free after 3'],
      ['The revised agenda is marked final, version 3. Which file do attendees get?', 'Agenda v3 final', 'Agenda v2 draft', 'Last month’s minutes'],
      ['A caller leaves a callback number and invoice reference. Where does the message go?', 'Accounts payable, with both details', 'The building delivery log', 'The conference room calendar'],
    ]),
};
