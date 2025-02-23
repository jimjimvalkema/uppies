import { ArgumentParser } from 'argparse';
import { ethers } from "ethers";
import uppiesDeployment from "../out/Uppies.sol/Uppies.json"  with { type: "json" };
import erc20ABI from "./erc20ABI.json"  with { type: "json" };

const delay = async (time) => await new Promise(resolve => setTimeout(resolve, time));

async function queryEventInChunks({chunksize=20000,filter,startBlock, endBlock,contract}){
    const provider = contract.runner.provider
    const lastBlock = endBlock ? endBlock : await provider.getBlockNumber("latest")
    const numIters = Math.ceil((lastBlock-startBlock)/chunksize)
    const allEvents = []
    console.log("scanning events: ",{lastBlock,startBlock,chunksize,numIters})
    for (let index = 0; index < numIters; index++) {
        const start = index*chunksize + startBlock
        const stop =  (start + chunksize) > lastBlock ? lastBlock :  (start + chunksize)
        const events =  await contract.queryFilter(filter,start,stop)
        allEvents.push(events)
    }
    return allEvents.flat()
}


async function syncUppies({preSyncedUppies={},chunksize=20000,startBlock,endBlock,uppiesContract}) {    
    const structNames = ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]

    const createFilter = uppiesContract.filters.CreateUppie()
    const removeFilter = uppiesContract.filters.RemoveUppie()
    const createEvents = await queryEventInChunks({chunksize,filter:createFilter,startBlock,endBlock,contract:uppiesContract})
    const removeEvents = await queryEventInChunks({chunksize,filter:removeFilter,startBlock,endBlock,contract:uppiesContract})

    //remove uppies from createEvents

    // make object with know uppies {"payee":[uppieIndexs]}
    const newUppies = createEvents.map((event)=> [event.args[0], event.args[1]]);
    const removedUppies = removeEvents.map((event)=> [event.args[0], event.args[1]]);
    // preSyncedUppies = {"0x0":[uppie,uppie],"0x1":[uppie,uppie,uppie]}
    // preSyncedUppiesArr = [["0x0",0],["0x0",1],["0x1",0],["0x1",1],["0x1",2]]
    const preSyncedUppiesArr = Object.keys(preSyncedUppies).map((key)=>preSyncedUppies[key].map((uppie)=> [key, uppie.uppiesIndex])).flat()
    const allUppiesArr = [...preSyncedUppiesArr, ...newUppies]
    for (const removedUppie of removedUppies) {
        const removeIndex = allUppiesArr.findIndex((uppie)=>uppie.address === removedUppie.address &&  uppie.index === removedUppie.index)
        allUppiesArr.splice(removeIndex,1)
    }

    const syncedUppies = {}
    for (const uppies of allUppiesArr) {
        const address = uppies[0]
        const index = uppies[1]
        const struct = Object.fromEntries((await uppiesContract.uppiesPerUser(address, index)).map((item, index)=>[structNames[index], item]))
        if (!(address in syncedUppies)) {
            syncedUppies[address] = []
        }
        syncedUppies[address][index] = {...struct, payeeAddress: address, uppiesIndex: index}

    }
    
    return syncedUppies
    
}


async function fillUppie({uppie, uppiesContract}) {
    try {
        console.log("filling: ",{index: uppie.uppiesIndex, payee: uppie.payeeAddress})
        const tx = await uppiesContract.fillUppie(uppie.uppiesIndex, uppie.payeeAddress, {gasLimit:7000000}) // should be 373000 to is safer
        console.log((await tx.wait(1)).hash) //slow but prevents from dubbel txs 
        
    } catch (error) {
        console.log(error) 
    }
}

async function isFillableUppie({uppie, uppiesContract}) {
    try {
        const provider = uppiesContract.runner.provider
        const underlyingTokenContract = new ethers.Contract(uppie.underlyingToken, erc20ABI,provider)
        const recipientBalance = await underlyingTokenContract.balanceOf(uppie.recipientAccount)
        // TODO healthfactor and basefee
        // check approval
        if (recipientBalance < BigInt(uppie.topUpThreshold)) {
            return true
        }
        
    } catch (error) {
        console.log(erc20ABI)
        return false
        
    }

}

// 5 minutes: 300000
const updateTime = 300000
const deploymentBlock = 38628840

const parser = new ArgumentParser({
    description: 'TODO',
    usage: `TODO`
});
parser.add_argument('-pv', '--privateKey', {default: "0x00000000000000000000000000000000", help: 'privatekey for the account that fills the uppies', required: true });
parser.add_argument('-p', '--provider', {default: "https://rpc.gnosischain.com", help: 'Provider url. Default uis mainnet. ex: mainnet: --provider=https://rpc.gnosischain.com or testnet: --provider=https://rpc.chiadochain.net', required: false });
parser.add_argument('-c', '--contractAddress', {default: "0x88c96330C65b7C4697285BA6Cd1F1ED1bA60faDD", help: 'contract address of the uppies contract', required: false });

const args = parser.parse_args()

const provider = new ethers.JsonRpcProvider(args.provider);
const wallet = new ethers.Wallet(args.privateKey, provider);

const uppiesContract = new ethers.Contract(args.contractAddress,uppiesDeployment.abi,wallet)
let lastSyncedUppieBlock = await provider.getBlockNumber("latest")
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
        lastSyncedUppieBlock = await provider.getBlockNumber("latest")
        uppiesPerPayee = await syncUppies({preSyncedUppies:uppiesPerPayee,startBlock: startBlock,endBlock: lastSyncedUppieBlock, uppiesContract: uppiesContract})
        console.log({uppies: uppiesPerPayee})
        for (const payee in uppiesPerPayee) {
            for (const uppie of uppiesPerPayee[payee]) {
                if (await isFillableUppie({uppie, uppiesContract})) {
                    try {
                        await fillUppie({uppie,uppiesContract})
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