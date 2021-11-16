//SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/Domain.sol";
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";

// DAO code/operator management/dutch auction, etc by BoringCrypto
// Staking in DictatorDAO inspired by Chef Nomi's SushiBar (heavily modified) - MIT license (originally WTFPL)
// TimeLock functionality Copyright 2020 Compound Labs, Inc. - BSD 3-Clause "New" or "Revised" License
contract DictatorDAO is IERC20, Domain {
    using BoringMath for uint256;
    using BoringMath128 for uint128;

    string public symbol;
    string public name;
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;

    DictatorToken public immutable token;
    address public operator;

    mapping(address => address) public userVote;
    mapping(address => uint256) public votes;

    constructor(
        string memory tokenSymbol,
        string memory tokenName,
        string memory sharesSymbol,
        string memory sharesName,
        address initialOperator
    ) public {
        // The DAO is the owner of the DictatorToken
        token = new DictatorToken(tokenSymbol, tokenName);

        symbol = sharesSymbol;
        name = sharesName;
        operator = initialOperator;
    }

    struct User {
        uint128 balance;
        uint128 lockedUntil;
    }

    /// @notice owner > balance mapping.
    mapping(address => User) public users;
    /// @notice owner > spender > allowance mapping.
    mapping(address => mapping(address => uint256)) public override allowance;
    /// @notice owner > nonce mapping. Used in `permit`.
    mapping(address => uint256) public nonces;

    event Transfer(address indexed _from, address indexed _to, uint256 _value);
    event Approval(
        address indexed _owner,
        address indexed _spender,
        uint256 _value
    );

    function balanceOf(address user)
        public
        view
        override
        returns (uint256 balance)
    {
        return users[user].balance;
    }

    function _transfer(
        address from,
        address to,
        uint256 shares
    ) internal {
        User memory fromUser = users[from];
        require(block.timestamp >= fromUser.lockedUntil, "Locked");
        if (shares != 0) {
            require(fromUser.balance >= shares, "Low balance");
            if (from != to) {
                require(to != address(0), "Zero address"); // Moved down so other failed calls safe some gas
                User memory toUser = users[to];

                address userVoteTo = userVote[to];
                address userVoteFrom = userVote[from];

                users[from].balance = fromUser.balance - shares.to128(); // Underflow is checked
                users[to].balance = toUser.balance + shares.to128(); // Can't overflow because totalSupply would be greater than 2^256-1
                votes[userVoteFrom] -= shares;
                votes[userVoteTo] += shares;
            }
        }
        emit Transfer(from, to, shares);
    }

    function _useAllowance(address from, uint256 shares) internal {
        if (msg.sender == from) {
            return;
        }
        uint256 spenderAllowance = allowance[from][msg.sender];
        // If allowance is infinite, don't decrease it to save on gas (breaks with EIP-20).
        if (spenderAllowance != type(uint256).max) {
            require(spenderAllowance >= shares, "Low allowance");
            allowance[from][msg.sender] = spenderAllowance - shares; // Underflow is checked
        }
    }

    /// @notice Transfers `shares` tokens from `msg.sender` to `to`.
    /// @param to The address to move the tokens.
    /// @param shares of the tokens to move.
    /// @return (bool) Returns True if succeeded.
    function transfer(address to, uint256 shares) public returns (bool) {
        _transfer(msg.sender, to, shares);
        return true;
    }

    /// @notice Transfers `shares` tokens from `from` to `to`. Caller needs approval for `from`.
    /// @param from Address to draw tokens from.
    /// @param to The address to move the tokens.
    /// @param shares The token shares to move.
    /// @return (bool) Returns True if succeeded.
    function transferFrom(
        address from,
        address to,
        uint256 shares
    ) public returns (bool) {
        _useAllowance(from, shares);
        _transfer(from, to, shares);
        return true;
    }

    /// @notice Approves `amount` from sender to be spend by `spender`.
    /// @param spender Address of the party that can draw from msg.sender's account.
    /// @param amount The maximum collective amount that `spender` can draw.
    /// @return (bool) Returns True if approved.
    function approve(address spender, uint256 amount)
        public
        override
        returns (bool)
    {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator();
    }

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 private constant PERMIT_SIGNATURE_HASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    /// @notice Approves `value` from `owner_` to be spend by `spender`.
    /// @param owner_ Address of the owner.
    /// @param spender The address of the spender that gets approved to draw from `owner_`.
    /// @param value The maximum collective amount that `spender` can draw.
    /// @param deadline This permit must be redeemed before this deadline (UTC timestamp in seconds).
    function permit(
        address owner_,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(owner_ != address(0), "Zero owner");
        require(block.timestamp < deadline, "Expired");
        require(
            ecrecover(
                _getDigest(
                    keccak256(
                        abi.encode(
                            PERMIT_SIGNATURE_HASH,
                            owner_,
                            spender,
                            value,
                            nonces[owner_]++,
                            deadline
                        )
                    )
                ),
                v,
                r,
                s
            ) == owner_,
            "Invalid Sig"
        );
        allowance[owner_][spender] = value;
        emit Approval(owner_, spender, value);
    }

    // Operator Setting
    address public pendingOperator;
    uint256 public pendingOperatorTime;

    function setOperator(address newOperator) public {
        require(newOperator != address(0), "Zero operator");
        uint256 netVotes = totalSupply - votes[address(0)];
        if (newOperator != pendingOperator) {
            require(votes[newOperator] * 2 > netVotes, "Not enough votes");
            pendingOperator = newOperator;
            pendingOperatorTime = block.timestamp + 7 days;
        } else {
            if (votes[newOperator] * 2 > netVotes) {
                require(block.timestamp >= pendingOperatorTime, "Wait longer");
                operator = pendingOperator;
            }
            // If there aren't enough votes, then the pending operator failed
            // to maintain a majority. If there are, then they are now the
            // operator. In either situation:
            pendingOperator = address(0);
            pendingOperatorTime = 0;
        }
    }

    /// math is ok, because amount, totalSupply and shares is always 0 <= amount <= 100.000.000 * 10^18
    /// theoretically you can grow the amount/share ratio, but it's not practical and useless
    function mint(uint256 amount, address operatorVote) public returns (bool) {
        // TODO: Remove?
        require(msg.sender != address(0), "Zero address");
        User memory user = users[msg.sender];

        uint256 totalTokens = token.balanceOf(address(this));
        uint256 shares =
            totalSupply == 0 ? amount : (amount * totalSupply) / totalTokens;

        // Did we change our vote? Do this while we know our previous total:
        address currentVote = userVote[msg.sender];
        uint256 extraVotes = shares;
        if (currentVote != operatorVote) {
            if (user.balance > 0) {
                // Safe, because the user must have added their balance before
                votes[currentVote] -= user.balance;
                extraVotes += user.balance;
            }
            userVote[msg.sender] = operatorVote;
        }
        votes[operatorVote] += extraVotes;

        user.balance += shares.to128();
        user.lockedUntil = (block.timestamp + 24 hours).to128();
        users[msg.sender] = user;
        totalSupply += shares;

        token.transferFrom(msg.sender, address(this), amount);

        emit Transfer(address(0), msg.sender, shares);
        return true;
    }

    // Change your vote. Does not lock tokens.
    function vote(address operatorVote) public returns (bool) {
        address currentVote = userVote[msg.sender];
        if (currentVote != operatorVote) {
            User memory user = users[msg.sender];
            if (user.balance > 0) {
                votes[currentVote] -= user.balance;
                votes[operatorVote] += user.balance;
            }
            userVote[msg.sender] = operatorVote;
        }
        return true;
    }

    function _burn(
        address from,
        address to,
        uint256 shares
    ) internal {
        require(to != address(0), "Zero address");
        User memory user = users[from];
        require(block.timestamp >= user.lockedUntil, "Locked");
        uint256 amount =
            (shares * token.balanceOf(address(this))) / totalSupply;
        users[from].balance = user.balance.sub(shares.to128()); // Must check underflow
        totalSupply -= shares;
        votes[userVote[from]] -= shares;

        token.transfer(to, amount);

        emit Transfer(from, address(0), shares);
    }

    function burn(address to, uint256 shares) public returns (bool) {
        _burn(msg.sender, to, shares);
        return true;
    }

    function burnFrom(
        address from,
        address to,
        uint256 shares
    ) public returns (bool) {
        _useAllowance(from, shares);
        _burn(from, to, shares);
        return true;
    }

    event QueueTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        bytes data,
        uint256 eta
    );
    event CancelTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        bytes data
    );
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        bytes data
    );

    uint256 public constant GRACE_PERIOD = 14 days;
    uint256 public constant DELAY = 2 days;
    mapping(bytes32 => uint256) public queuedTransactions;

    function queueTransaction(
        address target,
        uint256 value,
        bytes memory data
    ) public returns (bytes32) {
        require(msg.sender == operator, "Operator only");
        require(votes[operator] * 2 > totalSupply, "Not enough votes");

        bytes32 txHash = keccak256(abi.encode(target, value, data));
        uint256 eta = block.timestamp + DELAY;
        queuedTransactions[txHash] = eta;

        emit QueueTransaction(txHash, target, value, data, eta);
        return txHash;
    }

    function cancelTransaction(
        address target,
        uint256 value,
        bytes memory data
    ) public {
        require(msg.sender == operator, "Operator only");

        bytes32 txHash = keccak256(abi.encode(target, value, data));
        queuedTransactions[txHash] = 0;

        emit CancelTransaction(txHash, target, value, data);
    }

    function executeTransaction(
        address target,
        uint256 value,
        bytes memory data
    ) public payable returns (bytes memory) {
        require(msg.sender == operator, "Operator only");
        require(votes[operator] * 2 > totalSupply, "Not enough votes");

        bytes32 txHash = keccak256(abi.encode(target, value, data));
        uint256 eta = queuedTransactions[txHash];
        require(block.timestamp >= eta, "Too early");
        require(block.timestamp <= eta + GRACE_PERIOD, "Tx stale");

        queuedTransactions[txHash] = 0;

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) =
            target.call{value: value}(data);
        require(success, "Tx reverted :(");

        emit ExecuteTransaction(txHash, target, value, data);

        return returnData;
    }
}

contract DictatorToken is ERC20 {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    // using SignedSafeMath for int256;
    using BoringERC20 for IERC20;

    uint256 constant WEEK = 7 days;
    uint256 constant BONUS_DIVISOR = 14 days;

    string public symbol;
    string public name;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 100_000_000 * 1e18;

    DictatorDAO public immutable DAO;

    uint256 public immutable startTime;
    uint16 public currentWeek;
    mapping(uint16 => uint256) public weekShares;
    mapping(address => mapping(uint16 => uint256)) public userWeekShares;

    constructor(string memory symbol_, string memory name_) public {
        symbol = symbol_;
        name = name_;
        DAO = DictatorDAO(msg.sender);

        // Register founding time
        startTime = block.timestamp;

        // Mint all tokens and assign to the contract (no need for minting code after this + save some gas)
        balanceOf[address(this)] = totalSupply;
        emit Transfer(address(0), address(this), totalSupply);
    }

    function price() public view returns (uint256) {
        uint256 weekStart = startTime + currentWeek * WEEK;
        uint256 nextWeekStart = weekStart + WEEK;
        if (block.timestamp >= nextWeekStart) {
            return 0;
        }

        uint256 timeLeft =
            block.timestamp < weekStart
                ? WEEK
                : nextWeekStart - block.timestamp;
        uint256 timeLeftExp = timeLeft**8; // Max is 1.8e46
        return timeLeftExp / 1e28;
    }

    function buy(uint16 week, address to) external payable {
        require(week == currentWeek, "Wrong week");
        uint256 weekStart = startTime + currentWeek * WEEK;
        require(block.timestamp >= weekStart, "Not started");

        uint256 currentPrice = price();
        require(currentPrice > 0, "Ended");

        // The above checks ensure that elapsed < WEEK
        uint256 elapsed = block.timestamp - weekStart;
        // Shares = value + part of value based on how much of the week has
        // passed (starts at 50%, to 0% at the end of the week)
        uint256 bonus = ((WEEK - elapsed) * msg.value) / BONUS_DIVISOR;
        uint256 shares = msg.value + bonus;

        userWeekShares[to][week] += shares;
        weekShares[week] += shares;

        uint256 tokensPerWeek = tokensPerWeek(currentWeek);
        // Price is per "token ETH"; tokensPerWeek is in "token wei".
        require(
            weekShares[week].mul(1e18) <= currentPrice * tokensPerWeek,
            "Oversold"
        );
    }

    // Conclude the auction; buyers can now get their best price:
    function nextWeek() public {
        // TODO: Prove that we don't need to check the multiplication
        uint256 tokensPerWeek = tokensPerWeek(currentWeek);
        require(
            weekShares[currentWeek].mul(1e18) >= price() * tokensPerWeek,
            "Not fully sold"
        );
        currentWeek++;
    }

    function claimPurchase(uint16 week, address to) public {
        // TODO: Call nextWeek() as needed?
        require(week < currentWeek, "Not finished");
        // Given that (check definitions)...
        //      - price         <= WEEK**8 / 1e28 ~= 1.8 ETH,
        //      - tokensPerWeek <= 1M             ~= 1e26 wei,
        //      - shares        <= max_{all time}(price * tokensPerWeek)
        // the numerator is at most 1.8e54 < 2 * 2**180:
        uint256 tokens =
            (userWeekShares[to][week] * tokensPerWeek(week)) /
                weekShares[week];
        // By int division and the fact that all tokens have been minted, the
        // following will not underflow. TODO: check/enforce
        balanceOf[address(this)] -= tokens;
        balanceOf[to] += tokens;
        emit Transfer(address(this), to, tokens);
    }

    function tokensPerWeek(uint256 week) public pure returns (uint256) {
        return
            week < 2 ? 1_000_000e18 : week < 50 ? 100_000e18 : week < 100
                ? 50_000e18
                : week < 150
                ? 30_000e18
                : week < 200
                ? 20_000e18
                : 0;
    }

    function retrieveOperatorPayment(address to)
        public
        returns (bool success)
    {
        require(msg.sender == DAO.operator(), "Not operator");
        (success, ) = to.call{value: address(this).balance}("");
    }
}
