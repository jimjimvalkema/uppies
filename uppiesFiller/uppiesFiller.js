import { ArgumentParser } from 'argparse';
import { ethers } from "ethers";
import { estimateProfitFillUppie, fillUppie, isFillableUppie, isFillableUppieNoSimulation, syncUppies } from '../scripts/uppie-lib.js';
import { IAaveOracle__factory } from '../types/ethers-contracts/factories/Uppies.sol/IAaveOracle__factory';
import { Uppies__factory } from '../types/ethers-contracts/factories/Uppies.sol/Uppies__factory';

const delay = async (time) => await new Promise(resolve => setTimeout(resolve, time));

// 2 minutes: 120000
const updateTime = 120000
const deploymentBlock = 40464878


const parser = new ArgumentParser({
    description: 'TODO',
    usage: `TODO`
});
parser.add_argument('-pv', '--privateKey', {default: "0x00000000000000000000000000000000", help: 'privatekey for the account that fills the uppies', required: true });
parser.add_argument('-p', '--provider', {default: "https://rpc.gnosischain.com", help: 'Provider url. Default uis mainnet. ex: mainnet: --provider=https://rpc.gnosischain.com or testnet: --provider=https://rpc.chiadochain.net', required: false });
parser.add_argument('-c', '--contractAddress', {default: "0x41D41B606bE9c7Da574D07af900eF828f7496a9F", help: 'contract address of the uppies contract', required: false });
parser.add_argument('-s', '--isSponsored', {help: 'makes filler forego filler rewards', required: false, action:'store_true' });

const args = parser.parse_args()

const provider = new ethers.JsonRpcProvider(args.provider);
const wallet = new ethers.Wallet(args.privateKey, provider);

const uppiesContract = Uppies__factory.connect(args.contractAddress, wallet)
console.log({contractAddress:args.contractAddress})
const aaveOracle = IAaveOracle__factory.connect(await uppiesContract.aaveOracle(), provider)
let lastSyncedUppieBlock = await provider.getBlockNumber()
let startBlock = deploymentBlock
let uppiesPerPayee = await syncUppies({preSyncedUppies:{},startBlock: deploymentBlock, endBlock: lastSyncedUppieBlock, uppiesContract: uppiesContract})
startBlock = lastSyncedUppieBlock

while (true) {
    // save entire struct
    // check payee balance > 0.01$
    try {
        lastSyncedUppieBlock = await provider.getBlockNumber()
        uppiesPerPayee = await syncUppies({preSyncedUppies:uppiesPerPayee,startBlock: startBlock,endBlock: lastSyncedUppieBlock, uppiesContract: uppiesContract})
        console.log({uppiesPerPayee: Object.fromEntries(Object.keys(uppiesPerPayee).map((v)=>[v,uppiesPerPayee[v].map((i)=>i.index)])) })
        for (const payee in uppiesPerPayee) {
            for (const uppie of uppiesPerPayee[payee]) {
                // do concurrently and maybe with nonce manager
                const isFillable = await isFillableUppie({uppie, uppiesContract,isSponsored:args.isSponsored})//await isFillableUppieNoSimulation({uppie, uppiesContract})
                if (isFillable) {
                    try {
                        const uppieProfitInfo = await estimateProfitFillUppie({uppie, uppiesContract, isSponsored:false, aaveOracle, isSponsored:args.isSponsored})
                        console.log({isProfitable: uppieProfitInfo.isProfitable, isSponsored: args.isSponsored})
                        if (uppieProfitInfo.isProfitable || args.isSponsored) {
                            await fillUppie({uppie,uppiesContract, isSponsored:args.isSponsored})
                        }
                       
                    } catch (error) {
                        console.log(error)
                    }
                }
            }
        }
        startBlock = lastSyncedUppieBlock
        await delay(updateTime)
        
    } catch (error) {
        console.log(error)
        
    }

}