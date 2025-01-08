import { NetworkManager } from './network-manager';
import { Block, Transaction, BLOCKCHAIN_CONSTANTS, PeerMessage } from './types';
import { DigitalWallet } from './wallet';
import * as crypto from 'crypto';

export class MiningNode extends NetworkManager {
    private currentMiningBlock: Block | null;
    private isMining: boolean;
    private miningInterval: NodeJS.Timeout | null;
    private miningWallet: DigitalWallet | null;
    

    constructor(difficulty: number = 4) {
        // Pass isMiningNode flag to NetworkManager
        super(undefined, difficulty, true);
        this.currentMiningBlock = null;
        this.isMining = false;
        this.miningInterval = null;
        this.miningWallet = null;
    }

    public connectMiningWallet(wallet: DigitalWallet): void {
        this.miningWallet = wallet;
        console.log(`Mining wallet connected: ${wallet.getWalletId()}`);
        // Start mining immediately after wallet is connected
        this.startMining();
    }

    private createCoinbaseTransaction(blockIndex: number): Transaction {
        if (!this.miningWallet) {
            throw new Error('No mining wallet connected');
        }

        const currentIdentity = this.miningWallet.getCurrentIdentity();
        if (!currentIdentity) {
            throw new Error('No active identity in mining wallet');
        }

        // Calculate reward based on block height
        const halvings = Math.floor(blockIndex / BLOCKCHAIN_CONSTANTS.HALVING_INTERVAL);
        const reward = BLOCKCHAIN_CONSTANTS.INITIAL_BLOCK_REWARD / Math.pow(2, halvings);

        // Create transaction without signature first
        const coinbaseTransaction: Transaction = {
            id: crypto.randomBytes(32).toString('hex'),
            sender: null,
            recipient: currentIdentity.getPublicKey(),
            amount: reward,
            timestamp: Date.now(),
            isCoinbase: true,
            signature: undefined
        };

        // Create the exact string that will be used for verification
        const transactionData = JSON.stringify({
            id: coinbaseTransaction.id,
            sender: null,
            recipient: coinbaseTransaction.recipient,
            amount: coinbaseTransaction.amount,
            timestamp: coinbaseTransaction.timestamp,
            isCoinbase: true
        });

        // Sign with mining wallet's private key
        const sign = crypto.createSign('SHA256');
        sign.update(transactionData);
        coinbaseTransaction.signature = sign.sign(currentIdentity.getPrivateKey(), 'hex');

        return coinbaseTransaction;
    }

    

    public override async start(port: number): Promise<void> {
        await super.start(port);
        console.log(`Mining node started on port ${port}`);
        
        if (this.miningWallet) {
            this.startMining();
        } else {
            console.log('Mining paused: No wallet connected. Connect a wallet to begin mining.');
        }
    }

    public startMining(): void {
        if (this.isMining || !this.miningWallet) {
            return;
        }

        this.isMining = true;
        console.log('Starting mining operations...');

        this.miningInterval = setInterval(async () => {
            try {
                // Verify we're mining at correct height before continuing
                if (this.currentMiningBlock) {
                    const expectedHeight = this.blockchain.getChain().length;
                    if (this.currentMiningBlock.index !== expectedHeight) {
                        console.log(`Height mismatch. Mining block ${this.currentMiningBlock.index} but chain height is ${expectedHeight}. Resetting...`);
                        this.currentMiningBlock = null;
                    }
                }

                // Only start new block if we're not already mining one
                if (!this.currentMiningBlock) {
                    this.prepareNewBlock();
                }

                // Try to mine the current block
                if (this.currentMiningBlock) {
                    const success = this.tryMineBlock(this.currentMiningBlock);
                    if (success) {
                        // Double check height before accepting our mined block
                        if (this.currentMiningBlock.index === this.blockchain.getChain().length) {
                            this.handleMinedBlock(this.currentMiningBlock);
                        } else {
                            console.log('Mined block at wrong height, discarding');
                        }
                        this.currentMiningBlock = null;
                    }
                }
            } catch (error) {
                console.error('Error during mining:', error);
                this.stopMining();
            }
        }, 1000); // Check every second
    }
    
    protected broadcastMessage(message: PeerMessage): void {
        this.getNode().broadcastMessage(message);
    }

    private mineBlock(block: Block): void {
        const target = "0".repeat(this.blockchain.getDifficulty());
        
        while (true) {
            block.hash = this.calculateBlockHash(block);
            if (block.hash.substring(0, this.blockchain.getDifficulty()) === target) {
                console.log(`Block mined! Hash: ${block.hash}`);
                return;
            }
            block.nonce++;
        }
    }

    public stopMining(): void {
        if (this.miningInterval) {
            clearInterval(this.miningInterval);
            this.miningInterval = null;
        }
        this.isMining = false;
        this.currentMiningBlock = null;
        console.log('Mining operations stopped');
    }

    public override stop(): void {
        this.stopMining();
        this.miningWallet = null;
        super.stop();
    }

    public disconnectWallet(): void {
        this.stopMining();
        this.miningWallet = null;
        console.log('Mining wallet disconnected');
    }

    public isWalletConnected(): boolean {
        return this.miningWallet !== null;
    }

    public getMiningWalletId(): string | null {
        return this.miningWallet?.getWalletId() || null;
    }

    public getCurrentMiningAddress(): string | null {
        return this.miningWallet?.getCurrentIdentity()?.getPublicKey() || null;
    }

    

    private tryMineBlock(block: Block): boolean {
        const target = "0".repeat(this.blockchain.getDifficulty());
        const MAX_NONCE_ATTEMPTS = 1000; // Limit attempts per interval
        
        for (let i = 0; i < MAX_NONCE_ATTEMPTS; i++) {
            block.hash = this.calculateBlockHash(block);
            if (block.hash.substring(0, this.blockchain.getDifficulty()) === target) {
                return true;
            }
            block.nonce++;
        }
        return false;
    }

    



    private prepareNewBlock(): void {
        const currentChain = this.blockchain.getChain();
        const lastBlock = currentChain[currentChain.length - 1];
        const blockIndex = lastBlock.index + 1;
    
        console.log(`Preparing to mine block at height ${blockIndex}. Current chain height: ${currentChain.length}`);
    
        // Create coinbase transaction
        const coinbaseTransaction = this.createCoinbaseTransaction(blockIndex);
        
        // Get pending transactions from mempool
        const pendingTransactions = this.mempool.getTransactions(
            BLOCKCHAIN_CONSTANTS.MAX_TRANSACTIONS_PER_BLOCK - 1
        );
        
        // Create new block
        const transactions = [coinbaseTransaction, ...pendingTransactions];
        const currentIdentity = this.miningWallet!.getCurrentIdentity()!;
        
        this.currentMiningBlock = {
            index: blockIndex,
            previousHash: lastBlock.hash,
            timestamp: Date.now(),
            transactions,
            nonce: 0,
            hash: '',
            miner: currentIdentity.getPublicKey(),
            reward: coinbaseTransaction.amount
        };
    }
    
    private handleMinedBlock(block: Block): void {
        // Validate one final time before broadcasting
        if (this.isValidNewBlock(block)) {
            // Add to our chain
            this.blockchain.getChain().push(block);
            
            // Remove mined transactions from mempool
            const minedTxIds = new Set(block.transactions.map(tx => tx.id));
            Array.from(this.mempool.getTransactions()).forEach(tx => {
                if (minedTxIds.has(tx.id)) {
                    this.mempool.removeTransaction(tx.id);
                }
            });
            
            // Broadcast to network
            this.broadcastNewBlock(block);
            
            console.log(`Successfully mined block at height ${block.index}. New chain height: ${this.blockchain.getChain().length}`);
        }
    }
    
    protected override handleNewBlock(block: Block, sender: string): void {
        console.log(`Mining node received new block from peer ${sender}: ${block.hash}`);
        console.log(`Received block height: ${block.index}. Our current height: ${this.blockchain.getChain().length}`);
        
        try {
            const currentChain = this.blockchain.getChain();
            const lastBlock = currentChain[currentChain.length - 1];

            // Case 1: Block builds on our current chain
            if (block.previousHash === lastBlock.hash) {
                if (this.isValidNewBlock(block)) {
                    // Stop current mining operation
                    if (this.isMining) {
                        this.stopMining();
                    }

                    // Add block to chain
                    this.blockchain.getChain().push(block);
                    console.log(`Added new block from peer. New chain height: ${this.blockchain.getChain().length}`);
                    
                    // Remove mined transactions from mempool
                    const minedTxIds = new Set(block.transactions.map(tx => tx.id));
                    Array.from(this.mempool.getTransactions()).forEach(tx => {
                        if (minedTxIds.has(tx.id)) {
                            this.mempool.removeTransaction(tx.id);
                        }
                    });

                    // Broadcast the block to other peers
                    this.broadcastNewBlock(block, sender);
                    
                    // Reset current mining block since chain height changed
                    this.currentMiningBlock = null;
                    
                    // Restart mining for next block
                    if (this.miningWallet) {
                        this.startMining();
                    }
                }
            } 
            // ... rest of the cases remain the same ...
        } catch (error) {
            console.error('Error handling new block:', error);
        }
    }


}