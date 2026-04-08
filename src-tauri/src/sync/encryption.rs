use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    XChaCha20Poly1305, XNonce,
};
use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
use rand::RngCore;
use super::error::SyncError;

const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

/// Derive a 256-bit encryption key from a passphrase + salt using Argon2id.
pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], SyncError> {
    use argon2::{Algorithm, Version, Params};

    let params = Params::new(
        65536,  // 64 MB memory
        3,      // 3 iterations
        1,      // 1 degree of parallelism
        Some(KEY_LEN),
    ).map_err(|e| SyncError::Encryption(format!("Argon2 params error: {}", e)))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; KEY_LEN];
    argon2.hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| SyncError::Encryption(format!("Key derivation failed: {}", e)))?;

    Ok(key)
}

/// Generate a random salt for key derivation.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypt plaintext using XChaCha20-Poly1305.
/// Returns: nonce (24 bytes) || ciphertext
pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Vec<u8>, SyncError> {
    let cipher = XChaCha20Poly1305::new(key.into());

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| SyncError::Encryption(format!("Encryption failed: {}", e)))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt data encrypted by `encrypt()`.
/// Input: nonce (24 bytes) || ciphertext
pub fn decrypt(key: &[u8; KEY_LEN], data: &[u8]) -> Result<Vec<u8>, SyncError> {
    if data.len() < NONCE_LEN {
        return Err(SyncError::Encryption("Data too short to contain nonce".into()));
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = XNonce::from_slice(nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&key[..])
        .map_err(|e| SyncError::Encryption(format!("Invalid key: {}", e)))?;

    cipher.decrypt(nonce, ciphertext)
        .map_err(|e| SyncError::Encryption(format!("Decryption failed (wrong passphrase?): {}", e)))
}

/// Hash the passphrase for verification (stored on Drive so new devices can verify).
pub fn hash_passphrase_for_verification(passphrase: &str) -> Result<String, SyncError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(passphrase.as_bytes(), &salt)
        .map_err(|e| SyncError::Encryption(format!("Passphrase hashing failed: {}", e)))?;
    Ok(hash.to_string())
}

/// Verify a passphrase against a stored hash.
pub fn verify_passphrase(passphrase: &str, hash: &str) -> bool {
    use argon2::PasswordVerifier;
    let parsed = match argon2::PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default().verify_password(passphrase.as_bytes(), &parsed).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let salt = generate_salt();
        let key = derive_key("test-passphrase-123", &salt).unwrap();

        let plaintext = b"Hello, ClipPaste sync!";
        let encrypted = encrypt(&key, plaintext).unwrap();

        assert_ne!(&encrypted[NONCE_LEN..], plaintext);
        assert!(encrypted.len() > plaintext.len());

        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_key_fails() {
        let salt = generate_salt();
        let key1 = derive_key("correct-passphrase", &salt).unwrap();
        let key2 = derive_key("wrong-passphrase", &salt).unwrap();

        let encrypted = encrypt(&key1, b"secret data").unwrap();
        assert!(decrypt(&key2, &encrypted).is_err());
    }

    #[test]
    fn passphrase_verification() {
        let hash = hash_passphrase_for_verification("my-sync-password").unwrap();
        assert!(verify_passphrase("my-sync-password", &hash));
        assert!(!verify_passphrase("wrong-password", &hash));
    }

    #[test]
    fn empty_data_encrypt() {
        let salt = generate_salt();
        let key = derive_key("passphrase", &salt).unwrap();
        let encrypted = encrypt(&key, b"").unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"");
    }

    #[test]
    fn large_data_encrypt() {
        let salt = generate_salt();
        let key = derive_key("passphrase", &salt).unwrap();
        let data = vec![42u8; 1_000_000]; // 1MB
        let encrypted = encrypt(&key, &data).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, data);
    }
}
