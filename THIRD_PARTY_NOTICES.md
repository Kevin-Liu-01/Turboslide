# Third-party notices

Turboslide ships or embeds the works below. Each section names the work, what Turboslide takes
from it, the license, and carries the license text as the license requires (SPEC 11, Licensing).
The CLI and studio distributions carry this file.

## Inter (SIL Open Font License 1.1)

What: `packages/fonts/assets/InterVariable.woff2`, InterVariable from Rasmus Andersson's Inter
4.1 release of 2024-11-16 (the release asset `Inter-4.1.zip`, path `web/InterVariable.woff2`,
https://github.com/rsms/inter/releases/tag/v4.1; sha256
`693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`, 352240 bytes; the name table
reads "Version 4.001;git-9221beed3") with opsz 14 to 32 and wght 100 to 900, decoded from the GT
deck's `fonts/deck-fonts.css`; from M2, static instances cut from it for PPTX embedding (SPEC 8.4);
and, from the Google Slides parity round two (SPEC-2 7.1),
`packages/fonts/assets/InterVariable-Italic.woff2`, the italic companion from the same release
(path `web/InterVariable-Italic.woff2`; sha256
`e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a`, 387976 bytes; the same
"Version 4.001;git-9221beed3"), with an italic twin of every static instance cut from it. The
features round (docs/FEATURES.md 3.1) replaced the italic file the parity round shipped, which was
the 4.0 release's ("Version 4.000;git-a52131595"), and corrected the release named here from a tag
that does not exist to v4.1. Licence text: https://github.com/rsms/inter/blob/v4.1/LICENSE.txt.
Source: https://rsms.me/inter/ and https://github.com/rsms/inter. Inter 4.1 declares no Reserved
Font Name (name IDs 0, 7, 13 and 14 of both files, read by `reserved_font_name` in
`scripts/build-fonts.py` on every build), so the renamed instances ship under the OFL; the check
is recorded in `packages/fonts/export/fonts.json` `license`.

    Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)

    This Font Software is licensed under the SIL Open Font License, Version 1.1.
    This license is copied below, and is also available with a FAQ at:
    http://scripts.sil.org/OFL

    -----------------------------------------------------------
    SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
    -----------------------------------------------------------

    PREAMBLE
    The goals of the Open Font License (OFL) are to stimulate worldwide
    development of collaborative font projects, to support the font creation
    efforts of academic and linguistic communities, and to provide a free and
    open framework in which fonts may be shared and improved in partnership
    with others.

    The OFL allows the licensed fonts to be used, studied, modified and
    redistributed freely as long as they are not sold by themselves. The
    fonts, including any derivative works, can be bundled, embedded,
    redistributed and/or sold with any software provided that any reserved
    names are not used by derivative works. The fonts and derivatives,
    however, cannot be released under any other type of license. The
    requirement for fonts to remain under this license does not apply
    to any document created using the fonts or their derivatives.

    DEFINITIONS
    "Font Software" refers to the set of files released by the Copyright
    Holder(s) under this license and clearly marked as such. This may
    include source files, build scripts and documentation.

    "Reserved Font Name" refers to any names specified as such after the
    copyright statement(s).

    "Original Version" refers to the collection of Font Software components as
    distributed by the Copyright Holder(s).

    "Modified Version" refers to any derivative made by adding to, deleting,
    or substituting -- in part or in whole -- any of the components of the
    Original Version, by changing formats or by porting the Font Software to a
    new environment.

    "Author" refers to any designer, engineer, programmer, technical
    writer or other person who contributed to the Font Software.

    PERMISSION AND CONDITIONS
    Permission is hereby granted, free of charge, to any person obtaining
    a copy of the Font Software, to use, study, copy, merge, embed, modify,
    redistribute, and sell modified and unmodified copies of the Font
    Software, subject to the following conditions:

    1) Neither the Font Software nor any of its individual components,
    in Original or Modified Versions, may be sold by itself.

    2) Original or Modified Versions of the Font Software may be bundled,
    redistributed and/or sold with any software, provided that each copy
    contains the above copyright notice and this license. These can be
    included either as stand-alone text files, human-readable headers or
    in the appropriate machine-readable metadata fields within text or
    binary files as long as those fields can be easily viewed by the user.

    3) No Modified Version of the Font Software may use the Reserved Font
    Name(s) unless explicit written permission is granted by the corresponding
    Copyright Holder. This restriction only applies to the primary font name as
    presented to the users.

    4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
    Software shall not be used to promote, endorse or advertise any
    Modified Version, except to acknowledge the contribution(s) of the
    Copyright Holder(s) and the Author(s) or with their explicit written
    permission.

    5) The Font Software, modified or unmodified, in part or in whole,
    must be distributed entirely under this license, and must not be
    distributed under any other license. The requirement for fonts to
    remain under this license does not apply to any document created
    using the Font Software.

    TERMINATION
    This license becomes null and void if any of the above conditions are
    not met.

    DISCLAIMER
    THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
    OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
    COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
    DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
    OTHER DEALINGS IN THE FONT SOFTWARE.

## ECMA-376 preset shape definitions (Ecma International)

What: `packages/schema/src/shapes/presetShapeDefinitions.xml`, the `presetShapeDefinitions.xml`
file ECMA-376 Part 1 (Office Open XML File Formats, DrawingML) publishes beside its text as the
normative definition of the preset shape geometries (`ST_ShapeType`), committed as published
(sha256 `eaff19f4405b3be6822428c96ef46cc685499217366fd58e5e63a5a24739f02f`) and read by
`packages/schema/scripts/build-definitions.mjs` into `definitions.ts`, which the geometry
interpreter `packages/schema/src/shapes/geometry.ts` evaluates so the sheet, the Perfect export
and PowerPoint draw one shape (gslides-parity SPEC-2 0.10, 0.57). The file is not modified.
Ecma International grants permission to copy and distribute the standard and its accompanying
files under the Ecma International Code of Conduct in Patent Matters and the standard's copyright
notice, which reads:

    COPYRIGHT PROTECTED DOCUMENT
    © Ecma International 2016
    All rights reserved. Unless otherwise specified, no part of this publication may be reproduced
    or utilized in any form or by any means, electronic or mechanical, including photocopying and
    microfilm, without permission in writing from the publisher. Ecma International grants
    permission to reproduce this document in whole or in part for the purpose of implementing
    the standard.

The same file is redistributed by LibreOffice (`oox/source/drawingml/customshapes/`) and by the
Apache POI and python-pptx projects for the same purpose.

## Heroicons (MIT)

What: the 63 Heroicons 20 solid symbols in `packages/theme/assets/sprite.svg` and
`packages/theme/src/sprite.ts`, copied from the GT deck's `parts/head.html`, which took them from
`optimized/20/solid` of https://github.com/tailwindlabs/heroicons.

    MIT License

    Copyright (c) Tailwind Labs, Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Paper Shaders (Apache License 2.0, with NOTICE)

What: `@paper-design/shaders` 0.0.78, the shader materials behind the `paper:*` entries of the
material catalog in `packages/materials` (SPEC 5.4, M5): the package's fragment shaders and
`ShaderMount` are imported as is by `packages/materials/src/paper.ts` and `mount.ts`, served to
the headless capture page from the package's own `dist` by `capture.ts`, and the GT palette presets
in `presets.ts` are Turboslide's uniform values, not a modification of the package. Source:
https://github.com/paper-design/shaders. Apache 2.0 permits shipping, modifying and selling renders
and requires the LICENSE and NOTICE text below to travel with the distribution (pptx report section
4.11); `packages/materials/NOTICE` repeats the NOTICE beside the code. Frames rendered from the
materials carry the credit "Material: <name>, Paper Shaders, rendered in Turboslide" (the M5
capture) or "Shader: <name>, Paper Shaders, rendered in Turboslide" (a frame of the shader library,
docs/FEATURES.md 5.5). The gallery's stills under `packages/materials/previews/` are renders of the
same shaders at anchor 5500 (`scripts/build-shader-previews.mjs`).

NOTICE:

    Paper Shaders
    Copyright 2026 Paper

    Powered by Paper Shaders:
    https://shaders.paper.design

LICENSE:

                                     Apache License
                               Version 2.0, January 2004
                            http://www.apache.org/licenses/

       TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

       1. Definitions.

          "License" shall mean the terms and conditions for use, reproduction,
          and distribution as defined by Sections 1 through 9 of this document.

          "Licensor" shall mean the copyright owner or entity authorized by
          the copyright owner that is granting the License.

          "Legal Entity" shall mean the union of the acting entity and all
          other entities that control, are controlled by, or are under common
          control with that entity. For the purposes of this definition,
          "control" means (i) the power, direct or indirect, to cause the
          direction or management of such entity, whether by contract or
          otherwise, or (ii) ownership of fifty percent (50%) or more of the
          outstanding shares, or (iii) beneficial ownership of such entity.

          "You" (or "Your") shall mean an individual or Legal Entity
          exercising permissions granted by this License.

          "Source" form shall mean the preferred form for making modifications,
          including but not limited to software source code, documentation
          source, and configuration files.

          "Object" form shall mean any form resulting from mechanical
          transformation or translation of a Source form, including but
          not limited to compiled object code, generated documentation,
          and conversions to other media types.

          "Work" shall mean the work of authorship, whether in Source or
          Object form, made available under the License, as indicated by a
          copyright notice that is included in or attached to the work
          (an example is provided in the Appendix below).

          "Derivative Works" shall mean any work, whether in Source or Object
          form, that is based on (or derived from) the Work and for which the
          editorial revisions, annotations, elaborations, or other modifications
          represent, as a whole, an original work of authorship. For the purposes
          of this License, Derivative Works shall not include works that remain
          separable from, or merely link (or bind by name) to the interfaces of,
          the Work and Derivative Works thereof.

          "Contribution" shall mean any work of authorship, including
          the original version of the Work and any modifications or additions
          to that Work or Derivative Works thereof, that is intentionally
          submitted to Licensor for inclusion in the Work by the copyright owner
          or by an individual or Legal Entity authorized to submit on behalf of
          the copyright owner. For the purposes of this definition, "submitted"
          means any form of electronic, verbal, or written communication sent
          to the Licensor or its representatives, including but not limited to
          communication on electronic mailing lists, source code control systems,
          and issue tracking systems that are managed by, or on behalf of, the
          Licensor for the purpose of discussing and improving the Work, but
          excluding communication that is conspicuously marked or otherwise
          designated in writing by the copyright owner as "Not a Contribution."

          "Contributor" shall mean Licensor and any individual or Legal Entity
          on behalf of whom a Contribution has been received by Licensor and
          subsequently incorporated within the Work.

       2. Grant of Copyright License. Subject to the terms and conditions of
          this License, each Contributor hereby grants to You a perpetual,
          worldwide, non-exclusive, no-charge, royalty-free, irrevocable
          copyright license to reproduce, prepare Derivative Works of,
          publicly display, publicly perform, sublicense, and distribute the
          Work and such Derivative Works in Source or Object form.

       3. Grant of Patent License. Subject to the terms and conditions of
          this License, each Contributor hereby grants to You a perpetual,
          worldwide, non-exclusive, no-charge, royalty-free, irrevocable
          (except as stated in this section) patent license to make, have made,
          use, offer to sell, sell, import, and otherwise transfer the Work,
          where such license applies only to those patent claims licensable
          by such Contributor that are necessarily infringed by their
          Contribution(s) alone or by combination of their Contribution(s)
          with the Work to which such Contribution(s) was submitted. If You
          institute patent litigation against any entity (including a
          cross-claim or counterclaim in a lawsuit) alleging that the Work
          or a Contribution incorporated within the Work constitutes direct
          or contributory patent infringement, then any patent licenses
          granted to You under this License for that Work shall terminate
          as of the date such litigation is filed.

       4. Redistribution. You may reproduce and distribute copies of the
          Work or Derivative Works thereof in any medium, with or without
          modifications, and in Source or Object form, provided that You
          meet the following conditions:

          (a) You must give any other recipients of the Work or
              Derivative Works a copy of this License; and

          (b) You must cause any modified files to carry prominent notices
              stating that You changed the files; and

          (c) You must retain, in the Source form of any Derivative Works
              that You distribute, all copyright, patent, trademark, and
              attribution notices from the Source form of the Work,
              excluding those notices that do not pertain to any part of
              the Derivative Works; and

          (d) If the Work includes a "NOTICE" text file as part of its
              distribution, then any Derivative Works that You distribute must
              include a readable copy of the attribution notices contained
              within such NOTICE file, excluding those notices that do not
              pertain to any part of the Derivative Works, in at least one
              of the following places: within a NOTICE text file distributed
              as part of the Derivative Works; within the Source form or
              documentation, if provided along with the Derivative Works; or,
              within a display generated by the Derivative Works, if and
              wherever such third-party notices normally appear. The contents
              of the NOTICE file are for informational purposes only and
              do not modify the License. You may add Your own attribution
              notices within Derivative Works that You distribute, alongside
              or as an addendum to the NOTICE text from the Work, provided
              that such additional attribution notices cannot be construed
              as modifying the License.

          You may add Your own copyright statement to Your modifications and
          may provide additional or different license terms and conditions
          for use, reproduction, or distribution of Your modifications, or
          for any such Derivative Works as a whole, provided Your use,
          reproduction, and distribution of the Work otherwise complies with
          the conditions stated in this License.

       5. Submission of Contributions. Unless You explicitly state otherwise,
          any Contribution intentionally submitted for inclusion in the Work
          by You to the Licensor shall be under the terms and conditions of
          this License, without any additional terms or conditions.
          Notwithstanding the above, nothing herein shall supersede or modify
          the terms of any separate license agreement you may have executed
          with Licensor regarding such Contributions.

       6. Trademarks. This License does not grant permission to use the trade
          names, trademarks, service marks, or product names of the Licensor,
          except as required for reasonable and customary use in describing the
          origin of the Work and reproducing the content of the NOTICE file.

       7. Disclaimer of Warranty. Unless required by applicable law or
          agreed to in writing, Licensor provides the Work (and each
          Contributor provides its Contributions) on an "AS IS" BASIS,
          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
          implied, including, without limitation, any warranties or conditions
          of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
          PARTICULAR PURPOSE. You are solely responsible for determining the
          appropriateness of using or redistributing the Work and assume any
          risks associated with Your exercise of permissions under this License.

       8. Limitation of Liability. In no event and under no legal theory,
          whether in tort (including negligence), contract, or otherwise,
          unless required by applicable law (such as deliberate and grossly
          negligent acts) or agreed to in writing, shall any Contributor be
          liable to You for damages, including any direct, indirect, special,
          incidental, or consequential damages of any character arising as a
          result of this License or out of the use or inability to use the
          Work (including but not limited to damages for loss of goodwill,
          work stoppage, computer failure or malfunction, or any and all
          other commercial damages or losses), even if such Contributor
          has been advised of the possibility of such damages.

       9. Accepting Warranty or Additional Liability. While redistributing
          the Work or Derivative Works thereof, You may choose to offer,
          and charge a fee for, acceptance of support, warranty, indemnity,
          or other liability obligations and/or rights consistent with this
          License. However, in accepting such obligations, You may act only
          on Your own behalf and on Your sole responsibility, not on behalf
          of any other Contributor, and only if You agree to indemnify,
          defend, and hold each Contributor harmless for any liability
          incurred by, or claims asserted against, such Contributor by reason
          of your accepting any such warranty or additional liability.

       END OF TERMS AND CONDITIONS

       APPENDIX: How to apply the Apache License to your work.

          To apply the Apache License to your work, attach the following
          boilerplate notice, with the fields enclosed by brackets "[]"
          replaced with your own identifying information. (Don't include
          the brackets!)  The text should be enclosed in the appropriate
          comment syntax for the file format. We also recommend that a
          file or class name and description of purpose be included on the
          same "printed page" as the copyright notice for easier
          identification within third-party archives.

       Copyright [yyyy] [name of copyright owner]

       Licensed under the Apache License, Version 2.0 (the "License");
       you may not use this file except in compliance with the License.
       You may obtain a copy of the License at

           http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing, software
       distributed under the License is distributed on an "AS IS" BASIS,
       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
       See the License for the specific language governing permissions and
       limitations under the License.

## PptxGenJS (MIT)

What: `pptxgenjs` 4.0.1, the PPTX writer behind `turboslide export pptx` (SPEC 8.2, M2).
Source: https://github.com/gitbrent/PptxGenJS.

    The MIT License (MIT)

    Copyright (c) 2015-2022 Brent Ely

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## TanStack (MIT)

What: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/router-cli`,
`@tanstack/react-devtools`, `@tanstack/devtools-vite`, `@tanstack/react-router-devtools` and
`@tanstack/eslint-config`, the framework of `apps/studio` (SPEC 3.2). Source:
https://github.com/TanStack. `apps/studio` was created with `@tanstack/cli` 0.71.0.

    MIT License

    Copyright (c) 2021-present Tanner Linsley

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Glyphfield (MIT)

What: `window.turboslide.studio` in `@turboslide/agent` is `glyphfield/src/lib/studioAutomation.ts`
copied with the names changed (SPEC 7.4, M3), and the skills, manifest and verification style follow
Glyphfield's contracts (SPEC 2.2). The features round's ship two (docs/FEATURES.md 5.2, 5.3;
audit-shaders 5, 23) ports the shader library's control model: `packages/materials/src/controls.ts`
is Glyphfield's `LiveMaterialSettings` (`src/lib/liveMaterials.ts`), the published ranges of
`src/lib/agentCatalog.ts` `AGENT_SHADER_LIBRARY.controls` and the mapping of `paperShaderControls.ts`
`paperControlOverrides` onto the Paper families, rewritten against Turboslide's `u_*` uniform names
with the three colours taken by the brand kit and one rotation axis; the Shader section's groups
(`packages/chrome/src/inspector/shader.tsx`) follow `LiveMaterialControls.tsx`'s. The house
renderers (`glyphfield-mesh-gradient`, `glyphfield-grain-gradient`, `glyphfield-dither-gradient`, the
glyph field) are not ported in ship two (the P1 engine interface of docs/FEATURES.md 5.2 waits; this
notice extends to them when they land). Not shipped, with the reason (audit-shaders, the summary):
ShaderGradient (MIT, with three.js and React Three Fiber), Pavel Dobryakov's WebGL Fluid Simulation
(MIT; a stateful simulation no timestamp reconstructs) and HoloCloth (MIT, Justin Levine; a pointer
lit textile) stay in Glyphfield, and no code or asset of theirs is in this repository.
Prototemplate's studio field (`Prototemplate/src/lib/studio-field.ts`) is Kevin Liu's own code and
needs no third party notice when it lands (P1). Source: Kevin Liu's Glyphfield repository.

    MIT License

    Copyright (c) 2026 Kevin Liu

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Rust dependencies of crates/turboslide-native (MIT and Apache-2.0)

What: the crates linked into the napi addon and the wasm module of `crates/turboslide-native`
(SPEC 10, M5), which `@turboslide/native` loads and `@turboslide/effects` uses when a build is
present. `docs/native.md` describes the crate. The direct dependencies are pinned in
`crates/turboslide-native/Cargo.toml` and the whole tree in `Cargo.lock`; the table below is
`cargo metadata` over the `napi` and `wasm` features with the dev-dependency `png` (test fixtures
only) left out. Every crate is available under MIT, alone or as an alternative, and Turboslide
takes each one under MIT (or the MIT alternative where several are offered), except
`unicode-ident`, whose tables are additionally under Unicode-3.0, and `libloading`, which is ISC.

| Crate                                                        | Version                            | License                             |
| ------------------------------------------------------------ | ---------------------------------- | ----------------------------------- |
| adler2                                                       | 2.0.1                              | 0BSD OR MIT OR Apache-2.0           |
| bitflags                                                     | 2.13.2                             | MIT OR Apache-2.0                   |
| bumpalo                                                      | 3.20.3                             | MIT OR Apache-2.0                   |
| cfg-if                                                       | 1.0.4                              | MIT OR Apache-2.0                   |
| convert_case                                                 | 0.12.0                             | MIT                                 |
| ctor                                                         | 1.0.13                             | Apache-2.0 OR MIT                   |
| futures (and its subcrates)                                  | 0.3.34                             | MIT OR Apache-2.0                   |
| itoa                                                         | 1.0.18                             | MIT OR Apache-2.0                   |
| libc                                                         | 0.2.189                            | MIT OR Apache-2.0                   |
| libloading                                                   | 0.9.0                              | ISC                                 |
| libm                                                         | 0.2.16                             | MIT (fdlibm and CORE-MATH portions) |
| memchr                                                       | 2.8.3                              | Unlicense OR MIT                    |
| miniz_oxide                                                  | 0.9.1                              | MIT OR Zlib OR Apache-2.0           |
| napi, napi-derive, napi-derive-backend, napi-sys, napi-build | 3.12.3, 3.6.4, 6.1.3, 3.3.1, 2.4.2 | MIT                                 |
| nohash-hasher                                                | 0.2.0                              | Apache-2.0 OR MIT                   |
| once_cell                                                    | 1.21.4                             | MIT OR Apache-2.0                   |
| pin-project-lite                                             | 0.2.17                             | Apache-2.0 OR MIT                   |
| proc-macro2                                                  | 1.0.107                            | MIT OR Apache-2.0                   |
| quote                                                        | 1.0.47                             | MIT OR Apache-2.0                   |
| rustc-hash                                                   | 2.1.3                              | Apache-2.0 OR MIT                   |
| rustversion                                                  | 1.0.23                             | MIT OR Apache-2.0                   |
| semver                                                       | 1.0.28                             | MIT OR Apache-2.0                   |
| serde, serde_core, serde_derive                              | 1.0.229                            | MIT OR Apache-2.0                   |
| serde_json                                                   | 1.0.151                            | MIT OR Apache-2.0                   |
| simd-adler32                                                 | 0.3.10                             | MIT                                 |
| slab                                                         | 0.4.12                             | MIT                                 |
| syn                                                          | 3.0.5, 2.0.119                     | MIT OR Apache-2.0                   |
| unicode-ident                                                | 1.0.24                             | (MIT OR Apache-2.0) AND Unicode-3.0 |
| unicode-segmentation                                         | 1.13.3                             | MIT OR Apache-2.0                   |
| wasm-bindgen (and its macro and shared crates)               | 0.2.128                            | MIT OR Apache-2.0                   |
| windows-link                                                 | 0.2.1                              | MIT OR Apache-2.0                   |
| zmij                                                         | 1.0.23                             | MIT                                 |

The MIT text, as it appears in each of these crates (the copyright line names the crate's authors;
for libm "the rust-lang/libm contributors", for miniz_oxide "2013-2014 RAD Game Tools and Valve
Software, 2010-2014 Rich Geldreich and Tenacious Software LLC, 2017 Frommi, 2017-2024 oyvindln",
for napi-rs "2020-present LongYinan", for wasm-bindgen "2014 Alex Crichton", for serde and
serde_json "the serde developers"):

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

libm's `sin`, `exp` and `pow` are ports of FreeBSD msun (fdlibm) sources, which carry this notice:

    Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.

    Developed at SunPro, a Sun Microsystems, Inc. business.
    Permission to use, copy, modify, and distribute this
    software is freely granted, provided that this notice
    is preserved.

libm's `cbrt` is a port of CORE-MATH (`core-math/src/binary64/cbrt/cbrt.c`, Copyright (c) 2021-2022
Alexei Sibidanov, MIT).

## pixelmatch (ISC), ported

What: `crates/turboslide-native/src/diff.rs` is a Rust port of pixelmatch 7.2.0
(https://github.com/mapbox/pixelmatch), the perceptual diff `@turboslide/effects` also uses through
the npm package (SPEC 8.5 step 3). The port keeps pixelmatch's arithmetic so both count the same
pixels; `packages/effects/src/parity.test.ts` holds them together.

    ISC License

    Copyright (c) 2019, Mapbox

    Permission to use, copy, modify, and/or distribute this software for any purpose
    with or without fee is hereby granted, provided that the above copyright notice
    and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
    FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
    OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
    TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
    THIS SOFTWARE.

## DSSIM: not the dssim crate

SPEC 10 names https://github.com/kornelski/dssim for the perceptual text gate. That crate
(`dssim-core`) is licensed AGPL-3.0-or-later, and linking it into `turboslide-native` would place
the addon and the wasm module under the AGPL, which the provisional MIT license of this repository
(SPEC open question 14) does not allow without a decision. `crates/turboslide-native/src/dssim.rs`
and `packages/effects/src/dssim.ts` are therefore Turboslide's own implementation of multi-scale
SSIM from the published method (Wang, Bovik, Sheikh and Simoncelli, "Image quality assessment: from
error visibility to structural similarity", 2004; Wang, Simoncelli and Bovik, "Multi-scale
structural similarity for image quality assessment", 2003), written from the papers and not from
the dssim source, with the `1 / ssim - 1` output convention. `docs/native.md` records the
definition; adopting the dssim crate is Kevin's licensing decision.

## thesvg.org (MIT code; brand marks under their recorded licences)

What: the logo picker (docs/FEATURES.md section 4; `apps/studio/src/server/logos.ts`,
`logo-index.ts`, `logo-sanitize.ts`, `packages/chrome/src/logo-model.ts`) reads thesvg.org's icon
manifest (`src/data/icons.json` of https://github.com/glincker/thesvg, through the jsDelivr mirror)
into a cached index and fetches a mark's SVG file from thesvg.org or the mirror when a seller
inserts it. The repository's code is MIT (https://github.com/glincker/thesvg/blob/main/LICENSE);
nothing of that code is copied here. The marks are the property of their respective owners and
are shown to identify a brand, never to imply endorsement (thesvg's TRADEMARK.md and DISCLAIMER.md);
each mark carries the licence string thesvg recorded for it verbatim in the asset's `source.license`
and the picker reads a seller's sentence for it ("Free to use", "Free to use with credit", "Free
to use unchanged", "Free to use under an open licence", "The brand's own terms"). What this
repository redistributes: the server keeps a sanitized copy of a mark in its public store only
when the recorded licence is CC0, MIT, Apache, BSD, ISC or Unlicense, with the attribution written
into the file as its `<desc>` ("<Title> logo, from thesvg.org under <licence>; the mark belongs to
its owner"), and drops it within a day of the mark leaving thesvg.org; every other mark is fetched
per insert, sanitized in the function and never written to the store, so the only copy Turboslide
keeps of it is the deck the seller inserted it into. A mark under a licence that forbids
derivative works (CC BY-ND, the AWS collection) is inserted unmodified; the mono tint applies to
open, credit and copyleft licences alone. The ten mark fixture under
`apps/studio/src/server/logo-fixtures/` carries the files of eight marks as thesvg.org served them
on 2026-09-22 (Figma, Vercel, GitHub, Stripe and Anthropic under CC0-1.0, OpenAI under MIT, Amazon
EC2 under CC-BY-ND-2.0 from AWS's own package) and three drawings of Turboslide's own for the
tests (Acme, Gradientco, Northwind), so the tests and the preview run without the network.

## Everything else

The remaining dependencies are listed with their licenses by `pnpm licenses list` from the repo
root. Chromium, Chrome for Testing and LibreOffice run as separate programs and are not
redistributed by this repository.

## The font catalog (SIL Open Font License 1.1, per family)

What: the woff2 files under `packages/fonts/assets/<id>/` for the thirty three families the Font
menu offers beside Inter (gslides-parity SPEC-5-amendments A5; docs/PRODUCT.md 4.2;
docs/FEATURES.md 3.2; `packages/fonts/src/catalog.ts`): Roboto, Open Sans, Lato, Montserrat,
Poppins, Source Sans 3, Source Serif 4, Merriweather, Playfair Display, Lora, PT Serif, Libre
Baskerville, EB Garamond, Nunito, Raleway, Work Sans, DM Sans, Space Grotesk, Oswald, Bebas Neue,
Roboto Mono, JetBrains Mono, IBM Plex Sans, IBM Plex Mono and Fira Code (the product round), and
Geist, Geist Mono, Instrument Sans, Manrope, Bricolage Grotesque, Schibsted Grotesk, Newsreader
and Fraunces (the features round, each named below). Source: the Google Fonts repository
(https://github.com/google/fonts) at commit `1ac2012c34919f5fa2675aacf723fa98edb30b5f`, the file
named per face in `packages/fonts/src/catalog-files.ts` with its sha256. Each woff2 is a fontTools
format conversion of the TrueType file, nothing subset, renamed or instanced, so every family keeps
its name table and, where the licence declares one, its Reserved Font Name (Lato, Merriweather,
Playfair Display, Lora, PT Serif, Libre Baskerville, Raleway, Source Sans 3's "Source", IBM Plex
Sans and IBM Plex Mono's "Plex"). Every family is under the SIL Open Font License 1.1; the
family's own licence text, with its copyright statement and Reserved Font Names, is committed
verbatim as `packages/fonts/assets/<id>/LICENSE` beside its files (the OFL text itself is the one
reproduced under Inter above). The fetch is `packages/fonts/scripts/fetch-fonts.mjs`; the check
chain never fetches.

The eight families the features round added (docs/FEATURES.md 3.2), each a variable TrueType file
of the repository at the same commit converted to woff2, none declaring a Reserved Font Name:

Geist: `ofl/geist/Geist[wght].ttf` and `Geist-Italic[wght].ttf` as `packages/fonts/assets/geist/`
(69,840 and 73,056 bytes). Copyright 2024 The Geist Project Authors
(https://github.com/vercel/geist-font). SIL Open Font License 1.1.

Geist Mono: `ofl/geistmono/GeistMono[wght].ttf` and `GeistMono-Italic[wght].ttf` as
`packages/fonts/assets/geist-mono/` (71,120 and 78,736 bytes). Copyright 2024 The Geist Project
Authors (https://github.com/vercel/geist-font). SIL Open Font License 1.1.

Instrument Sans: `ofl/instrumentsans/InstrumentSans[wdth,wght].ttf` and
`InstrumentSans-Italic[wdth,wght].ttf` as `packages/fonts/assets/instrument-sans/` (89,024 and
94,780 bytes). Copyright 2022 The Instrument Sans Project Authors
(https://github.com/Instrument/instrument-sans). SIL Open Font License 1.1.

Manrope: `ofl/manrope/Manrope[wght].ttf` as `packages/fonts/assets/manrope/` (53,732 bytes; no
italic ships). Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope).
SIL Open Font License 1.1.

Bricolage Grotesque: `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf` as
`packages/fonts/assets/bricolage-grotesque/` (205,036 bytes; no italic ships). Copyright 2022 The
Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage). SIL Open Font
License 1.1.

Schibsted Grotesk: `ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf` and
`SchibstedGrotesk-Italic[wght].ttf` as `packages/fonts/assets/schibsted-grotesk/` (70,084 and
74,940 bytes). Copyright 2023 The Schibsted-Grotesk Project Authors
(https://github.com/schibsted/schibsted-grotesk). SIL Open Font License 1.1.

Newsreader: `ofl/newsreader/Newsreader[opsz,wght].ttf` and `Newsreader-Italic[opsz,wght].ttf` as
`packages/fonts/assets/newsreader/` (214,916 and 239,064 bytes). Copyright 2020 The Newsreader
Project Authors (http://github.com/productiontype/Newsreader). SIL Open Font License 1.1.

Fraunces: `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` and
`Fraunces-Italic[SOFT,WONK,opsz,wght].ttf` as `packages/fonts/assets/fraunces/` (194,936 and
235,660 bytes). Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces).
SIL Open Font License 1.1.
