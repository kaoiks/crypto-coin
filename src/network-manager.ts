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

    // Set up event listeners for the P2P node
    private setupEventListeners(): void {
        this.node.on('message', (message: PeerMessage) => {
        });

        this.node.on('peerConnected', ({ peerId }) => {
            console.log(`Connected to peer: ${peerId}`);
            console.log('Current peers:', this.node.getPeers());
        });

        this.node.on('peerDisconnected', ({ peerId }) => {
            console.log(`Disconnected from peer: ${peerId}`);
            console.log('Current peers:', this.node.getPeers());
        });
    }

    // Broadcast a transaction to all connected peers
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