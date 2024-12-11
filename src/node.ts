import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PeerMessage, Transaction } from './types';  // Added Transaction import

interface PeerInfo {
    socket: WebSocket;
    address: string;
}

export class P2PNode extends EventEmitter {
    private id: string;
    private server: WebSocket.Server | null;
    private peers: Map<string, PeerInfo>;
    private isActive: boolean;
    private port: number;

    constructor(nodeId: string) {
        super();
        this.id = nodeId;
        this.server = null;
        this.peers = new Map();
        this.isActive = false;
        this.port = 0;
    }

    public getId(): string {
        return this.id;
    }

    public async start(port: number): Promise<void> {
        if (this.isActive) {
            throw new Error('Node is already active');
        }

        try {
            this.port = port;
            this.server = new WebSocket.Server({ port });
            
            this.server.on('connection', (socket: WebSocket, request) => {
                // Normalize the remote address
                const clientAddress = this.normalizeAddress(request.socket.remoteAddress, request.socket.remotePort);
                this.handleConnection(socket, clientAddress);
            });
            
            this.isActive = true;
            this.emit('started', { nodeId: this.id, port });
            console.log(`P2P server started on port ${port}`);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    private normalizeAddress(address: string | undefined, port: number | undefined): string {
        if (!address || !port) {
            return `ws://localhost:${this.port}`;
        }

        // Handle IPv6 localhost
        if (address === '::1' || address === '::ffff:127.0.0.1') {
            return `ws://localhost:${port}`;
        }

        // Handle IPv4 localhost
        if (address === '127.0.0.1') {
            return `ws://localhost:${port}`;
        }

        // Handle IPv6 addresses
        if (address.includes(':')) {
            return `ws://[${address}]:${port}`;
        }

        // Handle regular IPv4 addresses
        return `ws://${address}:${port}`;
    }

    private handleConnection(socket: WebSocket, address: string) {
        socket.on('message', (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'HANDSHAKE') {
                    const peerId = message.payload.nodeId;
                    const peerAddress = message.payload.address || address;
                    this.peers.set(peerId, { socket, address: peerAddress });
                    this.emit('peerConnected', { peerId, address: peerAddress });
                    console.log(`Peer ${peerId} connected from ${peerAddress}`);
                } else {
                    this.emit('message', message);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        socket.on('close', () => {
            this.peers.forEach((peerInfo, peerId) => {
                if (peerInfo.socket === socket) {
                    this.peers.delete(peerId);
                    this.emit('peerDisconnected', { peerId });
                    console.log(`Peer ${peerId} disconnected`);
                }
            });
        });

        // Send handshake with our local address
        const handshake = {
            type: 'HANDSHAKE',
            payload: { 
                nodeId: this.id,
                address: `ws://localhost:${this.port}`
            },
            sender: this.id,
            timestamp: Date.now()
        };
        socket.send(JSON.stringify(handshake));
    }
    
    public async connectToPeer(peerAddress: string): Promise<void> {
        // Don't connect if we already have a connection to this address
        const existingPeer = Array.from(this.peers.values()).find(peer => peer.address === peerAddress);
        if (existingPeer) {
            console.log(`Already connected to peer at ${peerAddress}`);
            return;
        }

        try {
            console.log(`Attempting to connect to peer at ${peerAddress}`);
            const socket = new WebSocket(peerAddress);
            
            socket.on('open', () => {
                this.handleConnection(socket, peerAddress);
            });

            socket.on('error', (error) => {
                console.error(`Failed to connect to peer ${peerAddress}:`, error);
                this.emit('error', error);
            });

        } catch (error) {
            console.error(`Error connecting to peer ${peerAddress}:`, error);
            this.emit('error', error);
            throw error;
        }
    }

    // Rest of the methods remain the same...
    public broadcastMessage(message: PeerMessage): void {
        if (!this.isActive) {
            throw new Error('Node is not active');
        }

        const messageString = JSON.stringify({
            ...message,
            sender: this.id,
            timestamp: Date.now()
        });

        this.peers.forEach(({ socket }, peerId) => {
            try {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(messageString);
                }
            } catch (error) {
                console.error(`Error broadcasting to peer ${peerId}:`, error);
                this.emit('error', { error, peerId });
            }
        });
    }

    public sendToPeer(peerId: string, message: any): void {
        const peers = this.peers.get(peerId);
        if (peers?.socket.readyState === WebSocket.OPEN) {
            peers.socket.send(JSON.stringify(message));
        }
    }

    public getPendingTransactions(): Transaction[] {
        if (this.server && this.isActive) {
            return Array.from(this.peers.values()).reduce((transactions: Transaction[], peerInfo) => {
                // Here we would get pending transactions from connected peers
                // For now, return empty array as we haven't implemented transaction sharing yet
                return transactions;
            }, []);
        }
        return [];
    }

    public stop(): void {
        this.isActive = false;
        this.peers.forEach(({ socket }, peerId) => {
            socket.close();
            console.log(`Disconnecting from peer ${peerId}`);
        });
        this.peers.clear();
        
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        
        this.emit('stopped', { nodeId: this.id });
    }

    public getPeers(): string[] {
        return Array.from(this.peers.keys());
    }

    public getPeersWithAddresses(): Array<{ id: string, address: string }> {
        return Array.from(this.peers.entries()).map(([id, info]) => ({
            id,
            address: info.address
        }));
    }
}