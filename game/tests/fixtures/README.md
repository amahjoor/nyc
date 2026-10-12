`i3s-soho.bin.gz` is the unmodified decompressed geometry buffer from NYC OTI's
public 2014 citywide survey, recompressed with deterministic gzip for the test
fixture. It contains 280 SoHo building features and 11,512 triangles.

Source: https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0/nodes/4341/geometries/0

Metadata: https://www.arcgis.com/home/item.html?id=a6961bc4505c44e8a495b53483491cc0

Terms: https://cityofnewyork.github.io/opendatatsm/publicpolicies.html

The additional borough fixtures use the same unmodified geometry-buffer format,
recompressed with gzip. They exercise independent survey chunks rather than
relocating the SoHo sample:

| Fixture | Service node | Building features | Triangles |
| --- | ---: | ---: | ---: |
| `i3s-brooklyn.bin.gz` | 4 | 114 | 3,166 |
| `i3s-queens.bin.gz` | 301 | 423 | 15,991 |
| `i3s-bronx.bin.gz` | 2264 | 105 | 5,892 |
| `i3s-staten-island.bin.gz` | 2737 | 335 | 11,510 |

Each source URL replaces `4341` in the SoHo URL above with the listed service
node. Downloaded October 11, 2026. Survey year and attribution remain unchanged.
