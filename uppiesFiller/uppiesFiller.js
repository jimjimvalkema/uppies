import { ArgumentParser } from 'argparse';
import { ethers } from "ethers";
import { estimateProfitFillUppie, fillUppie, isFillableUppie, syncUppies } from '../scripts/uppie-lib.js';
import { IAaveOracle__factory } from '../types/ethers-contracts/factories/Uppies.sol/IAaveOracle__factory';
import { Uppies__factory } from '../types/ethers-contracts/factories/Uppies.sol/Uppies__factory';

const delay = async (time) => await new Promise(resolve => setTimeout(resolve, time));

// 5 minutes: 300000
const updateTime = 300000
const deploymentBlock = 40397448

const parser = new ArgumentParser({
    description: 'TODO',
    usage: `TODO`
});
parser.add_argument('-pv', '--privateKey', {default: "0x00000000000000000000000000000000", help: 'privatekey for the account that fills the uppies', required: true });
parser.add_argument('-p', '--provider', {default: "https://rpc.gnosischain.com", help: 'Provider url. Default uis mainnet. ex: mainnet: --provider=https://rpc.gnosischain.com or testnet: --provider=https://rpc.chiadochain.net', required: false });
parser.add_argument('-c', '--contractAddress', {default: "0x41D41B606bE9c7Da574D07af900eF828f7496a9F", help: 'contract address of the uppies contract', required: false });

const args = parser.parse_args()

const provider = new ethers.JsonRpcProvider(args.provider);
const wallet = new ethers.Wallet(args.privateKey, provider);

const uppiesContract = Uppies__factory.connect(args.contractAddress, wallet)
console.log({contractAddress:args.contractAddress})
const aaveOracle = IAaveOracle__factory.connect(await uppiesContract.aaveOracle(), provider)
let lastSyncedUppieBlock = await provider.getBlockNumber()
let startBlock = deploymentBlock
let uppiesPerPayee = await syncUppies({preSyncedUppies:{},startBlock: deploymentBlock, endBlock: lastSyncedUppieBlock, uppiesContract: uppiesContract})

while (true) {
    // look for CreateUppie and add/update the aaveAccount and index to our watch list
    // save entire struct
    
    // look for RemoveUppie and remove from our watch list

    // fill uppies
    // check recipient balance
    // check payee balance > 0.01$
    // TODO check health ratio with simulation
    try {
        lastSyncedUppieBlock = await provider.getBlockNumber()
        uppiesPerPayee = await syncUppies({preSyncedUppies:uppiesPerPayee,startBlock: startBlock,endBlock: lastSyncedUppieBlock, uppiesContract: uppiesContract})
        console.log({payees: Object.keys(uppiesPerPayee)})
        for (const payee in uppiesPerPayee) {
            for (const uppie of uppiesPerPayee[payee]) {
                // do concurrently and maybe with nonce manager
                if (await isFillableUppie({uppie, uppiesContract})) {
                    try {
                        const uppieProfitInfo = await estimateProfitFillUppie({uppie, uppiesContract, isSponsored:false, aaveOracle})
                        if (uppieProfitInfo.isProfitable) {
                            await fillUppie({uppie,uppiesContract})
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