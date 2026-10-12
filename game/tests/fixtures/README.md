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

The Central Park fixtures contain every actual leaf intersecting the 300-meter
preparation area around the Pond arrival street. They retain unmodified source
buffers, recompressed with deterministic gzip, downloaded October 12, 2026.
Node 3220 contains feature 492527: its 36 horizontal foundation triangles are
0.911018 meters above some of its wall feet. These triangles still match the
measured vertical walls around the complete 38-corner perimeter. This mismatch
previously rejected the whole destination as having no surveyed ground surface.

| Fixture | Features | Triangles | Decompressed SHA-256 |
| --- | ---: | ---: | --- |
| `i3s-central-park-3136.bin.gz` | 115 | 10358 | `6a422245a9b46b3f6e7a3b25d2ba84c9b0d14f4ea6166a7a5103fa7f2c392960` |
| `i3s-central-park-3144.bin.gz` | 96 | 13854 | `0f6c4da8f0e125e4757e89c5ff05f778e07e5ad162189cb9a2e25478f701f512` |
| `i3s-central-park-3164.bin.gz` | 88 | 13292 | `b89a08ea64636466e2f43a69b7dd5968921be69f305fb105721f4093fc412228` |
| `i3s-central-park-3166.bin.gz` | 83 | 14244 | `e45ad97170ca529bfb968a3535eeab57949679570e07fe2011a0e303d4447add` |
| `i3s-central-park-3216.bin.gz` | 206 | 11584 | `369766745ad34e03ebdb435638b78ceed3bae8e13e48c4d9e50afdf9296ae55d` |
| `i3s-central-park-3220.bin.gz` | 106 | 12002 | `e44594ef84c6417c6b4f6cb323672640149225b4b50e89e5f5994b8f0245d407` |
| `i3s-central-park-3222.bin.gz` | 40 | 4600 | `dcb4e85e05f2254365a98d9b138c243e7796d22dbf939904a2e928a68a1f9c6b` |
| `i3s-central-park-3907.bin.gz` | 161 | 17139 | `62b72c9ee9c68f47a80674a8135499d1bc9c397968e17b5dd369e196a0813274` |

Each source URL uses the same service above, replacing the node number with
the number in the fixture filename. Survey date, attribution and terms are
unchanged. Tests verify the whole destination against the real mapped streets,
not only a hand-built substitute for the failing feature.
