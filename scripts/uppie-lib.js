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
 *      payee:ethers.address,
 *      uppies:number
 * }} syncedUppie
 * @typedef {{[userAddress: ethers.AddressLike]: syncedUppie[]}} uppiesPerUser
 * @typedef {import("../types/ethers-contracts/Uppies.sol/Uppies").Uppies } UppiesContract
 */

import { ethers } from "ethers"
import { IAToken__factory } from "../types/ethers-contracts/factories/interfaces/aave/IAToken__factory"
import { ICreditDelegationToken__factory } from "../types/ethers-contracts/factories/interfaces/aave/ICreditDelegationToken__factory"
import { IPool__factory } from "../types/ethers-contracts/factories/interfaces/aave/IPool__factory"
import { IAaveOracle__factory } from "../types/ethers-contracts/factories/Uppies.sol/IAaveOracle__factory"
import { erc20Abi } from "viem"

function removeNumberKeys(o) {
    Object.keys(o).forEach((s) => { if (!Number.isNaN(Number(s))) { delete o[s] } })
}

/**
 * 
 * @param {{ chunksize: Number, filter:ethers.EventFilter, startBlock, endBlock, contract:ethers.Contract }} param0 
 * @returns {Promise<ethers.EventLog>}
 */
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
 * 
 * @param {{preSyncedUppies:uppiesPerUser,chunksize,startBlock,endBlock,uppiesContract:UppiesContract}} param0 
 * @returns {Promise<uppiesPerUser>} syncedUppiesPerUser
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
    const preSyncedUppiesArr = Object.keys(preSyncedUppies).map((userAddress) => preSyncedUppies[userAddress].map((uppie) => [userAddress, uppie.index])).flat()
    const allUppiesArr = [...preSyncedUppiesArr, ...newUppies]
    for (const removedUppie of removedUppies) {
        const removedIndex = allUppiesArr.findLastIndex((v) => v[0] === removedUppie[0] && v[1] === removedUppie[1])
        allUppiesArr.splice(removedIndex, 1)
    }

    const syncedUppiesPerUser = {}
    for (const uppies of allUppiesArr) {
        const address = uppies[0]
        const index = uppies[1]
        //const onchainUppieStruct = await uppiesContract.uppiesPerUser(address, index) //Object.fromEntries((await uppiesContract.uppiesPerUser(address, index)).map((item, index)=>[structNames[index], item]))
        const onchainUppieStruct = await getNamedStruct(uppiesContract, "uppiesPerUser", [address, index])
        if (onchainUppieStruct.canBorrow && onchainUppieStruct.canWithdraw) {
            if (!(address in syncedUppiesPerUser)) {
                syncedUppiesPerUser[address] = []
            }
            syncedUppiesPerUser[address].push({ ...onchainUppieStruct, payee: address, index: index })

        } else {
            console.log("whoops", {payee:address, index})
        }

    }

    return syncedUppiesPerUser

}

/**
 * 
 * @param {{uppie:syncedUppie, uppiesContract:ethers.Contract}} param0 
 * @returns 
 */
export async function fillUppie({ uppie, uppiesContract, isSponsored = false }) {
    console.log("filling uppie: ", { index: uppie.index, payee: uppie.payee, isSponsored })
    const tx = await (await uppiesContract.fillUppie(uppie.index, uppie.payee, isSponsored, { gasLimit: 600000 })).wait(1) // should be 373000 to is safer
    return tx
}
/** ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]
 * @param {{uppie:syncedUppie, uppiesContract:import("../types/ethers-contracts/Uppies.sol/Uppies").Uppies}} param0 
 * @returns 
 */
export async function isFillableUppieNoSimulation({ uppie, uppiesContract }) {
    if (uppie.canBorrow === false && uppie.canWithdraw === false) {
        return false
    }
    const provider = uppiesContract.runner.provider
    const underlyingTokenContract = new ethers.Contract(uppie.underlyingToken, erc20Abi, provider)
    const aaveTokenContract = IAToken__factory.connect(uppie.aaveToken, provider)
    const aaveOracleContract = IAaveOracle__factory.connect(await uppiesContract.aaveOracle(), provider)
    const aavePoolContract = IPool__factory.connect(await uppiesContract.aavePoolInstance(), provider)
    const debtTokenAddress = await aavePoolContract.getReserveVariableDebtToken(uppie.underlyingToken)
    const debtToken = ICreditDelegationToken__factory.connect(debtTokenAddress, provider)
    console.log("11111111111")
    console.log(uppie.recipient, uppie)
    const recipientBalance = await underlyingTokenContract.balanceOf(uppie.recipient)
    console.log("22222222222222")
    const payeeBalance = await aaveTokenContract.balanceOf(uppie.payee)
    console.log("3333333333333333")
    const creditDelegation = await debtToken.borrowAllowance(uppie.payee, uppiesContract.target)
    const approval = await aaveTokenContract.allowance(uppie.payee, uppiesContract.target)
    const topUpSize = BigInt(uppie.topUpTarget) - recipientBalance

    // TODO just getEstimate gas in try catch is prob enough and better. Maybe still do allowance checks since those errors are hard to debug sometimes
    // keep this code for debugging
    // also this info is use full for users
    const isBelowThreshold = recipientBalance < BigInt(uppie.topUpThreshold)
    const payeeHasBalance = Boolean(payeeBalance)

    const enoughCreditDelegation = topUpSize < creditDelegation
    const userAccountData = await aavePoolContract.getUserAccountData(uppie.payee)
    const underlyingTokenPrice = Number(await aaveOracleContract.getAssetPrice(uppie.underlyingToken)) / 100000000
    const topUpSizeBase = Number(topUpSize) * underlyingTokenPrice

    //console.log({totalDebtBase:Number(userAccountData.totalDebtBase), invertedUnderlyingTokenPrice: (1 / underlyingTokenPrice)})
    const debtInUnderlyingToken = userAccountData.totalDebtBase === 0n ? 0 : Number(userAccountData.totalDebtBase) * (1 / underlyingTokenPrice)
    const wontExceedMaxDebt = Boolean(uppie.maxDebt - BigInt(Math.round(debtInUnderlyingToken)) - topUpSize)
    const enoughAllowance = topUpSize < approval
    const canBorrow = uppie.canBorrow
    const canWithdraw = uppie.canWithdraw
    const doesWithdraw = canWithdraw && payeeHasBalance && enoughAllowance
    const doesBorrow = (!payeeHasBalance || !canWithdraw) && canBorrow && enoughCreditDelegation && wontExceedMaxDebt

    console.log({ totalCollateralBase: userAccountData.totalCollateralBase, currentLiquidationThreshold: userAccountData.currentLiquidationThreshold, totalDebtBase: userAccountData.totalDebtBase })
    const reproducedHealthFactor = userAccountData.totalCollateralBase === 0n ? Infinity : Number(userAccountData.totalCollateralBase) * (Number(userAccountData.currentLiquidationThreshold) / 10000) / Number(userAccountData.totalDebtBase)
    const healthFactorPostTopUp = doesBorrow ? userAccountData.totalCollateralBase === 0n ? Infinity : Number(userAccountData.totalCollateralBase) * (Number(userAccountData.currentLiquidationThreshold) / 10000) / (topUpSizeBase + Number(userAccountData.totalDebtBase)) : reproducedHealthFactor
    const wontGoBelowMinHealthFactor = (uppie.minHealthFactor === 0n) || (healthFactorPostTopUp > (Number(uppie.minHealthFactor) / 10 ** 18))
    const shouldBeFillable = (topUpSize && (doesWithdraw || doesBorrow))
    console.log({ currentHealthFactor: Number(userAccountData.healthFactor) / 10 ** 18, reproducedHealthFactor, healthFactorPostTopUp, minHealthFactor: Number(uppie.minHealthFactor) / 10 ** 18 })
    console.log(`\n-----checking uppie-----`)
    console.log({ recipientAddress: uppie.recipient, payeeAddress: uppie.payee, uppiesIndex: uppie.index }, {
        doesWithdraw,
        doesBorrow,
        canBorrow: uppie.canBorrow,
        canWithdraw: uppie.canWithdraw,
        isBelowThreshold,
        wontExceedMaxDebt,
        wontGoBelowMinHealthFactor,
        payeeHasBalance,
        enoughAllowance,
        enoughCreditDelegation,
        topUpSize,
        shouldBeFillable
    })
    console.log(`\n----------------\n`)
    // TODO check that contract cant do topUpSize of zero!!
    return shouldBeFillable

}

/**
 * 
 * @param {uppiesPerUser} uppiesPerUser 
 * @returns {syncedUppie[]}
 */
export function flattenUppiesPerUser(uppiesPerUser) {
    return Object.keys(uppiesPerUser).map(
        (payeeAddress) => Object.keys(uppiesPerUser[payeeAddress]).map(
            (index) => uppiesPerUser[payeeAddress][index]
        )
    ).flat()
}

/**
 * 
 * @param {{uppies: uppie[],uppiesContract:UppiesContract, maxConcurrentCalls: number}} param0 
 * @returns {Promise<ethers.Transaction>}
 */
export async function fillUppies({ uppies, uppiesContract, maxConcurrentCalls = 20 }) {
    const batches = Math.ceil(uppies.length / maxConcurrentCalls)
    const allTxs = []
    for (let index = 0; index < batches; index++) {
        const uppieBatch = uppies.slice(index * maxConcurrentCalls, (index + 1) * maxConcurrentCalls)
        const fillableUppiesPromises = uppieBatch.map((uppie) => isFillableUppie({ uppie, uppiesContract: uppiesContract }))
        const fillableUppiesBools = await Promise.all(fillableUppiesPromises)
        const fillableUppies = uppieBatch.filter((uppie, index) => fillableUppiesBools[index])
        const pendingFills = fillableUppies.map((uppie) => fillUppie({ uppie, uppiesContract: uppiesContract, isSponsored: false }))
        allTxs.push(await Promise.all(pendingFills))
    }
    return allTxs.flat()
}

/** 
 * @param {{uppie:syncedUppie, uppiesContract:UppiesContract}} param0 
 * @returns 
 */
export async function isFillableUppie({ uppie, uppiesContract, isSponsored = false }) {
    try {
        const gas = await uppiesContract.fillUppie.estimateGas(uppie.index, uppie.payee, isSponsored)
        return true
    } catch (error) {
        if (error.message.startsWith("VM Exception while processing transaction:") || error.message.startsWith("missing revert data") || error.message.startsWith("execution reverted")) {
            return false
        } else {
            console.log({ message: error.message })
            //throw new Error("Transaction simulation failed. Cant determine if it's a fillable uppie.", { cause: error });
            console.error("Transaction simulation failed. Cant determine if it's a fillable uppie.", { cause: error });
        }
    }
}
function invertAaveOraclePrice(oraclePrice) {
    // (1 / price) to invert the price. (ex eure/xDai -> xDai/eure) but 1*10000000000000000 because price is returned 10^8 to large so we need to do (10^(8*2) / price)
    return 10000000000000000n / oraclePrice;
}

function convertWithAaveOraclePrice(amount, oraclePrice) {
    // aave oracle prices are 10^8 too large
    return amount * oraclePrice / 100000000n;
}


/** 
 * @typedef {{isFillable: boolean, isProfitable: boolean, expectedCostToken: BigInt, fillerExpectedRewardToken: BigInt, estimatedGas: BigInt, uppieEstimatedGas: BigInt}} profitInfo
 * @param {{uppie:syncedUppie, uppiesContract:UppiesContract, aaveOracle:import("../types/ethers-contracts/Uppies.sol/IAaveOracle").IAaveOracle}} param0 
 * @returns {Promise<profitInfo>}
 */
export async function estimateProfitFillUppie({ uppie, uppiesContract, isSponsored = false, aaveOracle }) {
    try {
        const estimatedGas = await uppiesContract.fillUppie.estimateGas(uppie.index, uppie.payee, isSponsored)
        const underlyingTokenPrice = invertAaveOraclePrice(await aaveOracle.getAssetPrice(uppie.underlyingToken))
        const estimatedFeeData = await uppiesContract.runner.provider.getFeeData()
        const baseFee = estimatedFeeData.gasPrice
        const priorityFee = estimatedFeeData.maxPriorityFeePerGas
        const uppieExpectedGasCostNative = (uppie.gas.topUpGas * (baseFee + uppie.gas.priorityFee))
        const fillerExpectedRewardToken = uppie.gas.fillerReward + convertWithAaveOraclePrice(uppieExpectedGasCostNative, underlyingTokenPrice)
        const expectedCostToken = convertWithAaveOraclePrice(estimatedGas * (baseFee + priorityFee), underlyingTokenPrice)
        const isProfitable = fillerExpectedRewardToken > expectedCostToken
        return { isFillable: true, isProfitable, expectedCostToken, fillerExpectedRewardToken, estimatedGas, uppieEstimatedGas: uppie.gas.topUpGas }
    } catch (error) {
        return { isFillable: false, isProfitable: false }
    }
}


/**
 * 
 * @param {{address:ethers.BytesLike, uppiesContract:UppiesContract}} param0 
 * @returns {syncedUppie} uppie
 */
export async function getUppie({ address, index, uppiesContract }) {
    const uppieFromChain = await getNamedStruct(uppiesContract, "uppiesPerUser", [address, index])
    return { ...uppieFromChain, payee: address, index }

}

/**
 * 
 * @param {{address:ethers.BytesLike, uppiesContract:UppiesContract}} param0 
 * @returns {Promise<syncedUppie[]>} uppies
 */
export async function getAllUppies({ address, uppiesContract, maxConcurrentCalls = 20 }) {
    const highestUppieIndex = await uppiesContract.nextUppieIndexPerUser(address)
    // TODO will break on high amounts if rpc is weak
    const uppiesIndexes = new Array(Number(highestUppieIndex)).fill(0).map((v, i) => i)

    const batches = Math.ceil(uppiesIndexes.length / maxConcurrentCalls)
    const uppies = []
    for (let index = 0; index < batches; index++) {
        const uppieIndexesBatch = uppiesIndexes.slice((index) * maxConcurrentCalls, (index + 1) * maxConcurrentCalls)
        const uppieBatch = await Promise.all(uppieIndexesBatch.map((index) => getUppie({ address, index, uppiesContract })))
        uppies.push(uppieBatch.filter((uppie) => uppie.canBorrow || uppie.canWithdraw))
    }
    return uppies.flat()
}    
