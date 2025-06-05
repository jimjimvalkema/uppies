import { ethers } from 'ethers';
window.ethers = ethers

import { Uppies__factory } from '../types/ethers-contracts/factories/Uppies.sol/Uppies__factory';
import erc20Abi from "./erc20ABI.json"
import ATokenABI from "./ATokenABI.json"
import { getAllUppies } from '../scripts/uppie-lib';
import { IAToken__factory } from '../types/ethers-contracts/factories/interfaces/aave/IAToken__factory';
import { IPool__factory } from '../types/ethers-contracts/factories/interfaces/aave/IPool__factory';
import { ICreditDelegationToken__factory } from '../types/ethers-contracts/factories/interfaces/aave/ICreditDelegationToken__factory';
window.getAllUppies = getAllUppies


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



async function getTokenInfo({ address, provider }) {
    const contract = new ethers.Contract(address, erc20Abi, provider)
    const symbol = contract.symbol()
    const name = contract.name()
    const decimals = contract.decimals()
    return { symbol: await symbol, name: await name, decimals: await decimals }

}

async function postTxLinkUi(hash, add=false) {
    const link = `https://gnosisscan.io/tx/${hash}`;
    const div = document.getElementById("txlinks")
    if(!add) {
        div.innerHTML = ""
    }
    const a = document.createElement("a")
    a.innerText = link
    a.href = link
    div.appendChild(a)
    div.appendChild(document.createElement("br"))
}

async function removeUppieHandler({ index, uppiesContract }) {
    console.log({ uppiesContract })
    const tx = await uppiesContract.removeUppie(index)
    postTxLinkUi(tx)

}
/**
 * 
 * @param {{ address, uppiesContract:UppiesContract }} param0 
 */
async function listAllUppies({ address, uppiesContract }) {
    const provider = uppiesContract.runner.provider
    const allUppies = await getAllUppies({ address, uppiesContract })
    console.log({ allUppies })
    if (allUppies.length > 0) {
        document.getElementById("existingUppies").hidden = false
    }

    const existingUppiesUl = document.getElementById("existingUppiesUl")
    for (const [index, uppie] of Object.entries(allUppies)) {
        const uppieLi = document.createElement("li")
        const underlyingToken = await getTokenInfo({ address: uppie.underlyingToken, provider: provider })
        // TODO edit button
        uppieLi.innerText = `
        recipient: ${uppie.recipient} 
        threshold: ${ethers.formatUnits(uppie.topUpThreshold, underlyingToken.decimals)} ${underlyingToken.symbol}
        target:${ethers.formatUnits(uppie.topUpTarget, underlyingToken.decimals)}  ${underlyingToken.symbol}
        token:  ${underlyingToken.name}
        `
        const removeUppieBtn = document.createElement("button")
        const editUppieBtn = document.createElement("button")
        removeUppieBtn.innerText = "remove"
        editUppieBtn.innerText = "edit TODO"
        removeUppieBtn.addEventListener("click", (event) => removeUppieHandler({ index, uppiesContract }))
        //editUppieBtn.addEventListener("click", (event) => editUppieBtnUppieHandler({ index, uppiesContract }))
        uppieLi.append(removeUppieBtn,editUppieBtn)
        existingUppiesUl.appendChild(uppieLi)
        console.log("aaa")
    }

}
window.listAllUppies = listAllUppies


async function showAdvancedBtnHandler({ uppiesContract }) {
    const advancedOptionsEl = document.getElementById("advancedOptions")
    if (advancedOptionsEl.hidden) {
        advancedOptionsEl.hidden = false
    } else {
        advancedOptionsEl.hidden = true
    }
    const underlyingTokenAddress = document.getElementById("underlyingTokenInput").value
    await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress })
    validUppieFormCheck({ uppiesContract })
}

function topUpThresholdInputHandler({ event, uppiesContract }) {
    const topUpTargetEl = document.getElementById("topUpTargetInput")
    const topUpThresholdEl = document.getElementById("topUpThresholdInput")
    console.log(Number(topUpTargetEl.value), Number(topUpThresholdEl.value))
    if (Number(topUpTargetEl.value) < Number(topUpThresholdEl.value)) {
        topUpTargetEl.value = topUpThresholdEl.value
        setClassWithEvent("topUpTarget", event)
    }
    setClassWithEvent("topUpThreshold", event)

    if (document.getElementById("advancedOptions").hidden ) {
        const permissionSuggestion = (Number(topUpTargetEl.value) * 20).toString()
        document.getElementById("aaveTokenPermissionInput").value = permissionSuggestion
        document.getElementById("aaveDelegationInput").value = permissionSuggestion
    }
    validUppieFormCheck({ uppiesContract })
}

async function topUpTargetInputHandler({ event, provider, uppiesContract }) {
    const topUpTargetEl = document.getElementById("topUpTargetInput")
    const topUpThresholdEl = document.getElementById("topUpThresholdInput")
    const advancedOptionsEl = document.getElementById("advancedOptions")
    //console.log(Number(topUpTargetEl.value), Number(topUpThresholdEl.value) )
    if (advancedOptionsEl.hidden || Number(topUpTargetEl.value) < Number(topUpThresholdEl.value)) {
        topUpThresholdEl.value = topUpTargetEl.value
        setClassWithEvent("topUpThreshold", event)
    }
    setClassWithEvent("topUpTarget", event)
    if (document.getElementById("advancedOptions").hidden ) {
        const permissionSuggestion = (Number(topUpTargetEl.value) * 20).toString()
        document.getElementById("aaveTokenPermissionInput").value = permissionSuggestion
        document.getElementById("aaveDelegationInput").value = permissionSuggestion
    }

    validUppieFormCheck({ uppiesContract })
}

function setClassWithEvent(classname, event) {
    setClass({ classname, value: event.target.value })
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

function setClass({ classname, value }) {
    for (const element of document.getElementsByClassName(classname)) {
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
async function aaveTokenInputHandler({ event, signer, provider, uppiesContract, aavePoolInstance }) {
    const aaveTokenAddress = event.target.value
    let isValidInput
    let underlyingTokenAddress;
    if (ethers.isAddress(aaveTokenAddress)) {
        const aaveTokenContract = IAToken__factory.connect(aaveTokenAddress, provider)//new ethers.Contract(aaveTokenAddress, ATokenABI, provider)
        aaveTokenContract.decimals
        underlyingTokenAddress = await getUnderlyingToken({ aaveTokenContract })
        const aaveDebtToken = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
        const debtToken = ICreditDelegationToken__factory.connect(aaveDebtToken, provider)
        console.log({ underlyingTokenAddress })
        isValidInput = Boolean(underlyingTokenAddress)
        if (isValidInput) {
            const underlyingToken = getTokenInfo({ address: (await underlyingTokenAddress), provider })
            const aaveToken = getTokenInfo({ address: aaveTokenAddress, provider })
            const currentAaveTokenAllowance = aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
            const currentAaveTokenDelegation = debtToken.borrowAllowance(signer.address, uppiesContract.target)
            document.getElementById("currentAllowance").innerText = Math.round(ethers.formatUnits(await currentAaveTokenAllowance, (await aaveToken).decimals) * 10000) / 10000
            document.getElementById("currentDelegation").innerText = Math.round(ethers.formatUnits(await currentAaveTokenDelegation, (await aaveToken).decimals) * 10000) / 10000

            document.getElementById("underlyingTokenInput").value = await underlyingTokenAddress
            setClass({ classname: "underlyingTokenName", value: (await underlyingToken).name })
            setClass({ classname: "underlyingTokenSymbol", value: (await underlyingToken).symbol })
            setClass({ classname: "aaveTokenName", value: (await aaveToken).name })
            setClass({ classname: "aaveTokenSymbol", value: (await aaveToken).symbol })

            window.decimals =aaveTokenContract.decimals()
        } else {
            document.getElementById("underlyingTokenInput").value = ""
            setClass({ classname: "underlyingTokenName", value: "" })
            setClass({ classname: "underlyingTokenSymbol", value: "" })
            setClass({ classname: "aaveTokenName", value: "" })
        }
        validUppieFormCheck({ uppiesContract })
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
 */
async function underlyingTokenInputHandler({ event, signer, provider, aavePoolInstance, uppiesContract }) {
    const underlyingTokenAddress = event.target.value
    let isValidInput;
    let aaveTokenAddress;
    if (ethers.isAddress(underlyingTokenAddress)) {
        aaveTokenAddress = await getReserveAToken({ underlyingTokenAddress, aavePoolInstance })
        console.log({ aaveTokenAddress })
        isValidInput = Boolean(aaveTokenAddress)
    }
    if (isValidInput) {
        const underlyingToken = getTokenInfo({ address: underlyingTokenAddress, provider })
        const aaveToken = getTokenInfo({ address: await aaveTokenAddress, provider })
        const aaveTokenContract = IAToken__factory.connect(await aaveTokenAddress, provider)
        const currentAaveTokenAllowance = aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
        const aaveDebtToken = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
        const debtToken = ICreditDelegationToken__factory.connect(aaveDebtToken, provider)
        const currentAaveTokenDelegation = debtToken.borrowAllowance(signer.address, uppiesContract.target)
        document.getElementById("currentAllowance").innerText = Math.round(ethers.formatUnits(await currentAaveTokenAllowance, (await aaveToken).decimals) * 10000) / 10000
        console.log({currentAaveTokenDelegation: await currentAaveTokenDelegation})
        document.getElementById("currentDelegation").innerText = Math.round(ethers.formatUnits(await currentAaveTokenDelegation, (await aaveDebtToken).decimals) * 10000) / 10000

        document.getElementById("aaveTokenInput").value = await aaveTokenAddress
        setClass({ classname: "underlyingTokenName", value: (await underlyingToken).name })
        setClass({ classname: "underlyingTokenSymbol", value: (await underlyingToken).symbol })
        setClass({ classname: "aaveTokenName", value: (await aaveToken).name })
        setClass({ classname: "aaveTokenSymbol", value: (await aaveToken).symbol })

        await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress })

    } else {
        document.getElementById("underlyingTokenInput").value = ""
        setClass({ classname: "underlyingTokenName", value: "" })
        setClass({ classname: "underlyingTokenSymbol", value: "" })
        setClass({ classname: "aaveTokenName", value: "" })
    }

    validUppieFormCheck({ uppiesContract })


}

async function setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress }) {
    if (document.getElementById("advancedOptions").hidden) {
        const payee = document.getElementById("payeeInput").value
        const healthShouldBeZero = (!document.getElementById("canBorrowInput").checked) && !(await uppiesContract._isUsedAsCollateral(payee, await underlyingTokenAddress))
        if (healthShouldBeZero) {
            document.getElementById("minHealthFactorInput").value = 0
        } else {
            document.getElementById("minHealthFactorInput").value = 1.1
        }
    }

}

async function getUppieFromForm({ provider }) {
    const formNodes = document.getElementById("createUppieForm").querySelectorAll("input");
    const uppie = Object.fromEntries([...formNodes].map((n) => n.type==="checkbox" ? [n.name, n.checked]: [n.name, n.value]))

    // formatting
    const underlyingTokenInfo = await getTokenInfo({ address: uppie.underlyingToken, provider })
    const debtTokenInfo = await getTokenInfo({ address: uppie.underlyingToken, provider })
    uppie.topUpThreshold = ethers.parseUnits(uppie.topUpThreshold, underlyingTokenInfo.decimals)
    uppie.topUpTarget = ethers.parseUnits(uppie.topUpTarget, underlyingTokenInfo.decimals)
    uppie.minHealthFactor = BigInt(Number(uppie.minHealthFactor) * 10 ** 18)
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
    console.log({uppie})
    return uppie
}
window.getUppieFromForm = getUppieFromForm

/**
 * 
 * @param {{aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPool, runner: ethers.ContractRunner}} param0 
 * @returns {Promise<import('../types/ethers-contracts/interfaces/aave/ICreditDelegationToken').ICreditDelegationToken>}
 */
async function getDebtToken({ aavePoolInstance,runner }) {
    const underlyingTokenAddress = ethers.getAddress(document.getElementById("underlyingTokenInput").value)
    const debtTokenAddress = await aavePoolInstance.getReserveVariableDebtToken(underlyingTokenAddress)
    return ICreditDelegationToken__factory.connect(debtTokenAddress,runner)
}

/**
 * 
 * @param {{runner: ethers.ContractRunner}} param0 
 * @returns {import('../types/ethers-contracts/interfaces/aave/IAToken').IAToken}
 */
function getAToken({ runner }) {
    const ATokenAddress = ethers.getAddress(document.getElementById("aaveTokenInput").value)
    return IAToken__factory.connect(ATokenAddress, runner)
}

/**
 * 
 * @param {{event, uppiesContract:UppiesContract,aavePoolInstance:import('../types/ethers-contracts/interfaces/aave/IPool').IPoolInterface}} param0 
 */
async function createUppieHandler({ event, uppiesContract,aavePoolInstance }) {
    const provider = uppiesContract.runner.provider
    const signer = uppiesContract.runner
    const uppie = await getUppieFromForm({ provider })

    const canWithdraw = document.getElementById("canWithdrawInput").checked
    const canBorrow = document.getElementById("canBorrowInput").checked
    if(canWithdraw) {
        setATokenAllowance({uppiesContract, signer }).then(async (tx)=>await postTxLinkUi(tx.hash,true))
    }
    if(canBorrow) {
        setCreditDelegation({uppiesContract, signer,aavePoolInstance}).then(async (tx)=> await postTxLinkUi(tx.hash,true))
    }

    uppiesContract.createUppie(uppie).then(async (tx)=> await postTxLinkUi(tx.hash,true))
}
/**
 * 
 * @param {*} param0 
 * @returns {Promise<ethers.Transaction} tx
 */
async function setATokenAllowance({ event, uppiesContract, signer, allowLowering = false }) {
    const AToken = getAToken({runner:signer})
    const decimals = await AToken.decimals()

    const allowanceUi = ethers.parseUnits(document.getElementById("aaveTokenPermissionInput").value, decimals)
    const allowanceChain = await AToken.allowance(signer.address, uppiesContract.target)
    if (allowanceUi > allowanceChain || allowLowering) {
        const tx = await AToken.approve(uppiesContract.target,allowanceUi)
        return tx
    }
}

/**
 * 
 * @param {*} param0 
 * @returns {Promise<ethers.Transaction} tx
 */
async function setCreditDelegation({ event, uppiesContract, signer,aavePoolInstance, allowLowering = false }) {
    const debtToken = await getDebtToken({aavePoolInstance, runner:signer})
    const decimals = await debtToken.decimals()

    const allowanceUi = ethers.parseUnits(document.getElementById("aaveDelegationInput").value, decimals)
    const allowanceChain = await debtToken.borrowAllowance(signer.address, uppiesContract.target)
    if (allowanceUi > allowanceChain || allowLowering) {
        const tx = await debtToken.approveDelegation(uppiesContract.target,allowanceUi)
        return tx
    }
}

async function canBorrowInputHandler({ event, signer, provider, uppiesContract }) {
    const isChecked = document.getElementById("canBorrowInput")
    console.log({ isChecked })
    const showOnCanBorrowDivs = [...document.getElementsByClassName("showOnCanBorrow")]
    if (isChecked) {
        showOnCanBorrowDivs.forEach((e) => e.hidden = false)
    } else {
        showOnCanBorrowDivs.forEach((e) => e.hidden = true)
    }
    const underlyingTokenAddress = document.getElementById("underlyingTokenInput").value
    if (ethers.isAddress(underlyingTokenAddress)) {
        await setDefaultHealthFactor({ uppiesContract, underlyingTokenAddress })
    }
    await validUppieFormCheck({ uppiesContract })
}

async function canWithdrawInputHandler({ event, signer, provider, uppiesContract }) {
    const isChecked = event.target.checked
    const showOnCanBorrowDivs = [...document.getElementsByClassName("showOnCanWithdraw")]
    if (isChecked) {
        showOnCanBorrowDivs.forEach((e) => e.hidden = false)
    } else {
        showOnCanBorrowDivs.forEach((e) => e.hidden = true)
    }
    await validUppieFormCheck({ uppiesContract })
}
/**
 * 
 * @param {{uppiesContract:UppiesContract}} param0 
 */
async function validUppieFormCheck({ uppiesContract }) {
    const inputStatus = {
        // checkbox
        canWithdrawInput: { el: document.getElementById("canWithdrawInput"), isValid: true },
        canBorrowInput: { el: document.getElementById("canBorrowInput"), isValid: true },
        // top-up target
        topUpTargetInput: { el: document.getElementById("topUpTargetInput"), isValid: true },
        // addresses
        recipientAccountInput: { el: document.getElementById("recipientAccountInput"), isValid: true },
        payeeInput: { el: document.getElementById("payeeInput"), isValid: true },
        underlyingTokenInput: { el: document.getElementById("underlyingTokenInput"), isValid: true },
        // debt
        maxDebtInput: { el: document.getElementById("maxDebtInput"), isValid: true },

        // advanced
        // additional rules
        topUpThresholdInput: { el: document.getElementById("topUpThresholdInput"), isValid: true },
        minHealthFactorInput: { el: document.getElementById("minHealthFactorInput"), isValid: true },
        // fee settings
        maxBaseFeeInput: { el: document.getElementById("maxBaseFeeInput"), isValid: true },
        priorityFeeInput: { el: document.getElementById("priorityFeeInput"), isValid: true },
        fillerRewardInput: { el: document.getElementById("fillerRewardInput"), isValid: true },
        //permissions
        aaveTokenPermissionInput: { el: document.getElementById("aaveTokenPermissionInput"), isValid: true },
        aaveDelegationInput: { el: document.getElementById("aaveDelegationInput"), isValid: true },
        //token
        aaveTokenInput: { el: document.getElementById("aaveTokenInput"), isValid: true },
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
    // checkIfSet(inputStatus, "maxDebtInput")
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
        console.log({ underlyingIsCollateral, canBorrow: inputStatus.canBorrowInput.el.checked })
        runChecks(inputStatus, "minHealthFactorInput", [checkEmpty, checkZero, checkSmaller], 1.01)
    }

    const currentApproval = Number(document.getElementById("currentAllowance").innerText)
    if (currentApproval < 0 && canWithdraw) {
        runChecks(inputStatus, "aaveTokenPermissionInput", [checkEmpty, checkZero])
    } else {
        inputStatus.aaveTokenPermissionInput.isValid = true
        inputStatus.aaveTokenPermissionInput.reason = undefined
    }

    const currentDelegation = Number(document.getElementById("currentDelegation").innerText)
    if (currentDelegation < 0 && canBorrow) {
        runChecks(inputStatus, "aaveDelegationInput", [checkEmpty, checkZero])
    } else {
        inputStatus.aaveDelegationInput.isValid = true
        inputStatus.aaveDelegationInput.reason = undefined
    }

    runChecks(inputStatus, "topUpTargetInput", [checkEmpty, checkZero])
    runChecks(inputStatus, "recipientAccountInput", [checkEmpty,checkIsAddress])
    runChecks(inputStatus, "payeeInput", [checkEmpty,checkIsAddress])
    runChecks(inputStatus, "underlyingTokenInput", [checkEmpty,checkIsAddress])
    runChecks(inputStatus, "topUpThresholdInput", [checkEmpty, checkZero])
    runChecks(inputStatus, "maxBaseFeeInput", [checkEmpty])
    runChecks(inputStatus, "priorityFeeInput", [checkEmpty])
    runChecks(inputStatus, "fillerRewardInput", [checkEmpty])
    runChecks(inputStatus, "aaveTokenInput", [checkEmpty,checkIsAddress])

    const createUppieBtn = document.getElementById("createUppie")
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

async function main() {
    const { contract: uppiesContract, signer } = await getUppiesWithSigner()
    window.signer = signer
    const provider = signer.provider
    listAllUppies({ address: signer.address, uppiesContract })
    const aavePoolInstance = IPool__factory.connect(await uppiesContract.aavePoolInstance(), provider)
    window.uppiesContract = uppiesContract

    // TODO automatically set filler reward for different token types to also be worth 0.001 eure
    document.getElementById("payeeInput").value = signer.address

    await Promise.all([
        aaveTokenInputHandler({ event: { target: { value: "0xEdBC7449a9b594CA4E053D9737EC5Dc4CbCcBfb2" } }, signer, provider, uppiesContract, aavePoolInstance }),
        underlyingTokenInputHandler({ event: { target: { value: "0xcB444e90D8198415266c6a2724b7900fb12FC56E" } }, signer, provider, aavePoolInstance, uppiesContract }),
        canWithdrawInputHandler({ event: { target: { checked: true } }, signer, provider, uppiesContract })
    ])

    await validUppieFormCheck({ uppiesContract })

    // check boxes
    document.getElementById("canBorrowInput").addEventListener("click", ((event) => canBorrowInputHandler({ event, signer, provider, uppiesContract })))
    document.getElementById("canWithdrawInput").addEventListener("click", ((event) => canWithdrawInputHandler({ event, signer, provider, uppiesContract })))
    // target balance
    document.getElementById("topUpTargetInput").addEventListener("keyup", (async (event) => topUpTargetInputHandler({ event, provider, uppiesContract })))
    // addresses
    document.getElementById("recipientAccountInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))
    document.getElementById("underlyingTokenInput").addEventListener("keyup", ((event) => underlyingTokenInputHandler({ event, signer, provider, aavePoolInstance, uppiesContract })))
    document.getElementById("maxDebtInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))
    // document.getElementById("payeeInput").addEventListener("keyup", ((event) => validUppieCheck())) // not editable


    // --ADVANCED--
    document.getElementById("showAdvancedBtn").addEventListener("click", ((event) => showAdvancedBtnHandler({ uppiesContract })))

    // additional rules
    document.getElementById("minHealthFactorInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))
    document.getElementById("topUpThresholdInput").addEventListener("keyup", ((event) => topUpThresholdInputHandler({ event, uppiesContract })))

    // fee settings
    document.getElementById("maxBaseFeeInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))
    document.getElementById("priorityFeeInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))
    document.getElementById("fillerRewardInput").addEventListener("keyup", ((event) => validUppieFormCheck({ uppiesContract })))

    // permissions
    document.getElementById("aaveTokenPermissionBtn").addEventListener("click", async (event) => setATokenAllowance({ event, uppiesContract, signer, allowLowering: true }))
    document.getElementById("aaveDelegationBtn").addEventListener("click", async (event) => setCreditDelegation({ event, uppiesContract, signer,aavePoolInstance, allowLowering: true}))

    // token
    document.getElementById("aaveTokenInput").addEventListener("keyup", ((event) => aaveTokenInputHandler({ event, signer, provider, uppiesContract, aavePoolInstance })))

    // buttons
    document.getElementById("createUppie").addEventListener("click", (event) => createUppieHandler({ event, uppiesContract,aavePoolInstance }))
}

await main()