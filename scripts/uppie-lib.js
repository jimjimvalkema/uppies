/**
 * @typedef {{
 *      maxBaseFee: bigint, 
 *      priorityFee: bigint, 
 *      topUpGas: bigint, 
 *      fillerReward: bigint 
 * }} uppieGas
 * 
 * @typedef {{recipient: string, 
 *      aaveToken: string, 
 *      underlyingToken: string, 
 *      canBorrow: boolean, 
 *      canWithdraw: boolean, 
 *      maxDebt: bigint, 
 *      topUpThreshold: bigint, 
 *      topUpTarget: bigint, 
 *      minHealthFactor: bigint, 
 *      gas:  uppieGas
 * }} uppie
 * 
 * @typedef {uppie & {
 *      payeeAddress:ethers.address,
 *      uppiesIndex:number
 * }} syncedUppie
 */

import { ethers } from "ethers"

function removeNumberKeys(o) {
    console.log({o})
    Object.keys(o).forEach((s) => { if (!Number.isNaN(Number(s))) { delete o[s] } })
}

export async function queryEventInChunks({ chunksize = 20000, filter, startBlock, endBlock, contract }) {
    const provider = contract.runner.provider
    const lastBlock = endBlock ? endBlock : await provider.getBlockNumber("latest")
    const numIters = Math.ceil((lastBlock - startBlock) / chunksize)
    const allEvents = []
    //console.log("scanning events: ",{lastBlock,startBlock,chunksize,numIters})
    for (let index = 0; index < numIters; index++) {
        const start = index * chunksize + startBlock
        const stop = (start + chunksize) > lastBlock ? lastBlock : (start + chunksize)
        const events = await contract.queryFilter(filter, start, stop)
        allEvents.push(events)
    }
    return allEvents.flat()
}

export async function getNamedStruct(contract, functionName, inputs) {
    const results = await contract[functionName](...inputs)
    const paramTypes = contract.interface.getFunction(functionName).outputs
    return nameResults(results, paramTypes)
}

function nameResults(results, paramTypes) {
    const named = {}
    for (const [index, param] of paramTypes.entries()) {
        if (param.components) {
            named[param.name] = nameResults(results[index], param.components)
        } else {
            named[param.name] = results[index]
        }
    }
    return named
}

/**
 * TODO deal with gaps in the return
 * @typedef {import("../types/ethers-contracts/Uppies.sol/Uppies").Uppies} UppiesContract 
 * @typedef {{[userAddress: ethers.AddressLike]: syncedUppie[]}} syncedUppies
 * @param {{preSyncedUppies:syncedUppies,chunksize,startBlock,endBlock,uppiesContract:UppiesContract}} param0 
 * @returns {syncedUppies} syncedUppies
 */
export async function syncUppies({ preSyncedUppies = {}, chunksize = 20000, startBlock, endBlock, uppiesContract }) {
    const createFilter = uppiesContract.filters.NewUppie()
    const removeFilter = uppiesContract.filters.RemovedUppie()
    const createEvents = await queryEventInChunks({ chunksize, filter: createFilter, startBlock, endBlock, contract: uppiesContract })
    const removeEvents = await queryEventInChunks({ chunksize, filter: removeFilter, startBlock, endBlock, contract: uppiesContract })

    const newUppies = createEvents.map((event) => [event.args[0], event.args[1]]);
    const removedUppies = removeEvents.map((event) => [event.args[0], event.args[1]]);


    // TODO add blockNumber of the latest block a preSyncedUppie was read at. So we can skip those reads
    // make it a flat array of [[userAddress, uppiesIndex]]
    const preSyncedUppiesArr = Object.keys(preSyncedUppies).map((userAddress) => preSyncedUppies[userAddress].map((uppie) => [userAddress, uppie.uppiesIndex])).flat()
    const allUppiesArr = [...preSyncedUppiesArr, ...newUppies]
    for (const removedUppie of removedUppies) {
        const removeIndex = allUppiesArr.findIndex((uppie) => uppie.address === removedUppie[0] && uppie.index === removedUppie[1])
        allUppiesArr.splice(removeIndex, 1)
    }

    const syncedUppies = {}
    for (const uppies of allUppiesArr) {
        const address = uppies[0]
        const index = uppies[1]
        //const onchainUppieStruct = await uppiesContract.uppiesPerUser(address, index) //Object.fromEntries((await uppiesContract.uppiesPerUser(address, index)).map((item, index)=>[structNames[index], item]))
        const onchainUppieStruct = await getNamedStruct(uppiesContract, "uppiesPerUser", [address, index])
        if (!(address in syncedUppies)) {
            syncedUppies[address] = []
        }
        syncedUppies[address][index] = { ...onchainUppieStruct, payeeAddress: address, uppiesIndex: index }
    }

    return syncedUppies

}

/**
 * 
 * @param {{uppie:Uppie, uppiesContract:ethers.Contract}} param0 
 * @returns 
 */
export async function fillUppie({ uppie, uppiesContract }) {
    const tx = await uppiesContract.fillUppie(uppie.uppiesIndex, uppie.payeeAddress, { gasLimit: 600000 }) // should be 373000 to is safer
    return tx
}
/** ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]
 * @param {{uppie:Uppie, uppiesContract:ethers.Contract}} param0 
 * @returns 
 */
export async function isFillableUppie({ uppie, uppiesContract }) {
    const provider = uppiesContract.runner.provider
    const underlyingTokenContract = new ethers.Contract(uppie.underlyingToken, erc20ABI, provider)
    const aaveTokenContract = new ethers.Contract(uppie.aaveToken, erc20ABI, provider)
    const recipientBalance = await underlyingTokenContract.balanceOf(uppie.recipientAccount)
    const payeeBalance = await aaveTokenContract.balanceOf(uppie.payeeAddress)

    const approval = await aaveTokenContract.allowance(uppie.payeeAddress, uppiesContract.target)
    const topUpSize = BigInt(uppie.topUpTarget) - recipientBalance

    const isBelowThreshold = recipientBalance < BigInt(uppie.topUpThreshold)
    const payeeHasBalance = Boolean(payeeBalance)
    const enoughAllowance = topUpSize < approval
    console.log(`\n-----checking uppie-----`)
    console.log({ recipientAddress: uppie.recipientAccount, payeeAddress: uppie.payeeAddress, uppiesIndex: uppie.uppiesIndex }, { isBelowThreshold, payeeHasBalance, enoughAllowance }, { uppie })
    console.log(`\n----------------\n`)
    if (isBelowThreshold && payeeHasBalance && enoughAllowance) {
        return true
    } else {
        return false
    }
}