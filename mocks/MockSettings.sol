// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";

import "../DictatorDAO.sol";

contract MockSettings {
    uint256 public magicNumber;
    DictatorDAO public immutable DAO;

    constructor(DictatorDAO dao) public {
        DAO = dao;
    }

    modifier onlyDAO() {
        require(msg.sender == address(DAO), "Not DAO");
        _;
    }

    function updateMagicNumber(uint256 number) external onlyDAO {
        magicNumber = number;
    }
}
