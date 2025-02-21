function showAdvancedBtnHandler() {
    console.log("click")
    const advancedOptionsEl = document.getElementById("advancedOptions")
    if (advancedOptionsEl.hidden) {
        advancedOptionsEl.hidden = false
    } else {
        advancedOptionsEl.hidden = true
    }
}

function setClassWithEvent(classname,event) {
    for (const element of document.getElementsByClassName(classname)) {
        element.innerText = event.target.value
    }
    
}

async function main() {
    document.getElementById("showAdvancedBtn").addEventListener("click", ((event)=>showAdvancedBtnHandler()))
    document.getElementById("recipientAccountInput").addEventListener("keyup", ((event)=>setClassWithEvent("recipientAccount",event)))
    document.getElementById("topUpThresholdInput").addEventListener("keyup", ((event)=>setClassWithEvent("topUpThreshold",event)))
    document.getElementById("topUpTargetInput").addEventListener("keyup", ((event)=>setClassWithEvent("topUpTarget",event)))
    
    // TODO should update underlyingTokenSymbol, underlyingTokenName, aaveTokenName,aaveTokenSymbol
    document.getElementById("aaveTokenInput").addEventListener("change", ((event)=>false))

    // TODO also make a human readable price
    document.getElementById("maxBaseFeeInput").addEventListener("change", ((event)=>false))
    document.getElementById("minHealthFactorInput").addEventListener("change", ((event)=>false))
}

await main()