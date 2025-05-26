/**
 * @typedef  {{
 *      recipientAccount: ethers.AddressLike, 
 *      aaveToken:ethers.AddressLike, 
 *      underlyingToken:ethers.AddressLike,
 *      topUpThreshold: BigInt,
 *      topUpTarget: BigInt,
 *      maxBaseFee: BigInt,
 *      minHealthFactor: BigInt,
 *      payeeAddress: ethers.AddressLike,
 *      uppiesIndex: BigInt
 * }} Uppie
 */

import { ethers } from "ethers"


export async function queryEventInChunks({chunksize=20000,filter,startBlock, endBlock,contract}){
    const provider = contract.runner.provider
    const lastBlock = endBlock ? endBlock : await provider.getBlockNumber("latest")
    const numIters = Math.ceil((lastBlock-startBlock)/chunksize)
    const allEvents = []
    //console.log("scanning events: ",{lastBlock,startBlock,chunksize,numIters})
    for (let index = 0; index < numIters; index++) {
        const start = index*chunksize + startBlock
        const stop =  (start + chunksize) > lastBlock ? lastBlock :  (start + chunksize)
        const events =  await contract.queryFilter(filter,start,stop)
        allEvents.push(events)
    }
    return allEvents.flat()
}


export async function syncUppies({preSyncedUppies={},chunksize=20000,startBlock,endBlock,uppiesContract}) {    
    // TODO get from abi instead
    const structNames = ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]

    const createFilter = uppiesContract.filters.NewUppie()
    const removeFilter = uppiesContract.filters.RemovedUppie()
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
        const removeIndex = allUppiesArr.findIndex((uppie)=>uppie.address === removedUppie[0] &&  uppie.index === removedUppie[1])
        allUppiesArr.splice(removeIndex,1)
    }

    const syncedUppies = {}
    for (const uppies of allUppiesArr) {
        const address = uppies[0]
        const index = uppies[1]
        const onchainUppieStruct = Object.fromEntries((await uppiesContract.uppiesPerUser(address, index)).map((item, index)=>[structNames[index], item]))
        if (!(address in syncedUppies)) {
            syncedUppies[address] = []
        }
        syncedUppies[address][index] = {...onchainUppieStruct, payeeAddress: address, uppiesIndex: index}

    }
    
    return syncedUppies
    
}

/**
 * 
 * @param {{uppie:Uppie, uppiesContract:ethers.Contract}} param0 
 * @returns 
 */
export async function fillUppie({uppie, uppiesContract}) {
    const tx = await uppiesContract.fillUppie(uppie.uppiesIndex, uppie.payeeAddress, {gasLimit:600000}) // should be 373000 to is safer
    return tx
}
/** ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]
 * @param {{uppie:Uppie, uppiesContract:ethers.Contract}} param0 
 * @returns 
 */
export async function isFillableUppie({uppie, uppiesContract}) {
    const provider = uppiesContract.runner.provider
    const underlyingTokenContract = new ethers.Contract(uppie.underlyingToken, erc20ABI,provider)
    const aaveTokenContract = new ethers.Contract(uppie.aaveToken, erc20ABI,provider)
    const recipientBalance = await underlyingTokenContract.balanceOf(uppie.recipientAccount)
    const payeeBalance = await aaveTokenContract.balanceOf(uppie.payeeAddress)
    
    const approval =  await aaveTokenContract.allowance(uppie.payeeAddress, uppiesContract.target)
    const topUpSize = BigInt(uppie.topUpTarget) - recipientBalance

    const isBelowThreshold = recipientBalance < BigInt(uppie.topUpThreshold)
    const payeeHasBalance = Boolean(payeeBalance)
    const enoughAllowance = topUpSize < approval
    console.log(`\n-----checking uppie-----`)
    console.log({recipientAddress:uppie.recipientAccount,payeeAddress:uppie.payeeAddress, uppiesIndex: uppie.uppiesIndex},{isBelowThreshold, payeeHasBalance, enoughAllowance}, {uppie})
    console.log(`\n----------------\n`)
    if (isBelowThreshold && payeeHasBalance && enoughAllowance) {
        return true
    } else {
        return false
    }
}