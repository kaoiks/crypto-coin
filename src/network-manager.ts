import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { Block, PeerMessage, Transaction, BLOCKCHAIN_CONSTANTS } from './types';
import { Blockchain } from './blockchain';
import { Mempool } from './mempool';
import * as crypto from 'crypto';

export class NetworkManager {
    private wallet?: DigitalWallet;
    private node: P2PNode;
    private isWalletNode: boolean;
    private knownPeers: Set<string>;
    private walletConnections: Set<string>;
    protected blockchain: Blockchain;
    protected mempool: Mempool;

    constructor(wallet?: DigitalWallet, difficulty: number = 4) {
        this.wallet = wallet;
        this.isWalletNode = !!wallet;
        const nodeId = wallet ? wallet.getWalletId() : crypto.randomBytes(16).toString('hex');
        this.node = new P2PNode(nodeId);
        this.knownPeers = new Set();
        this.walletConnections = new Set();
        this.blockchain = new Blockchain(difficulty);
        this.mempool = new Mempool(this.blockchain);
        this.setupEventListeners();
    }

    protected setupEventListeners(): void {
        this.node.on('message', (message: PeerMessage) => {
            switch (message.type) {
                case 'PEER_DISCOVERY':
                    this.handlePeerDiscovery(message);
                    break;
                case 'BLOCK':
                    this.handleNewBlock(message.payload.block, message.sender);
                    break;
                case 'CHAIN_REQUEST':
                    this.handleChainRequest(message.sender);
                    break;
                case 'CHAIN_RESPONSE':
                    this.handleChainResponse(message.payload.chain);
                    break;
                case 'TRANSACTION':
                    this.handleNewTransaction(message.payload.transaction, message.sender);
                    break;
                case 'MEMPOOL_REQUEST':
                    this.handleMempoolRequest(message.sender);
                    break;
            }
        });
    
        this.node.on('peerConnected', async ({ peerId, address }) => {
            const isWalletConnection = address.includes('localhost:0');
            
            if (isWalletConnection) {
                this.walletConnections.add(peerId);
                console.log(`Wallet connected: ${peerId}`);
            } else {
                console.log(`Peer connected: ${peerId}`);
                
                if (!this.isWalletNode && !this.knownPeers.has(peerId)) {
                    this.knownPeers.add(peerId);
                    
                    const newPeer = {
                        id: peerId,
                        address: address
                    };
    
                    this.broadcastPeerDiscovery([newPeer]);
                }
    
                this.requestChainFromPeer(peerId);
            }
            
            console.log('Current peers:', this.getPeers());
            if (this.walletConnections.size > 0) {
                console.log('Connected wallets:', Array.from(this.walletConnections));
            }
        });
    
        this.node.on('peerDisconnected', ({ peerId }) => {
            if (this.walletConnections.has(peerId)) {
                this.walletConnections.delete(peerId);
                console.log(`Wallet disconnected: ${peerId}`);
            } else {
                this.knownPeers.delete(peerId);
                console.log(`Peer disconnected: ${peerId}`);
            }
            console.log('Current peers:', this.getPeers());
            if (this.walletConnections.size > 0) {
                console.log('Connected wallets:', Array.from(this.walletConnections));
            }
        });
    }

    protected handleMempoolRequest(requesterId: string): void {
        try {
            // Get all current transactions from mempool
            const transactions = this.mempool.getTransactions();
            
            // Create response message with all mempool transactions
            const mempoolResponse: PeerMessage = {
                type: 'MEMPOOL_RESPONSE',
                payload: {
                    transactions: transactions
                },
                sender: this.getNodeId(),
                timestamp: Date.now()
            };
    
            // Send response back to requesting peer
            this.node.sendToPeer(requesterId, mempoolResponse);
            console.log(`Sent mempool state to peer ${requesterId} with ${transactions.length} transactions`);
        } catch (error) {
            console.error('Error handling mempool request:', error);
        }
    }

    protected handleNewBlock(block: Block, sender: string): void {
        try {
            if (this.isValidNewBlock(block)) {
                this.blockchain.getChain().push(block);
                console.log(`Added new block from peer: ${block.hash}`);
                
                // Forward the block to other peers, excluding the sender
                this.broadcastNewBlock(block, sender);
            }
        } catch (error) {
            console.error('Error handling new block:', error);
        }
    }

    public getMempool(): Mempool {
        return this.mempool;
    }

    protected isValidNewBlock(block: Block): boolean {
        const chain = this.blockchain.getChain();
        const lastBlock = chain[chain.length - 1];
        
        // Basic block validation
        // Changed duplicate check to look at index and previousHash instead of just hash
        if (block.index === lastBlock.index) {
            console.log('Block with this index already exists');
            return false;
        }
    
        if (block.index !== lastBlock.index + 1) {
            console.log(`Invalid block index. Expected ${lastBlock.index + 1} but got ${block.index}`);
            return false;
        }
    
        if (block.previousHash !== lastBlock.hash) {
            console.log(`Invalid previous hash. Expected ${lastBlock.hash} but got ${block.previousHash}`);
            return false;
        }
    
        // Validate block hash and proof of work
        const calculatedHash = this.calculateBlockHash(block);
        if (calculatedHash !== block.hash) {
            console.log(`Invalid block hash. Calculated ${calculatedHash} but got ${block.hash}`);
            return false;
        }
    
        const target = "0".repeat(this.blockchain.getDifficulty());
        if (!block.hash.startsWith(target)) {
            console.log('Invalid proof of work');
            return false;
        }
    
        // Transaction validations
        if (!this.validateBlockTransactions(block)) {
            return false;
        }
    
        return true;
    }
    

    protected calculateBlockHash(block: Block): string {
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

    private validateBlockTransactions(block: Block): boolean {
        // Check if transactions array exists
        if (!Array.isArray(block.transactions)) {
            console.log('Block has no transactions array');
            return false;
        }

        // Find coinbase transactions
        const coinbaseTransactions = block.transactions.filter(tx => tx.isCoinbase);

        // Verify only one coinbase transaction exists
        if (coinbaseTransactions.length !== 1) {
            console.log(`Invalid number of coinbase transactions: ${coinbaseTransactions.length}`);
            return false;
        }

        // Validate coinbase transaction
        const coinbase = coinbaseTransactions[0];
        if (!this.blockchain.validateCoinbaseTransaction(coinbase, block.index)) {
            console.log('Invalid coinbase transaction');
            return false;
        }

        // Verify reward amount matches the coinbase amount
        if (block.reward !== coinbase.amount) {
            console.log(`Block reward mismatch. Block: ${block.reward}, Coinbase: ${coinbase.amount}`);
            return false;
        }

        // Validate all other transactions
        const regularTransactions = block.transactions.filter(tx => !tx.isCoinbase);
        for (const transaction of regularTransactions) {
            if (!this.blockchain.validateTransaction(transaction)) {
                console.log(`Invalid transaction: ${transaction.id}`);
                return false;
            }
        }

        return true;
    }

    protected handleNewTransaction(transaction: Transaction, sender: string): void {
        try {
            if (this.mempool.addTransaction(transaction)) {
                // Only broadcast if successfully added to mempool
                this.broadcastTransaction(transaction, sender);
            }
        } catch (error) {
            console.error('Error handling new transaction:', error);
        }
    }

    protected handleChainRequest(requesterId: string): void {
        const chainResponse: PeerMessage = {
            type: 'CHAIN_RESPONSE',
            payload: {
                chain: this.blockchain.getChain()
            },
            sender: this.getNodeId(),
            timestamp: Date.now()
        };

        this.node.sendToPeer(requesterId, chainResponse);
        console.log(`Sent chain to peer ${requesterId}`);
    }

    protected handleChainResponse(receivedChain: Block[]): void {
        try {
            if (this.isValidChain(receivedChain) && this.shouldReplaceChain(receivedChain)) {
                console.log('Received valid longer chain. Replacing current chain...');
                this.blockchain.replaceChain(receivedChain);
            }
        } catch (error) {
            console.error('Error handling chain response:', error);
        }
    }

    protected isValidChain(chain: Block[]): boolean {
        // Validate genesis block
        if (JSON.stringify(chain[0]) !== JSON.stringify(this.blockchain.getChain()[0])) {
            console.log('Invalid genesis block');
            return false;
        }

        // Validate each block in the chain
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i];
            const previousBlock = chain[i - 1];

            // Validate block linkage
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log('Invalid chain continuity');
                return false;
            }

            // Validate proof of work
            const target = "0".repeat(this.blockchain.getDifficulty());
            if (!currentBlock.hash.startsWith(target)) {
                console.log('Invalid proof of work in chain');
                return false;
            }

            // Validate block transactions
            if (!this.validateBlockTransactions(currentBlock)) {
                console.log('Invalid transactions in block');
                return false;
            }
        }

        return true;
    }

    // Rest of the existing methods...
    protected shouldReplaceChain(newChain: Block[]): boolean {
        return newChain.length > this.blockchain.getChain().length;
    }

    protected broadcastNewBlock(block: Block, originalSender?: string): void {
        const blockMessage: PeerMessage = {
            type: 'BLOCK',
            payload: { block },
            sender: this.getNodeId(),
            timestamp: Date.now()
        };

        const peersToSend = this.getPeers().filter(peerId => 
            peerId !== originalSender && 
            !this.walletConnections.has(peerId)
        );

        peersToSend.forEach(peerId => {
            this.node.sendToPeer(peerId, blockMessage);
        });

        if (peersToSend.length > 0) {
            console.log(`Forwarded block ${block.hash} to ${peersToSend.length} peers`);
        }
    }

    protected broadcastTransaction(transaction: Transaction, originalSender?: string): void {
        const transactionMessage: PeerMessage = {
            type: 'TRANSACTION',
            payload: { transaction },
            sender: this.getNodeId(),
            timestamp: Date.now()
        };

        const peersToSend = this.getPeers().filter(peerId => 
            peerId !== originalSender && 
            !this.walletConnections.has(peerId)
        );

        peersToSend.forEach(peerId => {
            this.node.sendToPeer(peerId, transactionMessage);
        });
    }

    protected requestChainFromPeer(peerId: string): void {
        const message: PeerMessage = {
            type: 'CHAIN_REQUEST',
            payload: {},
            sender: this.getNodeId(),
            timestamp: Date.now()
        };

        const peers = this.node.getPeersWithAddresses();
        const peer = peers.find(p => p.id === peerId);
        if (peer) {
            this.node.sendToPeer(peer.id, message);
            console.log(`Requested chain from peer ${peerId}`);
        }
    }

    protected broadcastPeerDiscovery(peers: Array<{id: string, address: string}>): void {
        this.node.broadcastMessage({
            type: 'PEER_DISCOVERY',
            payload: { peers },
            sender: this.node.getId(),
            timestamp: Date.now()
        });
    }

    public getPeers(): string[] {
        return this.node.getPeers().filter(peerId => !this.walletConnections.has(peerId));
    }

    public getConnectedWallets(): string[] {
        return Array.from(this.walletConnections);
    }

    public getBlockchain(): Blockchain {
        return this.blockchain;
    }

    public async start(port: number): Promise<void> {
        await this.node.start(port);
    }

    public async connectToPeer(peerAddress: string): Promise<void> {
        await this.node.connectToPeer(peerAddress);
    }

    public async connectToNode(nodeAddress: string): Promise<void> {
        if (!this.wallet) {
            throw new Error('Cannot connect to node: no wallet provided');
        }
        try {
            this.isWalletNode = true;
            await this.node.start(0);
            await this.connectToPeer(nodeAddress);
            console.log(`Wallet ${this.wallet.getWalletId()} connected to node at ${nodeAddress}`);
        } catch (error) {
            throw new Error(`Failed to connect wallet to node: ${error}`);
        }
    }

    public stop(): void {
        this.node.stop();
        this.knownPeers.clear();
        this.walletConnections.clear();
    }

    public isWalletConnected(): boolean {
        return !!this.wallet;
    }

    public getNodeId(): string {
        return this.node.getId();
    }

    public getNode(): P2PNode {
        return this.node;
    }

    private handlePeerDiscovery(message: PeerMessage): void {
        if (this.isWalletNode) return;

        const { peers } = message.payload;
        
        peers.forEach(async (peer: { id: string; address: string }) => {
            if (!this.knownPeers.has(peer.id) && 
                peer.id !== this.node.getId() && 
                !peer.address.includes('localhost:0')) {
                try {
                    this.knownPeers.add(peer.id);
                    await this.node.connectToPeer(peer.address);
                    console.log(`Connected to discovered peer: ${peer.id} at ${peer.address}`);
                } catch (error) {
                    this.knownPeers.delete(peer.id);
                    console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
                }
            }
        });
    }
}