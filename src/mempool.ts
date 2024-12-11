import { Transaction, BLOCKCHAIN_CONSTANTS } from './types';
import { Blockchain } from './blockchain';

export class Mempool {
    private pendingTransactions: Map<string, Transaction>;
    private blockchain: Blockchain;
    private maxTransactions: number;
    private transactionTimeout: number; // milliseconds

    constructor(
        blockchain: Blockchain, 
        maxTransactions: number = BLOCKCHAIN_CONSTANTS.MAX_TRANSACTIONS_PER_BLOCK,
        transactionTimeout: number = 3600000 // 1 hour default
    ) {
        this.pendingTransactions = new Map();
        this.blockchain = blockchain;
        this.maxTransactions = maxTransactions;
        this.transactionTimeout = transactionTimeout;
    }

    public addTransaction(transaction: Transaction): boolean {
        console.log('Adding transaction to mempool:', transaction.id);
        // Don't add if mempool is full
        if (this.pendingTransactions.size >= this.maxTransactions) {
            console.log('Mempool is full, rejecting transaction');
            return false;
        }

        // Don't add if transaction already exists
        if (this.pendingTransactions.has(transaction.id)) {
            console.log('Transaction already in mempool');
            return false;
        }

        // Don't add coinbase transactions to mempool
        if (transaction.isCoinbase) {
            console.log('Coinbase transactions cannot be added to mempool');
            return false;
        }

        // Validate transaction
        if (!this.validateTransaction(transaction)) {
            console.log('Transaction failed validation');
            return false;
        }

        // Add to mempool
        this.pendingTransactions.set(transaction.id, transaction);
        console.log('Transaction added successfully. Mempool size:', this.pendingTransactions.size);
        console.log('Current mempool transactions:', Array.from(this.pendingTransactions.keys()));
        return true;
    }

    private validateTransaction(transaction: Transaction): boolean {
        try {
            // Basic transaction validation
            if (!this.blockchain.validateTransaction(transaction)) {
                console.log('Transaction failed blockchain validation');
                return false;
            }

            // Check if transaction is too old
            const now = Date.now();
            if (now - transaction.timestamp > this.transactionTimeout) {
                console.log('Transaction is too old');
                return false;
            }

            // Skip balance check for coinbase transactions
            if (transaction.isCoinbase || !transaction.sender) {
                return true;
            }

            // Check for double-spending within mempool
            const pendingBalance = this.getPendingBalance(transaction.sender);
            const senderBalance = this.blockchain.getAccountBalance(transaction.sender);

            if (pendingBalance + transaction.amount > senderBalance.confirmed) {
                console.log('Insufficient balance including pending transactions');
                console.log('Required:', pendingBalance + transaction.amount);
                console.log('Available:', senderBalance.confirmed);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error validating transaction:', error);
            return false;
        }
    }

    public getTransactions(limit: number = this.maxTransactions): Transaction[] {
        console.log('Getting transactions from mempool. Current size:', this.pendingTransactions.size);
        console.log('Current mempool transactions:', Array.from(this.pendingTransactions.keys()));
        
        // Convert map to array and sort by timestamp (oldest first)
        const transactions = Array.from(this.pendingTransactions.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(0, limit);
            
        console.log('Returning transactions:', transactions.map(tx => tx.id));
        return transactions;
    }

    public removeTransaction(transactionId: string): void {
        this.pendingTransactions.delete(transactionId);
    }

    public removeTransactions(transactions: Transaction[]): void {
        transactions.forEach(transaction => {
            this.pendingTransactions.delete(transaction.id);
        });
    }

    public clear(): void {
        this.pendingTransactions.clear();
    }

    public getPendingBalance(address: string): number {
        return Array.from(this.pendingTransactions.values())
            .filter(tx => tx.sender === address)
            .reduce((sum, tx) => sum + tx.amount, 0);
    }

    public cleanup(): void {
        const now = Date.now();
        const expiredTransactions = Array.from(this.pendingTransactions.values())
            .filter(tx => now - tx.timestamp > this.transactionTimeout);

        expiredTransactions.forEach(tx => {
            this.pendingTransactions.delete(tx.id);
            console.log(`Removed expired transaction ${tx.id} from mempool`);
        });
    }

    public size(): number {
        return this.pendingTransactions.size;
    }

    public hasTransaction(transactionId: string): boolean {
        return this.pendingTransactions.has(transactionId);
    }

    public getTransaction(transactionId: string): Transaction | undefined {
        return this.pendingTransactions.get(transactionId);
    }
}