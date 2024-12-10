export interface PeerMessage {
    type: 'TRANSACTION' | 'BLOCK' | 'PEER_DISCOVERY' | 'CHAIN_REQUEST' | 'CHAIN_RESPONSE';
    payload: any;
    sender: string;
    timestamp: number;
}

export interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export interface Transaction {
    // Unique identifier for the transaction
    id: string;
    // Public key of the sender (null for coinbase transactions)
    sender: string | null;
    // Public key of the recipient
    recipient: string;
    // Amount being transferred
    amount: number;
    // Unix timestamp of when transaction was created
    timestamp: number;
    // Digital signature of the transaction
    signature?: string;
    // Flag to identify coinbase transactions
    isCoinbase: boolean;
}

export interface Block {
    // Block number in the chain
    index: number;
    // Hash of the previous block
    previousHash: string;
    // Unix timestamp of block creation
    timestamp: number;
    // List of transactions in this block
    transactions: Transaction[];
    // Nonce used for mining
    nonce: number;
    // Hash of this block
    hash: string;
    // Public key of the miner who created this block
    miner: string;
    // Block mining reward amount
    reward: number;
}

// Constants for the blockchain
export const BLOCKCHAIN_CONSTANTS = {
    // Initial block mining reward
    INITIAL_BLOCK_REWARD: 50,
    // Number of blocks between reward halvings
    HALVING_INTERVAL: 210000,
    // Initial mining difficulty (number of leading zeros required)
    INITIAL_DIFFICULTY: 4,
    // Target time between blocks in seconds
    TARGET_BLOCK_TIME: 600, // 10 minutes
    // Maximum number of transactions per block (excluding coinbase)
    MAX_TRANSACTIONS_PER_BLOCK: 2000,
    // Number of confirmations required for a transaction to be considered final
    REQUIRED_CONFIRMATIONS: 6
};

// Transaction-related constants
export const TRANSACTION_CONSTANTS = {
    // Minimum transaction amount
    MIN_TRANSACTION: 0.00000001,
    // Maximum coins that will ever exist
    MAX_SUPPLY: 21000000,
    // Number of confirmations required for a transaction to be considered final
    REQUIRED_CONFIRMATIONS: 6
};

// Status of a transaction in the blockchain
export enum TransactionStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    REJECTED = 'REJECTED'
}

// Type for tracking transaction confirmations
export interface TransactionConfirmation {
    transactionId: string;
    blockHeight: number;
    confirmations: number;
    status: TransactionStatus;
}

// Type for balance tracking
export interface AccountBalance {
    address: string;            // Public key of the account
    confirmed: number;          // Balance confirmed in blockchain
    pending: number;           // Balance in pending transactions
    lastUpdated: number;       // Timestamp of last balance update
}