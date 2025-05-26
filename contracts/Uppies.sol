// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAToken} from './interfaces/aave/IAToken.sol';
import {IPool} from './interfaces/aave/IPool.sol';

interface IAaveOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}

contract Uppies {
    event NewUppie(address indexed payee, uint256 _uppiesIndex);
    event RemovedUppie(address indexed payee, uint256 _uppiesIndex);
    event FilledUppie(address indexed payee, uint256 _uppiesIndex);

    address public aavePoolInstance;
    address public aaveOracle;
    constructor(address _aavePoolInstance, address _aaveOracle) {
        aavePoolInstance = _aavePoolInstance;
        aaveOracle = _aaveOracle;
    }

    // you can gasGolf this by hashing all this and only storing the hash. Or even off-chain signatures. 
    // But that mainly affects cost of creating an uppie, which is only doesn't happen a lott 
    struct Uppie {
        address recipient;
        address aaveToken;    
        address underlyingToken;
        bool canBorrow;    
        uint256 maxDebt;
        uint256 topUpThreshold; // when to Uppie
        uint256 topUpTarget;    // can be a higher number than topUpThreshold so you don't have to top-up every tx
        uint256 minHealthFactor;

        uint256 maxBaseFee;
        uint256 priorityFee;
        uint256 topUpGas;
        uint256 fillerReward;
    }

    // more gas efficient maxing would be off-chain sigs 
    mapping(address => mapping(uint256 => Uppie)) public uppiesPerUser;
    // to enable ui to get all uppies without event scanning. (can be too high. will never be too low)
    mapping(address => uint256) public nextUppieIndexPerUser;       

    function createUppie(
        address _recipientAccount,
        address _aaveToken,
        bool _canBorrow,
        uint256 _maxDebt,
        uint256 _topUpThreshold,
        uint256 _topUpTarget,
        uint256 _minHealthFactor,

        uint256 _maxBaseFee,
        uint256 _priorityFee,       
        uint256 _topUpGas,
        uint256 _fillerReward
    ) public {
        address underlyingToken = IAToken(_aaveToken).UNDERLYING_ASSET_ADDRESS();
        Uppie memory uppie = Uppie(
            _recipientAccount,
            _aaveToken,
            underlyingToken,
            _canBorrow,
            _maxDebt,
            _topUpThreshold,
            _topUpTarget,
            _minHealthFactor,
            _maxBaseFee,
            _priorityFee,       
            _topUpGas,
            _fillerReward
        );
        
        uint256 _nextUppieIndex = nextUppieIndexPerUser[msg.sender];

        uppiesPerUser[msg.sender][_nextUppieIndex] = uppie; 
        emit NewUppie(msg.sender, _nextUppieIndex);
        nextUppieIndexPerUser[msg.sender] = _nextUppieIndex + 1;
    }

    function editUppie(
        Uppie memory uppie,
        uint256 _uppiesIndex
    ) public {
        require(nextUppieIndexPerUser[msg.sender] > _uppiesIndex, "cant edit uppie that doesn't exist");

        address underlyingToken = IAToken(uppie.aaveToken).UNDERLYING_ASSET_ADDRESS();
        require(uppie.underlyingToken == underlyingToken, "the underlying token from uppie.underlyingToken doesn't match uppie.aaveToken" );

        uppiesPerUser[msg.sender][_uppiesIndex] = uppie;
        emit NewUppie(msg.sender, _uppiesIndex);
    }


    function removeUppie(uint256 _uppiesIndex) public {
        uint256 _nextUppieIndex = nextUppieIndexPerUser[msg.sender];
        require(_nextUppieIndex > _uppiesIndex, "cant edit uppie that doesn't exist");

        uppiesPerUser[msg.sender][_uppiesIndex] = Uppie(address(0x0),address(0x0),address(0x0),false,0,0,0,0,0,0,0,0);
        if (_uppiesIndex == _nextUppieIndex - 1) {
            nextUppieIndexPerUser[msg.sender] = _nextUppieIndex - 1;
        }
        emit RemovedUppie(msg.sender, _uppiesIndex);
    }

    // ethereum communism!
    function sponsoredFillUppie(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);

        require((uppie.canBorrow == false) && (payeeBalance != 0), "payee balance empty");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");
        
        uint256 topUpSize = _calculateTopUpSize(uppie, payeeBalance);

        // withdraw
        IERC20(uppie.aaveToken).transferFrom(payee, address(this), topUpSize);
        IPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            topUpSize,
            address(this)
        );

        // check health factor
        require(_isSafeHealthFactor(uppie.minHealthFactor, payee),"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        
        // send it!
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        emit FilledUppie(payee, _uppiesIndex);
    }

    function fillUppie(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        uint256 blockBaseFee = block.basefee;
        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);

        require(blockBaseFee < uppie.maxBaseFee, "base fee is higher than then the uppie.maxBaseFee");
        require(payeeBalance != 0, "payee balance empty");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");
        
        uint256 underlyingTokenPrice = _invertAaveOraclePrice(IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken));  
        (uint256 totalWithdraw, uint256 fillerFee, uint256 topUpSize) = _calculateTotalWithdrawAndFees(uppie, payeeBalance, blockBaseFee, underlyingTokenPrice);

        // withdraw
        IERC20(uppie.aaveToken).transferFrom(payee, address(this), totalWithdraw);
        IPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            totalWithdraw,
            address(this)
        );

        // check health factor
        require(_isSafeHealthFactor(uppie.minHealthFactor, payee),"This uppie will causes to the user to go below the Uppie.minHealthFactor");
        
        // send it!
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        IERC20(uppie.underlyingToken).transfer(msg.sender, fillerFee);
        emit FilledUppie(payee, _uppiesIndex);
    }

    function fillUppieWithBorrow(uint256 _uppiesIndex, address payee) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];

        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        uint256 blockBaseFee = block.basefee;
        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);

        require(blockBaseFee < uppie.maxBaseFee, "base fee is higher than then the uppie.maxBaseFee");
        require(payeeBalance == 0, "can't borrow if payee still has a balance");
        require(uppie.canBorrow , "this uppie is not allowed to borrow");
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");
       
        uint256 underlyingTokenPrice = _invertAaveOraclePrice(IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken));       
        (uint256 totalBorrow, uint256 fillerFee, uint256 topUpSize) = _calculateTotalBorrowAndFees(uppie, blockBaseFee, underlyingTokenPrice);

        // borrow
        IPool(aavePoolInstance).borrow(
            uppie.underlyingToken,
            totalBorrow,
            2, // interestRateMode 1 is deprecated so we you can only use 2 which is variable
            0, // referral code
            payee
        );
        // see what happened in aave
        (,uint256 totalDebtBase , , , , uint256 currentHealthFactor) = IPool(aavePoolInstance).getUserAccountData(payee);
        //check health
        require(currentHealthFactor > uppie.minHealthFactor, "This uppie will causes to the user to go below the Uppie.minHealthFactor");
        //check debt
        uint256 totalDebtDenominatedInUnderlyingToken = _convertWithAaveOraclePrice(totalDebtBase, underlyingTokenPrice);
        require(totalDebtDenominatedInUnderlyingToken <= uppie.maxDebt, "total debt larger than uppie.maxDebt");

        // send it!
        IERC20(uppie.underlyingToken).transfer(uppie.recipient,topUpSize);
        IERC20(uppie.underlyingToken).transfer(msg.sender, fillerFee);
        emit FilledUppie(payee, _uppiesIndex);
    }

    function _calculateTotalWithdrawAndFees(Uppie memory uppie, uint256 payeeBalance, uint256 blockBaseFee, uint256 underlyingTokenPrice) pure private returns(uint256 totalWithdraw, uint256 fillerFee, uint256 topUpSize) {
        // 1 / price to invert the price. (ex eure/xDai -> xDai/eure) but 1*10000000000000000 because price is returned 10^8 to large
        topUpSize = payeeBalance - uppie.topUpTarget;
        uint256 xdaiPaid = (uppie.priorityFee + blockBaseFee) * uppie.topUpGas;
        uint256 txCost = _convertWithAaveOraclePrice(xdaiPaid, underlyingTokenPrice);
        
        fillerFee = txCost + uppie.fillerReward;
        totalWithdraw = topUpSize + fillerFee;

        // not enough money? just send what you got
        if (payeeBalance < totalWithdraw) {
            totalWithdraw = payeeBalance;
            topUpSize = payeeBalance - fillerFee;
        }
        return (totalWithdraw, fillerFee, topUpSize);
    }

    function _calculateTotalBorrowAndFees(Uppie memory uppie, uint256 blockBaseFee, uint256 underlyingTokenPrice) pure private returns(uint256 totalBorrow, uint256 fillerFee, uint256 topUpSize) {
        // TODO see if it is possible to calculate the max amount able to borrow before going to below uppie.minHealthFactor. It might not be possible?
        //topUpSize = maxBorrow - uppie.topUpTarget;
        topUpSize = uppie.topUpTarget;
        uint256 xdaiPaid = (uppie.priorityFee + blockBaseFee) * uppie.topUpGas;
        uint256 txCost = _convertWithAaveOraclePrice(xdaiPaid, underlyingTokenPrice);
        
        fillerFee = txCost + uppie.fillerReward;
        totalBorrow = topUpSize + fillerFee;

        // \/ cant do this yet we need to calculate `maxBorrow` first but idk how yet
        // not enough money? just send what you got
        // if (payeeBalance < totalWithdraw) {
        //     totalWithdraw = payeeBalance;
        //     topUpSize = payeeBalance - fillerFee;
        // }
        return (totalBorrow, fillerFee, topUpSize);
    }

    function _invertAaveOraclePrice(uint256 oraclePrice) private pure returns(uint256 invertedOraclePrice)  {
         // (1 / price) to invert the price. (ex eure/xDai -> xDai/eure) but 1*10000000000000000 because price is returned 10^8 to large so we need to do (10^(8*2) / price) 
        return 10000000000000000 / oraclePrice;
    }

    function _convertWithAaveOraclePrice(uint256 amount, uint256 oraclePrice) private pure returns(uint256 convertedAmount)  {
        // aave oracle prices are 10^8 too large   
        return amount * oraclePrice / 100000000;
    }

    function _calculateTopUpSize(Uppie memory uppie, uint256 payeeBalance) pure private returns(uint256 topUpSize) {
        topUpSize = payeeBalance - uppie.topUpTarget;
        if (payeeBalance < topUpSize) {
            return payeeBalance;
        } else {
            return topUpSize;
        }
    }

    function _isSafeHealthFactor(uint256 minHealthFactor, address payee) view private returns(bool isSafe) {
        // health factor check just incase user used the token as collateral. We don't want them to get liquidated!
        // needs to be after the withdraw so we can see if it went bad.
        if ((minHealthFactor > 0)) {
            (, , , , , uint256 currentHealthFactor) = IPool(aavePoolInstance).getUserAccountData(payee);
            return currentHealthFactor > minHealthFactor;
        } else {
            return true;
        }
    }
}
