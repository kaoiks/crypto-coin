import { NetworkManager } from './network-manager';
import { Block, Transaction, BLOCKCHAIN_CONSTANTS } from './types';
import { DigitalWallet } from './wallet';
import * as crypto from 'crypto';

export class MiningNode extends NetworkManager {
    private isMining: boolean;
    private miningInterval: NodeJS.Timeout | null;
    private miningWallet: DigitalWallet | null;
    

    constructor(difficulty: number = 4) {
        super(undefined, difficulty);
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

    // Override to add mining-specific behavior
    protected override handleNewBlock(block: Block, sender: string): void {
        console.log(`Mining node received new block from peer ${sender}: ${block.hash}`);
        try {
            // Make sure block index is correct
            const currentChainLength = this.blockchain.getChain().length;
            if (block.index !== currentChainLength) {
                console.log(`Invalid block index. Expected ${currentChainLength} but got ${block.index}`);
                return;
            }

            if (this.isValidNewBlock(block)) {
                // Stop mining current block
                if (this.isMining) {
                    this.stopMining();
                }

                // Add block to chain
                this.blockchain.getChain().push(block);
                console.log(`Added new block from peer: ${block.hash}`);
                
                // Restart mining for next block
                if (this.miningWallet) {
                    this.startMining();
                }
            }
        } catch (error) {
            console.error('Error handling new block:', error);
        }
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
                const currentChain = this.blockchain.getChain();
                const lastBlock = currentChain[currentChain.length - 1];
                const blockIndex = lastBlock.index + 1;
                
                // Create coinbase transaction for the block
                const coinbaseTransaction = this.createCoinbaseTransaction(blockIndex);
                
                // Get pending transactions from mempool
                console.log("CO W MEMPOOLU: ", this.mempool.getTransactions(BLOCKCHAIN_CONSTANTS.MAX_TRANSACTIONS_PER_BLOCK - 1));
                const pendingTransactions = this.mempool.getTransactions(BLOCKCHAIN_CONSTANTS.MAX_TRANSACTIONS_PER_BLOCK - 1);
                
                // Create new block with coinbase and pending transactions
                const transactions = [coinbaseTransaction, ...pendingTransactions];
                const currentIdentity = this.miningWallet!.getCurrentIdentity()!;
                
                const newBlock: Block = {
                    index: blockIndex,
                    previousHash: lastBlock.hash,
                    timestamp: Date.now(),
                    transactions,
                    nonce: 0,
                    hash: '',
                    miner: currentIdentity.getPublicKey(),
                    reward: coinbaseTransaction.amount
                };
    
                // Mine the block (calculate hash with correct nonce)
                this.mineBlock(newBlock);
                console.log('Block mined:', newBlock);
                // Validate the block before broadcasting
                if (this.isValidNewBlock(newBlock)) {
                    // Add to our chain first
                    this.blockchain.getChain().push(newBlock);
                    
                    // Remove mined transactions from mempool
                    this.mempool.removeTransactions(pendingTransactions);
                    
                    // Then broadcast
                    this.broadcastNewBlock(newBlock);
                    console.log(`Mined and broadcast new block: ${newBlock.hash}`);
                    console.log(`Mining reward: ${coinbaseTransaction.amount} coins`);
                    console.log('Current chain length:', this.blockchain.getChain().length);
                } else {
                    console.error('Mined an invalid block - discarding');
                }
            } catch (error) {
                console.error('Error during mining:', error);
                this.stopMining();
            }
        }, 10000); // Mine every 10 seconds
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
}