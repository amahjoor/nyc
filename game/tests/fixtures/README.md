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

The Prospect Lake fixtures retain the actual surveyed buildings around Wellhouse
Drive. They cover the destination preparation area used by the reconstructed
park travel regression. These buffers are unmodified source geometry, compressed
with deterministic gzip. SHA-256 values below apply to the decompressed buffers.
Downloaded October 11, 2026.

| Fixture | Building features | Triangles | Decompressed SHA-256 |
| --- | ---: | ---: | --- |
| `i3s-prospect-91.bin.gz` | 140 | 10270 | `1a0da80dab588b71a52a3a31f65900e013c4c3b4010e10f8a94a4d3d2e6fedf9` |
| `i3s-prospect-3464.bin.gz` | 307 | 7574 | `bfa96cd334c2bd2348174fc35d98a2d104b047244358e9404a7fec36bab62572` |
| `i3s-prospect-3465.bin.gz` | 356 | 9912 | `c2acf699274682e290faa5806e4015e6619136e665c588dc12b68d80a2fa58c7` |

Exact source URLs:

- Node 91: https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0/nodes/91/geometries/0
- Node 3464: https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0/nodes/3464/geometries/0
- Node 3465: https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0/nodes/3465/geometries/0
