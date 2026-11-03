# Third-party dependencies and terms

The original workflow code does not change the licenses of dependencies or tools downloaded by the installer. Tool archives/models are downloaded from their publishers; they are not bundled in the source release. Preserve notices included in their archives. Review terms applicable to your use before installation or redistribution.

| Component | Upstream terms/source |
| --- | --- |
| Remotion 4 and its packages | [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md): eligibility-based free use and Company License requirements. Not relicensed by this project. |
| Claude Code | [Anthropic commercial terms](https://www.anthropic.com/legal/commercial-terms) and applicable account/service terms; the downloaded native package retains its LICENSE.md. Account and usage are separate. |
| Node.js | [Node license and bundled third-party notices](https://github.com/nodejs/node/blob/main/LICENSE) |
| pnpm | [MIT](https://github.com/pnpm/pnpm/blob/main/LICENSE) |
| React | [MIT](https://github.com/facebook/react/blob/main/LICENSE) |
| TypeScript | [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) |
| Tailwind CSS | [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) |
| whisper.cpp | [MIT](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE) |
| Whisper model | [Model repository](https://huggingface.co/ggerganov/whisper.cpp), derived from [OpenAI Whisper](https://github.com/openai/whisper/blob/main/LICENSE) |
| Silero VAD | [VAD repository](https://github.com/snakers4/silero-vad) and [converted model](https://huggingface.co/ggml-org/whisper-vad) |
| FFmpeg Gyan full Windows build | [Build publisher](https://www.gyan.dev/ffmpeg/builds/) and [FFmpeg legal information](https://ffmpeg.org/legal.html). Build options affect licensing. Retain the downloaded archive's license/readme; this source release does not redistribute the binaries. |
| Python embeddable runtime | [Python license](https://docs.python.org/3/license.html); PSF and bundled notices |
| auto-editor | [Upstream license](https://github.com/WyattBlue/auto-editor/blob/master/LICENSE), including its native binary's bundled components |
| Geist / Geist Mono | [SIL Open Font License](https://github.com/vercel/geist-font/blob/main/LICENSE) |
| Render browser | Downloaded by Remotion; Chromium/Chrome for Testing retain their own licenses and notices |
| Visual C++ runtime | Microsoft terms shown by its signed redistributable installer; installed only if missing |

This list is not a substitute for a version-specific dependency/license inventory before publication. Do not advertise the whole dependency stack as unrestricted open source. The code's license does not grant ownership of brands, logos, user footage, third-party media or hosted AI accounts.

See the [current Windows dependency inventory](docs/DEPENDENCY-LICENSES.md) and [source-only license review](docs/LICENSE-REVIEW.md). The unused UNLICENSED transitions package was removed. Missing vendor metadata remains recorded accurately and is bound to explicit upstream-download-only decisions; dependencies/tool binaries are excluded from the source artifact. Each user must satisfy Remotion eligibility/commercial terms. Bundled runtime/container redistribution requires a separate review.
