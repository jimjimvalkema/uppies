// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract AaveTopUp {
    address aave;
    constructor (address _aave) {
        aave = _aave;

    }

    struct TopUp {
        address aaveAccount;
        address recipientAccount;
        address aaveToken;
        uint256 topThreshold;  // when to topup
        uint256 topUpExtra;     // a little bit extra to prevent topping up on every tx

    }
    mapping (address => TopUp) public TopUps;

    function createTopUpRule(address _recipientAccount, address _aaveToken, uint256 _topThreshold, uint256 _topUpExtra) public {
        // set permissions of _aaveToken
        
        TopUp memory topUp = TopUp(msg.sender, _recipientAccount, _aaveToken, _topThreshold, _topUpExtra);
        // TODO one token per eoa which is a silly restriction but i dont care
        TopUps[msg.sender] = topUp;
        
    }
}
