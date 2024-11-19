// types.ts
export interface PeerMessage {
    type: 'TRANSACTION' | 'BLOCK' | 'PEER_DISCOVERY' | 'WALLET_REGISTRATION';
    payload: any;
    sender: string;
    timestamp: number;
}


export interface KeyPair {
    publicKey: string;
    privateKey: string;
};