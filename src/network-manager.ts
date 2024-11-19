import { DigitalWallet, WalletEvent } from './wallet';
import { P2PNode } from './node';
import { PeerMessage } from './types';

export class NetworkManager {
    private wallet: DigitalWallet;
    private node: P2PNode;

    constructor(wallet: DigitalWallet) {
        this.wallet = wallet;
        this.node = new P2PNode(wallet.getWalletId());
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.node.on('message', (message: PeerMessage) => {
            if (message.type === 'PEER_DISCOVERY') {
                this.handlePeerDiscovery(message);
            }
        });

        this.node.on('peerConnected', async ({ peerId, address }) => {
            console.log(`Connected to peer: ${peerId}`);
            
            // Broadcast our existing peers to the new peer
            const peers = this.node.getPeersWithAddresses();
            if (peers.length > 0) {
                this.node.broadcastMessage({
                    type: 'PEER_DISCOVERY',
                    payload: { peers },
                    sender: this.wallet.getWalletId(),
                    timestamp: Date.now()
                });
            }
            
            console.log('Current peers:', this.node.getPeers());
        });

        this.node.on('peerDisconnected', ({ peerId }) => {
            console.log(`Disconnected from peer: ${peerId}`);
            console.log('Current peers:', this.node.getPeers());
        });
    }

    private async handlePeerDiscovery(message: PeerMessage): Promise<void> {
        const { peers } = message.payload;
        
        // Filter out peers we're already connected to
        const currentPeers = new Set(this.node.getPeers());
        const newPeers = peers.filter((peer: { id: string, address: string }) => 
            peer.id !== this.wallet.getWalletId() && !currentPeers.has(peer.id)
        );

        // Connect to new peers
        for (const peer of newPeers) {
            try {
                await this.node.connectToPeer(peer.address);
                console.log(`Connected to discovered peer: ${peer.id} at ${peer.address}`);
            } catch (error) {
                console.error(`Failed to connect to discovered peer ${peer.id}:`, error);
            }
        }
    }

    public async start(port: number): Promise<void> {
        await this.node.start(port);
    }

    public async connectToPeer(peerAddress: string): Promise<void> {
        await this.node.connectToPeer(peerAddress);
    }

    public stop(): void {
        this.node.stop();
    }

    public getPeers(): string[] {
        return this.node.getPeers();
    }
}