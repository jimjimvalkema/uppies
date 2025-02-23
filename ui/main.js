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

async function listAllUppies({address, uppiesContract}) {
    const provider = uppiesContract.runner.provider
    const allUppies = await getAllUppies({address, uppiesContract})
    console.log({allUppies})
    document.getElementById("uppieIndexInput").value = allUppies.length
    if (allUppies.length > 0) {
        document.getElementById("existingUppies").hidden = false
    }

    const existingUppiesUl = document.getElementById("existingUppiesUl")
    for (const uppie of allUppies) {
        const uppieLi = document.createElement("li")
        const underlyingToken = await getTokenInfo({address: uppie.underlyingToken,provider:provider})
        uppieLi.innerText = `
        recipient: ${uppie.recipientAccount} 
        threshold: ${ethers.formatUnits(uppie.topUpThreshold, underlyingToken.decimals)} ${underlyingToken.symbol}
        target:${ethers.formatUnits(uppie.topUpTarget, underlyingToken.decimals)}  ${underlyingToken.symbol}
        token:  ${underlyingToken.name}
        `
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

function topUpTargetInputHandler(event) {
    const topUpTargetEl = document.getElementById("topUpTargetInput")
    const topUpThresholdEl = document.getElementById("topUpThresholdInput")
    console.log(Number(topUpTargetEl.value), Number(topUpThresholdEl.value) )
    if (Number(topUpTargetEl.value) < Number(topUpThresholdEl.value) ) {
    
        topUpThresholdEl.value  = topUpTargetEl.value 
        setClassWithEvent("topUpThreshold",event)
    }
    setClassWithEvent("topUpTarget",event)
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

async function aaveTokenInputHandler({event, provider}) {
    const aaveTokenAddress = event.target.value
    if (ethers.isAddress(aaveTokenAddress)) {
        const aaveTokenContract = new ethers.Contract(aaveTokenAddress,ATokenABI,provider)
        const underlyingTokenAddress = await aaveTokenContract.UNDERLYING_ASSET_ADDRESS()
        const underlyingToken = await getTokenInfo({address:underlyingTokenAddress, provider}) 
        const aaveToken = await getTokenInfo({address:aaveTokenAddress, provider}) 

        document.getElementById("underlyingTokenInput").value = underlyingTokenAddress
        setClass({classname:"underlyingTokenName", value:underlyingToken.name})
        setClass({classname:"underlyingTokenSymbol", value:underlyingToken.symbol})
        setClass({classname:"aaveTokenName", value:aaveToken.name})
    } else {
        document.getElementById("underlyingTokenInput").value = ""
        setClass({classname:"underlyingTokenName", value:""})
        setClass({classname:"underlyingTokenSymbol", value:""})
        setClass({classname:"aaveTokenName", value:""})
    }
}

async function createUppieHandler({event, uppiesContract}) {

}

async function main() {
    const { contract: uppiesContract, signer } = await getContractWithSigner()
    window.signer = signer
    const provider = signer.provider
    window.uppiesContract = uppiesContract

    document.getElementById("payeeInput").value = signer.address
    await aaveTokenInputHandler({event:{target:{value:"0xEdBC7449a9b594CA4E053D9737EC5Dc4CbCcBfb2"}}, provider})

    await listAllUppies({address: signer.address, uppiesContract})


    document.getElementById("showAdvancedBtn").addEventListener("click", ((event)=>showAdvancedBtnHandler()))
    document.getElementById("recipientAccountInput").addEventListener("keyup", ((event)=>setClassWithEvent("recipientAccount",event)))
    document.getElementById("topUpThresholdInput").addEventListener("keyup", ((event)=>topUpThresholdInputHandler(event)))
    document.getElementById("topUpTargetInput").addEventListener("keyup", ((event)=>topUpTargetInputHandler(event)))
    
    // TODO should update underlyingTokenSymbol, underlyingTokenName, aaveTokenName,aaveTokenSymbol
    document.getElementById("aaveTokenInput").addEventListener("keyup", ((event)=>aaveTokenInputHandler({event, provider})))

    // TODO also make a human readable price
    document.getElementById("maxBaseFeeInput").addEventListener("keyup", ((event)=>false))
    document.getElementById("minHealthFactorInput").addEventListener("keyup", ((event)=>false))
    document.getElementById("createUppie").addEventListener("click", (event)=>createUppieHandler({event, uppiesContract}))

}

await main()