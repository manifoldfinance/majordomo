const { expect } = require('chai');
const {
  createFixture,
  BN,
  e10,
  keccak256,
  toUtf8Bytes,
  abiCoder,
  solidityPack,
  incTime,
} = require('./framework');
const { provider } = hre.ethers;

const gwei = 1_000_000_000n;
const exawei = gwei * gwei;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

let PERMIT_SIGNATURE_HASH, DOMAIN_SEPARATOR;

describe('General functionality', function () {
  let fixture, cmd;
  before(async function () {
    fixture = await createFixture(deployments, this, async (cmd) => {
      const latestBlock = await provider.getBlock('latest');
      await cmd.deploy(
        'dao',
        'contracts/DictatorDAO.sol:DictatorDAO',
        'MAJOR',
        'Majordomo',
        'xMAJOR',
        'xMajordomo',
        this.bob.address
      );
      const tokenAddress = await this.dao.token();
      await cmd.attach(
        'token',
        'contracts/DictatorDAO.sol:DictatorToken',
        tokenAddress
      );

      const one = BN(1);

      const [tEarly, tMid, tLate] = [5 * 3600, 40 * 3600, 130 * 3600];
      const [qEarly, qMid, qLate] = [
        1485119047619047619n,
        1380952380952380952n,
        1113095238095238095n,
      ];

      await incTime(tEarly);
      await this.token.buy(0, this.alice.address, { value: one });

      await incTime(tMid - tEarly);
      await this.token.buy(0, this.bob.address, { value: one });

      await incTime(tLate - tMid);
      await this.token.buy(0, this.carol.address, { value: one });

      await incTime(WEEK);
      await this.token.nextWeek();

      for (const acc of [this.alice, this.bob, this.carol]) {
        await this.token.claimPurchase(0, acc.address);
        await this.token.connect(acc).approve(this.dao.address, UINT256_MAX);
      }

      PERMIT_SIGNATURE_HASH = keccak256(
        toUtf8Bytes(
          'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
        )
      );
      const DOMAIN_SEPARATOR_HASH = keccak256(
        toUtf8Bytes('EIP712Domain(uint256 chainId,address verifyingContract)')
      );
      // TODO: Get chain ID
      DOMAIN_SEPARATOR = keccak256(
        abiCoder.encode(
          ['bytes32', 'uint256', 'address'],
          [DOMAIN_SEPARATOR_HASH, 31337, this.dao.address]
        )
      );
    });
  });

  beforeEach(async function () {
    await fixture();
  });

  let aliceNonce = 0;

  describe('ERC methods', function () {
    it('Should have the expected domain separator', async function () {
      expect(await this.dao.DOMAIN_SEPARATOR()).to.equal(DOMAIN_SEPARATOR);
    });

    it('Should accept a signed "permit" request', async function () {
      const halfEth = BN(500, 15);
      const { timestamp } = await provider.getBlock('latest');
      const deadline = timestamp + 3600;

      const dataHash = keccak256(
        abiCoder.encode(
          ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
          [
            PERMIT_SIGNATURE_HASH,
            this.alice.address,
            this.fred.address,
            halfEth,
            aliceNonce++,
            deadline,
          ]
        )
      );
      const digest = keccak256(
        solidityPack(
          ['string', 'bytes32', 'bytes32'],
          ['\x19\x01', DOMAIN_SEPARATOR, dataHash]
        )
      );

      // TODO: v, r, s
    });
  });
});
