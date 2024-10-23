import * as crypto from 'crypto';
import { KeyPair } from './types';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ITERATION_COUNT = 100000;

function generateMasterKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
        password,
        salt,
        ITERATION_COUNT,
        KEY_LENGTH,
        'sha256'
    );
}

export function encrypt(data: string, password: string): string {
    try {
        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        const masterKey = generateMasterKey(password, salt);

        const cipher = crypto.createCipheriv(
            ENCRYPTION_ALGORITHM,
            masterKey,
            iv
        );

        let encryptedData = cipher.update(data, 'utf8', 'hex');
        encryptedData += cipher.final('hex');

        // Get authentication tag
        const authTag = cipher.getAuthTag();
        
        // Validate auth tag length before proceeding
        if (authTag.length !== AUTH_TAG_LENGTH) {
            throw new Error(`Invalid auth tag length during encryption: ${authTag.length}`);
        }

        // Format: salt:iv:authTag:encryptedData
        const result = `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encryptedData}`;

        // Validate the encrypted format before returning
        if (!validateEncryptedFormat(result)) {
            throw new Error('Generated encrypted data does not match expected format');
        }

        return result;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error(`Failed to encrypt data: ${error}`);
    }
}

export function decrypt(encryptedData: string, password: string): string {
    try {
        // Add format validation before attempting decryption
        if (!validateEncryptedFormat(encryptedData)) {
            throw new Error('Invalid encrypted data format');
        }

        const [saltHex, ivHex, authTagHex, data] = encryptedData.split(':');

        // Add component validation with detailed error messages
        if (saltHex.length !== SALT_LENGTH * 2) {
            throw new Error(`Invalid salt length: ${saltHex.length/2} bytes`);
        }
        if (ivHex.length !== IV_LENGTH * 2) {
            throw new Error(`Invalid IV length: ${ivHex.length/2} bytes`);
        }
        if (authTagHex.length !== AUTH_TAG_LENGTH * 2) {
            throw new Error(`Invalid auth tag length: ${authTagHex.length/2} bytes`);
        }

        // Add hex validation
        const isValidHex = (str: string) => /^[0-9a-fA-F]+$/.test(str);
        if (!isValidHex(saltHex) || !isValidHex(ivHex) || !isValidHex(authTagHex) || !isValidHex(data)) {
            throw new Error('Invalid hex encoding in encrypted data');
        }

        const salt = Buffer.from(saltHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const masterKey = generateMasterKey(password, salt);

        const decipher = crypto.createDecipheriv(
            ENCRYPTION_ALGORITHM,
            masterKey,
            iv
        );

        // Debug log the lengths
        console.debug('Decryption components lengths:', {
            salt: salt.length,
            iv: iv.length,
            authTag: authTag.length,
            data: data.length / 2 // hex string length is double the byte length
        });

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        throw new Error(`Failed to decrypt data - ${error}`);
    }
}

export function validateEncryptedFormat(encryptedData: string): boolean {
    if (!encryptedData || typeof encryptedData !== 'string') {
        console.error('Invalid input: encryptedData must be a non-empty string');
        return false;
    }

    const parts = encryptedData.split(':');
    
    // Debug log the parts lengths
    console.debug('Validating encrypted format parts:', {
        totalParts: parts.length,
        saltLength: parts[0]?.length,
        ivLength: parts[1]?.length,
        authTagLength: parts[2]?.length,
        dataLength: parts[3]?.length
    });

    return parts.length === 4 &&
        parts[0].length === SALT_LENGTH * 2 &&
        parts[1].length === IV_LENGTH * 2 &&
        parts[2].length === AUTH_TAG_LENGTH * 2 &&
        parts[3]?.length > 0; // Ensure we have some encrypted data
}

// Rest of the functions remain the same
export function generateEncryptionKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

export function generateId(): string {
    return crypto.randomBytes(16).toString('hex');
}

export function createKeyPair(): KeyPair {
    let pair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { 'privateKey': pair.privateKey, 'publicKey': pair.publicKey };
}