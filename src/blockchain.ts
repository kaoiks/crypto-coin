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
        // Skip additional validation for coinbase transactions
        if (transaction.isCoinbase) {
            return true;
        }
    
        // Verify basic transaction properties
        if (!transaction.sender || !transaction.recipient || transaction.amount <= 0) {
            console.log('Transaction validation failed: Invalid basic properties');
            return false;
        }
    
        // Verify signature
        if (!this.verifyTransactionSignature(transaction)) {
            console.log('Transaction validation failed: Invalid signature');
            return false;
        }
    
        return true;
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

    public getAccountBalance(address: string): AccountBalance {
        console.log(`Calculating balance for address: ${address}`);
        
        // Get or create balance object
        let balance = this.balances.get(address) || {
            address,
            confirmed: 0,
            pending: 0,
            lastUpdated: Date.now()
        };
    
        // Calculate balance from entire chain
        let runningBalance = 0;
        this.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                if (transaction.sender === address) {
                    runningBalance -= transaction.amount;
                }
                if (transaction.recipient === address) {
                    runningBalance += transaction.amount;
                }
            });
        });
    
        balance.confirmed = runningBalance;
        balance.lastUpdated = Date.now();
        this.balances.set(address, balance);
        
        return balance;
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