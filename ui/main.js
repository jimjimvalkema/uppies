import { ethers } from 'ethers';
window.ethers = ethers

import uppiesDeployment from "../out/Uppies.sol/Uppies.json"
import erc20Abi from "./erc20ABI.json"
import ATokenABI from "./ATokenABI.json"

const contractAbi = uppiesDeployment.abi
const CONTRACT_ADDRESS = "0x88c96330C65b7C4697285BA6Cd1F1ED1bA60faDD"
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

async function getUppie({address, index, uppiesContract}) {
    const structNames = ["recipientAccount", "aaveToken", "underlyingToken", "topUpThreshold", "topUpTarget", "maxBaseFee", "minHealthFactor"]
    const uppieArr = await uppiesContract.uppiesPerUser(address, index)
    // map names to array items
    const uppie = Object.fromEntries(uppieArr.map((item, index)=>[structNames[index], item]))   
    uppie.payee = address
    uppie.index = index

    return uppie
}
window.getUppie = getUppie


async function getAllUppies({address, uppiesContract}) {
    const uppiesFound = []
    let index = 0
    while(true) {
        const currentUppie = await getUppie({address, index, uppiesContract})
        if (currentUppie.aaveToken === "0x0000000000000000000000000000000000000000") {break}
        uppiesFound.push(currentUppie)
        index ++
    } 
    return uppiesFound
    
}    
window.getAllUppies = getAllUppies

async function getTokenInfo({address, provider}) {
    const contract = new ethers.Contract(address, erc20Abi, provider)
    const symbol = contract.symbol()
    const name = contract.name()
    const decimals = contract.decimals()
    return {symbol: await symbol, name: await name, decimals: await decimals}

}

function postTxLinkUi(txhash) {
    const a = document.getElementById("txlink")
    a.innerText = `https://gnosisscan.io/tx/${txhash}`
    a.href = `https://gnosisscan.io/tx/${txhash}`

}

async function removeUppieHandler({index, uppiesContract}) {
    console.log({uppiesContract})
    const tx = await uppiesContract.removeUppie(index)
    postTxLinkUi(tx.hash)
    
}

async function listAllUppies({address, uppiesContract}) {
    const provider = uppiesContract.runner.provider
    const allUppies = await getAllUppies({address, uppiesContract})
    console.log({allUppies})
    document.getElementById("uppieIndexInput").value = allUppies.length
    if (allUppies.length > 0) {
        document.getElementById("existingUppies").hidden = false
    }

    const existingUppiesUl = document.getElementById("existingUppiesUl")
    for (const [index,uppie] of Object.entries(allUppies)) {
        const uppieLi = document.createElement("li")
        const underlyingToken = await getTokenInfo({address: uppie.underlyingToken,provider:provider})
        uppieLi.innerText = `
        recipient: ${uppie.recipientAccount} 
        threshold: ${ethers.formatUnits(uppie.topUpThreshold, underlyingToken.decimals)} ${underlyingToken.symbol}
        target:${ethers.formatUnits(uppie.topUpTarget, underlyingToken.decimals)}  ${underlyingToken.symbol}
        token:  ${underlyingToken.name}
        `
        const removeUppieBtn = document.createElement("button")
        removeUppieBtn.innerText = "remove"
        removeUppieBtn.addEventListener("click", (event)=>removeUppieHandler({index, uppiesContract}))
        uppieLi.appendChild(removeUppieBtn)
        existingUppiesUl.appendChild(uppieLi)
        console.log("aaa")
    }
    
}


function showAdvancedBtnHandler() {
    const advancedOptionsEl = document.getElementById("advancedOptions")
    if (advancedOptionsEl.hidden) {
        advancedOptionsEl.hidden = false
    } else {
        advancedOptionsEl.hidden = true
    }
}

function topUpThresholdInputHandler(event) {
    const topUpTargetEl = document.getElementById("topUpTargetInput")
    const topUpThresholdEl = document.getElementById("topUpThresholdInput")
    console.log(Number(topUpTargetEl.value), Number(topUpThresholdEl.value) )
    if (Number(topUpTargetEl.value) < Number(topUpThresholdEl.value) ) {
        topUpTargetEl.value =topUpThresholdEl.value
        setClassWithEvent("topUpTarget",event) 
    }
    setClassWithEvent("topUpThreshold",event)
}

async function topUpTargetInputHandler(event, provider) {
    const topUpTargetEl = document.getElementById("topUpTargetInput")
    const topUpThresholdEl = document.getElementById("topUpThresholdInput")
    //console.log(Number(topUpTargetEl.value), Number(topUpThresholdEl.value) )
    if (Number(topUpTargetEl.value) < Number(topUpThresholdEl.value) ) {
    
        topUpThresholdEl.value  = topUpTargetEl.value 
        setClassWithEvent("topUpThreshold",event)
    }
    setClassWithEvent("topUpTarget",event)
    console.log((Number(topUpTargetEl.value)*20).toString())
    document.getElementById("aaveTokenPermissionInput").value = (Number(topUpTargetEl.value)*20).toString()
}

function setClassWithEvent(classname,event) {
    setClass({classname, value:event.target.value})
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

async function getContractWithSigner({ abi = contractAbi, chain = CHAININFO, contractAddress = CONTRACT_ADDRESS } = {}) {
    const provider = new ethers.BrowserProvider(window.ethereum)
    window.provider = provider //debug moment
    await switchNetwork(chain, provider)
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, abi, signer)
    return { contract, signer }

  }

function setClass({classname, value}) {
    for (const element of document.getElementsByClassName(classname)) {
        element.innerText = value
    } 
}

async function aaveTokenInputHandler({event, signer, provider}) {
    const aaveTokenAddress = event.target.value
    if (ethers.isAddress(aaveTokenAddress)) {
        const aaveTokenContract = new ethers.Contract(aaveTokenAddress,ATokenABI,provider)
        const underlyingTokenAddress =  aaveTokenContract.UNDERLYING_ASSET_ADDRESS()
        const underlyingToken =  getTokenInfo({address:(await underlyingTokenAddress), provider}) 
        const aaveToken =  getTokenInfo({address:aaveTokenAddress, provider}) 
        const currentAaveTokenAllowance = aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
        document.getElementById("currentAllowance").innerText = Math.round(ethers.formatUnits(await currentAaveTokenAllowance, (await aaveToken).decimals)*10000)/10000

        document.getElementById("underlyingTokenInput").value = await underlyingTokenAddress
        setClass({classname:"underlyingTokenName", value:(await underlyingToken).name})
        setClass({classname:"underlyingTokenSymbol", value:(await underlyingToken).symbol})
        setClass({classname:"aaveTokenName", value:(await aaveToken).name})
        setClass({classname:"aaveTokenSymbol", value:(await aaveToken).symbol})

        window.decimals = await aaveTokenContract.decimals()
    } else {
        document.getElementById("underlyingTokenInput").value = ""
        setClass({classname:"underlyingTokenName", value:""})
        setClass({classname:"underlyingTokenSymbol", value:""})
        setClass({classname:"aaveTokenName", value:""})
    }
}

async function getUppieFromForm({provider}) {
    const formNodes = document.getElementById("createUppieForm").querySelectorAll("input");
    const uppie = Object.fromEntries([...formNodes].map((n)=>[n.name,n.value]))


    // formatting
    const underlyingToken = await getTokenInfo({address: uppie.underlyingToken, provider})
    uppie.topUpThreshold = ethers.parseUnits(uppie.topUpThreshold, underlyingToken.decimals)
    uppie.topUpTarget = ethers.parseUnits(uppie.topUpTarget, underlyingToken.decimals)
    uppie.maxBaseFee = BigInt(Number(uppie.maxBaseFee) * 10**9) // convert gwei to wei
    uppie.minHealthFactor = uppie.minHealthFactor === "" ? 115792089237316195423570985008687907853269984665640564039457584007913129639934n : BigInt( Number(uppie.minHealthFactor) * 10**18)
    uppie.recipientAccount = ethers.getAddress(uppie.recipientAccount)
    uppie.payee = ethers.getAddress(uppie.payee)
    uppie.underlyingToken = ethers.getAddress(uppie.underlyingToken)
    uppie.aaveToken = ethers.getAddress(uppie.aaveToken)
    return uppie
}
window.getUppieFromForm = getUppieFromForm

async function createUppieHandler({event, uppiesContract}) {
    const provider = uppiesContract.runner.provider
    const signer = uppiesContract.runner
    const uppie = await getUppieFromForm({provider})
   
    const allowanceTx = await setAllowance({event, uppiesContract, signer})
    const tx = uppiesContract.createUppie(uppie.recipientAccount, uppie.aaveToken, uppie.topUpThreshold, uppie.topUpTarget, uppie.index, uppie.maxBaseFee, uppie.minHealthFactor)
    console.log({tx:(await tx).hash})
    postTxLinkUi((await tx).hash)
}

async function setAllowance({event, uppiesContract, signer, allowLowering=false}) {
    console.log({signer})
    const provider = uppiesContract.runner.provider
    console.log("hiiiiiiiiiiii")
    const aaveTokenAddress = document.getElementById("aaveTokenInput").value
    const aaveTokenContract = new ethers.Contract(aaveTokenAddress,ATokenABI,signer)
    const decimals =  await aaveTokenContract.decimals()
    console.log({decimals})
    aaveTokenContract.connect(signer)
    const allowanceUi = ethers.parseUnits(document.getElementById("aaveTokenPermissionInput").value, await aaveTokenContract.decimals())
    const allowanceChain = await aaveTokenContract.allowance(signer.address, CONTRACT_ADDRESS)
    if (allowanceUi >  allowanceChain || allowLowering) {
        const tx = aaveTokenContract.approve(CONTRACT_ADDRESS, allowanceUi)
        postTxLinkUi((await tx).hash)
        return tx

    }

    
}

async function main() {
    const { contract: uppiesContract, signer } = await getContractWithSigner()
    window.signer = signer
    const provider = signer.provider
    window.uppiesContract = uppiesContract

    document.getElementById("payeeInput").value = signer.address
    await aaveTokenInputHandler({event:{target:{value:"0xEdBC7449a9b594CA4E053D9737EC5Dc4CbCcBfb2"}}, signer, provider})

    await listAllUppies({address: signer.address, uppiesContract})


    document.getElementById("showAdvancedBtn").addEventListener("click", ((event)=>showAdvancedBtnHandler()))
    document.getElementById("recipientAccountInput").addEventListener("keyup", ((event)=>setClassWithEvent("recipientAccount",event)))
    document.getElementById("topUpThresholdInput").addEventListener("keyup", ((event)=>topUpThresholdInputHandler(event)))
    document.getElementById("topUpTargetInput").addEventListener("keyup", (async (event)=>topUpTargetInputHandler(event)))
    
    // TODO should update underlyingTokenSymbol, underlyingTokenName, aaveTokenName,aaveTokenSymbol
    document.getElementById("aaveTokenInput").addEventListener("keyup", ((event)=>aaveTokenInputHandler({event, signer, provider})))

    // TODO also make a human readable price
    document.getElementById("maxBaseFeeInput").addEventListener("keyup", ((event)=>false))
    document.getElementById("minHealthFactorInput").addEventListener("keyup", ((event)=>false))
    document.getElementById("createUppie").addEventListener("click", (event)=>createUppieHandler({event, uppiesContract}))
    document.getElementById("aaveTokenPermissionBtn").addEventListener("click", async (event)=>setAllowance({event, uppiesContract, signer,allowLowering:true}))

    

}

await main()