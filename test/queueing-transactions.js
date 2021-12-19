const { expect } = require('chai');
const {
  createFixture,
  BN,
  e10,
  keccak256,
  abiCoder,
  incTime,
} = require('./framework');
const { provider } = hre.ethers;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('Queueing Transactions', function () {
  const stakeAlice = BN(1000);

  let fixture;
  before(async function () {
    // Only used once, so not really a fixture. For now.
    fixture = await createFixture(deployments, this, async (cmd) => {
      // Initial supply will be owned by Alice, the first account:
      const owners = [this.alice, this.bob, this.carol];
      const initialBalance = BN(10_000);

      await cmd.deploy('token', 'MockERC20', initialBalance.mul(owners.length));

      await cmd.deploy(
        'dao',
        'contracts/DictatorDAO.sol:DictatorDAO',
        'MAJOR',
        'Majordomo',
        this.token.address,
        this.bob.address,
      );

      await cmd.deploy('settings', 'MockSettings', this.dao.address);

      for (const acc of owners) {
        if (acc != this.alice) {
          await this.token.transfer(acc.address, initialBalance);
        }
        await this.token.connect(acc).approve(this.dao.address, UINT256_MAX);
      }

      // Bob is already the operator; he now also has all the votes:
      await this.dao.connect(this.alice).mint(stakeAlice, this.bob.address);
    });

    await fixture();
  });

  beforeEach(async function () {
    await fixture();
  });

  // How long must we wait before running a transaction?
  const DELAY = 2 * 24 * 3600;
  // When does the transaction expire?
  const EXPIRATION = 14 * 24 * 3600;

  describe('Mechanism', function () {
    it('Should accept transactions from the operator', async function () {
      const target = this.dirk.address;
      const value = BN(1_000_000);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data]),
      );

      // Ensure a deterministic timestamp:
      const next = await incTime(1);

      await expect(
        this.dao.connect(this.bob).queueTransaction(target, value, data),
      )
        .to.emit(this.dao, 'QueueTransaction')
        .withArgs(hash, target, value, data, next + DELAY);
    });

    it('Should only accept transactions from the operator', async function () {
      await expect(
        this.dao
          .connect(this.alice)
          .queueTransaction(this.alice.address, BN(1_000_000), []),
      ).to.be.revertedWith('Operator only');
    });

    it('Should require a majority to schedule', async function () {
      // Alice is the only one who voted. If Carol stakes as many tokens and
      // votes for someone else, Bob will no longer have a majority:
      await this.dao.connect(this.carol).mint(stakeAlice, this.erin.address);

      await expect(
        this.dao
          .connect(this.bob)
          .queueTransaction(this.dirk.address, BN(1_000_000), []),
      ).to.be.revertedWith('Not enough votes');
    });

    it('Should let only the operator cancel', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data]),
      );

      const next = await incTime(1);

      await expect(
        this.dao.connect(this.bob).queueTransaction(target, value, data),
      )
        .to.emit(this.dao, 'QueueTransaction')
        .withArgs(hash, target, value, data, next + DELAY);

      await expect(
        this.dao.connect(this.alice).cancelTransaction(target, value, data),
      ).to.be.revertedWith('Operator only');

      await expect(
        this.dao.connect(this.bob).cancelTransaction(target, value, data),
      )
        .to.emit(this.dao, 'CancelTransaction')
        .withArgs(hash, target, value, data);
    });

    it('Should enforce a min delay before executing', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data),
      ).to.be.revertedWith('Too early');
    });

    it('Should enforce a max delay before executing', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await incTime(EXPIRATION + DELAY + 1);

      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data),
      ).to.be.revertedWith('Tx stale');
    });

    it('Should execute a scheduled transaction', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data]),
      );

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await incTime(DELAY);

      // Not enough money
      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data),
      ).to.be.revertedWith('Tx reverted :(');

      // Send along enough money. Note that the tx is kept if it reverts:
      await expect(
        this.dao
          .connect(this.bob)
          .executeTransaction(target, value, data, { value }),
      )
        .to.emit(this.dao, 'ExecuteTransaction')
        .withArgs(hash, target, value, data);
    });

    it('Should require a majority to execute', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data]),
      );

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await incTime(DELAY);

      // Alice is the only one who voted. If Carol stakes as many tokens and
      // votes for someone else, Bob will no longer have a majority:
      await this.dao.connect(this.carol).mint(stakeAlice, this.erin.address);

      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data),
      ).to.be.revertedWith('Not enough votes');
    });

    it('Should only execute transactions for the operator', async function () {
      await expect(
        this.dao
          .connect(this.alice)
          .executeTransaction(this.alice.address, BN(1_000_000), []),
      ).to.be.revertedWith('Operator only');
    });

    it('Should not execute an unscheduled transaction', async function () {
      // There are no scheduled transactions in the fixture.  The default "ETA"
      // is zero; this situation will therefore get interpreted as a stale
      // transation -- clearly EXPIRATION seconds will have passed since the
      // Unix epoch.
      await expect(
        this.dao
          .connect(this.bob)
          .executeTransaction(this.bob.address, BN(1_000_000), []),
      ).to.be.revertedWith('Tx stale');
    });
  });

  describe('Application - Example', function () {
    it('Should let the operator act on behalf of the DAO', async function () {
      expect(await this.settings.magicNumber()).to.equal(0);

      const desiredNumber = 42;

      const target = this.settings.address;
      const value = 0;
      const data = this.settings.interface.encodeFunctionData(
        'updateMagicNumber',
        [desiredNumber],
      );

      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data]),
      );

      await incTime(1);
      await this.dao.connect(this.bob).queueTransaction(target, value, data);
      await incTime(DELAY);
      await this.dao.connect(this.bob).executeTransaction(target, value, data);

      expect(await this.settings.magicNumber()).to.equal(desiredNumber);
    });
  });
});
