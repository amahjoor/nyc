# People

Nobody in the game is a downloaded model. A person is grown from a **design**, a flat list of plain values, the way a car is grown from its row. Open **Design your character** in the pause menu to set your own. [Character page](../dist/character.html)

## What a design says

About seventy things, each with an ordinary value when left out. [Fields and defaults](../dist/body-designs.js)

| Group | What it sets |
| --- | --- |
| Frame | Masculine to feminine, age (6 to 95), height, thin to heavy, slight to muscular |
| Build | Shoulders, chest, bust, waist, belly, hips, seat, arm and leg girth, neck |
| Proportions | Leg, torso and arm length, head size, hands, feet |
| Head and face | Width, depth, forehead, cheekbones, cheeks, jaw, chin, ears; eye size, lids, spacing and height; brow ridge and eyebrows; nose length, width, bridge, projection and tip; mouth height and width, lips |
| Skin and hair | Skin, hair and eye colour, 16 hair styles, 6 beards |
| Clothes | 8 tops, 8 things worn over them, 10 kinds of trousers, shorts and skirts, 7 shoes, 8 hats, 4 glasses, 3 bags, each in any colour, cut tight or loose |

Age does more than grey the hair. A child is shorter, with a large head and short legs for its height; the old lose a little height, carry a little more in front, and thin on top. Weight thickens the trunk more than the limbs and hangs under the chin; a heavy body carries its arms out from its sides.

## How a body is made

`buildBody(design, motion)` in [`body.js`](../dist/body.js) needs no browser and no art:

1. **Skeleton.** The mannequin's 53 bones, their lengths changed to the design's and the whole scaled to its height.
2. **Flesh.** Rounded shapes laid along the bones (a trunk and limbs whose cross-sections change along their length, a skull, a jaw, a nose) melt into one another as a field of distances. A face is about forty of them.
3. **Clothes and hair.** More layers of the same field: cloth lies on whatever is under it and hangs from the chest or the thigh instead of following the body in, so a shirt is not paint.
4. **Surface.** Where the field is nought it is cut into triangles, finer on the head and hands than on the body. Seen close a body is about 60,000 vertices and takes a second to grow, off the main thread; one of the crowd is 5,900, and 2,400 far off.
5. **Binding.** Each vertex learns which bones move it from where it is: along an arm, down a leg, up the spine.

The result stands arms out, the way the skeleton rests, and anything recorded for that skeleton moves it.

## Movement

A pose is each bone's turn and where the pelvis is. [`body-motion.js`](../dist/body-motion.js) samples and blends them; an animator runs standing, walking, jogging and sprinting into one another by speed and puts whatever else is happening over the top.

| Recorded (Quaternius, Universal Animation Library, CC0) | Written by hand here ([`body-moves.js`](../dist/body-moves.js)) |
| --- | --- |
| idle, walk, jog, sprint, jump (start, hang, land), jab, cross, roll, hit to chest and head, death, driving, sitting, talking, crouching, pushing, reaching, picking up, dancing, pistol aim, shot and reload | guard, kick, fall, vault, climb, car door, getting in and out, carjack, thrown from a car, break-in, hands up, cower, flinch, knocked down, lying, getting up, stumble, kneel, cuffed, cuffing |

A written movement is a few poses in plain angles: `thigh_r: ['x', -92]` lifts the right thigh to the front. To add one, write its poses, pick it in the character page's movement list, and look at it.

Furniture uses five poses in the character page’s movement list. `seatChair` sits upright, `seatBench` lets one leg stretch forward, and `seatBooth` keeps the feet closer under the table. `seatLounge` settles back into a deeper cushion. `seatStool` tucks the feet toward the footrest. Each seat supplies its surface height and facing direction. Press **E** at a free seat to turn and sit down. Press **E** again, even partway down, to rise back into the aisle.

## What the player can do

Besides walking, running (Shift), jumping (Space) and punching (F or a click): **Q** kicks, which lands twice as hard. **Space** facing a car vaults it; facing a ledge up to a little over head height, climbs it. After a punch or a kick the player stays squared up for a few seconds. A long drop flails and a hard landing rolls. [`player-moves.js`](../dist/player-moves.js)

Getting into a car takes as long as the movement does. One the player has driven is just opened. About half the cars left at the kerb are locked, the same ones each time, and an elbow goes through the window (half a star). One with somebody driving it has the driver hauled out and thrown down, who then gets up and runs (a star, and the street takes fright).

## What the street does

People walk at their own pace, wait, jog if they are dressed for it. A car that hits one at more than about 8 mph throws them the way it was going; they lie there some seconds and get up, or over about 27 mph do not. A car driven at them, or any car when they are in the roadway, makes them start back and step aside, and from a fast one they run. Walk into someone and they stagger; run into them and they go down and get up again. Someone punched squares up and swings back; put down, they get up and run. An arrest stands the player with hands up, then on their knees, while the nearest officer cuffs them.

## Who is on the street

The cast is 48 designs: [rows in `body-designs.js`](../dist/body-designs.js), each `[outfits it suits, sex, age, weight, muscle, hair, beard, top, over it, legs, shoes, hat, bag, glasses]`. Fourteen are heavy or very heavy, nine thin, two are children and five past sixty-five; none has muscle past halfway. An outfit drawn for a place and hour (suits round the offices, shorts where the visitors are) picks among the rows that suit it, and the person wears that body in colours of their own. These shares are the game's, not a survey.

To add someone, add a row and look at the street. Weights are kept to a few steps so that bodies of one build share the poses worked out for it.

## Limits

Faces are plain: eyes do not blink or look, mouths do not move. Hair and cloth do not swing. Hands are mittens at street distance. Clothes are shapes without print, pockets or folds. A vault lifts the player over the car as a picture; the car is not climbed on. Drivers are not seen at the wheel, so a carjacked driver appears as they are thrown out. Shooting has its stance and its movements but the player has no gun yet.

## Rebuild

```sh
node scripts/build-motion.mjs      # needs the library unpacked under assets-src/characters/
node --test tests/people.test.js
```
