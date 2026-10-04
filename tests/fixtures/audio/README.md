# Audio test fixtures

`sfx.mp3` and `sfx.ogg` are unmodified, small encoded audio fixtures from
Chromium's official media tests, pinned to commit
`b6be2ef08a6cc5ae86dcc4a9cd2b3e3066353726`:

- [MP3 source](https://chromium.googlesource.com/chromium/src/+/b6be2ef08a6cc5ae86dcc4a9cd2b3e3066353726/media/test/data/sfx.mp3)
- [Ogg source](https://chromium.googlesource.com/chromium/src/+/b6be2ef08a6cc5ae86dcc4a9cd2b3e3066353726/media/test/data/sfx.ogg)
- [Upstream BSD license](https://chromium.googlesource.com/chromium/src/+/b6be2ef08a6cc5ae86dcc4a9cd2b3e3066353726/LICENSE), retained verbatim in `LICENSE.chromium`.

| Fixture   | Bytes | SHA-256                                                            |
| --------- | ----: | ------------------------------------------------------------------ |
| `sfx.mp3` | 2,189 | `46364ebce1b9b2f278b35a7dc05b10427a33c073cf085cfa1a4ab33f3d307565` |
| `sfx.ogg` | 3,869 | `d38a6edbd595aafa08cef3f1749acdeafb4f471cb4fc4b37679292936ca6d89c` |

The MP3 is a LAME-encoded MPEG-1 Layer III track with an ID3v2.3 tag. The Ogg
contains Vorbis audio. The browser tests exercise actual upload and decoding,
rather than treating a valid header as proof of playback.

`audio-ui.spec.ts` also generates its own short PCM WAV tone in memory. Its
padded MP3 regression replaces the fixture's metadata with a valid ID3v2.4
`TSSE` tag and ten zero padding bytes; the encoded audio remains unchanged.
No external audio, commercial recording, encoder installation, network access,
or extra dependency is needed when running tests. These assets are test-only.
