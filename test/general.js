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
const { ecsign } = require('ethereumjs-util');
const { provider } = hre.ethers;
const { arrayify, splitSignature } = hre.ethers.utils;

const gwei = 1_000_000_000n;
const exawei = gwei * gwei;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

let PERMIT_SIGNATURE_HASH, DOMAIN_SEPARATOR;

describe('General functionality', function () {
  let fixture, cmd, lisa, dao;

  const initialBalance = BN(10_000);
  const stakeAlice = BN(1_000);

  before(async function () {
    fixture = await createFixture(deployments, this, async (cmd) => {
      lisa = hre.ethers.Wallet.createRandom();

      // Initial supply will be owned by Alice, the first account:
      const owners = [this.alice, this.bob, this.carol, lisa];

      await cmd.deploy('token', 'MockERC20', initialBalance.mul(owners.length));

      await cmd.deploy(
        'dao',
        'contracts/DictatorDAO.sol:DictatorDAO',
        'MAJOR',
        'Majordomo',
        this.token.address,
        this.bob.address,
      );
      dao = this.dao;

      for (const acc of owners) {
        await this.token.transfer(acc.address, initialBalance);
      }

      // For ERC20 purposes; stake and ensure we're free to use it:
      await this.token.approve(this.dao.address, UINT256_MAX);
      await this.dao.mint(stakeAlice, this.alice.address);
      await incTime(7 * 24 * 3600);
      await provider.send('evm_mine', []);

      PERMIT_SIGNATURE_HASH = keccak256(
        toUtf8Bytes(
          'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)',
        ),
      );
      const DOMAIN_SEPARATOR_HASH = keccak256(
        toUtf8Bytes('EIP712Domain(uint256 chainId,address verifyingContract)'),
      );
      // TODO: Get chain ID
      DOMAIN_SEPARATOR = keccak256(
        abiCoder.encode(
          ['bytes32', 'uint256', 'address'],
          [DOMAIN_SEPARATOR_HASH, 31337, dao.address],
        ),
      );
    });
  });

  beforeEach(async function () {
    await fixture();
  });

  let lisaNonce = 0;

  // Mostly a catch all for paths that aren't taken in other tests..
  describe('ERC20 transfers', function () {
    it('Should allow transfers of zero units', async function () {
      await expect(dao.transfer(lisa.address, 0))
        .to.emit(dao, 'Transfer')
        .withArgs(this.alice.address, lisa.address, 0);
    });

    it('Should enforce account balance', async function () {
      const tooMuch = stakeAlice.add(1);
      await expect(dao.transfer(lisa.address, tooMuch)).to.be.revertedWith(
        'Low balance',
      );
    });

    it('Should allow transfers to self', async function () {
      await expect(dao.transfer(this.alice.address, 1))
        .to.emit(dao, 'Transfer')
        .withArgs(this.alice.address, this.alice.address, 1);
    });

    it('Should refuse otherwise valid transfers to zero', async function () {
      await expect(dao.transfer(ZERO_ADDR, 1)).to.be.revertedWith(
        'Zero address',
      );
    });
  });

  describe('ERC20 allowances', function () {
    it('Should always allow transferFrom self', async function () {
      expect(
        await this.dao.allowance(this.alice.address, this.alice.address),
      ).to.equal(0);

      expect(dao.transferFrom(this.alice.address, this.alice.address, 1))
        .to.emit(dao, 'Transfer')
        .withArgs(this.alice.address, this.alice.address, 1);
    });

    it('Should treat max allowance as infinite', async function () {
      await this.dao.approve(this.bob.address, UINT256_MAX);
      expect(
        dao
          .connect(this.bob)
          .transferFrom(this.alice.address, this.carol.address, 1),
      )
        .to.emit(dao, 'Transfer')
        .withArgs(this.alice.address, this.carol.address, 1);
      expect(
        await this.dao.allowance(this.alice.address, this.bob.address),
      ).to.equal(UINT256_MAX);
    });

    it('Should exhaust other allowances', async function () {
      const amount = stakeAlice.sub(100);
      const overHalf = amount.div(2).add(1);
      expect(overHalf).to.gt(0);

      await this.dao.approve(this.bob.address, amount);
      await expect(
        dao
          .connect(this.bob)
          .transferFrom(this.alice.address, this.carol.address, overHalf),
      )
        .to.emit(dao, 'Transfer')
        .withArgs(this.alice.address, this.carol.address, overHalf);

      await expect(
        dao
          .connect(this.bob)
          .transferFrom(this.alice.address, this.carol.address, overHalf),
      ).to.be.revertedWith('Low allowance');
    });
  });

  describe('EIP 2612 permit', function () {
    it('Should have the expected domain separator', async function () {
      expect(await dao.DOMAIN_SEPARATOR()).to.equal(DOMAIN_SEPARATOR);
    });

    const signPermitRequest = async (from, to, amount, deadline) => {
      const nonce = await dao.nonces(from.address);
      const dataHash = keccak256(
        abiCoder.encode(
          ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
          [
            PERMIT_SIGNATURE_HASH,
            from.address,
            to.address,
            amount,
            nonce,
            deadline,
          ],
        ),
      );
      const digest = keccak256(
        solidityPack(
          ['string', 'bytes32', 'bytes32'],
          ['\x19\x01', DOMAIN_SEPARATOR, dataHash],
        ),
      );
      return ecsign(arrayify(digest), arrayify(from.privateKey));
    };

    it('Should accept a signed "permit" request', async function () {
      const halfEth = BN(500, 15);
      const { timestamp } = await provider.getBlock('latest');
      const deadline = timestamp + 3600;

      const { v, r, s } = await signPermitRequest(
        lisa,
        this.fred,
        halfEth,
        deadline,
      );

      await expect(
        dao.permit(lisa.address, this.fred.address, halfEth, deadline, v, r, s),
      )
        .to.emit(dao, 'Approval')
        .withArgs(lisa.address, this.fred.address, halfEth);

      expect(await dao.allowance(lisa.address, this.fred.address)).to.equal(
        halfEth,
      );
    });

    it('Should not accept the same signature twice', async function () {
      const { timestamp } = await provider.getBlock('latest');
      const deadline = timestamp + 3600;

      const { v, r, s } = await signPermitRequest(
        lisa,
        this.fred,
        BN(1),
        deadline,
      );

      await expect(
        dao.permit(lisa.address, this.fred.address, BN(1), deadline, v, r, s),
      )
        .to.emit(dao, 'Approval')
        .withArgs(lisa.address, this.fred.address, BN(1));

      await expect(
        dao.permit(lisa.address, this.fred.address, BN(1), deadline, v, r, s),
      ).to.be.revertedWith('Invalid Sig');
    });

    it('Should reject on a zero owner', async function () {
      const { timestamp } = await provider.getBlock('latest');
      const deadline = timestamp + 3600;

      const { v, r, s } = await signPermitRequest(
        lisa,
        this.fred,
        BN(1),
        deadline,
      );

      await expect(
        dao.permit(ZERO_ADDR, this.fred.address, BN(1), deadline, v, r, s),
      ).to.be.revertedWith('Zero owner');
    });

    it('Should enforce the deadline', async function () {
      const { timestamp } = await provider.getBlock('latest');
      const deadline = timestamp + 3600;

      const { v, r, s } = await signPermitRequest(
        lisa,
        this.fred,
        BN(1),
        deadline,
      );

      await incTime(3601);

      await expect(
        dao.permit(lisa.address, this.fred.address, BN(1), deadline, v, r, s),
      ).to.be.revertedWith('Expired');
    });
  });
});
