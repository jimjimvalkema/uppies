import { ArgumentParser } from 'argparse';
import { ethers } from "ethers";
import uppiesDeployment from "../out/Uppies.sol/Uppies.json"  with { type: "json" };

const delay = async (time) => await new Promise(resolve => setTimeout(resolve, time));

async function queryEventInChunks({chunksize=5000,filter,startBlock,contract}){
    const provider = contract.runner.provider
    const lastBlock = await provider.getBlockNumber("latest")
    const numIters = Math.ceil((lastBlock-startBlock)/chunksize)
    const allEvents = []
    console.log("scanning events: ",{lastBlock,startBlock,chunksize,numIters})
    for (let index = 0; index < numIters; index++) {
        const start = index*chunksize + startBlock
        const stop =  (start + chunksize) > lastBlock ? lastBlock :  (start + chunksize)
        console.log({filter,start,stop})
        const events =  await contract.queryFilter(filter,start,stop)
        allEvents.push(events)
    }
    return allEvents.flat()
}


async function syncUppies({preSyncedUppies={},chunksize=5000,filter,startBlock,uppiesContract}) {    
    const createFilter = uppiesContract.filters.CreateUppie()
    const removeFilter = uppiesContract.filters.RemoveUppie()
    const createEvents = await queryEventInChunks({chunksize,filter,startBlock,contract})
    const removeEvents = await queryEventInChunks({chunksize,filter,startBlock,contract})

    //remove uppies from createEvents

    // make object with know uppies {"payee":[uppieIndexs]}
    const newUppies = {}
    for (key of Object.keys(newUppies)) {
        await uppiesContract.uppiesPerUser(payee, index)

    }
    
    
}


// 5 minutes: 300000
const updateTime = 3000
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

while (true) {
    // look for CreateUppie and add/update the aaveAccount and index to our watch list
    // save entire struct
    
    // look for RemoveUppie and remove from our watch list

    // fill uppies
    // check recipient balance
    // check payee balance > 0.01$
    // TODO check health ratio with simulation
    const structNames = ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]
    const struct = Object.fromEntries((await uppiesContract.uppiesPerUser("0xf1B42cc7c1609445620dE4352CD7e58353C3FA74", 0)).map((item, index)=>[structNames[index], item]))
    console.log(struct)
    await delay(updateTime)
}