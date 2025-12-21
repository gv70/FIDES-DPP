//! FIDES DPP Contract (v0.2)
//!
//! On-chain anchor for an off-chain dataset (e.g. a VC-JWT on IPFS).
//! Tracks token ownership separately from issuer authority.
//!
//! @license Apache-2.0

#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod dpp_contract_v2 {
    use ink::prelude::string::String;
    use ink::storage::Mapping;
    use scale::{Decode, Encode};

    #[allow(dead_code)]
    pub type TokenId = u128;
    
    /// Granularity level of the passport.
    #[derive(Encode, Decode, Clone, Debug, PartialEq)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum Granularity {
        ProductClass,

        Batch,

        Item,
    }

    /// On-chain anchor record for a passport token.
    #[derive(Encode, Decode, Clone, Debug, PartialEq)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct PassportRecord {
        pub token_id: u128,

        /// Issuer authority (immutable). Only the issuer can update or revoke.
        pub issuer: Address,

        pub dataset_uri: String,

        /// SHA-256 hash of the dataset bytes.
        pub payload_hash: [u8; 32],

        pub dataset_type: String,

        pub version: u32,

        pub status: PassportStatus,

        pub created_at: u32,

        pub updated_at: u32,

        pub granularity: Granularity,

        pub subject_id_hash: Option<[u8; 32]>,
    }

    /// Technical status (not a product lifecycle stage).
    #[derive(Encode, Decode, Clone, Debug, PartialEq)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum PassportStatus {
        Draft,

        Active,

        Suspended,

        Revoked,

        Archived,
    }

    /// Version history entry (immutable, append-only)
    ///
    /// Each update creates a new history entry, preserving the complete audit trail.
    /// This aligns with UNTP's immutable VC model while leveraging blockchain
    /// for transparent version tracking.
    #[derive(Encode, Decode, Clone, Debug, PartialEq)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct VersionHistory {
        /// Version number (1-indexed)
        pub version: u32,

        /// IPFS URI for this specific version
        ///
        /// Each version has its own immutable VC-JWT on IPFS.
        pub dataset_uri: String,

        /// SHA-256 hash of the VC-JWT for this version
        pub payload_hash: [u8; 32],

        /// Dataset type for this version
        pub dataset_type: String,

        /// Block number when this version was created
        pub updated_at: u32,

        /// Account that created this version
        ///
        /// For version 1, this is the issuer.
        /// For subsequent versions, this is who performed the update.
        pub updated_by: Address,
    }

    /// Error types
    #[derive(Debug, PartialEq, Eq, Clone)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    pub enum Error {
        /// Token ID not found
        TokenNotFound,
        /// Invalid input (empty strings, etc.)
        InvalidInput,
        /// Unauthorized (caller is not the issuer)
        Unauthorized,
        /// Caller is not the current owner
        NotOwner,
        /// Caller is not owner nor approved operator
        NotApproved,
        /// Operation not allowed
        NotAllowed,
        /// Passport is revoked (cannot be updated)
        PassportRevoked,
        /// Passport is already revoked (cannot revoke again)
        AlreadyRevoked,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    // Events

    /// Emitted when a passport is registered
    #[ink(event)]
    pub struct PassportRegistered {
        #[ink(topic)]
        pub token_id: u128,
        #[ink(topic)]
        pub issuer: Address,
        pub dataset_uri: String,
        pub payload_hash: [u8; 32],
        pub dataset_type: String,
        pub version: u32,
        pub created_at: u32,
    }

    /// Emitted when a passport dataset is updated
    #[ink(event)]
    pub struct PassportUpdated {
        #[ink(topic)]
        pub token_id: u128,
        pub dataset_uri: String,
        pub payload_hash: [u8; 32],
        pub dataset_type: String,
        pub version: u32,
        pub updated_at: u32,
    }

    /// Emitted when a passport is revoked
    #[ink(event)]
    pub struct PassportRevoked {
        #[ink(topic)]
        pub token_id: u128,
        #[ink(topic)]
        pub issuer: Address,
        pub reason: Option<String>,
        pub revoked_at: u32,
    }

    // Ownership events (ERC-721 compatible). Transfers do not change issuer authority.

    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        pub from: Option<Address>,
        #[ink(topic)]
        pub to: Option<Address>,
        #[ink(topic)]
        pub token_id: u128,
    }

    #[ink(event)]
    pub struct Approval {
        #[ink(topic)]
        pub owner: Address,
        #[ink(topic)]
        pub approved: Address,
        #[ink(topic)]
        pub token_id: u128,
    }

    #[ink(event)]
    pub struct ApprovalForAll {
        #[ink(topic)]
        pub owner: Address,
        #[ink(topic)]
        pub operator: Address,
        pub approved: bool,
    }

    #[ink(storage)]
    pub struct DppContractV2 {
        passports: Mapping<u128, PassportRecord>,

        next_token_id: u128,

        version_history: Mapping<(u128, u32), VersionHistory>,

        // subject_id_hash -> token_id (best-effort reverse lookup)
        subject_id_to_token: Mapping<[u8; 32], u128>,

        token_owner: Mapping<u128, Address>,
        token_approvals: Mapping<u128, Address>,
        owned_tokens_count: Mapping<Address, u128>,
        operator_approvals: Mapping<(Address, Address), ()>,
    }

    impl DppContractV2 {
        /// Constructor.
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                passports: Mapping::new(),
                next_token_id: 0,
                version_history: Mapping::new(),
                subject_id_to_token: Mapping::new(),
                token_owner: Mapping::new(),
                token_approvals: Mapping::new(),
                owned_tokens_count: Mapping::new(),
                operator_approvals: Mapping::new(),
            }
        }

        /// Register a new passport anchor.
        /// * `payload_hash` - SHA-256 hash of the JWT string
        /// * `dataset_type` - MIME type (e.g., "application/vc+jwt")
        /// * `granularity` - Granularity level (ProductClass, Batch, or Item)
        /// * `subject_id_hash` - Optional hashed canonical subject identifier
        ///
        /// # Returns
        ///
        /// Token ID of the newly registered passport
        ///
        /// # Errors
        ///
        /// * `InvalidInput` - Empty dataset_uri or dataset_type
        #[ink(message)]
        pub fn register_passport(
            &mut self,
            dataset_uri: String,
            payload_hash: [u8; 32],
            dataset_type: String,
            granularity: Granularity,
            subject_id_hash: Option<[u8; 32]>,
        ) -> Result<u128> {
            let caller = self.env().caller();
            let token_id = self.next_token_id;
            let block_number = self.env().block_number();

            if dataset_uri.is_empty() || dataset_type.is_empty() {
                return Err(Error::InvalidInput);
            }

            let record = PassportRecord {
                token_id,
                issuer: caller,
                dataset_uri: dataset_uri.clone(),
                payload_hash,
                dataset_type: dataset_type.clone(),
                version: 1,
                status: PassportStatus::Active,
                created_at: block_number,
                updated_at: block_number,
                granularity: granularity.clone(),
                subject_id_hash,
            };

            self.passports.insert(token_id, &record);

            self.add_token_to(&caller, token_id)?;

            self.next_token_id += 1;

            if let Some(subject_hash) = subject_id_hash {
                self.subject_id_to_token.insert(subject_hash, &token_id);
            }

            let history_entry = VersionHistory {
                version: 1,
                dataset_uri: dataset_uri.clone(),
                payload_hash,
                dataset_type: dataset_type.clone(),
                updated_at: block_number,
                updated_by: caller,
            };
            self.version_history.insert((token_id, 1), &history_entry);

            self.env().emit_event(PassportRegistered {
                token_id,
                issuer: caller,
                dataset_uri,
                payload_hash,
                dataset_type,
                version: 1,
                created_at: block_number,
            });

            self.env().emit_event(Transfer {
                from: None,
                to: Some(caller),
                token_id,
            });

            Ok(token_id)
        }

        /// Get the current anchor record.
        #[ink(message)]
        pub fn get_passport(&self, token_id: u128) -> Option<PassportRecord> {
            self.passports.get(token_id)
        }

        /// Update the anchor (issuer-only). Increments `version`.
        ///
        /// NOTE: Granularity is immutable after registration.
        #[ink(message)]
        pub fn update_dataset(
            &mut self,
            token_id: u128,
            dataset_uri: String,
            payload_hash: [u8; 32],
            dataset_type: String,
            subject_id_hash: Option<[u8; 32]>,
        ) -> Result<()> {
            let caller = self.env().caller();
            let mut record = self.passports.get(token_id).ok_or(Error::TokenNotFound)?;

            if record.issuer != caller {
                return Err(Error::Unauthorized);
            }

            // Cannot update revoked passports
            if record.status == PassportStatus::Revoked {
                return Err(Error::PassportRevoked);
            }

            // Validation: check for empty strings
            if dataset_uri.is_empty() || dataset_type.is_empty() {
                return Err(Error::InvalidInput);
            }

            // Prepare new version
            let block_number = self.env().block_number();
            let new_version = record.version + 1;

            // Update fields in current record
            let old_subject_hash = record.subject_id_hash;
            record.dataset_uri = dataset_uri.clone();
            record.payload_hash = payload_hash;
            record.dataset_type = dataset_type.clone();
            record.subject_id_hash = subject_id_hash;
            record.version = new_version;
            record.updated_at = block_number;

            // Update reverse lookup.
            if let Some(old_hash) = old_subject_hash {
                // Only remove if it points to this token_id (safety check)
                if let Some(existing_token) = self.subject_id_to_token.get(old_hash) {
                    if existing_token == token_id {
                        // Note: ink! Mapping doesn't support deletion directly
                        // We'll overwrite with new hash if it changed
                    }
                }
            }
            
            // Add/update new mapping
            if let Some(new_hash) = subject_id_hash {
                self.subject_id_to_token.insert(new_hash, &token_id);
            }

            // Store updated record
            self.passports.insert(token_id, &record);

            // Append-only version history.
            let history_entry = VersionHistory {
                version: new_version,
                dataset_uri: dataset_uri.clone(),
                payload_hash,
                dataset_type: dataset_type.clone(),
                updated_at: block_number,
                updated_by: caller,
            };
            self.version_history.insert((token_id, new_version), &history_entry);

            // Emit event
            self.env().emit_event(PassportUpdated {
                token_id,
                dataset_uri,
                payload_hash,
                dataset_type,
                version: new_version,
                updated_at: block_number,
            });

            Ok(())
        }

        /// Revoke a passport (issuer-only).
        #[ink(message)]
        pub fn revoke_passport(
            &mut self,
            token_id: u128,
            reason: Option<String>,
        ) -> Result<()> {
            let caller = self.env().caller();
            let mut record = self.passports.get(token_id).ok_or(Error::TokenNotFound)?;

            // Authorization: only original issuer
            if record.issuer != caller {
                return Err(Error::Unauthorized);
            }

            // Cannot revoke already revoked passports
            if record.status == PassportStatus::Revoked {
                return Err(Error::AlreadyRevoked);
            }

            // Update status
            let block_number = self.env().block_number();
            record.status = PassportStatus::Revoked;
            record.updated_at = block_number;

            // Store
            self.passports.insert(token_id, &record);

            // Emit event (reason stored in event, not in storage)
            self.env().emit_event(PassportRevoked {
                token_id,
                issuer: caller,
                reason,
                revoked_at: block_number,
            });

            Ok(())
        }

        // Ownership (NFT-like).

        #[ink(message)]
        pub fn balance_of(&self, owner: Address) -> u128 {
            self.owned_tokens_count.get(owner).unwrap_or(0)
        }

        #[ink(message)]
        pub fn owner_of(&self, token_id: u128) -> Option<Address> {
            self.token_owner.get(token_id)
        }

        #[ink(message)]
        pub fn get_approved(&self, token_id: u128) -> Option<Address> {
            self.token_approvals.get(token_id)
        }

        #[ink(message)]
        pub fn is_approved_for_all(&self, owner: Address, operator: Address) -> bool {
            self.operator_approvals.contains((owner, operator))
        }

        #[ink(message)]
        pub fn approve(&mut self, to: Address, token_id: u128) -> Result<()> {
            let caller = self.env().caller();
            let owner = self.owner_of(token_id).ok_or(Error::TokenNotFound)?;

            if to == owner {
                return Err(Error::NotAllowed);
            }

            if caller != owner && !self.is_approved_for_all(owner, caller) {
                return Err(Error::NotApproved);
            }

            self.token_approvals.insert(token_id, &to);
            self.env().emit_event(Approval {
                owner,
                approved: to,
                token_id,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn set_approval_for_all(&mut self, operator: Address, approved: bool) -> Result<()> {
            let caller = self.env().caller();

            if operator == caller {
                return Err(Error::NotAllowed);
            }

            if approved {
                self.operator_approvals.insert((caller, operator), &());
            } else {
                self.operator_approvals.remove((caller, operator));
            }

            self.env().emit_event(ApprovalForAll {
                owner: caller,
                operator,
                approved,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn transfer(&mut self, to: Address, token_id: u128) -> Result<()> {
            let caller = self.env().caller();
            self.transfer_token_from(&caller, &to, token_id)
        }

        #[ink(message)]
        pub fn transfer_from(&mut self, from: Address, to: Address, token_id: u128) -> Result<()> {
            self.transfer_token_from(&from, &to, token_id)
        }

        // Query messages

        /// Get next token ID (for informational purposes)
        #[ink(message)]
        pub fn next_token_id(&self) -> u128 {
            self.next_token_id
        }

        /// Get specific version from history
        ///
        /// # Arguments
        ///
        /// * `token_id` - Token ID
        /// * `version` - Version number (1-indexed)
        ///
        /// # Returns
        ///
        /// VersionHistory if found, None otherwise
        ///
        /// # Example
        ///
        /// ```ignore
        /// let v1 = contract.get_version(token_id, 1);  // Get original version
        /// let v2 = contract.get_version(token_id, 2);  // Get second version
        /// ```
        #[ink(message)]
        pub fn get_version(&self, token_id: u128, version: u32) -> Option<VersionHistory> {
            self.version_history.get((token_id, version))
        }

        /// Get all version history for a passport
        ///
        /// Returns a vector of all versions in ascending order (v1, v2, v3, ...).
        ///
        /// # Arguments
        ///
        /// * `token_id` - Token ID
        ///
        /// # Returns
        ///
        /// Vector of VersionHistory entries (empty if token doesn't exist or has no history)
        ///
        /// # Note
        ///
        /// This iterates from version 1 up to the current version.
        /// For passports with many versions, consider using get_version() for specific versions.
        #[ink(message)]
        pub fn get_version_history(&self, token_id: u128) -> ink::prelude::vec::Vec<VersionHistory> {
            use ink::prelude::vec::Vec;

            // Get current passport to know the latest version
            let record = match self.passports.get(token_id) {
                Some(r) => r,
                None => return Vec::new(),  // Token doesn't exist
            };

            let mut history = Vec::new();

            // Iterate through all versions (1..=current_version)
            for v in 1..=record.version {
                if let Some(entry) = self.version_history.get((token_id, v)) {
                    history.push(entry);
                }
            }

            history
        }

        /// Get the latest N versions
        ///
        /// Useful for displaying recent history without loading all versions.
        ///
        /// # Arguments
        ///
        /// * `token_id` - Token ID
        /// * `limit` - Maximum number of versions to return
        ///
        /// # Returns
        ///
        /// Vector of the most recent versions, in descending order (newest first)
        #[ink(message)]
        pub fn get_recent_versions(&self, token_id: u128, limit: u32) -> ink::prelude::vec::Vec<VersionHistory> {
            use ink::prelude::vec::Vec;

            let record = match self.passports.get(token_id) {
                Some(r) => r,
                None => return Vec::new(),
            };

            let mut history = Vec::new();
            let current_version = record.version;

            // Start from current version and go backwards
            let start = if current_version > limit {
                current_version - limit + 1
            } else {
                1
            };

            for v in (start..=current_version).rev() {
                if let Some(entry) = self.version_history.get((token_id, v)) {
                    history.push(entry);
                }
            }

            history
        }

        /// Find token ID by subject identifier hash
        ///
        /// Enables lookup of passport by product identifier (hashed).
        /// The caller must compute the hash off-chain using the same algorithm:
        /// - ProductClass: SHA-256(productId)
        /// - Batch: SHA-256(productId + "#" + batchNumber)
        /// - Item: SHA-256(productId + "#" + serialNumber)
        ///
        /// # Arguments
        ///
        /// * `subject_id_hash` - SHA-256 hash of the canonical subject identifier
        ///
        /// # Returns
        ///
        /// Token ID if found, None otherwise
        ///
        /// # Example
        ///
        /// ```ignore
        /// // Off-chain: Compute hash
        /// let hash = sha256("GTIN-123#LOT-2024-001");  // Batch granularity
        ///
        /// // On-chain: Lookup token ID
        /// let token_id = contract.find_token_by_subject_id(hash);
        /// ```
        #[ink(message)]
        pub fn find_token_by_subject_id(&self, subject_id_hash: [u8; 32]) -> Option<u128> {
            self.subject_id_to_token.get(subject_id_hash)
        }

        // Internal ownership helpers

        fn transfer_token_from(&mut self, from: &Address, to: &Address, token_id: u128) -> Result<()> {
            let caller = self.env().caller();

            // Require an existing passport record (same lifecycle rules)
            let record = self.passports.get(token_id).ok_or(Error::TokenNotFound)?;
            if record.status == PassportStatus::Revoked {
                return Err(Error::PassportRevoked);
            }

            let owner = self.owner_of(token_id).ok_or(Error::TokenNotFound)?;

            if owner != *from {
                return Err(Error::NotOwner);
            }

            if !self.approved_or_owner(caller, token_id, owner) {
                return Err(Error::NotApproved);
            }

            self.clear_approval(token_id);
            self.remove_token_from(from, token_id)?;
            self.add_token_to(to, token_id)?;

            self.env().emit_event(Transfer {
                from: Some(*from),
                to: Some(*to),
                token_id,
            });

            Ok(())
        }

        fn approved_or_owner(&self, caller: Address, token_id: u128, owner: Address) -> bool {
            caller == owner
                || self.token_approvals.get(token_id) == Some(caller)
                || self.is_approved_for_all(owner, caller)
        }

        fn clear_approval(&mut self, token_id: u128) {
            self.token_approvals.remove(token_id);
        }

        fn remove_token_from(&mut self, from: &Address, token_id: u128) -> Result<()> {
            if !self.token_owner.contains(token_id) {
                return Err(Error::TokenNotFound);
            }

            let count = self
                .owned_tokens_count
                .get(*from)
                .unwrap_or(0)
                .checked_sub(1)
                .ok_or(Error::InvalidInput)?;
            self.owned_tokens_count.insert(*from, &count);
            self.token_owner.remove(token_id);

            Ok(())
        }

        fn add_token_to(&mut self, to: &Address, token_id: u128) -> Result<()> {
            if self.token_owner.contains(token_id) {
                return Err(Error::InvalidInput);
            }

            let count = self
                .owned_tokens_count
                .get(*to)
                .unwrap_or(0)
                .checked_add(1)
                .ok_or(Error::InvalidInput)?;
            self.owned_tokens_count.insert(*to, &count);
            self.token_owner.insert(token_id, to);

            Ok(())
        }
    }

    // Unit tests

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn new_works() {
            let contract = DppContractV2::new();
            assert_eq!(contract.next_token_id(), 0);
        }

        #[ink::test]
        fn register_passport_works() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();
            let dataset_uri = String::from("ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxqvyb3m");
            let payload_hash = [0u8; 32];
            let dataset_type = String::from("application/vc+jwt");

            ink::env::test::set_caller(accounts.alice);

            let token_id = contract
                .register_passport(
                    dataset_uri.clone(),
                    payload_hash,
                    dataset_type.clone(),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            assert_eq!(token_id, 0);

            let record = contract.get_passport(token_id).unwrap();
            assert_eq!(record.token_id, token_id);
            assert_eq!(record.dataset_uri, dataset_uri);
            assert_eq!(record.payload_hash, payload_hash);
            assert_eq!(record.dataset_type, dataset_type);
            assert_eq!(record.version, 1);
            assert_eq!(record.status, PassportStatus::Active);
            assert_eq!(record.granularity, Granularity::Batch);
            assert_eq!(record.subject_id_hash, None);

            assert_eq!(contract.owner_of(token_id), Some(accounts.alice));
            assert_eq!(contract.balance_of(accounts.alice), 1);
        }

        #[ink::test]
        fn register_with_subject_id_hash_works() {
            let mut contract = DppContractV2::new();
            let subject_id_hash = [42u8; 32];

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    Some(subject_id_hash),
                )
                .unwrap();

            let record = contract.get_passport(token_id).unwrap();
            assert_eq!(record.subject_id_hash, Some(subject_id_hash));
            assert_eq!(record.granularity, Granularity::Item);
        }

        #[ink::test]
        fn register_multiple_passports_works() {
            let mut contract = DppContractV2::new();

            let token_id_0 = contract
                .register_passport(
                    String::from("ipfs://cid0"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::ProductClass,
                    None,
                )
                .unwrap();

            let token_id_1 = contract
                .register_passport(
                    String::from("ipfs://cid1"),
                    [1u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            assert_eq!(token_id_0, 0);
            assert_eq!(token_id_1, 1);

            let record_0 = contract.get_passport(token_id_0).unwrap();
            let record_1 = contract.get_passport(token_id_1).unwrap();

            assert_eq!(record_0.dataset_uri, String::from("ipfs://cid0"));
            assert_eq!(record_0.granularity, Granularity::ProductClass);
            assert_eq!(record_1.dataset_uri, String::from("ipfs://cid1"));
            assert_eq!(record_1.granularity, Granularity::Batch);
        }

        #[ink::test]
        fn register_with_empty_uri_fails() {
            let mut contract = DppContractV2::new();

            let result = contract.register_passport(
                String::from(""),
                [0u8; 32],
                String::from("application/vc+jwt"),
                Granularity::Batch,
                None,
            );

            assert_eq!(result, Err(Error::InvalidInput));
        }

        #[ink::test]
        fn register_with_empty_type_fails() {
            let mut contract = DppContractV2::new();

            let result = contract.register_passport(
                String::from("ipfs://cid"),
                [0u8; 32],
                String::from(""),
                Granularity::Batch,
                None,
            );

            assert_eq!(result, Err(Error::InvalidInput));
        }

        #[ink::test]
        fn update_dataset_increments_version() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://old"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            contract
                .update_dataset(
                    token_id,
                    String::from("ipfs://new"),
                    [1u8; 32],
                    String::from("application/vc+jwt"),
                    None,
                )
                .unwrap();

            let record = contract.get_passport(token_id).unwrap();
            assert_eq!(record.version, 2);
            assert_eq!(record.dataset_uri, String::from("ipfs://new"));
            assert_eq!(record.payload_hash, [1u8; 32]);
            // Granularity should remain unchanged
            assert_eq!(record.granularity, Granularity::Batch);
        }

        #[ink::test]
        fn only_issuer_can_update() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();

            ink::env::test::set_caller(accounts.alice);
            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            // Try to update from different account
            ink::env::test::set_caller(accounts.bob);
            let result = contract.update_dataset(
                token_id,
                String::from("ipfs://new"),
                [1u8; 32],
                String::from("application/vc+jwt"),
                None,
            );

            assert_eq!(result, Err(Error::Unauthorized));
        }

        #[ink::test]
        fn update_nonexistent_token_fails() {
            let mut contract = DppContractV2::new();

            let result = contract.update_dataset(
                999,
                String::from("ipfs://new"),
                [1u8; 32],
                String::from("application/vc+jwt"),
                None,
            );

            assert_eq!(result, Err(Error::TokenNotFound));
        }

        #[ink::test]
        fn revoke_prevents_updates() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::ProductClass,
                    None,
                )
                .unwrap();

            contract
                .revoke_passport(token_id, Some(String::from("test reason")))
                .unwrap();

            let result = contract.update_dataset(
                token_id,
                String::from("ipfs://new"),
                [1u8; 32],
                String::from("application/vc+jwt"),
                None,
            );

            assert_eq!(result, Err(Error::PassportRevoked));
        }

        #[ink::test]
        fn revoke_works() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            contract
                .revoke_passport(token_id, Some(String::from("product recalled")))
                .unwrap();

            let record = contract.get_passport(token_id).unwrap();
            assert_eq!(record.status, PassportStatus::Revoked);
        }

        #[ink::test]
        fn only_issuer_can_revoke() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();

            ink::env::test::set_caller(accounts.alice);
            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            // Try to revoke from different account
            ink::env::test::set_caller(accounts.bob);
            let result = contract.revoke_passport(token_id, Some(String::from("reason")));

            assert_eq!(result, Err(Error::Unauthorized));
        }

        #[ink::test]
        fn transfer_works() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();

            ink::env::test::set_caller(accounts.alice);
            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            assert_eq!(contract.owner_of(token_id), Some(accounts.alice));

            contract.transfer(accounts.bob, token_id).unwrap();
            assert_eq!(contract.owner_of(token_id), Some(accounts.bob));
            assert_eq!(contract.balance_of(accounts.alice), 0);
            assert_eq!(contract.balance_of(accounts.bob), 1);
        }

        #[ink::test]
        fn approve_and_transfer_from_works() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();

            ink::env::test::set_caller(accounts.alice);
            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            contract.approve(accounts.charlie, token_id).unwrap();
            assert_eq!(contract.get_approved(token_id), Some(accounts.charlie));

            ink::env::test::set_caller(accounts.charlie);
            contract.transfer_from(accounts.alice, accounts.bob, token_id).unwrap();
            assert_eq!(contract.owner_of(token_id), Some(accounts.bob));
        }

        #[ink::test]
        fn revoked_passport_cannot_transfer() {
            let mut contract = DppContractV2::new();
            let accounts = ink::env::test::default_accounts();

            ink::env::test::set_caller(accounts.alice);
            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            contract.revoke_passport(token_id, None).unwrap();
            let result = contract.transfer(accounts.bob, token_id);
            assert_eq!(result, Err(Error::PassportRevoked));
        }

        #[ink::test]
        fn cannot_revoke_already_revoked() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            contract.revoke_passport(token_id, None).unwrap();

            let result = contract.revoke_passport(token_id, None);
            assert_eq!(result, Err(Error::AlreadyRevoked));
        }

        #[ink::test]
        fn revoke_nonexistent_token_fails() {
            let mut contract = DppContractV2::new();

            let result = contract.revoke_passport(999, None);
            assert_eq!(result, Err(Error::TokenNotFound));
        }

        #[ink::test]
        fn all_granularity_levels_work() {
            let mut contract = DppContractV2::new();

            // ProductClass
            let token_id_0 = contract
                .register_passport(
                    String::from("ipfs://model"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::ProductClass,
                    Some([10u8; 32]),
                )
                .unwrap();

            // Batch
            let token_id_1 = contract
                .register_passport(
                    String::from("ipfs://batch"),
                    [1u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    Some([20u8; 32]),
                )
                .unwrap();

            // Item
            let token_id_2 = contract
                .register_passport(
                    String::from("ipfs://item"),
                    [2u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    Some([30u8; 32]),
                )
                .unwrap();

            let record_0 = contract.get_passport(token_id_0).unwrap();
            let record_1 = contract.get_passport(token_id_1).unwrap();
            let record_2 = contract.get_passport(token_id_2).unwrap();

            assert_eq!(record_0.granularity, Granularity::ProductClass);
            assert_eq!(record_1.granularity, Granularity::Batch);
            assert_eq!(record_2.granularity, Granularity::Item);

            assert_eq!(record_0.subject_id_hash, Some([10u8; 32]));
            assert_eq!(record_1.subject_id_hash, Some([20u8; 32]));
            assert_eq!(record_2.subject_id_hash, Some([30u8; 32]));
        }

        #[ink::test]
        fn get_nonexistent_passport_returns_none() {
            let contract = DppContractV2::new();
            assert_eq!(contract.get_passport(999), None);
        }

        #[ink::test]
        fn update_with_empty_uri_fails() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Batch,
                    None,
                )
                .unwrap();

            let result = contract.update_dataset(
                token_id,
                String::from(""), // Empty URI
                [1u8; 32],
                String::from("application/vc+jwt"),
                None,
            );

            assert_eq!(result, Err(Error::InvalidInput));
        }

        #[ink::test]
        fn update_with_empty_type_fails() {
            let mut contract = DppContractV2::new();

            let token_id = contract
                .register_passport(
                    String::from("ipfs://cid"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::Item,
                    None,
                )
                .unwrap();

            let result = contract.update_dataset(
                token_id,
                String::from("ipfs://new"),
                [1u8; 32],
                String::from(""), // Empty type
                None,
            );

            assert_eq!(result, Err(Error::InvalidInput));
        }

        #[ink::test]
        fn granularity_remains_immutable_after_update() {
            let mut contract = DppContractV2::new();

            // Register with ProductClass
            let token_id = contract
                .register_passport(
                    String::from("ipfs://old"),
                    [0u8; 32],
                    String::from("application/vc+jwt"),
                    Granularity::ProductClass,
                    Some([42u8; 32]),
                )
                .unwrap();

            // Update dataset
            contract
                .update_dataset(
                    token_id,
                    String::from("ipfs://new"),
                    [1u8; 32],
                    String::from("application/vc+jwt"),
                    Some([99u8; 32]),
                )
                .unwrap();

            let record = contract.get_passport(token_id).unwrap();
            
            // Granularity should NOT have changed
            assert_eq!(record.granularity, Granularity::ProductClass);
            
            // But other fields should have updated
            assert_eq!(record.dataset_uri, String::from("ipfs://new"));
            assert_eq!(record.payload_hash, [1u8; 32]);
            assert_eq!(record.subject_id_hash, Some([99u8; 32]));
            assert_eq!(record.version, 2);
        }
    }
}
