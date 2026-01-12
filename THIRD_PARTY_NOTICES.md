# Third-Party Notices

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

For questions about these notices or licensing, please contact the team.
