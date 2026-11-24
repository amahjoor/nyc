# Real businesses, brand parody, and a Steam release

U.S. research notes for *I Heart NYC*, November 24, 2026. The examples below are design options. Legal clearance depends on the actual assets, their context, and where the game ships.

## Can players recognize the joke?

Yes. The closest example is *E.S.S. Entertainment 2000 v. Rock Star Videos* (Ninth Circuit, 2008). *Grand Theft Auto: San Andreas* featured a fictional **Pig Pen** club inspired by the real **Play Pen**. The court found that the depiction helped evoke the neighborhood and did not explicitly mislead players about the club owner's involvement in the game. The decision supports recognizable references within a fictional city. It does not clear a particular pun or logo across all U.S. jurisdictions. [Court opinion, especially pp. 15152–55](https://cdn.ca9.uscourts.gov/datastore/opinions/2008/11/05/0656237.pdf)

Where the joke appears matters. In *Jack Daniel’s v. VIP Products* (2023), the Supreme Court held that ordinary trademark-confusion analysis applied when the seller used the parodied marks to identify its own product. Humor can still matter in that analysis. A sign over a fictional gym entrance, the game's own Steam capsule, and a mark on merchandise sold to players deserve separate decisions. One question is whether buyers could reasonably think the real business sponsored or approved the product. [Supreme Court opinion](https://www.supremecourt.gov/opinions/22pdf/22-148_3e04.pdf) · [15 U.S.C. § 1125](https://www.law.cornell.edu/uscode/text/15/1125)

## Stores, signs, and the phone map

An accurate plain-text business name and address on a map generally need no individual copyright license. Original sign artwork, photographs, and the database supplying the locations have their own rights. For the bundled OpenStreetMap shops, retain visible contributor attribution and the Open Database License notice, and follow the license terms for the distributed database. [Copyright Office FAQ](https://www.copyright.gov/help/faq/faq-protect.html) · [OpenStreetMap license](https://www.openstreetmap.org/copyright) · [Game data sources](../README.md#shops-the-registers-do-not-list)

The phone puts fictional visitor reviews alongside real business details. For a factual listing, keep the sourced details and remove invented reviews. Show an inspection grade with its source and inspection date if available. For a fictional shop, use its fictional identity on the sign, inside the shop, and throughout its phone listing. A real branch's phone number or website can make the fictional listing appear official. [Phone map and shop listings](../README.md) · [Review implementation](../dist/place-reviews.js)

Common features such as deli counters, clothing racks, fitting rooms, and bank queues can give a shop its character. A distinctive combination of nonfunctional features that identifies a business can receive trademark protection as *trade dress*. In *Two Pesos v. Taco Cabana*, the Supreme Court upheld protection for a restaurant's overall décor in a dispute between restaurant operators. That case helps identify which visual details merit review in a game. [Court opinion](https://tile.loc.gov/storage-services/service/ll/usrep/usrep505/usrep505763/usrep505763.pdf)

### Planet Fitness and “Planet Fatness”

“Planet Fatness” is a working pun. The current Planet Fitness interior uses purple and yellow finishes, wall lettering, and paired treadmill lanes. To keep the reference legible, retain the budget-gym setting and give the fictional business its own sign artwork and joke. One possible membership poster reads “We count the walk from the parking lot.” Review the exterior, interior, and phone listing together. If a Steam screenshot features the gym prominently, include that screenshot in the review. [Gym interiors](../dist/business-rooms.js) · [Storefront signs](../dist/storefronts.js)

### Bank of America

A factual pin can identify a real branch. For a playable bank featured in a robbery mission, a fictional name and emblem are a lower-risk design choice. The existing renderer draws Bank of America's flag emblem directly on the exterior fascia and interior wall, even without downloaded logos. Change that drawing along with the name if the branch is fictionalized. The teller stations, consultation desks, and ATM lobby can serve the fictional branch. [Bank renderer](../dist/bank.js) · [Branch interior](bank-interior.jpg)

### Clothing shops and wearable designs

The wardrobe includes original pieces built from documented CC0 garment meshes and a separate archive of 100 named designer pieces. Ordinary garment cuts and functional features are generally available to model. Original illustrations, fabric prints, patches, and source photographs may each carry copyright. For a photo-based recipe, record whether the photo was consulted for shape or whether pixels from it appear in a shipped texture. [Wardrobe credits](people.md) · [Archive recipes](../data/archive-collection/) · [Copyright Office on useful articles](https://www.copyright.gov/register/va-useful.html)

For example, the archive lists Dior Homme waxed denim and a Number (N)ine Mickey Mouse graphic tee. An independently textured pair of waxed jeans can convey the style. For the tee, review the specific character artwork visible on the model as well as the designer label. Renaming the item leaves that artwork in place. Check the buying screen too, since some real fashion houses' in-game shops carry their namesake collections. [Item catalogue](../dist/archive-collection.js) · [Shop inventory](../dist/archive-stock.js)

## What to take into release review

1. **Capture each featured use.** For each proposed pun, collect the street sign, interior, phone card, associated mission or purchasable item, and any store-page screenshot. Record what is factual, what was invented, and who supplied the artwork. These are the materials a U.S. games/IP lawyer can use to assess a close call.
2. **Check the game title separately.** New York State licenses its I LOVE NY marks. Review the actual *I Heart NYC* wordmark and Steam capsule before commissioning final artwork. The state's licensing page establishes its policy for its marks. Whether this game's design falls within those rights requires its own assessment. [New York State licensing information](https://www.iloveny.com/licensee-info/)
3. **Inspect the packaged build.** The storefront renderer can load optional chain logos downloaded outside Git. Check the files actually packaged and the marks drawn in code. Test the desktop build on a clean machine, including what happens when the local NPC chat service is unavailable. [Chain signs and logos](../README.md#chain-signs-and-logos) · [Local game server](../scripts/serve.mjs)
4. **Prepare the Steam submission.** Valve reviews the store page and build and requires rights to distributed content. Its published onboarding terms currently list a US$100 fee per game, a 21-day wait after payment for the first few releases, and at least two weeks with a public Coming Soon page. Recheck timing when setting a date. The content survey asks about mature content, player-facing AI-generated assets, and safeguards for live-generated content such as NPC dialogue. [Steam Direct](https://partner.steamgames.com/steamdirect) · [Content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)
