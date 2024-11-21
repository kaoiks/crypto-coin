import { NetworkManager } from './network-manager';
import { Block } from './types';

export class MiningNode extends NetworkManager {
    private isMining: boolean;
    private miningInterval: NodeJS.Timeout | null;
    
    constructor(difficulty: number = 4) {
        super(undefined, difficulty);
        this.isMining = false;
        this.miningInterval = null;
    }

    // Override to add mining-specific behavior
    protected override handleNewBlock(block: Block, sender: string): void {
        console.log(`Mining node received new block from peer ${sender}: ${block.hash}`);
        try {
            if (this.isValidNewBlock(block)) {
                if (this.isMining) {
                    this.stopMining();
                }

                this.blockchain.getChain().push(block);
                console.log(`Added new block from peer: ${block.hash}`);
                
                // Restart mining with new chain
                this.startMining();
            }
        } catch (error) {
            console.error('Error handling new block:', error);
        }
    }

    public override async start(port: number): Promise<void> {
        await super.start(port);
        console.log(`Mining node started on port ${port}`);
        this.startMining();
    }

    public startMining(): void {
        if (this.isMining) {
            return;
        }

        this.isMining = true;
        console.log('Starting mining operations...');

        this.miningInterval = setInterval(() => {
            try {
                const newBlock = this.blockchain.createBlock(`Block data at ${new Date().toISOString()}`);
                this.broadcastNewBlock(newBlock);
                console.log(`Mined and broadcast new block: ${newBlock.hash}`);
                console.log('Current chain length:', this.blockchain.getChain().length);
            } catch (error) {
                console.error('Error during mining:', error);
            }
        }, 10000);
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
        super.stop();
    }
}