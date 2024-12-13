import * as crypto from 'crypto';
import { Block, Transaction, BLOCKCHAIN_CONSTANTS, AccountBalance, TransactionStatus, TransactionConfirmation } from './types';

export class Blockchain {
    private chain: Block[];
    private difficulty: number;
    private balances: Map<string, AccountBalance>;
    private transactionConfirmations: Map<string, TransactionConfirmation>;

    constructor(difficulty: number = BLOCKCHAIN_CONSTANTS.INITIAL_DIFFICULTY) {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = difficulty;
        this.balances = new Map();
        this.transactionConfirmations = new Map();
    }

    private createGenesisBlock(): Block {
        const genesisBlock: Block = {
            index: 0,
            previousHash: "0".repeat(this.difficulty) + "1" + "0".repeat(63 - this.difficulty),
            timestamp: 1700000000000,
            transactions: [],
            nonce: 0,
            hash: "",
            miner: "GENESIS",
            reward: 0
        };

        genesisBlock.hash = this.calculateHash(genesisBlock);
        return genesisBlock;
    }

    private calculateHash(block: Block): string {
        const data = JSON.stringify({
            index: block.index,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            transactions: block.transactions,
            nonce: block.nonce,
            miner: block.miner,
            reward: block.reward
        });

        return crypto.createHash('sha256').update(data).digest('hex');
    }

    public createBlock(data: { transactions: Transaction[], miner: string, reward: number }): Block {
        const previousBlock = this.getLastBlock();
        const newBlock: Block = {
            index: previousBlock.index + 1,
            previousHash: previousBlock.hash,
            timestamp: Date.now(),
            transactions: data.transactions,
            nonce: 0,
            hash: "",
            miner: data.miner,
            reward: data.reward
        };

        this.mineBlock(newBlock);
        this.chain.push(newBlock);
        
        // Update balances and confirmations for all transactions in the block
        this.processBlockTransactions(newBlock);
        
        return newBlock;
    }

    private mineBlock(block: Block): void {
        const target = "0".repeat(this.difficulty);
        
        while (true) {
            block.hash = this.calculateHash(block);
            if (block.hash.substring(0, this.difficulty) === target) {
                console.log(`Block mined! Hash: ${block.hash}`);
                return;
            }
            block.nonce++;
        }
    }

    private processBlockTransactions(block: Block): void {
        block.transactions.forEach(transaction => {
            // Update transaction confirmations
            this.updateTransactionConfirmation(transaction.id, block.index);
            
            // Update account balances
            this.updateBalances(transaction);
        });

        // Update confirmation counts for all tracked transactions
        this.updateAllConfirmations(block.index);
    }

    private updateTransactionConfirmation(transactionId: string, blockHeight: number): void {
        const confirmation: TransactionConfirmation = {
            transactionId,
            blockHeight,
            confirmations: 0,
            status: TransactionStatus.CONFIRMED
        };
        this.transactionConfirmations.set(transactionId, confirmation);
    }

    private updateAllConfirmations(currentBlockHeight: number): void {
        this.transactionConfirmations.forEach(confirmation => {
            confirmation.confirmations = currentBlockHeight - confirmation.blockHeight + 1;
            if (confirmation.confirmations >= BLOCKCHAIN_CONSTANTS.REQUIRED_CONFIRMATIONS) {
                confirmation.status = TransactionStatus.CONFIRMED;
            }
        });
    }

    private updateBalances(transaction: Transaction): void {
        // Handle sender balance (except for coinbase transactions)
        if (!transaction.isCoinbase && transaction.sender) {
            const senderBalance = this.getAccountBalance(transaction.sender);
            senderBalance.confirmed -= transaction.amount;
            this.balances.set(transaction.sender, senderBalance);
        }

        // Handle recipient balance
        const recipientBalance = this.getAccountBalance(transaction.recipient);
        recipientBalance.confirmed += transaction.amount;
        this.balances.set(transaction.recipient, recipientBalance);
    }

    public validateCoinbaseTransaction(transaction: Transaction, blockIndex: number): boolean {
        if (!transaction.isCoinbase) {
            return false;
        }

        // Calculate expected reward
        const halvings = Math.floor(blockIndex / BLOCKCHAIN_CONSTANTS.HALVING_INTERVAL);
        const expectedReward = BLOCKCHAIN_CONSTANTS.INITIAL_BLOCK_REWARD / Math.pow(2, halvings);

        // Verify reward amount
        if (transaction.amount !== expectedReward) {
            console.log(`Invalid coinbase amount. Expected: ${expectedReward}, Got: ${transaction.amount}`);
            return false;
        }

        // Verify signature
        if (!this.verifyTransactionSignature(transaction)) {
            console.log('Invalid coinbase signature');
            return false;
        }

        return true;
    }

    public validateTransaction(transaction: Transaction): boolean {
        if (transaction.isCoinbase) {
            return true;
        }
    
        if (!transaction.sender || !transaction.recipient || transaction.amount <= 0) {
            console.log('Transaction validation failed: Invalid basic properties');
            return false;
        }
    
        // Check if recipient's public key is in valid format
        if (!transaction.recipient.includes('-----BEGIN PUBLIC KEY-----') || 
            !transaction.recipient.includes('-----END PUBLIC KEY-----')) {
            console.log('Transaction validation failed: Invalid recipient format');
            return false;
        }
    
        // Verify sender has sufficient balance
        const senderBalance = this.getAccountBalance(transaction.sender);
        if (senderBalance.confirmed < transaction.amount) {
            console.log('Transaction validation failed: Insufficient balance');
            console.log('Required:', transaction.amount);
            console.log('Available:', senderBalance.confirmed);
            return false;
        }
    
        // Verify signature
        return this.verifyTransactionSignature(transaction);
    }
    

    private verifyTransactionSignature(transaction: Transaction): boolean {
        if (!transaction.signature) {
            console.log('Transaction validation failed: Missing signature');
            return false;
        }
    
        const transactionData = JSON.stringify({
            id: transaction.id,
            sender: transaction.sender,
            recipient: transaction.recipient,
            amount: transaction.amount,
            timestamp: transaction.timestamp,
            isCoinbase: transaction.isCoinbase
        });
    
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(transactionData);
            
            // For coinbase transactions, verify against miner's public key
            const publicKey = transaction.isCoinbase ? transaction.recipient : transaction.sender;
            
            if (!publicKey) {
                console.log('Transaction validation failed: No public key available for verification');
                return false;
            }
    
            const result = verify.verify(publicKey, transaction.signature, 'hex');
            if (!result) {
                console.log('Transaction validation failed: Signature verification failed');
            }
            return result;
        } catch (error) {
            console.log('Transaction validation failed: Error during signature verification:', error);
            return false;
        }
    }

   // Modify getAccountBalance to use the normalized keys
public getAccountBalance(address: string): AccountBalance {
    console.log(`Calculating balance for address: ${address}`);
    
    // Initialize new account balance or get existing
    const normalizedAddress = this.normalizePublicKey(address);
    let balance = this.balances.get(normalizedAddress) || {
        address: normalizedAddress,
        confirmed: 0,
        pending: 0,
        lastUpdated: Date.now()
    };

    // Reset confirmed balance before recalculating
    balance.confirmed = 0;

    // Calculate balance by traversing the entire chain
    this.chain.forEach((block) => {
        block.transactions.forEach(transaction => {
            const normalizedSender = transaction.sender ? this.normalizePublicKey(transaction.sender) : null;
            const normalizedRecipient = this.normalizePublicKey(transaction.recipient);
            
            // Handle amounts sent
            if (normalizedSender === normalizedAddress) {
                balance.confirmed -= transaction.amount;
            }
            // Handle amounts received
            if (normalizedRecipient === normalizedAddress) {
                balance.confirmed += transaction.amount;
                console.log(`Added ${transaction.amount} to ${address} from transaction ${transaction.id}`);
            }
        });
    });

    console.log(`Final balance for ${address}: ${balance.confirmed}`);
    
    // Update stored balance
    this.balances.set(normalizedAddress, balance);
    return balance;
}

private normalizePublicKey(key: string): string {
    return key.replace(/\r\n/g, '\n').trim();
}

    public validateTransactionBalance(transaction: Transaction, balanceAtPoint: number): boolean {
        if (transaction.isCoinbase) {
            return true;
        }
    
        if (!transaction.sender) {
            return false;
        }
    
        if (balanceAtPoint < transaction.amount) {
            console.log('Insufficient balance for transaction:', transaction.id);
            console.log('Required:', transaction.amount, 'Available:', balanceAtPoint);
            return false;
        }
    
        return true;
    }

    public getTransactionHistory(address: string): Transaction[] {
        const transactions: Transaction[] = [];
        
        this.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                if (transaction.sender === address || transaction.recipient === address) {
                    transactions.push(transaction);
                }
            });
        });

        return transactions;
    }

    public getTransactionConfirmation(transactionId: string): TransactionConfirmation | undefined {
        return this.transactionConfirmations.get(transactionId);
    }

    // In blockchain.ts
public replaceChain(newChain: Block[]): void {
    if (newChain.length <= this.chain.length) {
        throw new Error('New chain must be longer than current chain');
    }

    // Reset balances before chain replacement
    this.balances.clear();
    this.transactionConfirmations.clear();

    // Set genesis block
    this.chain = [newChain[0]];
    
    // Initialize balances map with AccountBalance objects
    const blockBalances = new Map<string, AccountBalance>();
    
    // Validate and add each block
    for (let i = 1; i < newChain.length; i++) {
        const block = newChain[i];
        let isValid = true;

        // Process block transactions to update balances
        for (const tx of block.transactions) {
            if (tx.isCoinbase) {
                if (!this.validateCoinbaseTransaction(tx, block.index)) {
                    isValid = false;
                    break;
                }
                const recipientBalance = blockBalances.get(tx.recipient) || {
                    address: tx.recipient,
                    confirmed: 0,
                    pending: 0,
                    lastUpdated: Date.now()
                };
                recipientBalance.confirmed += tx.amount;
                blockBalances.set(tx.recipient, recipientBalance);
            } else {
                if (!tx.sender) continue;
                
                const senderBalance = blockBalances.get(tx.sender) || {
                    address: tx.sender,
                    confirmed: 0,
                    pending: 0,
                    lastUpdated: Date.now()
                };

                if (senderBalance.confirmed < tx.amount) {
                    isValid = false;
                    break;
                }

                // Update sender balance
                senderBalance.confirmed -= tx.amount;
                blockBalances.set(tx.sender, senderBalance);

                // Update recipient balance
                const recipientBalance = blockBalances.get(tx.recipient) || {
                    address: tx.recipient,
                    confirmed: 0,
                    pending: 0,
                    lastUpdated: Date.now()
                };
                recipientBalance.confirmed += tx.amount;
                blockBalances.set(tx.recipient, recipientBalance);
            }
        }
        
        if (!isValid) {
            throw new Error(`Invalid block at height ${block.index}`);
        }
        
        // If block is valid, update chain and balances
        this.chain.push(block);
        blockBalances.forEach((balance, address) => {
            this.balances.set(address, balance);
        });
        
        // Update confirmations
        block.transactions.forEach(tx => {
            this.updateTransactionConfirmation(tx.id, block.index);
        });
    }

    console.log('Chain replaced and balances recalculated');
}

    private validateBlock(block: Block, previousBlock: Block): boolean {
        if (block.previousHash !== previousBlock.hash) {
            return false;
        }

        // Validate coinbase transaction
        const coinbaseTransaction = block.transactions.find(tx => tx.isCoinbase);
        if (!coinbaseTransaction || !this.validateCoinbaseTransaction(coinbaseTransaction, block.index)) {
            return false;
        }

        // Validate other transactions
        const regularTransactions = block.transactions.filter(tx => !tx.isCoinbase);
        for (const transaction of regularTransactions) {
            if (!this.validateTransaction(transaction)) {
                return false;
            }
        }

        return true;
    }

    public getDifficulty(): number {
        return this.difficulty;
    }

    public getChain(): Block[] {
        return this.chain;
    }

    public getLastBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    public isValid(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            if (!this.validateBlock(this.chain[i], this.chain[i-1])) {
                return false;
            }
        }
        return true;
    }
}