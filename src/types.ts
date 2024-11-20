export interface PeerMessage {
    type: 'TRANSACTION' | 'BLOCK' | 'PEER_DISCOVERY';
    payload: any;
    sender: string;
    timestamp: number;
}

export interface KeyPair {
    publicKey: string;
    privateKey: string;
};