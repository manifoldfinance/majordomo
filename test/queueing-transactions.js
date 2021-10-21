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

const gwei = 1_000_000_000n;
const exawei = gwei * gwei;

const UINT256_MAX = 2n ** 256n - 1n;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('Queueing Transactions', function () {
  const stakeAlice = BN(1000);

  let fixture;
  before(async function () {
    // Only used once, so not really a fixture. For now.
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

      // Bob is the operator
      // const stakeBob = BN(200);
      // const stakeCarol = BN(33_333_333, 12);

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
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data])
      );

      // Ensure a deterministic timestamp:
      const next = await incTime(1);

      await expect(
        this.dao.connect(this.bob).queueTransaction(target, value, data)
      )
        .to.emit(this.dao, 'QueueTransaction')
        .withArgs(hash, target, value, data, next + DELAY);
    });

    it('Should only accept transactions from the operator', async function () {
      await expect(
        this.dao
          .connect(this.alice)
          .queueTransaction(this.alice.address, BN(1_000_000), [])
      ).to.be.revertedWith('Operator only');
    });

    it('Should require the operator to have a vote majority', async function () {
      // Alice is the only one who voted. If Carol stakes as many tokens and
      // votes for someone else, Bob will no longer have a majority:
      await this.dao.connect(this.carol).mint(stakeAlice, this.erin.address);

      await expect(
        this.dao
          .connect(this.bob)
          .queueTransaction(this.dirk.address, BN(1_000_000), [])
      ).to.be.revertedWith('Not enough votes');
    });

    it('Should let only the operator cancel', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data])
      );

      const next = await incTime(1);

      await expect(
        this.dao.connect(this.bob).queueTransaction(target, value, data)
      )
        .to.emit(this.dao, 'QueueTransaction')
        .withArgs(hash, target, value, data, next + DELAY);

      await expect(
        this.dao.connect(this.alice).cancelTransaction(target, value, data)
      ).to.be.revertedWith('Operator only');

      await expect(
        this.dao.connect(this.bob).cancelTransaction(target, value, data)
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
        this.dao.connect(this.bob).executeTransaction(target, value, data)
      ).to.be.revertedWith('Too early');
    });

    it('Should enforce a max delay before executing', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await incTime(EXPIRATION + DELAY + 1);

      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data)
      ).to.be.revertedWith('Tx stale');
    });

    it('Should execute a scheduled transaction', async function () {
      const target = this.fred.address;
      const value = BN(1337);
      const data = [];
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data])
      );

      await this.dao.connect(this.bob).queueTransaction(target, value, data);

      await incTime(DELAY);

      // Not enough money
      await expect(
        this.dao.connect(this.bob).executeTransaction(target, value, data)
      ).to.be.revertedWith('Tx reverted :(');

      // Send along enough money. Note that the tx is kept if it reverts:
      await expect(
        this.dao
          .connect(this.bob)
          .executeTransaction(target, value, data, { value })
      )
        .to.emit(this.dao, 'ExecuteTransaction')
        .withArgs(hash, target, value, data);
    });

    it('Should not execute an unscheduled transaction', async function () {
      // There are no scheduled transactions in the fixture.  The default "ETA"
      // is zero; this situation will therefore get interpreted as a stale
      // transation -- clearly EXPIRATION seconds will have passed since the
      // Unix epoch.
      await expect(
        this.dao
          .connect(this.bob)
          .executeTransaction(this.bob.address, BN(1_000_000), [])
      ).to.be.revertedWith('Tx stale');
    });
  });

  describe('Application - Example', function () {
    it('Should let the operator act on behalf of the DAO', async function () {
      const target = this.token.address;
      const value = 0;
      // TODO: Sort out where to get this;
      const data = this.token.interface.encodeFunctionData('setMigrator', [
        this.fred.address,
      ]);
      const hash = keccak256(
        abiCoder.encode(['address', 'uint256', 'bytes'], [target, value, data])
      );
      await incTime(1);
      await this.dao.connect(this.bob).queueTransaction(target, value, data);
      await incTime(DELAY);

      expect(await this.token.migrator()).to.equal(ZERO_ADDR);
      await this.dao.connect(this.bob).executeTransaction(target, value, data);
      expect(await this.token.migrator()).to.equal(this.fred.address);
    });
  });
});
