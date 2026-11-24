# Business and wardrobe names

The two place catalogs list individual locations, including branches and unnamed trade records. Coordinates use the game’s world metres. Rows with empty registered names have no trade name in the source. Civic facilities such as public libraries retain their mapped identities.

| Catalog | Coverage |
| --- | --- |
| [City and state registers](places.csv) | 70,957 commercial locations |
| [Additional OpenStreetMap shops](shops.csv) | 12,056 commercial locations |
| [Archive wardrobe](wardrobe.csv) | 505 catalog entries, including matching suit pieces |

Chains share a fictional identity across locations. Independents use trade-specific wordplay and a deterministic fictional street qualifier. The qualifier is part of the sign. Directions use the same mapped coordinates in either edition. Repeated names and overlapping records can appear in both source datasets.

Run `node game/scripts/build-business-puns.mjs` to refresh the tables or add `--check` to detect drift. For an in-game comparison, run `npm --prefix game run dev`, enter the city and open **Pause → Settings → City → Business and fashion names**. Switching reloads the city on the same origin. Public desktop and web packages select fictional names automatically.

The OpenStreetMap-derived shop table is © OpenStreetMap contributors and distributed under ODbL 1.0. The game adds its local coordinates, classifications and fictional display names. The repository includes the distributed city data and transformation scripts. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/) · [Source catalogs and credits](../../README.md)

For questions about a particular sign, garment or logo, see the [brand and release research](../brand-parody-and-steam-release.md).
