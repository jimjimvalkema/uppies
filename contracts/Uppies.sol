// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAToken} from './interfaces/aave/IAToken.sol';
import {IPool} from './interfaces/aave/IPool.sol';

interface IAaveOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}

/// @title Automatic wallet top-ups using aave deposits/debt 
/// @author Jim Jim Valkema
/// @notice TODO
/// @dev TODO
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

    /// @custom:gasgolf
    /// you can gasGolf this by hashing all this and only storing the hash. Or even off-chain signatures. 
    /// But that mainly affects cost of creating an uppie, but the benefit would be small since creating uppies doesn't happen often 
    struct UppieGasSettings {
        uint256 maxBaseFee;
        uint256 priorityFee;
        uint256 topUpGas;
        uint256 fillerReward;
    }
    
    struct Uppie {
        address recipient;
        address aaveToken;    
        address underlyingToken;
        bool canBorrow; 
        bool canWithdraw;
        uint256 maxDebt;
        uint256 topUpThreshold; // when to Uppie
        uint256 topUpTarget;    // can be a higher number than topUpThreshold so you don't have to top-up every tx
        uint256 minHealthFactor;

        UppieGasSettings gas;
    }

    // factory would simplify code
    // maybe derive index from signature? 
    mapping(address => mapping(uint256 => Uppie)) public uppiesPerUser;

    /// @custom:gasgolf to enable ui to get all uppies without event scanning. (can be too high. will never be too low)
    mapping(address => uint256) public nextUppieIndexPerUser;       

    /// @notice creates new uppie
    /// @dev TODO
    /// @param uppie the new uppie
    function createUppie(
        Uppie memory uppie
    ) public {
        address underlyingToken = IAToken(uppie.aaveToken).UNDERLYING_ASSET_ADDRESS();
        require(uppie.underlyingToken == underlyingToken, "the underlying token from uppie.underlyingToken doesn't match uppie.aaveToken" );

        uint256 _nextUppieIndex = nextUppieIndexPerUser[msg.sender];
        nextUppieIndexPerUser[msg.sender] = _nextUppieIndex + 1;

        uppiesPerUser[msg.sender][_nextUppieIndex] = uppie; 
        emit NewUppie(msg.sender, _nextUppieIndex);
    }

    /// @notice edits an existing uppie
    /// @dev TODO
    /// @param uppie The number of rings from dendrochronological sample
    /// @param _uppiesIndex index of the uppie to edit
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

    /// @notice edits an existing uppie
    /// @dev removing a uppie that isn't the last one will leave a gap in the array. This shouldn't break anything, it just makes the ui slower (if it doesn't use events)
    /// @param _uppiesIndex index of the uppie to remove
    function removeUppie(uint256 _uppiesIndex) public {
        uint256 _nextUppieIndex = nextUppieIndexPerUser[msg.sender];
        require(_nextUppieIndex > _uppiesIndex, "cant edit uppie that doesn't exist");

        /// @custom:gasgolf can this be more efficient?
        uppiesPerUser[msg.sender][_uppiesIndex] = Uppie(address(0x0),address(0x0),address(0x0),false,false,0,0,0,0,UppieGasSettings(0,0,0,0));
        if (_uppiesIndex == _nextUppieIndex - 1) {
            nextUppieIndexPerUser[msg.sender] = _nextUppieIndex - 1;
        }
        emit RemovedUppie(msg.sender, _uppiesIndex);
    }

    /// @notice fills an uppie either by withdrawing or borrowing.
    /// @dev 
    /// @param _uppiesIndex index of the uppie to fill
    /// @param payee owner of the uppie and also payee
    /// @param isSponsored set to true if caller doesn't want compensation for gas
    function fillUppie(uint256 _uppiesIndex, address payee, bool isSponsored) public {
        Uppie memory uppie = uppiesPerUser[payee][_uppiesIndex];
   
        uint256 payeeBalance = IERC20(uppie.aaveToken).balanceOf(payee);
        uint256 recipientBalance = IERC20(uppie.underlyingToken).balanceOf(uppie.recipient);
        bool doWithdraw = uppie.canWithdraw && payeeBalance != 0;

        require(doWithdraw || uppie.canBorrow, "can't withdraw and cant borrow"); // TODO payee balance empty error?
        require(recipientBalance < uppie.topUpThreshold, "user balance not below top-up threshold");

        uint256 total;
        uint256 fillerFee;
        uint256 topUpSize;

        // TODO if doWithdraw and isSponsored, we don't need underlyingTokenPrice
        uint256 underlyingTokenPrice = _invertAaveOraclePrice(IAaveOracle(aaveOracle).getAssetPrice(uppie.underlyingToken)); 

        if(doWithdraw) {
            (total, fillerFee, topUpSize) = _calculateAmounts(uppie, payeeBalance, recipientBalance, underlyingTokenPrice, isSponsored);
            // withdraw
            _withdraw(uppie, total, payee);
        } else {
            uint256 remainingAllowedDebt = _getAllowedDebtRemaining(uppie, payee, underlyingTokenPrice);
            require(remainingAllowedDebt != 0, "not allowed to draw more debt");
            (total, fillerFee, topUpSize) = _calculateAmounts(uppie, remainingAllowedDebt, recipientBalance, underlyingTokenPrice, isSponsored);
            // borrow
            _borrow(uppie, total, payee);
        }

        // check health factor
        require(_isSafeHealthFactor(uppie.minHealthFactor, payee),"This uppie will causes to the user to go below the Uppie.minHealthFactor or user is already below it");
        
        // send it!
        IERC20(uppie.underlyingToken).transfer(uppie.recipient, topUpSize);
        if(!isSponsored) {
            IERC20(uppie.underlyingToken).transfer(msg.sender, fillerFee);
        }
        emit FilledUppie(payee, _uppiesIndex);
    }

    function _borrow(Uppie memory uppie, uint256 total, address payee) private {
        IPool(aavePoolInstance).borrow(
            uppie.underlyingToken,
            total,
            2, // interestRateMode 1 is deprecated so we you can only use 2 which is variable
            0, // referral code
            payee
        );
    }

    function _withdraw(Uppie memory uppie, uint256 total, address payee) private {
        IERC20(uppie.aaveToken).transferFrom(payee, address(this), total);
        IPool(aavePoolInstance).withdraw(
            uppie.underlyingToken,
            total,
            address(this)
        );
    }

    function _getAllowedDebtRemaining(Uppie memory uppie, address payee, uint256 underlyingTokenPrice) public view returns (uint256 allowedDebtRemaining) {
        (,uint256 totalDebtBase , , , ,) = IPool(aavePoolInstance).getUserAccountData(payee);
        uint256 convertedTotalDebt = _convertWithAaveOraclePrice(totalDebtBase, underlyingTokenPrice);
        if (uppie.maxDebt > convertedTotalDebt) {
            return uppie.maxDebt - convertedTotalDebt;
        } else {
            return 0;
        }
    }

    function _calculateAmounts(Uppie memory uppie, uint256 payeeBalance, uint256 recipientBalance, uint256 underlyingTokenPrice, bool isSponsored) view private returns(uint256 total, uint256 fillerFee, uint256 topUpSize) {
        if (isSponsored) {
            (total, fillerFee, topUpSize) = _calculateAmountsWithFillerFee(uppie, payeeBalance, recipientBalance, underlyingTokenPrice);
        } else {
            total = _calculateTopUpSize(uppie, payeeBalance, recipientBalance);
            topUpSize = total;
            fillerFee = 0;
        }
        return (total, fillerFee, topUpSize);
    }

    function _calculateAmountsWithFillerFee(Uppie memory uppie, uint256 payeeBalance, uint256 recipientBalance, uint256 underlyingTokenPrice) view private returns(uint256 total, uint256 fillerFee, uint256 topUpSize) {
        uint256 blockBaseFee = block.basefee;
        require(blockBaseFee < uppie.gas.maxBaseFee, "base fee is higher than then the uppie.maxBaseFee");
    
        topUpSize = uppie.topUpTarget - recipientBalance;
        uint256 xdaiPaid = (uppie.gas.priorityFee + blockBaseFee) * uppie.gas.topUpGas;
        uint256 txCost = _convertWithAaveOraclePrice(xdaiPaid, underlyingTokenPrice);

        fillerFee = txCost + uppie.gas.fillerReward;
        total = topUpSize + fillerFee;

        // not enough money? just send what you got
        if (payeeBalance < total) {
            require(payeeBalance > fillerFee, "payee cant afford the filler fee");
            total = payeeBalance;
            topUpSize = payeeBalance - fillerFee;
        }
        return (total, fillerFee, topUpSize);
    }

    function _calculateTopUpSize(Uppie memory uppie, uint256 payeeBalance, uint256 recipientBalance) pure private returns(uint256 topUpSize) {
        topUpSize = uppie.topUpTarget - recipientBalance;

        // not enough money? just send what you got
        if (payeeBalance < topUpSize) {
            return payeeBalance;
        } else {
            return topUpSize;
        }
    }

    function _invertAaveOraclePrice(uint256 oraclePrice) private pure returns(uint256 invertedOraclePrice)  {
         // (1 / price) to invert the price. (ex eure/xDai -> xDai/eure) but 1*10000000000000000 because price is returned 10^8 to large so we need to do (10^(8*2) / price)
        return 10000000000000000 / oraclePrice;
    }

    function _convertWithAaveOraclePrice(uint256 amount, uint256 oraclePrice) private pure returns(uint256 convertedAmount)  {
        // aave oracle prices are 10^8 too large
        return amount * oraclePrice / 100000000;
    }

    function _isSafeHealthFactor(uint256 minHealthFactor, address payee) view private returns(bool isSafe) {
        // health factor check just incase user used the token as collateral. We don't want them to get liquidated!
        // needs to be after the withdraw so we can see if it went bad.
        if (minHealthFactor > 0) {
            (, , , , , uint256 currentHealthFactor) = IPool(aavePoolInstance).getUserAccountData(payee);
            return currentHealthFactor > minHealthFactor;
        } else {
            return true;
        }
    }
}
