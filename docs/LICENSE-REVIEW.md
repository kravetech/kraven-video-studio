# Source-only license review

Scope: original source and configuration/examples only. Dependencies, tool/model archives, font binaries, render browser, media, local state and production Git history are excluded. Original project code retains Apache-2.0 LICENSE and NOTICE. No dependency is relicensed by this repository.

| Finding | Resolution for this source candidate |
| --- | --- |
| Unused @remotion/transitions declares UNLICENSED | Removed from package.json, lockfile and fresh installed graph; no application imports used it. The license gate now refuses every UNLICENSED package. |
| Remotion packages reference vendor terms | Manifest-bound decisions link the exact version to the immutable upstream license. Download from upstream; retain vendor terms and notices. No Apache claim for Remotion. |
| @remotion/media and Windows compositor omit license metadata | Metadata remains accurately recorded as Unknown. Upstream package paths are identified at commit 5217b0c90623f2decb4575714fac89d3c4b69896; repository-root license scope is an explicit inference. They remain separately downloaded dependencies, excluded from the source artifact. No independent binary redistribution is approved. |
| License cache index incomplete | Inventory reads installed manifests and license files directly and binds their hashes to the exact lockfile. |
| Fonts, SFX and examples | Geist fonts download under their own terms; generated synthetic effects are not shipped. Source examples/preset contain no media/font binaries. NOTICE preserves original attribution. |

The installed Remotion LICENSE.md matches upstream Git blob **d655e2df830bbe19285e55607aefff636ed93d7b** at that commit (SHA-256 recorded in license-review.json). See [immutable license](https://github.com/remotion-dev/remotion/blob/5217b0c90623f2decb4575714fac89d3c4b69896/LICENSE.md), [package-scope decisions](license-review.json) and [installed metadata](dependency-licenses.json). Scope inference is documented evidence, not a vendor confirmation for missing package metadata.

Remotion's license permits video creation under its eligibility rules and requires a Company License outside those rules. Each installer operator must check their legal entity/use case; this project does not purchase, supply or waive that license. See the [vendor FAQ](https://www.remotion.dev/docs/license/faq). Keep the marketing description precise: Apache-2.0 toolkit using a separately licensed renderer.

FFmpeg licensing depends on the build; Gyan full binaries and Remotion's own compositor/FFmpeg components retain their respective notices and corresponding-source obligations. See [Remotion acknowledgements](https://www.remotion.dev/docs/acknowledgements) and [FFmpeg legal](https://ffmpeg.org/legal.html). Python, auto-editor, Whisper/model, Silero, Claude, Microsoft runtime and browser retain their terms in THIRD_PARTY_NOTICES.md. No codec/patent or bundled-runtime clearance is inferred.

**Local source-artifact checks can pass with these explicit vendor conditions.** A container/executable/runtime bundle requires a new redistribution review and vendor clarification where metadata is missing; do not reuse this source-only decision for it. New unknown/UNLICENSED packages, changed reviewed manifests or vendor license files fail checks instead of inheriting an exception.
