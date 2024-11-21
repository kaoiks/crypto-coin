import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { Block, PeerMessage } from './types';
import { Blockchain } from './blockchain';
import * as crypto from 'crypto';

export class NetworkManager {
    private wallet?: DigitalWallet;
    private node: P2PNode;
    private isWalletNode: boolean;
    private knownPeers: Set<string>;
    private walletConnections: Set<string>;
    protected blockchain: Blockchain;

    constructor(wallet?: DigitalWallet, difficulty: number = 4) {
        this.wallet = wallet;
        this.isWalletNode = !!wallet;
        const nodeId = wallet ? wallet.getWalletId() : crypto.randomBytes(16).toString('hex');
        this.node = new P2PNode(nodeId);
        this.knownPeers = new Set();
        this.walletConnections = new Set();
        this.blockchain = new Blockchain(difficulty);
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

                // Request chain from peer after connection
                this.requestChainFromPeer(peerId);
            }
            
            console.log('Current peers:', this.getPeers());
            if (this.walletConnections.size > 0) {
                console.log('Connected wallets:', Array.from(this.walletConnections));
            }
        });

        // Previous disconnect handler remains the same...
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


    protected isValidNewBlock(block: Block): boolean {
        const chain = this.blockchain.getChain();
        const lastBlock = chain[chain.length - 1];
        
        if (lastBlock.hash === block.hash) {
            // console.log('Block already in chain');
            return false;
        }

        if (block.index !== lastBlock.index + 1) {
            console.log('Invalid block index');
            return false;
        }

        if (block.previousHash !== lastBlock.hash) {
            console.log(`Invalid previous hash. Expected ${lastBlock.hash} but got ${block.previousHash}`);
            return false;
        }

        const target = "0".repeat(this.blockchain.getDifficulty());
        if (!block.hash.startsWith(target)) {
            console.log('Invalid proof of work');
            return false;
        }

        return true;
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
        if (this.isValidChain(receivedChain) && this.shouldReplaceChain(receivedChain)) {
            console.log('Received valid longer chain. Replacing current chain...');
            this.blockchain.replaceChain(receivedChain);
        }
    }

    protected isValidChain(chain: Block[]): boolean {
        if (JSON.stringify(chain[0]) !== JSON.stringify(this.blockchain.getChain()[0])) {
            console.log('Invalid genesis block');
            return false;
        }

        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i];
            const previousBlock = chain[i - 1];

            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log('Invalid chain continuity');
                return false;
            }

            const target = "0".repeat(this.blockchain.getDifficulty());
            if (!currentBlock.hash.startsWith(target)) {
                console.log('Invalid proof of work in chain');
                return false;
            }
        }

        return true;
    }

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

        // Get all peers except the original sender and wallets
        const peersToSend = this.getPeers().filter(peerId => 
            peerId !== originalSender && 
            !this.walletConnections.has(peerId)
        );

        // Send to each peer individually
        peersToSend.forEach(peerId => {
            this.node.sendToPeer(peerId, blockMessage);
        });

        if (peersToSend.length > 0) {
            console.log(`Forwarded block ${block.hash} to ${peersToSend.length} peers`);
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

    // Rest of the methods remain the same...
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
    
    private async handlePeerDiscovery(message: PeerMessage): Promise<void> {
        if (this.isWalletNode) {
            return;
        }

        const { peers } = message.payload;
        
        for (const peer of peers) {
            // Skip wallets, known peers, and self
            if (this.knownPeers.has(peer.id) || 
                peer.id === this.node.getId() || 
                peer.address.includes('localhost:0')) {
                continue;
            }

            try {
                this.knownPeers.add(peer.id);
                await this.node.connectToPeer(peer.address);
                console.log(`Connected to discovered peer: ${peer.id} at ${peer.address}`);
            } catch (error) {
                this.knownPeers.delete(peer.id);
                console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
            }
        }
    }
}

    
