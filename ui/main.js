import { ethers } from 'ethers';
window.ethers = ethers

import { Uppies__factory } from '../types/ethers-contracts/factories/Uppies.sol/Uppies__factory';
import erc20Abi from "./erc20ABI.json"
import ATokenABI from "./ATokenABI.json"
import { estimateProfitFillUppie, getAllUppies, isFillableUppie } from '../scripts/uppie-lib';
import { IAToken__factory } from '../types/ethers-contracts/factories/interfaces/aave/IAToken__factory';
import { IPool__factory } from '../types/ethers-contracts/factories/interfaces/aave/IPool__factory';
import { ICreditDelegationToken__factory } from '../types/ethers-contracts/factories/interfaces/aave/ICreditDelegationToken__factory';
import { IAaveOracle__factory } from '../types/ethers-contracts/factories/Uppies.sol/IAaveOracle__factory';
window.getAllUppies = getAllUppies

/**
 * @typedef {defaultUppie:syncedUppie} defaultUppie
 */
const defaultUppie = {
    canWithdraw: true,
    canBorrow: false,
    topUpTarget: undefined,
    recipient: undefined,
    underlyingToken: "0xcB444e90D8198415266c6a2724b7900fb12FC56E",
    payee: "0xe1faDc36322d8ba0Dd766BF62cafc3E6e6e70B47",
    maxDebt: undefined,
    topUpThreshold: undefined,
    minHealthFactor: 0n,        // 1.1 when borrow
    aaveToken: "0xEdBC7449a9b594CA4E053D9737EC5Dc4CbCcBfb2",
    gas: {
        maxBaseFee: 30000000000n,
        priorityFee: 10000000n,
        fillerReward: 1000000000000000n,
        topUpGas: 449152n
    }
}

// TODO form.getElementsByClassName("currentAllowance") bad, should be a class

const form = document.getElementById("createNewUppie")
window.createNewUppieInputsDiv = form

// TODO reload on switching accounts

/**
 * @typedef {import('../scripts/uppie-lib').UppiesContract} UppiesContract
 */

const CONTRACT_ADDRESS = "0xF438b730996Ad8CF60B58881c5defa72535b8Dbf"
const TOP_UP_GAS = 474336n
const CHAININFO = {
    chainId: "0x64",
    rpcUrls: ["https://rpc.gnosischain.com"],
    chainName: "Gnosis chain",
    nativeCurrency: {
        name: "XDAI",
        symbol: "XDAI",
        decimals: 18
    },
    blockExplorerUrls: ["https://gnosisscan.io/"]
}


/**
 * @typedef {{ symbol: bigint, name: bigint, decimals: bigint }} tokenInfo
 * @param {*} param0 
 * @returns {Promise<tokenInfo>}
 */
async function getTokenInfo({ address, provider, contractObj }) {
    const contract = contractObj ? contractObj : new ethers.Contract(address, erc20Abi, provider)
    const symbol = contract.symbol()
    const name = contract.name()
    const decimals = contract.decimals()
    return { symbol: await symbol, name: await name, decimals: await decimals }

}

async function postTxLinkUi(hash, add = false) {
    const link = `https://gnosisscan.io/tx/${hash}`;
    const div = document.getElementById("txlinks")
    if (!add) {
        div.innerHTML = ""
    }
    const a = document.createElement("a")
    a.innerText = link
    a.href = link
    div.appendChild(a)
    div.appendChild(document.createElement("br"))
}

async function removeUppieHandler({ index, uppiesContract }) {
    console.log("removing: ", { index })
    const tx = await uppiesContract.removeUppie(index)
    postTxLinkUi(tx.hash)
}

async function makeEditUppieFrom({signer, provider, uppiesContract, aavePoolInstance, uppie, index}) {
    const editUppieForm = document.getElementById("createNewUppie").cloneNode(true)
    editUppieForm.id = ""
    const editTitle = document.createElement("h3")
    editTitle.innerText = `edit uppie ${index}`
    editUppieForm.prepend(editTitle)
    await initializeUppieForm({ form:editUppieForm, signer, provider, uppiesContract, aavePoolInstance, uppie, uppieIndex:index, type:"edit"})
    const editUppieBtn = editUppieForm.getElementsByClassName("createUppie")[0]
    editUppieBtn.innerText = "edit uppie"
    editUppieForm.hidden = true
    return editUppieForm
    
}

/**
 * 
 * @param {{event, uppiesContract:UppiesContract,aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPoolInterface}} param0 
 */
async function editUppieHandler({ event, uppiesContract, aavePoolInstance, index, form }) {
    const provider = uppiesContract.runner.provider
    const signer = uppiesContract.runner
    const uppie = await getUppieFromForm({ provider, form })

    const canWithdraw = form.getElementsByClassName("canWithdrawInput")[0].checked
    const canBorrow = form.getElementsByClassName("canBorrowInput")[0].checked
    if (canWithdraw) {
        setATokenAllowance({ uppiesContract, signer, form }).then(async (tx) => tx ? await postTxLinkUi(tx.hash, true) : false)
    }
    if (canBorrow) {
        setCreditDelegation({ uppiesContract, signer, aavePoolInstance, form }).then(async (tx) => tx ? await postTxLinkUi(tx.hash, true) : false)
    }

    uppiesContract.editUppie(uppie, index).then(async (tx) => await postTxLinkUi(tx.hash, true))
}

function showEditUppieHandler({form, editUppieBtn}) {
    if(form.hidden) {
        form.hidden = false
        editUppieBtn.innerText = "hide edit"
    } else {
        form.hidden = true
        editUppieBtn.innerText = "show edit"
    }
}
/**
 * 
 * @param {{ address, uppiesContract:UppiesContract }} param0 
 */
async function listAllUppies({ address, uppiesContract,aavePoolInstance,aaveOracle }) {
    const provider = uppiesContract.runner.provider
    const allUppies = await getAllUppies({ address, uppiesContract })
    console.log({ allUppies })
    if (allUppies.length > 0) {
        document.getElementById("existingUppies").hidden = false
    }

    const existingUppiesUl = document.getElementById("existingUppiesUl")
    for (const [index, uppie] of Object.entries(allUppies)) {
        console.log({index:uppie.index},await estimateProfitFillUppie({uppie, uppiesContract, aaveOracle}))
        
        const uppieLi = document.createElement("li")
        const underlyingToken = await getTokenInfo({ address: uppie.underlyingToken, provider: provider })
        // TODO edit button
        uppieLi.innerText = ` Uppie: ${uppie.index}
        recipient: ${uppie.recipient} 
        target balance: ${ethers.formatUnits(uppie.topUpTarget, underlyingToken.decimals)}  ${underlyingToken.symbol}
        token: ${underlyingToken.name}
        can: ${[uppie.canWithdraw ? "withdraw" : false,uppie.canBorrow ? "borrow" : false].filter((v)=>v).toString()}
        `
        const removeUppieBtn = document.createElement("button")
        const editUppieBtn = document.createElement("button")
        removeUppieBtn.innerText = "remove"
        editUppieBtn.innerText = "show edit"
        removeUppieBtn.addEventListener("click", (event) => removeUppieHandler({ index: uppie.index, uppiesContract }))
        const editUppieForm = await makeEditUppieFrom({signer, provider, uppiesContract, aavePoolInstance, uppie, index})
        editUppieBtn.addEventListener("click", (event) => showEditUppieHandler({form:editUppieForm, editUppieBtn }))
       
        const isFillable = await isFillableUppie({uppie, uppiesContract, isSponsored:true})
        uppieLi.append(removeUppieBtn, editUppieBtn,editUppieForm)
        if (isFillable) {
            const manualFillUppieBtn = document.createElement("button")
            uppiesContract.connect(signer)
            manualFillUppieBtn.addEventListener("click", async ()=> await uppiesContract.fillUppie(uppie.index, uppie.payee, false))
            manualFillUppieBtn.innerText = "fill manually"
            uppieLi.append(manualFillUppieBtn)
        }
        
        existingUppiesUl.appendChild(uppieLi)
    }

}


async function showAdvancedBtnHandler({ uppiesContract, form, advancedOptionsBtn }) {
    const advancedOptionsEl = form.getElementsByClassName("advancedOptions")[0]
    if (advancedOptionsEl.hidden) {
        advancedOptionsEl.hidden = false
        advancedOptionsBtn.innerText = "hide advanced options"
    } else {
        advancedOptionsEl.hidden = true
        advancedOptionsBtn.innerText = "show advanced options"
    }
    const underlyingTokenAddress = form.getElementsByClassName("underlyingTokenInput")[0].value
    await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress, form })
    validUppieFormCheck({ uppiesContract, form })
}

function topUpThresholdInputHandler({ event, uppiesContract, form }) {
    const topUpTargetEl = form.getElementsByClassName("topUpTargetInput")[0]
    const topUpThresholdEl = form.getElementsByClassName("topUpThresholdInput")[0]
    if (Number(topUpTargetEl.value) < Number(topUpThresholdEl.value)) {
        topUpTargetEl.value = topUpThresholdEl.value
        setClassWithEvent("topUpTarget", event, form)
    }
    setClassWithEvent("topUpThreshold", event, form)

    if (form.getElementsByClassName("advancedOptions")[0].hidden) {
        const permissionSuggestion = (Number(topUpTargetEl.value) * 20).toString()
        form.getElementsByClassName("aaveTokenPermissionInput")[0].value = permissionSuggestion
        form.getElementsByClassName("aaveDelegationInput")[0].value = permissionSuggestion
    }
    validUppieFormCheck({ uppiesContract, form })
}

async function topUpTargetInputHandler({ provider, uppiesContract, form }) {
    const topUpTargetEl = form.getElementsByClassName("topUpTargetInput")[0]
    const topUpThresholdEl = form.getElementsByClassName("topUpThresholdInput")[0]
    const advancedOptionsEl = form.getElementsByClassName("advancedOptions")[0]
    if (advancedOptionsEl.hidden || Number(topUpTargetEl.value) < Number(topUpThresholdEl.value)) {
        topUpThresholdEl.value = topUpTargetEl.value
    }
    if (form.getElementsByClassName("advancedOptions")[0].hidden) {
        const permissionSuggestion = (Number(topUpTargetEl.value) * 20).toString()
        form.getElementsByClassName("aaveTokenPermissionInput")[0].value = permissionSuggestion
        form.getElementsByClassName("aaveDelegationInput")[0].value = permissionSuggestion
    }

    validUppieFormCheck({ uppiesContract, form })
}

function setClassWithEvent(classname, event, rootEl=undefined) {
    setClass({ classname, value: event.target.value, rootEl })
}

async function switchNetwork(network, provider) {
    try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: network.chainId }]);

    } catch (switchError) {
        window.switchError = switchError
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.error && switchError.error.code === 4902) {
            try {
                await provider.send("wallet_addEthereumChain", [network]);

            } catch (addError) {
                // handle "add" error
            }
        }
        // handle other "switch" errors
    }
}

async function getUppiesWithSigner({ chain = CHAININFO, contractAddress = CONTRACT_ADDRESS } = {}) {
    const provider = new ethers.BrowserProvider(window.ethereum)
    window.provider = provider //debug moment
    await switchNetwork(chain, provider)
    const signer = await provider.getSigner();
    const contract = Uppies__factory.connect(contractAddress, signer)
    return { contract, signer }

}

function setClass({ classname, value, rootEl=undefined }) {
    rootEl = rootEl ? rootEl : document
    for (const element of rootEl.getElementsByClassName(classname)) {
        element.innerText = value
    }
}

async function getUnderlyingToken({ aaveTokenContract }) {
    try {
        return await aaveTokenContract.UNDERLYING_ASSET_ADDRESS()
    } catch (error) {
        console.log(error)
        return false
    }
}
/**
 * 
 * @param {{ event, signer, provider, uppiesContract, aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPool }} param0 
 */
async function aaveTokenInputHandler({ signer, provider, uppiesContract, aavePoolInstance, form, aaveTokenAddress }) {
    const aaveTokenInput = form.getElementsByClassName("aaveTokenInput")[0]
    if (aaveTokenAddress === undefined) {
        aaveTokenAddress = aaveTokenInput.value
    } else {
        aaveTokenInput.value = aaveTokenAddress
    }
    let isValidInput
    let underlyingTokenAddress;
    if (ethers.isAddress(aaveTokenAddress)) {
        const aaveTokenContract = IAToken__factory.connect(aaveTokenAddress, provider)//new ethers.Contract(aaveTokenAddress, ATokenABI, provider)
        aaveTokenContract.decimals
        underlyingTokenAddress = await getUnderlyingToken({ aaveTokenContract })
        const aaveDebtToken = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
        const debtToken = ICreditDelegationToken__factory.connect(aaveDebtToken, provider)
        isValidInput = Boolean(underlyingTokenAddress)
        if (isValidInput) {
            const underlyingToken = getTokenInfo({ address: (await underlyingTokenAddress), provider })
            const aaveToken = getTokenInfo({ address: aaveTokenAddress, provider })
            const currentAaveTokenAllowance = aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
            const currentAaveTokenDelegation = debtToken.borrowAllowance(signer.address, uppiesContract.target)
            form.getElementsByClassName("currentAllowance")[0].innerText = Math.round(ethers.formatUnits(await currentAaveTokenAllowance, (await aaveToken).decimals) * 10000) / 10000
            form.getElementsByClassName("currentDelegation")[0].innerText = Math.round(ethers.formatUnits(await currentAaveTokenDelegation, (await aaveToken).decimals) * 10000) / 10000

            form.getElementsByClassName("underlyingTokenInput")[0].value = await underlyingTokenAddress
            setClass({ classname: "underlyingTokenName", value: (await underlyingToken).name, rootEl:form })
            setClass({ classname: "underlyingTokenSymbol", value: (await underlyingToken).symbol, rootEl:form })
            setClass({ classname: "aaveTokenName", value: (await aaveToken).name, rootEl:form })
            setClass({ classname: "aaveTokenSymbol", value: (await aaveToken).symbol, rootEl:form })

            window.decimals = aaveTokenContract.decimals()
        } else {
            form.getElementsByClassName("underlyingTokenInput")[0].value = ""
            setClass({ classname: "underlyingTokenName", value: "", rootEl:form })
            setClass({ classname: "underlyingTokenSymbol", value: "", rootEl:form })
            setClass({ classname: "aaveTokenName", value: "", rootEl:form })
        }
        validUppieFormCheck({ uppiesContract, form })
    }


}

async function getReserveAToken({ underlyingTokenAddress, aavePoolInstance }) {
    try {
        const reserveToken = await aavePoolInstance.getReserveAToken(underlyingTokenAddress)
        if (reserveToken === "0x0000000000000000000000000000000000000000") {
            console.error(`${underlyingTokenAddress} is not an underlying token on aave`)
            return false
        } else {
            return reserveToken
        }
    } catch (error) {
        console.log(error)
        return false
    }
}

/**
 * 
 * @param {{event, signer, provider, aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPool, uppiesContract:UppiesContract}} param0 
 * @returns {{underlyingTokenInfo:tokenInfo,aaveTokenInfo:tokenInfo,aaveDebtTokenInfo:tokenInfo, debtToken}}
 */
async function underlyingTokenInputHandler({ signer, provider, aavePoolInstance, uppiesContract, form, underlyingTokenAddress }) {
    const underlyingTokenInput = form.getElementsByClassName("underlyingTokenInput")[0]
    if (underlyingTokenAddress === undefined) {
        underlyingTokenAddress = underlyingTokenInput.value
    } else {
        underlyingTokenInput.value = underlyingTokenAddress
    }

    let isValidInput;
    let aaveTokenAddress;
    if (ethers.isAddress(underlyingTokenAddress)) {
        aaveTokenAddress = await getReserveAToken({ underlyingTokenAddress, aavePoolInstance })
        isValidInput = Boolean(aaveTokenAddress)
    }
    if (isValidInput) {
        const underlyingTokenInfo = getTokenInfo({ address: underlyingTokenAddress, provider })
        const aaveTokenInfo = getTokenInfo({ address: await aaveTokenAddress, provider })
        const aaveTokenContract = IAToken__factory.connect(await aaveTokenAddress, provider)
        const currentAaveTokenAllowance = aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
        const aaveDebtTokenAddress = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
        const debtTokenContract = ICreditDelegationToken__factory.connect(aaveDebtTokenAddress, provider)
        const aaveDebtTokenInfo = getTokenInfo({ provider, contractObj:debtTokenContract })

        const currentAaveTokenDelegation = debtTokenContract.borrowAllowance(signer.address, uppiesContract.target)
        form.getElementsByClassName("currentAllowance")[0].innerText = Math.round(ethers.formatUnits(await currentAaveTokenAllowance, (await aaveTokenInfo).decimals) * 10000) / 10000
        form.getElementsByClassName("currentDelegation")[0].innerText = Math.round(ethers.formatUnits(await currentAaveTokenDelegation, (await aaveDebtTokenInfo).decimals) * 10000) / 10000

        form.getElementsByClassName("aaveTokenInput")[0].value = await aaveTokenAddress
        setClass({ classname: "underlyingTokenName", value: (await underlyingTokenInfo).name, rootEl:form })
        setClass({ classname: "underlyingTokenSymbol", value: (await underlyingTokenInfo).symbol, rootEl:form })
        setClass({ classname: "aaveTokenName", value: (await aaveTokenInfo).name, rootEl:form })
        setClass({ classname: "aaveTokenSymbol", value: (await aaveTokenInfo).symbol, rootEl:form })

        await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress, form })

        return { underlyingTokenInfo: await underlyingTokenInfo, aaveTokenInfo: await aaveTokenInfo, aaveDebtTokenInfo: await aaveDebtTokenInfo, debtToken: debtTokenContract }


    } else {
        form.getElementsByClassName("underlyingTokenInput")[0].value = ""
        setClass({ classname: "underlyingTokenName", value: "", rootEl:form })
        setClass({ classname: "underlyingTokenSymbol", value: "", rootEl:form })
        setClass({ classname: "aaveTokenName", value: "", rootEl:form })
    }

    validUppieFormCheck({ uppiesContract, form })


}

async function setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress, form }) {
    if (form.getElementsByClassName("advancedOptions")[0].hidden) {
        const payee = form.getElementsByClassName("payeeInput")[0].value
        const healthShouldBeZero = (!form.getElementsByClassName("canBorrowInput")[0].checked) && !(await uppiesContract._isUsedAsCollateral(payee, await underlyingTokenAddress))
        if (healthShouldBeZero) {
            form.getElementsByClassName("minHealthFactorInput")[0].value = 0
        } else {
            form.getElementsByClassName("minHealthFactorInput")[0].value = 1.1
        }
    }

}

async function getUppieFromForm({ provider, form }) {
    const formNodes = form.querySelectorAll("input");
    const uppie = Object.fromEntries([...formNodes].map((n) => n.type === "checkbox" ? [n.name, n.checked] : [n.name, n.value]))

    // formatting
    const underlyingTokenInfo = await getTokenInfo({ address: uppie.underlyingToken, provider })
    // TODO use the real debt token address here 
    const debtTokenInfo = await getTokenInfo({ address: uppie.underlyingToken, provider })
    uppie.topUpThreshold = ethers.parseUnits(uppie.topUpThreshold, underlyingTokenInfo.decimals)
    uppie.topUpTarget = ethers.parseUnits(uppie.topUpTarget, underlyingTokenInfo.decimals)
    uppie.minHealthFactor = ethers.parseUnits(uppie.minHealthFactor, 18)//BigInt(Number(uppie.minHealthFactor) * 10 ** 18)
    uppie.maxDebt = uppie.maxDebt === "" ? 0n : ethers.parseUnits(uppie.maxDebt, debtTokenInfo.decimals)

    // move gasSettings
    uppie.gas = {
        maxBaseFee: BigInt(Number(uppie.maxBaseFee) * 10 ** 9),
        priorityFee: BigInt(Number(uppie.priorityFee) * 10 ** 9),
        fillerReward: ethers.parseUnits(uppie.fillerReward, underlyingTokenInfo.decimals),
        topUpGas: TOP_UP_GAS
    }
    // moved
    delete uppie.maxBaseFee
    delete uppie.priorityFee
    delete uppie.fillerReward

    // not needed
    delete uppie.aaveDelegation
    delete uppie.aaveTokenPermission
    console.log("got uppie from form: ",{ uppie })
    return uppie
}
window.getUppieFromForm = getUppieFromForm

/**
 * 
 * @param {{aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPool, runner: ethers.ContractRunner}} param0 
 * @returns {Promise<import('../types/ethers-contracts/interfaces/aave/ICreditDelegationToken').ICreditDelegationToken>}
 */
async function getDebtToken({ aavePoolInstance, runner, form }) {
    const underlyingTokenAddress = ethers.getAddress(form.getElementsByClassName("underlyingTokenInput")[0].value)
    const debtTokenAddress = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
    return ICreditDelegationToken__factory.connect(debtTokenAddress, runner)
}

/**
 * 
 * @param {{runner: ethers.ContractRunner}} param0 
 * @returns {import('../types/ethers-contracts/interfaces/aave/IAToken').IAToken}
 */
function getAToken({ runner, form }) {
    const ATokenAddress = ethers.getAddress(form.getElementsByClassName("aaveTokenInput")[0].value)
    return IAToken__factory.connect(ATokenAddress, runner)
}

/**
 * 
 * @param {{event, uppiesContract:UppiesContract,aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPoolInterface}} param0 
 */
async function createUppieHandler({ event, uppiesContract, aavePoolInstance, form }) {
    const provider = uppiesContract.runner.provider
    const signer = uppiesContract.runner
    const uppie = await getUppieFromForm({ provider, form })

    const canWithdraw = form.getElementsByClassName("canWithdrawInput")[0].checked
    const canBorrow = form.getElementsByClassName("canBorrowInput")[0].checked
    if (canWithdraw) {
        setATokenAllowance({ uppiesContract, signer, form }).then(async (tx) => tx ? await postTxLinkUi(tx.hash, true) : false)
    }
    if (canBorrow) {
        setCreditDelegation({ uppiesContract, signer, aavePoolInstance, form }).then(async (tx) => tx ? await postTxLinkUi(tx.hash, true) : false)
    }

    uppiesContract.createUppie(uppie).then(async (tx) => await postTxLinkUi(tx.hash, true))
}

/**
 * 
 * @param {*} param0 
 * @returns {Promise<ethers.Transaction} tx
 */
async function setATokenAllowance({ event, uppiesContract, signer, form, allowLowering = false }) {
    const AToken = getAToken({ runner: signer, form })
    const decimals = await AToken.decimals()

    const allowanceUi = ethers.parseUnits(form.getElementsByClassName("aaveTokenPermissionInput")[0].value, decimals)
    const allowanceChain = await AToken.allowance(signer.address, uppiesContract.target)
    if (allowanceUi > allowanceChain || allowLowering) {
        const tx = await AToken.approve(uppiesContract.target, allowanceUi)
        return tx
    }
}

/**
 * 
 * @param {*} param0 
 * @returns {Promise<ethers.Transaction} tx
 */
async function setCreditDelegation({ event, uppiesContract, signer, aavePoolInstance, form, allowLowering = false }) {
    const debtToken = await getDebtToken({ aavePoolInstance, runner: signer, form })
    const decimals = await debtToken.decimals()

    const allowanceUi = ethers.parseUnits(form.getElementsByClassName("aaveDelegationInput")[0].value, decimals)
    const allowanceChain = await debtToken.borrowAllowance(signer.address, uppiesContract.target)
    if (allowanceUi > allowanceChain || allowLowering) {
        const tx = await debtToken.approveDelegation(uppiesContract.target, allowanceUi)
        return tx
    }
}

async function canBorrowInputHandler({ event, signer, provider, form, uppiesContract, setHealthFactor = true , isChecked=undefined}) {
    const canBorrowInput = form.getElementsByClassName("canBorrowInput")[0]
    if (isChecked!==undefined) {
        canBorrowInput.checked = isChecked
    } else {
        isChecked = canBorrowInput.checked
    }

    const showOnCanBorrowDivs = [...form.getElementsByClassName("showOnCanBorrow")]
    if (isChecked) {
        showOnCanBorrowDivs.forEach((e) => e.hidden = false)
    } else {
        showOnCanBorrowDivs.forEach((e) => e.hidden = true)
    }
    const underlyingTokenAddress = form.getElementsByClassName("underlyingTokenInput")[0].value
    if (setHealthFactor && ethers.isAddress(underlyingTokenAddress)) {
        await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress, form })
    }
    await validUppieFormCheck({ uppiesContract, form })
}

async function canWithdrawInputHandler({  form, uppiesContract, isChecked=undefined }) {
    const canWithdrawInput = form.getElementsByClassName("canWithdrawInput")[0]
    if (isChecked!==undefined) {
        canWithdrawInput.checked = isChecked
    } else {
        isChecked = canWithdrawInput.checked
    }

    const showOnCanBorrowDivs = [...form.getElementsByClassName("showOnCanWithdraw")]
    if (isChecked) {
        showOnCanBorrowDivs.forEach((e) => e.hidden = false)
    } else {
        showOnCanBorrowDivs.forEach((e) => e.hidden = true)
    }
    await validUppieFormCheck({ uppiesContract, form })
}
/**
 * 
 * @param {{uppiesContract:UppiesContract}} param0 
 */
async function validUppieFormCheck({ uppiesContract, form }) {
    // TODO the allowance // permisions
    const inputStatus = {
        // checkbox
        canWithdrawInput: { el: form.getElementsByClassName("canWithdrawInput")[0], isValid: true },
        canBorrowInput: { el: form.getElementsByClassName("canBorrowInput")[0], isValid: true },
        // top-up target
        topUpTargetInput: { el: form.getElementsByClassName("topUpTargetInput")[0], isValid: true },
        // addresses
        recipientAccountInput: { el: form.getElementsByClassName("recipientAccountInput")[0], isValid: true },
        payeeInput: { el: form.getElementsByClassName("payeeInput")[0], isValid: true },
        underlyingTokenInput: { el: form.getElementsByClassName("underlyingTokenInput")[0], isValid: true },
        // debt
        maxDebtInput: { el: form.getElementsByClassName("maxDebtInput")[0], isValid: true },

        // advanced
        // additional rules
        topUpThresholdInput: { el: form.getElementsByClassName("topUpThresholdInput")[0], isValid: true },
        minHealthFactorInput: { el: form.getElementsByClassName("minHealthFactorInput")[0], isValid: true },
        // fee settings
        maxBaseFeeInput: { el: form.getElementsByClassName("maxBaseFeeInput")[0], isValid: true },
        priorityFeeInput: { el: form.getElementsByClassName("priorityFeeInput")[0], isValid: true },
        fillerRewardInput: { el: form.getElementsByClassName("fillerRewardInput")[0], isValid: true },
        //permissions
        aaveTokenPermissionInput: { el: form.getElementsByClassName("aaveTokenPermissionInput")[0], isValid: true },
        aaveDelegationInput: { el: form.getElementsByClassName("aaveDelegationInput")[0], isValid: true },
        //token
        aaveTokenInput: { el: form.getElementsByClassName("aaveTokenInput")[0], isValid: true },
    }

    // TODO make a isAddress check and use that to tell the user input bad instead of insta deleting it
    const checkEmpty = (v, n, c) => v === "" ? { isValid: false, reason: `${n} cant be empty` } : { isValid: true, reason: undefined }
    const checkZero = (v, n, c) => v === "0" || v === 0 ? { isValid: false, reason: `${n} cant be zero` } : { isValid: true, reason: undefined }
    const checkLarger = (v, n, c) => Number(v) > c ? { isValid: false, reason: `${n} cant be larger then ${c}` } : { isValid: true, reason: undefined }
    const checkSmaller = (v, n, c) => Number(v) < c ? { isValid: false, reason: `${n} cant be smaller then ${c}` } : { isValid: true, reason: undefined }
    const checkIsAddress = (v, n, c) => !ethers.isAddress(v) ? { isValid: false, reason: `${n}: "${v}" not an address ` } : { isValid: true, reason: undefined }
    const canWithdraw = inputStatus.canWithdrawInput.el.checked
    const canBorrow = inputStatus.canBorrowInput.el.checked
    const noRulesEnabled = canWithdraw === false && canBorrow === false

    if (noRulesEnabled) {
        inputStatus.canWithdrawInput.isValid = false
        inputStatus.canBorrowInput.isValid = false
        const reason = "neither borrow or withdraw is enabled. Enable at least one!"
        inputStatus.canWithdrawInput.reason = reason
        inputStatus.canBorrowInput.reason = reason
    }

    // TODO maxDebtInput should be set if canBorrow, other wise its fine
    // checkIfSet(inputStatus, "maxDebtInput")[0]
    if (canBorrow) {
        runChecks(inputStatus, "maxDebtInput", [checkEmpty, checkZero])
    } else {
        inputStatus.maxDebtInput.isValid = true
    }

    // TODO minHealthFactorInput should be set if underlyingTokenIsCollateral or/and canBorrow
    const payee = inputStatus.payeeInput.el.value
    const underlyingTokenAddress = inputStatus.underlyingTokenInput.el.value
    const underlyingIsCollateral = ethers.isAddress(underlyingTokenAddress) ? await uppiesContract._isUsedAsCollateral(payee, underlyingTokenAddress) : false
    if (underlyingIsCollateral || inputStatus.canBorrowInput.el.checked) {
        runChecks(inputStatus, "minHealthFactorInput", [checkEmpty, checkZero, checkSmaller], 1.01)
    }

    const currentApproval = Number(form.getElementsByClassName("currentAllowance")[0].innerText)
    if (currentApproval < 0 && canWithdraw) {
        runChecks(inputStatus, "aaveTokenPermissionInput", [checkEmpty, checkZero])
    } else {
        inputStatus.aaveTokenPermissionInput.isValid = true
        inputStatus.aaveTokenPermissionInput.reason = undefined
    }

    const currentDelegation = Number(form.getElementsByClassName("currentDelegation")[0].innerText)
    if (currentDelegation < 0 && canBorrow) {
        runChecks(inputStatus, "aaveDelegationInput", [checkEmpty, checkZero])
    } else {
        inputStatus.aaveDelegationInput.isValid = true
        inputStatus.aaveDelegationInput.reason = undefined
    }

    runChecks(inputStatus, "topUpTargetInput", [checkEmpty, checkZero])
    runChecks(inputStatus, "recipientAccountInput", [checkEmpty, checkIsAddress])
    runChecks(inputStatus, "payeeInput", [checkEmpty, checkIsAddress])
    runChecks(inputStatus, "underlyingTokenInput", [checkEmpty, checkIsAddress])
    runChecks(inputStatus, "topUpThresholdInput", [checkEmpty, checkZero])
    runChecks(inputStatus, "maxBaseFeeInput", [checkEmpty])
    runChecks(inputStatus, "priorityFeeInput", [checkEmpty])
    runChecks(inputStatus, "fillerRewardInput", [checkEmpty])
    runChecks(inputStatus, "aaveTokenInput", [checkEmpty, checkIsAddress])

    const createUppieBtn = form.getElementsByClassName("createUppie")[0]
    const isValidForm = Object.keys(inputStatus).reduce((prev, name, i) => prev && inputStatus[name].isValid, true)
    createUppieBtn.disabled = !isValidForm

    window.inputStatus = inputStatus
}

function runChecks(inputStatus, name, checks, comparedValue = undefined) {
    const currentValue = inputStatus[name].el.value
    for (const check of checks) {
        const result = check(currentValue, name, comparedValue)
        inputStatus[name].isValid = result.isValid === false ? result.isValid : inputStatus[name].isValid
        inputStatus[name].reason = result.reason ? result.reason : inputStatus[name].reason
    }

}
/**
 * 
 * @param {{uppie:import('../scripts/uppie-lib').uppie, form}} param0 
 */
async function setValuesForm({ uppie, form, aavePoolInstance, uppiesContract, setHealthFactor=false }) {
    const [{ underlyingTokenInfo, aaveTokenInfo, aaveDebtTokenInfo, debtToken }] = await Promise.all([
        underlyingTokenInputHandler({ underlyingTokenAddress: uppie.underlyingToken, signer, provider, aavePoolInstance, uppiesContract, form: form }),
        //aaveTokenInputHandler({aaveTokenAddress:uppie.aaveToken, signer, provider, uppiesContract, aavePoolInstance, form: form }),
        canBorrowInputHandler({ isChecked:uppie.canBorrow, signer, provider, uppiesContract, form: form, setHealthFactor }),
        canWithdrawInputHandler({isChecked:uppie.canWithdraw, signer, provider, uppiesContract, form: form }),
    ])

    const feeSettings = uppie.gas ? uppie.gas : defaultUppie.gas
    form.getElementsByClassName("maxBaseFeeInput")[0].value = ethers.formatUnits(feeSettings.maxBaseFee, 9)
    form.getElementsByClassName("priorityFeeInput")[0].value = ethers.formatUnits(feeSettings.priorityFee, 9)
    form.getElementsByClassName("fillerRewardInput")[0].value = ethers.formatUnits(feeSettings.fillerReward, underlyingTokenInfo.decimals)

    const topUpTargetInput = form.getElementsByClassName("topUpTargetInput")[0]
    const topUpThresholdInput = form.getElementsByClassName("topUpThresholdInput")[0]
    const minHealthFactorInput = form.getElementsByClassName("minHealthFactorInput")[0]
    const maxDebtInput = form.getElementsByClassName("maxDebtInput")[0]
    const recipientAccountInput = form.getElementsByClassName("recipientAccountInput")[0]

    topUpTargetInput.value = uppie.topUpTarget ? ethers.formatUnits(uppie.topUpTarget, underlyingTokenInfo.decimals) : ""
    topUpThresholdInput.value = uppie.topUpThreshold ? ethers.formatUnits(uppie.topUpThreshold, underlyingTokenInfo.decimals) : ""
    minHealthFactorInput.value = uppie.minHealthFactor ? ethers.formatUnits(uppie.minHealthFactor, 18) : minHealthFactorInput.value
    maxDebtInput.value = uppie.maxDebt ? ethers.formatUnits(uppie.maxDebt, underlyingTokenInfo.decimals) : ""
    recipientAccountInput.value = uppie.recipient ? ethers.getAddress(uppie.recipient) : ""

    await topUpTargetInputHandler({ uppiesContract, form })

}




/**
 * 
 * @param {{uppie:import('../scripts/uppie-lib').uppie}} param0 
 */
async function initializeUppieForm({ form, signer, provider, uppiesContract, aavePoolInstance, uppie, setHealthFactor = true, uppieIndex, type }) {
    console.log("init with", {uppie})
    // TODO get default values from an uppie 
    form.getElementsByClassName("payeeInput")[0].value = signer.address
    setClass({ classname: "payeeInput", value: signer.address, rootEl:form })

    await setValuesForm({ uppie: uppie, aavePoolInstance, uppiesContract, form, setHealthFactor:true })
    await validUppieFormCheck({ uppiesContract, form: form })

    // check boxes
    form.getElementsByClassName("canBorrowInput")[0].addEventListener("click", ((event) => canBorrowInputHandler({ event, signer, provider, uppiesContract, form: form, setHealthFactor })))
    form.getElementsByClassName("canWithdrawInput")[0].addEventListener("click", ((event) => canWithdrawInputHandler({ event, signer, provider, uppiesContract, form: form })))
    // target balance
    form.getElementsByClassName("topUpTargetInput")[0].addEventListener("change", (async (event) => topUpTargetInputHandler({ event, provider, uppiesContract, form: form })))
    // addresses
    form.getElementsByClassName("recipientAccountInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))
    form.getElementsByClassName("underlyingTokenInput")[0].addEventListener("change", ((event) => underlyingTokenInputHandler({ event, signer, provider, aavePoolInstance, uppiesContract, form: form })))
    form.getElementsByClassName("maxDebtInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))
    // document.getElementById("payeeInput")[0].addEventListener("keyup", ((event) => validUppieCheck())) // not editable


    // --ADVANCED--
    const advancedOptionsBtn =  form.getElementsByClassName("showAdvancedBtn")[0]
    advancedOptionsBtn.addEventListener("click", ((event) => showAdvancedBtnHandler({ uppiesContract, form: form, form: form, advancedOptionsBtn })))
    const createUppieBtn = form.getElementsByClassName("createUppie")[0]
    if(type==="edit") {
        form.getElementsByClassName("createUppie")[0].addEventListener("click", (event) => editUppieHandler({ event, uppiesContract, aavePoolInstance, index:uppieIndex, form }))
        createUppieBtn.innerText = "edit uppie"
    } else {
        form.getElementsByClassName("createUppie")[0].addEventListener("click", (event) => createUppieHandler({ event, uppiesContract, aavePoolInstance, form: form }))
    }
    

    // additional rules
    form.getElementsByClassName("minHealthFactorInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))
    form.getElementsByClassName("topUpThresholdInput")[0].addEventListener("change", ((event) => topUpThresholdInputHandler({ event, uppiesContract, form: form })))

    // fee settings
    form.getElementsByClassName("maxBaseFeeInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))
    form.getElementsByClassName("priorityFeeInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))
    form.getElementsByClassName("fillerRewardInput")[0].addEventListener("change", ((event) => validUppieFormCheck({ uppiesContract, form: form })))

    // permissions
    form.getElementsByClassName("aaveTokenPermissionBtn")[0].addEventListener("click", async (event) => setATokenAllowance({ event, uppiesContract, signer, allowLowering: true, form: form }))
    form.getElementsByClassName("aaveDelegationBtn")[0].addEventListener("click", async (event) => setCreditDelegation({ event, uppiesContract, signer, aavePoolInstance, allowLowering: true, form: form }))

    // token
    form.getElementsByClassName("aaveTokenInput")[0].addEventListener("change", ((event) => aaveTokenInputHandler({ event, signer, provider, uppiesContract, aavePoolInstance, form: form })))
}

async function main() {
    const { contract: uppiesContract, signer } = await getUppiesWithSigner()
    const contractLink = document.getElementById("contractBlockExplorerLink")
    contractLink.href = `https://gnosisscan.io/address/${uppiesContract.target}#code`
    contractLink.innerText =`gnosisscan.io/address/${uppiesContract.target}`
    window.signer = signer
    const provider = signer.provider
    const aavePoolInstance = IPool__factory.connect(await uppiesContract.aavePoolInstance(), provider)
    const aaveOracle = IAaveOracle__factory.connect(await uppiesContract.aaveOracle(), provider)
    window.aaveOracle = aaveOracle
    window.aavePoolInstance = aavePoolInstance
    listAllUppies({ address: signer.address, uppiesContract,aavePoolInstance, aaveOracle })
    window.uppiesContract = uppiesContract

    // TODO automatically set filler reward for different token types to also be worth 0.001 eure

    // buttons
    await initializeUppieForm({ form, signer, provider, uppiesContract, aavePoolInstance, uppie: defaultUppie })
}

await main()