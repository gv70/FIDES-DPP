# Third-Party Notices

**Last Updated**: 2025-12-11  
**Last Verified**: 2025-12-11

This project incorporates material from the projects listed below (Third Party IP). The original copyright notice and the license under which we received such Third Party IP are set forth below.

## How to Keep This Document in Sync

1. **When adding a new dependency**: After adding to `DEPENDENCIES.md`, add a notice entry here:
   - Use the template format below
   - Include full copyright notice (from `npm info <package> repository` or GitHub)
   - Include full license text (Apache 2.0, MIT, etc.) - see template for standard licenses
   - Update "Last Verified" timestamp above

2. **When updating a dependency**: Verify copyright/license hasn't changed, update if needed.

3. **Automated extraction hints**: For npm packages, you can get copyright info via:
   ```bash
   npm info <package> repository
   npm info <package> license
   ```
   Then fetch license text from the repository's LICENSE file.

## Template for Adding Third-Party Notices

When adding a new dependency notice, use this template:

```markdown
---

## package-name

**Copyright**: Copyright Holder Name  
**License**: License Name (e.g., Apache License 2.0, MIT License)  
**Source**: https://github.com/org/package

[Include full license text here - see examples below for standard licenses]

---

### For Apache License 2.0:
[Use the full Apache 2.0 text from the "Full Apache License 2.0 Text" section below]

### For MIT License:
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

### For other licenses:
Include the full license text from the dependency's LICENSE file.
```

**Required Fields**:
- **Copyright**: Exact copyright holder name (from package repository)
- **License**: Full license name
- **Source**: Repository URL (GitHub, npm, etc.)
- **License Text**: Full license text (required for license compliance and attribution)

---

## did-jwt-vc

**Copyright**: Decentralized Identity Foundation  
**License**: Apache License 2.0  
**Source**: https://github.com/decentralized-identity/did-jwt-vc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

## did-resolver

**Copyright**: Decentralized Identity Foundation  
**License**: Apache License 2.0  
**Source**: https://github.com/decentralized-identity/did-resolver

Licensed under the Apache License, Version 2.0 (the "License").
See the LICENSE file at the source repository for full terms.

---

## dedot

**Copyright**: dedot contributors  
**License**: MIT License  
**Source**: https://github.com/dedotdev/dedot

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

---

## typink

**Copyright**: typink contributors  
**License**: MIT License  
**Source**: https://github.com/dedotdev/typink

Licensed under the MIT License. See LICENSE file at source repository.

---

## ajv

**Copyright**: Evgeny Poberezkin and ajv contributors  
**License**: MIT License  
**Source**: https://github.com/ajv-validator/ajv

Licensed under the MIT License. See LICENSE file at source repository.

---

## @4sure-tech/vc-bitstring-status-lists

**Copyright**: 4Sure Tech contributors  
**License**: Apache License 2.0  
**Source**: https://github.com/4sure-tech/vc-bitstring-status-lists

Licensed under the Apache License, Version 2.0.
See the LICENSE file at the source repository for full terms.

---

## Next.js

**Copyright**: Vercel, Inc.  
**License**: MIT License  
**Source**: https://github.com/vercel/next.js

Licensed under the MIT License. See LICENSE file at source repository.

---

## React

**Copyright**: Meta Platforms, Inc. and affiliates  
**License**: MIT License  
**Source**: https://github.com/facebook/react

Licensed under the MIT License.

Copyright (c) Meta Platforms, Inc. and affiliates.

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

---

## @polkadot/api

**Copyright**: Parity Technologies and Polkadot-JS contributors  
**License**: Apache License 2.0  
**Source**: https://github.com/polkadot-js/api

Licensed under the Apache License, Version 2.0.
See the LICENSE file at the source repository for full terms.

---

## ink!

**Copyright**: Parity Technologies (UK) Ltd.  
**License**: Apache License 2.0  
**Source**: https://github.com/use-ink/ink

Licensed under the Apache License, Version 2.0.

Copyright (c) 2018-2023 Parity Technologies (UK) Ltd.

See the LICENSE file at the source repository for full terms.

---

## parity-scale-codec

**Copyright**: Parity Technologies (UK) Ltd.  
**License**: Apache License 2.0  
**Source**: https://github.com/paritytech/parity-scale-codec

Licensed under the Apache License, Version 2.0.
See the LICENSE file at the source repository for full terms.

---

## walt.id Identity (Optional Runtime Service)

**Copyright**: walt.id GmbH  
**License**: Apache License 2.0  
**Source**: https://github.com/walt-id/waltid-identity

Used as an optional runtime service (Docker container) for Status List management and DID:web key management.

Licensed under the Apache License, Version 2.0.

Copyright (c) walt.id GmbH

See LICENSE file at: https://github.com/walt-id/waltid-identity/blob/main/LICENSE

---

## Kubo (IPFS)

**Copyright**: Protocol Labs, Inc. and IPFS contributors  
**License**: MIT License and Apache License 2.0 (dual-licensed)  
**Source**: https://github.com/ipfs/kubo

Licensed under dual MIT/Apache-2.0 license.
See LICENSE-MIT and LICENSE-APACHE files at source repository.

---

## Helia

**Copyright**: Protocol Labs, Inc. and IPFS contributors  
**License**: MIT License and Apache License 2.0 (dual-licensed)  
**Source**: https://github.com/ipfs/helia

Licensed under dual MIT/Apache-2.0 license.
See LICENSE-MIT and LICENSE-APACHE files at source repository.

---

## PostgreSQL (Optional Runtime Service)

**Copyright**: PostgreSQL Global Development Group  
**License**: PostgreSQL License  
**Source**: https://www.postgresql.org/

PostgreSQL Database Management System
(formerly known as Postgres, then as Postgres95)

Portions Copyright (c) 1996-2024, PostgreSQL Global Development Group
Portions Copyright (c) 1994, The Regents of the University of California

Permission to use, copy, modify, and distribute this software and its
documentation for any purpose, without fee, and without a written agreement
is hereby granted, provided that the above copyright notice and this
paragraph and the following two paragraphs appear in all copies.

---

## TypeScript

**Copyright**: Microsoft Corporation  
**License**: Apache License 2.0  
**Source**: https://github.com/microsoft/TypeScript

Licensed under the Apache License, Version 2.0.
Copyright (c) Microsoft Corporation. All rights reserved.
See LICENSE.txt at source repository for full terms.

---

## Additional Acknowledgments

- **Polkadot** and **Substrate** for blockchain infrastructure
- **UNTP (UN Transparency Protocol)** for DPP specification guidance
- **W3C** for Verifiable Credentials and DID Core standards
- **IETF** for RFC 9264 (Linkset specification)
- **UN/CEFACT** for sustainability vocabulary standards

---

## UNTP JSON Schema (Runtime Fetched, Not Vendored)

**Note**: The UNTP JSON Schema is licensed under GNU GPL v3.0 and is **fetched at runtime** from:

https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.1.json

This schema is **NOT vendored or copied** into the FIDES-DPP codebase to maintain Apache-2.0 license compatibility. The schema is fetched dynamically during validation operations only.

**License**: GNU General Public License v3.0  
**Source**: https://github.com/uncefact/spec-untp

For more information on GPL v3.0, see: https://www.gnu.org/licenses/gpl-3.0.html

---

## UNTP Vocabulary (Clean Room Implementation)

**Note**: UNTP vocabulary.jsonld files are licensed under GNU GPL v3.0, which is incompatible with Apache 2.0.

**FIDES-DPP implements a clean room solution**:
- Database schema and TypeScript types are **independently implemented** based on UNTP public specifications (markdown documentation)
- **NOT derived from** GPL-licensed vocabulary.jsonld files
- Structure aligned for interoperability (same property names) without copying implementation
- Documented in ADR-0002 and this notice

**References Used** (public specifications, not GPL code):
- `reference/specification/DigitalProductPassport.md`
- `reference/specification/IdentityResolver.md`
- `reference/specification/DIDMethods.md`

**License**: GNU General Public License v3.0 (for vocabulary.jsonld files only)  
**Source**: https://test.uncefact.org/vocabulary/untp/  
**Usage**: FIDES-DPP implements compatible data structures based on UNTP public specifications, not derived from GPL-licensed vocabulary.jsonld files. This is a clean room implementation for Apache 2.0 compatibility.

For more information on GPL v3.0, see: https://www.gnu.org/licenses/gpl-3.0.html

---

## Full Apache License 2.0 Text

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

---

For questions about these notices or licensing, please contact the FIDES-DPP team.
