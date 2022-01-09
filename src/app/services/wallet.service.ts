import { Injectable } from '@angular/core';
import { UtilService } from './util.service';
import { ApiService } from './api.service';
import { BigNumber } from 'bignumber.js';
import { AddressBookService } from './address-book.service';
import * as CryptoJS from 'crypto-js';
import { WorkPoolService } from './work-pool.service';
// import { WebsocketService } from './websocket.service';
import { QLCBlockService } from './qlc-block.service';
import { NotificationService } from './notification.service';
import { AppSettingsService } from './app-settings.service';
import { PriceService } from './price.service';
// import { LedgerService } from './ledger.service';
import { NGXLogger } from 'ngx-logger';
import { interval, timer } from 'rxjs';
import { ChainxAccountService } from './chainx-account.service';

export type WalletType = 'seed' | 'ledger' | 'privateKey';

export interface WalletAccount {
	id: string;
	// frontiers: any | null;
	secret: any;
	keyPair: any;
	index: number;
	balance: BigNumber;
	balances: any;
	otherTokens: any;
	pendingBlocks: any;
	pendingCount: number;
	pendingPerTokenCount: any;
	latestTransactions: any;
	// balanceRaw: BigNumber;
	// pendingRaw: BigNumber;
	// balanceFiat: number;
	// pendingFiat: number;
	addressBookName: string | null;
	accountMeta: any;
}
export interface NeoWallet {
	id: string;
	index: number;
	balances: any;
	addressBookName: string | null;
	encryptedwif: string;
}
export interface ChainxAccount {
  id: string;
  index: number;
  addressBookName: string | null;
  balances: object | null;
  wif: string;
  mnemonic: boolean;
}
export interface FullWallet {
	type: WalletType;
	seedBytes: any;
	seed: string | null;
	// tokens: any;
	// balance: BigNumber;
	// pending: BigNumber;
	pendingCount: number;
	// balanceRaw: BigNumber;
	// pendingRaw: BigNumber;
	// balanceFiat: number;
	// pendingFiat: number;
	accounts: WalletAccount[];
	neowallets: NeoWallet[];
	chainxAccounts: ChainxAccount[];
	accountsIndex: number;
	locked: boolean;
	password: string;
}

@Injectable({
	providedIn: 'root'
})
export class WalletService {
	qlc = 100000000;
	storeKey = `sms-billing`;

	wallet: FullWallet = {
		type: 'seed',
		seedBytes: null,
		seed: '',
		// tokens: {},
		// balance: new BigNumber(0),
		// pending: new BigNumber(0),
		pendingCount: 0,
		// balanceRaw: new BigNumber(0),
		// pendingRaw: new BigNumber(0),
		// balanceFiat: 0,
		// pendingFiat: 0,
		accounts: [],
		neowallets: [],
		chainxAccounts: [],
		accountsIndex: 0,
		locked: false,
		password: ''
	};

	processingPending = false;
	loadingPending = false;
	pendingBlocks = [];
	successfulBlocks = [];
	blocksCount = {
		'count':0,
		'unchecked':0
	};
	tokenMap = {};
	tokenRefreshTime = 0;

	private pendingRefreshInterval$ = interval(60000);
	private blocksCountInterval$ = interval(60000);
	private confirmTxTimer = timer(500);

	constructor(
		private util: UtilService,
		private api: ApiService,
		private appSettings: AppSettingsService,
		private addressBook: AddressBookService,
		private price: PriceService,
		private workPool: WorkPoolService,
		// private websocket: WebsocketService,
		private qlcBlock: QLCBlockService,
		// private ledgerService: LedgerService,
		private notifications: NotificationService,
		private logger: NGXLogger
	) {
		// this.websocket.newTransactions$.subscribe(async transaction => {
		// 	if (!transaction) {
		// 		return; // Not really a new transaction
		// 	}

		// 	// Find out if this is a send, with our account as a destination or not
		// 	const walletAccountIDs = this.wallet.accounts.map(a => a.id);
		// 	if (transaction.block.type === 'send' && walletAccountIDs.indexOf(transaction.block.destination) !== -1) {
		// 		// Perform an automatic receive
		// 		const walletAccount = this.wallet.accounts.find(a => a.id === transaction.block.destination);
		// 		if (walletAccount) {
		// 			// If the wallet is locked, show a notification
		// 			if (this.wallet.locked) {
		// 				const lockMessage = 'New incoming transaction - unlock the wallet to receive it!';
		// 				this.notifications.sendWarning(lockMessage, {
		// 					length: 0,
		// 					identifier: 'pending-locked'
		// 				});
		// 			}
		// 			this.addPendingBlock(walletAccount.id, transaction.hash, transaction.amount, transaction.token);
		// 			await this.processPendingBlocks();
		// 		}
		// 	} else if (transaction.block.type === 'state') {
		// 		await this.processStateBlock(transaction);
		// 	}

		// 	// TODO: We don't really need to call to update balances, we should be able to balance on our own from here
		// 	await this.reloadBalances();
		// });

		this.addressBook.addressBook$.subscribe(newAddressBook => {
			this.reloadAddressBook();
		});

		this.pendingRefreshInterval$.subscribe(async () => {
			// check every x sec for new pending transactions
			this.loadPending();
		});

		this.blocksCountInterval$.subscribe(async () => {
			this.refreshBlocks();
		});
		this.load();
	}

	async load() {
		await this.refreshBlocks();
		this.loadPending();
	}

	async loadTokens() {
		if ((Date.now() - this.tokenRefreshTime) < 100000) {
			return;
		}
		this.tokenRefreshTime = Date.now();
		this.tokenMap = {};
		const tokens = await this.api.tokens();
		if (!tokens.error) {
			tokens.result.forEach(token => {
				if (token.tokenSymbol != 'QLC' && token.tokenSymbol != 'QGAS') {
					token.image = 'none';
				} else {
					token.image = token.tokenSymbol;
				}
				this.tokenMap[token.tokenId] = token;
			});
		}
		return;
	}

	async loadPending() {
		if (this.processingPending === true) {
			return;
		}
		if (this.loadingPending === true) {
			return;
		}
		this.loadingPending = true;
		this.pendingBlocks = [];
		let pendingCount = 0;
		const accountsPending = await this.api.accountsPending(this.wallet.accounts.map(a => a.id));

		let allAccounts = this.wallet.accounts;

		if (!accountsPending.error) {
			await this.loadTokens();
			const pendingResult = accountsPending.result;
			for (const account in pendingResult) {
				if (!pendingResult.hasOwnProperty(account)) {
					continue;
				}
				pendingCount += pendingResult[account].length;
				let walletAccount = this.wallet.accounts.find(a => a.id === account);
				walletAccount.pendingCount = pendingResult[account].length;
				walletAccount.pendingPerTokenCount = [];
				walletAccount.pendingBlocks = [];
				pendingResult[account].forEach(pending => {
					if (this.tokenMap.hasOwnProperty(pending.type)) {
						pending.tokenInfo = this.tokenMap[pending.type];
					}
					walletAccount.pendingBlocks.push(pending);
					if (pending.tokenName != 'QLC' && pending.tokenName != 'QGAS') {
						pending.tokenName = 'OTHER';
					}
					if (!walletAccount.pendingPerTokenCount[pending.tokenName])
						walletAccount.pendingPerTokenCount[pending.tokenName] = 0;

					walletAccount.pendingPerTokenCount[pending.tokenName] += 1;
					this.pendingBlocks.push({
						account: pending.source,
						receiveAccount: account,
						amount: pending.amount,
						token: pending.type,
						tokenName: pending.tokenName,
						tokenSymbol: pending.tokenName,
						timestamp: pending.timestamp,
						hash: pending.hash
					});
				});
				allAccounts = allAccounts.filter(function( obj ) {
					return obj.id !== account;
				});
				//console.log(walletAccount.pendingBlocks);
			}
			this.loadingPending = false;
			if (!this.isLocked() && this.appSettings.settings.receive == 'auto') {
				this.processPendingBlocks();
			}
		}

		allAccounts.forEach((data) => {
			let walletAccount = this.wallet.accounts.find(a => a.id === data.id);
			walletAccount.pendingBlocks = [];
			walletAccount.pendingPerTokenCount = [];
			walletAccount.pendingCount = 0;
		});

		this.wallet.pendingCount = pendingCount;
		this.loadingPending = false;
	}

	async removeBlockFromPendingAccount(block,newhash = '') {
		let walletAccount = this.wallet.accounts.find(a => a.id === block.receiveAccount);

		if (walletAccount === undefined) {
			console.log('ERROR - Account not found');
			return;
		}

		const pendingBlock = walletAccount.pendingBlocks.find( (pendingBlock) => {
			return pendingBlock.hash === block.hash;
		});

		walletAccount.pendingBlocks = walletAccount.pendingBlocks.filter( (pendingBlock) => {
			return pendingBlock.hash !== block.hash;
		});

		walletAccount.pendingCount = walletAccount.pendingBlocks.length;
		/*let tokenName = block.tokenName;
		if (block.tokenName != 'QLC' && block.tokenName != 'QGAS') {
			tokenName = 'OTHER';
		}*/
		walletAccount.pendingPerTokenCount = [];
		for (const pending of walletAccount.pendingBlocks) {
			if (walletAccount.pendingPerTokenCount[pending.tokenName]) {
				walletAccount.pendingPerTokenCount[pending.tokenName] += 1;
			} else {
				walletAccount.pendingPerTokenCount[pending.tokenName] = 1;
			}
		}
		//walletAccount.pendingPerTokenCount[tokenName] -= 1;

		// update balances
		await this.getTokenBalance(walletAccount);

		if (newhash != '' && newhash != null) {
			const blocksInfo = await this.api.blocksInfo([newhash]);
			if (blocksInfo.result) {
				let block = blocksInfo.result[0];
				await this.loadTokens();
				if (this.tokenMap.hasOwnProperty(block.token)) {
					block.tokenInfo = this.tokenMap[block.token];
				}
				walletAccount.latestTransactions.unshift(block); // add block to latest transactions

			}
		}
	}

	async getTokenBalance(walletAccount,block = null) {
		/*let tokenBalance = undefined;
		if (walletAccount.accountMeta && walletAccount.accountMeta.tokens) {
			tokenBalance = walletAccount.accountMeta.tokens.find( (token) => {
				return token.type === block.token;
			});
		}
		if (tokenBalance === undefined) {*/
			const accountInfo = await this.api.accountInfo(walletAccount.id);
			if (!accountInfo.error) {
				const am = accountInfo.result;
				for (const token of am.tokens) {
					if (this.tokenMap.hasOwnProperty(token.type)) {
						token.tokenInfo = this.tokenMap[token.type];
					}
				}
				walletAccount.accountMeta = am;
				let accountMeta = [];
				let otherTokens = [];
    			if (accountInfo.result && accountInfo.result.tokens && Array.isArray(accountInfo.result.tokens)) {
      				accountInfo.result.tokens.forEach(token => {
						accountMeta[token.tokenName] = token;
						if (token.tokenInfo.tokenSymbol != 'QLC' && token.tokenInfo.tokenSymbol != 'QGAS') {
							otherTokens.push(token);
						}
					});
				}

				walletAccount.otherTokens = otherTokens;
				walletAccount.balances = accountMeta;
			}
			//return await this.getTokenBalance(walletAccount,block);
		//}
		//return tokenBalance;
	}

	async refreshBlocks() {
		const blocksCount = await this.api.blocksCount();

		if (blocksCount.result) {
			this.blocksCount = blocksCount.result;
		}
	}

	async processStateBlock(transaction) {
		if (transaction.is_send === 'true' && transaction.block.link_as_account) {
			// This is an incoming send block, we want to perform a receive
			const walletAccount = this.wallet.accounts.find(a => a.id === transaction.block.link_as_account);
			if (!walletAccount) {
				return; // Not for our wallet?
			}

			this.addPendingBlock(walletAccount.id, transaction.hash, new BigNumber(0), transaction.token, transaction.tokenName);
			await this.processPendingBlocks();
		} else {
			// Not a send to us, which means it was a block posted by us.  We shouldnt need to do anything...
			const walletAccount = this.wallet.accounts.find(a => a.id === transaction.block.link_as_account);
			if (!walletAccount) {
				return; // Not for our wallet?
			}
		}
	}

	reloadAddressBook() {
		this.wallet.accounts.forEach(account => {
			account.addressBookName = this.addressBook.getAccountName(account.id);
		});
	}

	async getWalletAccount(accountID) {
		return this.wallet.accounts.find(a => a.id === accountID);
	}

	async getNeoWallet(walletID) {
		return this.wallet.neowallets.find(a => a.id === walletID);
	}

	async loadStoredWallet() {
		this.resetWallet();

		const walletData = localStorage.getItem(this.storeKey);
		if (!walletData) {
			return this.wallet;
		}

		const walletJson = JSON.parse(walletData);
		const walletType = walletJson.type || 'seed';
		this.wallet.type = walletType;
		if (walletType === 'seed') {
			this.wallet.seed = walletJson.seed;
			this.wallet.seedBytes = this.util.hex.toUint8(walletJson.seed);
		}
		if (walletType === 'seed' || walletType === 'privateKey') {
			this.wallet.locked = walletJson.locked;
			this.wallet.password = walletJson.password || null;
		}

		this.wallet.accountsIndex = walletJson.accountsIndex || 0;

		if (walletJson.accounts && walletJson.accounts.length) {
			if (walletType === 'ledger' || this.wallet.locked) {
				// With the wallet locked, we load a simpler version of the accounts which does not have the keypairs, and uses the ID as input
				walletJson.accounts.forEach(account => this.loadWalletAccount(account.index, account.id));
			} else {
				await Promise.all(walletJson.accounts.map(async account => await this.addWalletAccount(account.index, false)));
			}
		} else {
			// Loading from accounts index
			if (!this.wallet.locked) {
				await this.loadAccountsFromIndex(); // Need to have the seed to reload any accounts if they are not stored
			}
		}
		if (walletJson.neowallets && walletJson.neowallets.length) {
			walletJson.neowallets.forEach(async account => await this.loadNeoWalletAccount(account));
		}
		if (walletJson.chainxAccounts && walletJson.chainxAccounts.length) {
			walletJson.chainxAccounts.forEach(async account => await this.loadChainxAccount(account));
		}

		await this.reloadBalances(true);


		return this.wallet;
	}



	async loadNeoWalletAccount(account) {
		const addressBookName = this.addressBook.getAccountName(account.id);

		const newAccount: NeoWallet = {
			id: account.id,
			index: account.index,
			addressBookName,
			balances: [],
			encryptedwif: account.encryptedwif
		};
		this.wallet.neowallets.push(newAccount);
		this.saveWalletExport();
		return newAccount;
	}

	async loadChainxAccount(account) {
		const addressBookName = this.addressBook.getAccountName(account.id);

		const newAccount: ChainxAccount = {
			id: account.id,
			index: account.index,
			addressBookName,
			balances: null,
			wif: account.wif,
      mnemonic: account.mnemonic
		};
		this.wallet.chainxAccounts.push(newAccount);
		this.saveWalletExport();
		return newAccount;
	}

	async loadImportedWallet(seed, password, accountsIndex = 1) {
		this.resetWallet();

		this.wallet.seed = seed;
		this.wallet.seedBytes = this.util.hex.toUint8(seed);
		this.wallet.accountsIndex = accountsIndex;
		this.wallet.password = password;

		for (let i = 0; i < accountsIndex; i++) {
			await this.addWalletAccount(i, false);
		}

		await this.reloadBalances(true);

		// if (this.wallet.accounts.length) {
		// 	this.websocket.subscribeAccounts(this.wallet.accounts.map(a => a.id));
		// }

		return this.wallet;
	}

	async loadAccountsFromIndex() {
		this.wallet.accounts = [];

		for (let i = 0; i < this.wallet.accountsIndex; i++) {
			await this.addWalletAccount(i, false);
		}
	}

	generateExportData() {
		const exportData: any = {
			accountsIndex: this.wallet.accountsIndex
		};
		if (this.wallet.locked) {
			exportData.seed = this.wallet.seed;
		} else {
			exportData.seed = CryptoJS.AES.encrypt(this.wallet.seed, this.wallet.password).toString();
		}

		return exportData;
	}

	generateExportUrl() {
		const exportData = this.generateExportData();
		const base64Data = btoa(JSON.stringify(exportData));

		// FIXME: change url
		return `https://wallet.qlcchain.online/import-wallet#${base64Data}`;
	}

	lockWallet() {
		if (!this.wallet.seed || !this.wallet.password) {
			return; // Nothing to lock, password not set
		}
		const encryptedSeed = CryptoJS.AES.encrypt(this.wallet.seed, this.wallet.password);

		// Update the seed
		this.wallet.seed = encryptedSeed.toString();
		this.wallet.seedBytes = null;

		// Remove secrets from accounts
		this.wallet.accounts.forEach(a => {
			a.keyPair = null;
			a.secret = null;
		});

		this.wallet.locked = true;
		this.wallet.password = '';

		this.saveWalletExport(); // Save so that a refresh gives you a locked wallet

		return true;
	}
	async unlockWallet(password: string) {
		try {
			const decryptedBytes = CryptoJS.AES.decrypt(this.wallet.seed, password);
			const decryptedSeed = decryptedBytes.toString(CryptoJS.enc.Utf8);
			if (!decryptedSeed || decryptedSeed.length !== 64) {
				return false;
			}
			this.wallet.seed = decryptedSeed;
			this.wallet.seedBytes = this.util.hex.toUint8(this.wallet.seed);
			this.wallet.accounts.forEach(a => {
				a.secret = this.util.account.generateAccountSecretKeyBytes(this.wallet.seedBytes, a.index);
				a.keyPair = this.util.account.generateAccountKeyPair(a.secret);
			});

			this.wallet.locked = false;
			this.wallet.password = password;

			this.notifications.removeNotification('pending-locked'); // If there is a notification to unlock, remove it

			// TODO: Determine if we need to load some accounts - should only be used when? Loading from import.
			if (this.wallet.accounts.length < this.wallet.accountsIndex) {
				this.loadAccountsFromIndex().then(() => this.reloadBalances()); // Reload all?
			}

			// Process any pending blocks
			this.processPendingBlocks();

			this.saveWalletExport(); // Save so a refresh also gives you your unlocked wallet?

			return true;
		} catch (err) {
			return false;
		}
	}

	walletIsLocked() {
		return this.wallet.locked;
	}

	async createWalletFromSeed(seed: string, emptyAccountBuffer: number = 10) {
		this.resetWallet();

		this.wallet.seed = seed;
		this.wallet.seedBytes = this.util.hex.toUint8(seed);

		let emptyTicker = 0;
		const usedIndices = [];
		let greatestUsedIndex = 0;
		const batchSize = emptyAccountBuffer + 1;
		for (let batch = 0; emptyTicker < emptyAccountBuffer; batch++) {
			const batchAccounts = {};
			const batchAccountsArray = [];
			for (let i = 0; i < batchSize; i++) {
				const index = batch * batchSize + i;
				const accountBytes = this.util.account.generateAccountSecretKeyBytes(this.wallet.seedBytes, index);
				const accountKeyPair = this.util.account.generateAccountKeyPair(accountBytes);
				const accountAddress = this.util.account.getPublicAccountID(accountKeyPair.publicKey);

				batchAccounts[accountAddress] = {
					index: index,
					publicKey: this.util.uint8.toHex(accountKeyPair.publicKey).toUpperCase(),
					used: false
				};
				batchAccountsArray.push(accountAddress);
			}
			const accountFrontier = await this.api.accountsFrontiers(batchAccountsArray);

			if (!accountFrontier.error) {
				// if frontiers contains this account
				const frontierResult = accountFrontier.result;
				Object.keys(frontierResult).map(account => {
					if (batchAccounts.hasOwnProperty(account)) {
						batchAccounts[account].used = true;
					}
				});
			}

			Object.keys(batchAccounts).map(accountID => {
				const account = batchAccounts[accountID];
				if (account.used) {
					usedIndices.push(account.index);
					if (account.index > greatestUsedIndex) {
						greatestUsedIndex = account.index;
						emptyTicker = 0;
					}
				} else {
					if (account.index > greatestUsedIndex) {
						emptyTicker++;
					}
				}
			});
		}

		if (usedIndices.length > 0) {
			for (let i = 0; i < usedIndices.length; i++) {
				// add account and reload balance when add complete
				this.addWalletAccount(usedIndices[i], i === usedIndices.length - 1);
			}
		} else {
			this.addWalletAccount();
		}

		return this.wallet.seed;
	}

	createNewWallet() {
		this.resetWallet();

		const seedBytes = this.util.account.generateSeedBytes();
		this.wallet.seedBytes = seedBytes;
		this.wallet.seed = this.util.hex.fromUint8(seedBytes);

		this.addWalletAccount();

		return this.wallet.seed;
	}

	createLedgerWallet() {
		this.resetWallet();

		this.wallet.type = 'ledger';
		const newAccount = this.addWalletAccount(0);

		return this.wallet;
	}

	// async createLedgerAccount(index) {
	// 	const account = await this.ledgerService.getLedgerAccount(index);

	// 	const accountID = account.address;
	// 	const addressBookName = this.addressBook.getAccountName(accountID);

	// 	const newAccount: WalletAccount = {
	// 		id: accountID,
	// 		frontiers: null,
	// 		secret: null,
	// 		keyPair: null,
	// 		balance: new BigNumber(0),
	// 		pending: new BigNumber(0),
	// 		pendingCount: 0,
	// 		balanceRaw: new BigNumber(0),
	// 		pendingRaw: new BigNumber(0),
	// 		balanceFiat: 0,
	// 		pendingFiat: 0,
	// 		index: index,
	// 		addressBookName,
	// 		accountMeta: {}
	// 	};

	// 	return newAccount;
	// }

	async createSeedAccount(index) {
		const accountBytes = this.util.account.generateAccountSecretKeyBytes(this.wallet.seedBytes, index);
		const accountKeyPair = this.util.account.generateAccountKeyPair(accountBytes);
		const accountName = this.util.account.getPublicAccountID(accountKeyPair.publicKey);
		const addressBookName = this.addressBook.getAccountName(accountName);

		const newAccount: WalletAccount = {
			id: accountName,
			// frontiers: null,
			secret: accountBytes,
			keyPair: accountKeyPair,
			balance: new BigNumber(0),
			// pending: new BigNumber(0),
			pendingBlocks: [],
			pendingCount: 0,
			pendingPerTokenCount: [],
			balances: null,
			otherTokens: [],
			latestTransactions: [],
			// balanceRaw: new BigNumber(0),
			// pendingRaw: new BigNumber(0),
			// balanceFiat: 0,
			// pendingFiat: 0,
			index: index,
			addressBookName,
			accountMeta: {}
		};

		return newAccount;
	}

	/**
	 * Reset wallet to a base state, without changing reference to the main object
	 */
	resetWallet() {
		// if (this.wallet.accounts.length) {
		// 	this.websocket.unsubscribeAccounts(this.wallet.accounts.map(a => a.id)); // Unsubscribe from old accounts
		// }
		this.wallet.type = 'seed';
		this.wallet.password = '';
		this.wallet.locked = false;
		this.wallet.seed = '';
		this.wallet.seedBytes = null;
		this.wallet.accounts = [];
		this.wallet.accountsIndex = 0;
		// this.wallet.balance = new BigNumber(0);
		// this.wallet.pending = new BigNumber(0);
		// this.wallet.balanceFiat = 0;
		// this.wallet.pendingFiat = 0;
	}

	isConfigured() {
		switch (this.wallet.type) {
			case 'seed':
				return !!this.wallet.seed;
			case 'ledger':
				return true; // ?
			case 'privateKey':
				return false;
		}
	}

	isLocked() {
		switch (this.wallet.type) {
			case 'privateKey':
			case 'seed':
				return this.wallet.locked;
			case 'ledger':
				return false;
		}
	}

	isLedgerWallet() {
		// return this.wallet.type === 'ledger';
		return false;
	}

	reloadFiatBalances() {
		// const fiatPrice = this.price.price.lastPrice;
		// this.wallet.accounts.forEach(account => {
		// 	account.balanceFiat = this.util.qlc
		// 		.rawToMqlc(account.balance)
		// 		.times(fiatPrice)
		// 		.toNumber();
		// 	account.pendingFiat = this.util.qlc
		// 		.rawToMqlc(account.pending)
		// 		.times(fiatPrice)
		// 		.toNumber();
		// });
		// this.wallet.balanceFiat = this.util.qlc
		// 	.rawToMqlc(this.wallet.balance)
		// 	.times(fiatPrice)
		// 	.toNumber();
		// this.wallet.pendingFiat = this.util.qlc
		// 	.rawToMqlc(this.wallet.pending)
		// 	.times(fiatPrice)
		// 	.toNumber();
	}

	async reloadBalances(reloadPending = true) {
		this.wallet.pendingCount = 0;
		const accountsPending = await this.api.accountsPending(this.wallet.accounts.map(a => a.id));
		if (!accountsPending.error) {
			const pendingResult = accountsPending.result;
			for (const account in pendingResult) {
				if (!pendingResult.hasOwnProperty(account)) {
					continue;
				}
				this.wallet.pendingCount += pendingResult[account].length;
			}
		}

		// console.log('pendingCount >>> ' + this.wallet.pendingCount);

		const tokenMap = {};
		const tokens = await this.api.tokens();
		if (!tokens.error && tokens.result) {
			tokens.result.forEach(token => {
				tokenMap[token.tokenId] = token;
			});
		}

		// fill account meta
		for (const account of this.wallet.accounts) {
			const accountInfo = await this.api.accountInfo(account.id);
			if (!accountInfo.error && accountInfo.result) {
				const am = accountInfo.result;
				for (const token of am.tokens) {
					if (tokenMap.hasOwnProperty(token.type)) {
						token.tokenInfo = tokenMap[token.type];
					}
					if (token.type === this.api.qlcTokenHash) {
						account.balance = new BigNumber(token.balance);
					}
					//this.logger.debug(JSON.stringify(token));
				}
				account.accountMeta = am;
			}
		}

		// for (let account of this.wallet.accounts) {
		// 	this.logger.debug(JSON.stringify(account));
		// }

		// Make sure any frontiers are in the work pool
		// If they have no frontier, we want to use their pub key?
		const hashes = [];
		this.wallet.accounts.forEach(account => {
			const tokensMeta = account.accountMeta.tokens;
			if (tokensMeta && Array.isArray(tokensMeta)) {
				tokensMeta.forEach(tm => {
					hashes.push(tm.header);
				});
			}
		});
		hashes.forEach(hash => this.workPool.addWorkToCache(hash));

		// If there is a pending balance, search for the actual pending transactions
		if (reloadPending && this.wallet.pendingCount > 0) {
			await this.loadPendingBlocksForWallet();
		}
	}

	async loadWalletAccount(accountIndex, accountID) {
		const index = accountIndex;
		const addressBookName = this.addressBook.getAccountName(accountID);

		const newAccount: WalletAccount = {
			id: accountID,
			// frontiers: null,
			secret: null,
			keyPair: null,
			balance: new BigNumber(0),
			balances: null,
			otherTokens: [],
			// pending: new BigNumber(0),
			pendingBlocks: [],
			pendingCount: 0,
			pendingPerTokenCount: [],
			latestTransactions: [],
			// balanceRaw: new BigNumber(0),
			// pendingRaw: new BigNumber(0),
			// balanceFiat: 0,
			// pendingFiat: 0,
			index: index,
			addressBookName,
			accountMeta: {}
		};

		this.wallet.accounts.push(newAccount);
		// this.websocket.subscribeAccounts([accountID]);
		return newAccount;
	}

	async addWalletAccount(accountIndex: number | null = null, reloadBalances: boolean = true) {
		// if (!this.wallet.seedBytes) return;
		let index = accountIndex;
		let nextIndex = index + 1;
		if (index === null) {
			index = this.wallet.accountsIndex; // Use the existing number, then increment it

			// Make sure the index is not being used (ie. if you delete acct 3/5, then press add twice, it goes 3, 6, 7)
			while (this.wallet.accounts.find(a => a.index === index)) {
				index++;
			}

			// Find the next available index
			try {
				nextIndex = index + 1;
				while (this.wallet.accounts.find(a => a.index === nextIndex)) {
					nextIndex++;
				}
				this.wallet.accountsIndex = nextIndex;
			} catch (error) {
				this.logger.error(error.messages);
			}
		}

		let newAccount: WalletAccount | null;

		if (this.wallet.type === 'privateKey') {
			throw new Error(`Cannot add another account in private key mode`);
		} else if (this.wallet.type === 'seed') {
			newAccount = await this.createSeedAccount(index);
		} else if (this.wallet.type === 'ledger') {
			// try {
			// 	newAccount = await this.createLedgerAccount(index);
			// } catch (err) {
			// 	this.notifications.sendWarning(`Unable to load account from ledger.  Make sure it is connected`);
			// 	throw err;
			// }
		}

		this.wallet.accounts.push(newAccount);
		this.wallet.accountsIndex = this.wallet.accounts.length;

		if (reloadBalances) {
			await this.reloadBalances();
		}

		// this.websocket.subscribeAccounts([newAccount.id]);

		this.saveWalletExport();

		return newAccount;
	}

	async removeWalletAccount(accountID: string) {
		const walletAccount = await this.getWalletAccount(accountID);
		const errMessage = 'Account is not in wallet';
		if (!walletAccount) {
			throw new Error(errMessage);
		}
		const walletAccountIndex = this.wallet.accounts.findIndex(a => a.id === accountID);
		if (walletAccountIndex === -1) {
			throw new Error(errMessage);
		}

		this.wallet.accounts.splice(walletAccountIndex, 1);

		// Reset the account index if this account is lower than the current index
		if (walletAccount.index < this.wallet.accountsIndex) {
			this.wallet.accountsIndex = walletAccount.index;
		}

		// this.websocket.unsubscribeAccounts([accountID]);

		// Reload the balances, save new wallet state
		await this.reloadBalances();
		this.saveWalletExport();

		return true;
	}

	addPendingBlock(accountID, blockHash, amount, tokenHash, tokenName) {
		if (this.successfulBlocks.indexOf(blockHash) !== -1) {
			return; // Already successful with this block
		}
		const existingHash = this.pendingBlocks.find(b => b.hash === blockHash);
		if (existingHash) {
			return; // Already added
		}
		this.pendingBlocks.push({
			account: accountID,
			receiveAccount: accountID,
			hash: blockHash,
			amount: amount,
			token: tokenHash,
			tokenName: tokenName,
			tokenSymbol: tokenName
		});
	}

	async loadPendingBlocksForWallet() {
		if (!this.wallet.accounts.length) {
			return;
		}
		const accountsPending = await this.api.accountsPending(this.wallet.accounts.map(a => a.id));
		if (accountsPending.error) {
			return;
		}
		const pendingResult = accountsPending.result;
		for (const account in pendingResult) {
			if (!pendingResult.hasOwnProperty(account)) {
				continue;
			}

			pendingResult[account].forEach(pending => {
				this.addPendingBlock(account, pending.hash, pending.amount, pending.type, pending.tokenName);
			});
		}

		if (this.pendingBlocks.length && this.appSettings.settings.receive == 'auto') {
			this.processPendingBlocks();
		}
	}

	async processPendingBlocks() {
		if (this.processingPending || this.wallet.locked || !this.pendingBlocks.length || this.appSettings.settings.receive != 'auto') {
			return;
		}
		this.processingPending = true;

		const nextBlock = this.pendingBlocks[0];
		if (this.successfulBlocks.find(b => b.hash === nextBlock.hash)) {
			//console.log('Block has already been processed')
			this.pendingBlocks.shift(); // Remove it after processing, to prevent attempting to receive duplicated messages
			this.removeBlockFromPendingAccount(nextBlock);
			this.processingPending = false;
			return setTimeout(() => this.processPendingBlocks(), 1500); // Block has already been processed
		}
		const walletAccount = await this.getWalletAccount(nextBlock.receiveAccount);
		if (!walletAccount) {
			//console.log('Dispose of the block, no matching account')
			this.pendingBlocks.shift(); // Remove it after processing, to prevent attempting to receive duplicated messages
			this.removeBlockFromPendingAccount(nextBlock);
			this.processingPending = false;
			return setTimeout(() => this.processPendingBlocks(), 1500); // Dispose of the block, no matching account
		}

		const newHash = await this.qlcBlock.generateReceive(walletAccount, nextBlock.hash, this.isLedgerWallet());

		if (newHash) {
			this.confirmTx(newHash,nextBlock,true);
		}
	}

	async processPendingBlock(pending) {
		if (this.processingPending || this.wallet.locked) {
			return;
		}
		this.processingPending = true;
		const nextBlock = {
			account: pending.source,
			receiveAccount: pending.account,
			amount: pending.amount,
			token: pending.type,
			tokenName: pending.tokenName,
			tokenSymbol: pending.tokenName,
			timestamp: pending.timestamp,
			hash: pending.hash
		};
		if (this.successfulBlocks.find(b => b.hash === nextBlock.hash)) {
			//console.log('Block has already been processed')
			this.pendingBlocks.shift(); // Remove it after processing, to prevent attempting to receive duplicated messages
			this.removeBlockFromPendingAccount(nextBlock);
			this.processingPending = false;
			return; // Block has already been processed
		}
		const walletAccount = await this.getWalletAccount(nextBlock.receiveAccount);
		if (!walletAccount) {
			//console.log('Dispose of the block, no matching account')
			this.pendingBlocks.shift(); // Remove it after processing, to prevent attempting to receive duplicated messages
			this.removeBlockFromPendingAccount(nextBlock);
			this.processingPending = false;
			return; // Dispose of the block, no matching account
		}

		const newHash = await this.qlcBlock.generateReceive(walletAccount, nextBlock.hash, this.isLedgerWallet());
console.log(newHash);
		if (newHash) {
			this.confirmTx(newHash,nextBlock);
		}

		return false;
	}

	async confirmTx(hash,nextBlock,auto = false) {
		const blockConfirmedQuery = await this.api.blockConfirmedStatus(hash);
		console.log(blockConfirmedQuery);
		if (typeof blockConfirmedQuery.result != 'undefined') {
			if (blockConfirmedQuery.result == true) {
				if (this.successfulBlocks.length >= 500) {
					this.successfulBlocks.shift();
				}
				this.successfulBlocks.push(nextBlock.hash);
				await this.loadTokens();
				let tokenInfo;
				if (this.tokenMap.hasOwnProperty(nextBlock.token)) {
					tokenInfo = this.tokenMap[nextBlock.token];
				}
				this.notifications.sendSuccess(
					`Successfully received ${nextBlock.amount == 0 ? '' : new BigNumber(nextBlock.amount).dividedBy(Math.pow(10,tokenInfo.decimals)).toFixed(tokenInfo.decimals)} ${tokenInfo.tokenSymbol}!`
				);
				// Remove it after processing, to prevent attempting to receive duplicated messages
				this.pendingBlocks = this.pendingBlocks.filter(function( obj ) {
					return obj.hash !== nextBlock.hash;
				});
				this.removeBlockFromPendingAccount(nextBlock,hash);
				this.processingPending = false;
				setTimeout(() => this.processPendingBlocks(), 1500);
				return true;
			}
		}
		this.confirmTxTimer.subscribe( val => {
			this.confirmTx(hash,nextBlock,auto);
		});
	}

	saveWalletExport() {
		const exportData = this.generateWalletExport();

		switch (this.appSettings.settings.walletStore) {
			case 'none':
				this.removeWalletData();
				break;
			default:
			case 'localStorage':
				localStorage.setItem(this.storeKey, JSON.stringify(exportData));
				break;
		}
	}

	removeWalletData() {
		localStorage.removeItem(this.storeKey);
	}

	generateWalletExport() {
		const data: any = {
			type: this.wallet.type,
			accounts: this.wallet.accounts.map(a => ({ id: a.id, index: a.index })),
			neowallets: this.wallet.neowallets.map(a => ({ id: a.id, index: a.index, encryptedwif: a.encryptedwif })),
			chainxAccounts: this.wallet.chainxAccounts.map(a => ({ id: a.id, index: a.index, wif: a.wif, mnemonic: a.mnemonic })),
			accountsIndex: this.wallet.accountsIndex
		};

		if (this.wallet.type === 'seed') {
			data.seed = this.wallet.seed;
			data.locked = this.wallet.locked;
			data.password = this.wallet.locked ? '' : this.wallet.password;
		}

		return data;
	}

	

	async prepareQLCBlockView(blocks) {
		let preparedBlocks = [];
		
		await this.loadTokens();

		for (const block of blocks) {
			//const blockInfo = await this.api.blocksInfo([block.link]);
			// For Open and receive blocks, we need to look up block info to get originating account
			if (block.type === 'Online' || block.type === 'Change') {
				block.link_as_account = block.address;
			} else if (block.type === 'Open' || block.type === 'Receive' || block.type === 'ContractReward') {
				const preBlock = await this.api.blocksInfo([block.link]);
				if (!preBlock.error && typeof (preBlock.result[0]) != 'undefined' && preBlock.result.length > 0) {
					block.link_as_account = preBlock.result[0].address;
				}
			} else {
				const link_as_account = await this.api.accountForPublicKey(block.link);
				if (!link_as_account.error && typeof (link_as_account.result) != 'undefined') {
					block.link_as_account = link_as_account.result;
				}
			}
			if (this.tokenMap.hasOwnProperty(block.token)) {
				block.tokenInfo = this.tokenMap[block.token];
			}
			preparedBlocks.push(block);
		}
		return preparedBlocks;
	}
}
